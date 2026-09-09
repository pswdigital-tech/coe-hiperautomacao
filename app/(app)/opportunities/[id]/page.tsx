import { notFound } from 'next/navigation';
import {
  fetchOpportunityById,
  fetchPhasesForOpportunity,
  fetchRisksForOpportunity,
  fetchDocumentsForOpportunity,
  fetchNotesForOpportunity,
  fetchTasksForOpportunity,
} from '@/lib/opportunities/queries';
// Histórico: timeline unificada (audit_log 0038 + linhas legadas de
// opportunity_history), não mais só a tabela antiga.
import { fetchOpportunityTimeline } from '@/lib/audit/timeline';
import {
  isReadOnlyViewer,
  getCurrentProfile,
  isPlatformAdmin,
  isTenantAdminOf,
  isPswStaff,
  canReprocessAiEnrichment,
} from '@/lib/security/role';
import {
  fetchAssigneesForOpportunity,
  fetchAssignableProfiles,
  fetchAssignableProfilesForPswActor,
  fetchTaskAssignableProfiles,
} from '@/lib/opportunities/assignees';
import { fetchTenantsByIds } from '@/lib/tenants/queries';
import { fetchSddState } from '@/lib/opportunities/sdd/data';
import { OpportunityDetail } from '@/components/opportunities/modal/OpportunityDetail';

/**
 * Detalhe da oportunidade (v0.5). O layout mudou de "ficha + card de entrada
 * para as tarefas" para "header + abas, com o Plano de Atividades como aba
 * padrão e uma coluna de resumo ao lado" — chegar às tarefas não custa mais um
 * clique e uma navegação.
 *
 * `today` é calculado AQUI, no servidor, e desce como prop: os agregados do
 * resumo (atrasadas) dependem da data de hoje, e lê-la no cliente faria o
 * markup do SSR divergir do da hidratação.
 */
export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const opportunity = await fetchOpportunityById(id);
  if (!opportunity) notFound();
  const [
    phases,
    risks,
    documents,
    notes,
    history,
    readOnly,
    assignees,
    profile,
    tasks,
    sddState,
  ] = await Promise.all([
    fetchPhasesForOpportunity(id),
    fetchRisksForOpportunity(id),
    fetchDocumentsForOpportunity(id),
    fetchNotesForOpportunity(id),
    fetchOpportunityTimeline(id),
    isReadOnlyViewer(),
    fetchAssigneesForOpportunity(id),
    getCurrentProfile(),
    fetchTasksForOpportunity(id),
    // 0065 — última versão do SDD + se os dados mudaram depois dela.
    fetchSddState(id),
  ]);

  // Atribuir é privilégio de admin (0032). Quem opera pela PSW — platform_admin
  // (em qualquer empresa) ou psw_staff com concessão de admin naquela empresa
  // (0045) — recebe a lista ampliada com o staff PSW do tenant da PSW como
  // candidato (ACCESS-09/D-05, Phase 17); o tenant_admin de cliente continua
  // vendo só as pessoas da própria empresa, exatamente como hoje. Sem o ramo do
  // psw_staff, o staff-admin não achava o PRÓPRIO NOME na lista (o tenant do
  // profile dele é o da PSW, nunca o da oportunidade) e, por tabela, também não
  // conseguia virar responsável de tarefa — a trigger de 0041 exige vínculo em
  // `opportunity_assignees`. Quem de fato autoriza o vínculo cross-tenant
  // continua sendo a trigger/policy de `opportunity_assignees` — esta lista só
  // monta candidatos.
  //
  // Gate alinhado com a RLS (Phase 18, Plan 08, GRANT-04/GRANT-09): o par
  // pessoa × empresa contra o tenant DESTA oportunidade, mesmo critério do
  // gate de escrita em `assignee-actions.ts` — as policies de atribuição
  // (0047) já permitem que um staff-admin de A atribua dentro de A; manter o
  // gate visual mais restrito que o banco seria dívida silenciosa.
  const canAssign =
    isPlatformAdmin(profile) || (await isTenantAdminOf(profile, opportunity.tenant_id));

  // Reprocessar a análise da IA (lib/ai/reprocess-actions.ts) é gate de PSW, e
  // NÃO o mesmo de atribuir: só super-admin da plataforma e staff PSW com
  // concessão de admin NESTA empresa (0045). O `tenant_admin` do cliente, que
  // atribui normalmente, não vê o botão — a ação queima crédito de IA da PSW e
  // pode reescrever campos derivados em massa. O predicado mora em
  // `canReprocessAiEnrichment()` justamente para o gate visual e o da Server
  // Action nunca divergirem; o bloqueio real é o da action (o enriquecimento
  // roda com service role, então ali a RLS não é a última linha).
  const canReprocessAi = await canReprocessAiEnrichment(
    profile,
    opportunity.tenant_id
  );
  const assignableProfiles = !canAssign
    ? []
    : isPlatformAdmin(profile) || isPswStaff(profile)
      ? await fetchAssignableProfilesForPswActor(
          opportunity.tenant_id,
          profile!.tenantId
        )
      : await fetchAssignableProfiles(opportunity.tenant_id);

  // Sinalização de contexto (Phase 17): o staff PSW, ao abrir uma oportunidade
  // de outra empresa, precisa enxergar de qual empresa ela é — "por que estou
  // vendo isto". Só para este papel: para os demais, a empresa deles é sempre
  // a mesma e o rótulo seria ruído. Nenhuma query extra fora deste papel.
  const companyTenant = isPswStaff(profile)
    ? (await fetchTenantsByIds([opportunity.tenant_id]))[0] ?? null
    : null;

  // Candidatos a responsável de TAREFA (ACCESS-11/D-14) — inclui o staff PSW
  // atribuído a ESTA oportunidade, além das pessoas do tenant. Lista distinta
  // da de atribuição da oportunidade, que é privilégio de admin.
  const taskAssignableProfiles = await fetchTaskAssignableProfiles(
    opportunity.id,
    opportunity.tenant_id
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="px-6 lg:px-8 py-6">
      <div className="max-w-screen-2xl mx-auto">
        <OpportunityDetail
          opportunity={opportunity}
          phases={phases}
          risks={risks}
          documents={documents}
          notes={notes}
          history={history}
          readOnly={readOnly}
          companyName={companyTenant?.name ?? null}
          tasks={tasks}
          taskAssignableProfiles={taskAssignableProfiles}
          today={today}
          assignees={assignees}
          assignableProfiles={assignableProfiles}
          canAssign={canAssign}
          canReprocessAi={canReprocessAi}
          sddState={sddState}
          // Gerar SDD tem o gate de EDITOR (requireEditorRole), não o de admin:
          // é a mesma fronteira de qualquer outra escrita na oportunidade.
          // Baixar não tem gate — o viewer pega o próprio documento.
          canGenerateSdd={!readOnly}
        />
      </div>
    </div>
  );
}
