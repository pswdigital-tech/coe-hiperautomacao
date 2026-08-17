'use server';

// =============================================================================
// assignee-actions.ts — atribuir/desatribuir pessoas (0032; cross-tenant D-05
// na Phase 17; gate alinhado com a RLS na Phase 18, Plan 08, GRANT-04/GRANT-09)
// -----------------------------------------------------------------------------
// Camadas de defesa (mesmo padrão do resto do projeto):
//   1. Guard aqui — `platform_admin` OU o par pessoa × empresa
//      (`isTenantAdminOf`) contra o tenant da OPORTUNIDADE-ALVO. As policies
//      de atribuição (0047) já chamam `is_tenant_admin_of()` como fonte
//      única — o banco JÁ permite que um staff-admin de A atribua dentro de
//      A; manter esta ação mais restrita seria dívida silenciosa (a próxima
//      pessoa que comparar os dois vai supor que o erro está no banco, não
//      aqui).
//   2. `tenant_id` derivado da OPORTUNIDADE no servidor, nunca do formulário.
//   3. Candidatos validados: do MESMO tenant da oportunidade sempre; OU
//      `psw_staff` de QUALQUER tenant quando quem atribui é `platform_admin`
//      (D-05) — o único vínculo cruzado legítimo desta fase.
//   4. RLS (0032/0047) é o bloqueio real. A trigger `check_assignee_tenant()`
//      (reescrita na 0040) repete esta mesma regra no banco: aceita vínculo
//      cruzado SOMENTE quando o profile atribuído é `psw_staff`, e continua
//      rejeitando qualquer outro profile de tenant diferente — inclusive
//      quando quem atribui é `platform_admin`.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  getCurrentProfile,
  isPlatformAdmin,
  isTenantAdminOf,
  isPswStaff,
  WRITE_SCOPE_DENIED_MESSAGE,
} from '@/lib/security/role';

export type AssignResult = { ok: true } | { ok: false; error: string };

/**
 * Define o conjunto EXATO de pessoas atribuídas a uma oportunidade (o que não
 * vier na lista é desatribuído). Idempotente: reenviar a mesma lista não muda
 * nada.
 */
export async function setOpportunityAssignees(
  opportunityId: string,
  profileIds: string[]
): Promise<AssignResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  const supabase = await createClient();

  // tenant_id vem da oportunidade (server-derived) ANTES do gate — o critério
  // de quem pode atribuir agora depende do tenant-ALVO (par pessoa × empresa),
  // não só do papel isolado. A RLS de `opportunities` já limita esta leitura a
  // quem tem algum acesso (tenant_admin do próprio tenant, platform_admin, ou
  // staff-admin/atribuído); "não encontrada" e "fora do escopo" colapsam de
  // propósito na mesma mensagem — nunca revelar qual dos dois casos ocorreu.
  const { data: opp } = await supabase
    .from('opportunities')
    .select('id, tenant_id')
    .eq('id', opportunityId)
    .maybeSingle();

  if (!opp) return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };

  // Gate de escrita: super-admin em qualquer empresa, OU o par pessoa ×
  // empresa contra o tenant da oportunidade-alvo (mesmo critério do gate
  // visual em opportunities/[id]/page.tsx — interface e servidor concordam,
  // o servidor continua sendo o bloqueio real).
  const canAssign =
    isPlatformAdmin(profile) || (await isTenantAdminOf(profile, opp.tenant_id));
  if (!canAssign) {
    return { ok: false, error: WRITE_SCOPE_DENIED_MESSAGE };
  }

  // Aceita profiles do MESMO tenant da oportunidade — a regra de sempre — OU,
  // quando quem atribui opera pela PSW (`platform_admin`, ou `psw_staff` que
  // já passou no gate de admin DESTA oportunidade acima), também profiles
  // `psw_staff` de QUALQUER tenant (D-05: cliente nunca vincula gente de fora
  // — um `tenant_admin` de cliente não pode, e a UI dele nem oferece essa
  // opção; esta é a segunda camada). O ramo do `psw_staff` é o que permite ao
  // staff-admin atribuir a si mesmo a oportunidade que administra — e, por
  // consequência, virar responsável de tarefa (a trigger de 0041 exige o
  // vínculo em `opportunity_assignees`). A
  // trigger `check_assignee_tenant()` (0040) repete a checagem no banco —
  // esta camada existe para a mensagem legível, não como bloqueio único.
  const unique = Array.from(new Set(profileIds.filter(Boolean)));
  let valid: string[] = [];
  if (unique.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, tenant_id, role')
      .in('id', unique);
    const actingForPsw = isPlatformAdmin(profile) || isPswStaff(profile);
    valid = (profiles ?? [])
      .filter(
        (p) => p.tenant_id === opp.tenant_id || (actingForPsw && isPswStaff(p))
      )
      .map((p) => p.id);
    if (valid.length !== unique.length) {
      return { ok: false, error: 'Alguma das pessoas não pertence a esta empresa.' };
    }
  }

  // Reconcilia: apaga o que saiu, insere o que entrou. Duas queries pequenas,
  // sem transação — o pior caso de uma falha no meio é a lista ficar como
  // estava em parte, e o admin reenviar.
  const { data: current } = await supabase
    .from('opportunity_assignees')
    .select('profile_id')
    .eq('opportunity_id', opportunityId);

  const currentIds = (current ?? []).map((r) => r.profile_id);
  const toRemove = currentIds.filter((id) => !valid.includes(id));
  const toAdd = valid.filter((id) => !currentIds.includes(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('opportunity_assignees')
      .delete()
      .eq('opportunity_id', opportunityId)
      .in('profile_id', toRemove);
    if (error) return { ok: false, error: `Erro ao desatribuir: ${error.message}` };
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from('opportunity_assignees').insert(
      toAdd.map((profileId) => ({
        opportunity_id: opportunityId,
        profile_id: profileId,
        tenant_id: opp.tenant_id, // server-derived — NUNCA do formulário
        created_by: profile.id,
      }))
    );
    if (error) return { ok: false, error: `Erro ao atribuir: ${error.message}` };
  }

  revalidatePath('/opportunities');
  revalidatePath(`/opportunities/${opportunityId}`);
  return { ok: true };
}
