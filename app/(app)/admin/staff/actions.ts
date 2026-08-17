'use server';

// =============================================================================
// admin/staff/actions.ts — conceder, revogar e contar o impacto da revogação
// (Phase 18, Plan 04, GRANT-06/07/08)
// -----------------------------------------------------------------------------
// O ator aqui é sempre o `platform_admin` — é quem entra em `/admin/staff`
// (guard herdado de `app/(app)/admin/layout.tsx`, D-N). O guard `isPlatformAdmin`
// abaixo é falha-cedo (evita um round-trip ao banco só para descobrir 42501);
// o bloqueio REAL é a RLS de `psw_tenant_admins` (migration 0045: insert/delete
// exigem `is_platform_admin()`, sem policy de update) — já provada pelo plano
// 18-02 (specs c6/c7 e observação direta pelo app).
//
// Esta tela é a ÚNICA superfície de escrita de `psw_tenant_admins` em toda a
// aplicação (T-18-30). Este arquivo NUNCA escreve nem lê a tabela de
// atribuição individual diretamente — nem sequer o nome dela aparece aqui
// (T-18-31/D-C): a contagem de impacto usa `fetchOpportunityIdsForAssignee`,
// o helper já existente de `lib/opportunities/assignees.ts`, e não uma query
// nova. Dois pontos de escrita/leitura ad-hoc da mesma tabela divergiriam em
// validação — o ponto único de escrita de atribuição individual continua
// sendo `components/opportunities/AssigneesPanel.tsx`.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile, isPlatformAdmin } from '@/lib/security/role';
import { fetchOpportunityIdsForAssignee } from '@/lib/opportunities/assignees';
import { countOpportunitiesLostOnRevoke } from '@/lib/staff-admin/origins';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GrantResult = { ok: true } | { error: string };

/**
 * Concede a uma pessoa (que precisa ser `psw_staff`) a condição de admin de
 * uma empresa. Nunca interpola a mensagem crua do banco na resposta
 * (T-18-32) — cada código de erro conhecido vira uma frase pt-BR fixa.
 */
export async function grantTenantAdmin(formData: FormData): Promise<GrantResult> {
  const profile = await getCurrentProfile();
  if (!isPlatformAdmin(profile)) return { error: 'Acesso negado.' };

  const personId = String(formData.get('profile_id') ?? '').trim();
  const tenantId = String(formData.get('tenant_id') ?? '').trim();

  if (!UUID_RE.test(personId) || !UUID_RE.test(tenantId)) {
    return { error: 'Selecione uma pessoa e uma empresa válidas.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('psw_tenant_admins').insert({
    profile_id: personId,
    tenant_id: tenantId,
    granted_by: profile!.id,
  });

  if (error) {
    // unique(profile_id, tenant_id) — a pessoa já administra essa empresa.
    if (error.code === '23505') {
      return { error: 'Essa pessoa já é admin dessa empresa.' };
    }
    // trigger `psw_tenant_admins_role_guard` (0045) rejeita papel != psw_staff.
    if (error.code === '23514') {
      return { error: 'A concessão de admin de empresa só existe para staff PSW.' };
    }
    return { error: 'Não foi possível conceder o acesso. Tente novamente.' };
  }

  revalidatePath('/admin/staff');
  return { ok: true };
}

/**
 * Revoga (apaga) uma concessão pelo id da linha em `psw_tenant_admins`.
 * Apaga SÓ essa linha — nada mais. As atribuições individuais nominais da
 * pessoa naquela empresa sobrevivem por construção: esta ação não as toca,
 * não as lê, não as apaga (D-C/D-G).
 */
export async function revokeTenantAdmin(grantId: string): Promise<GrantResult> {
  const profile = await getCurrentProfile();
  if (!isPlatformAdmin(profile)) return { error: 'Acesso negado.' };

  if (!UUID_RE.test(grantId)) return { error: 'Concessão inválida.' };

  const supabase = await createClient();
  const { error } = await supabase.from('psw_tenant_admins').delete().eq('id', grantId);

  if (error) {
    return { error: 'Não foi possível revogar o acesso. Tente novamente.' };
  }

  revalidatePath('/admin/staff');
  return { ok: true };
}

export type RevokeImpactResult = { ok: true; count: number } | { error: string };

/**
 * Quantas oportunidades a pessoa deixa de ver ao revogar esta concessão
 * (D-G) — chamada SOB DEMANDA quando o diálogo de revogação abre, nunca
 * persistida, nunca uma prop estática do componente pai (T-18-33).
 *
 * O conjunto "atribuídas nominalmente" vem de `fetchOpportunityIdsForAssignee`
 * (helper já existente, sem tenant) — a diferença de conjuntos em
 * `countOpportunitiesLostOnRevoke` já ignora, por construção, qualquer id
 * atribuído fora do tenant concedido (não está no conjunto "visível" daquele
 * tenant), então não é preciso — nem desejável (T-18-31) — filtrar a tabela de
 * atribuição por tenant aqui.
 */
export async function countRevokeImpact(grantId: string): Promise<RevokeImpactResult> {
  const profile = await getCurrentProfile();
  if (!isPlatformAdmin(profile)) return { error: 'Acesso negado.' };

  if (!UUID_RE.test(grantId)) return { error: 'Concessão inválida.' };

  const supabase = await createClient();
  const { data: grant, error: grantError } = await supabase
    .from('psw_tenant_admins')
    .select('profile_id, tenant_id')
    .eq('id', grantId)
    .maybeSingle();

  if (grantError || !grant) return { error: 'Concessão não encontrada.' };

  const [visibleRes, assignedIds] = await Promise.all([
    supabase.from('opportunities').select('id').eq('tenant_id', grant.tenant_id),
    fetchOpportunityIdsForAssignee(grant.profile_id),
  ]);

  if (visibleRes.error) {
    return { error: 'Não foi possível calcular o impacto da revogação.' };
  }

  const visibleIds = (visibleRes.data ?? []).map((o) => o.id);

  return { ok: true, count: countOpportunitiesLostOnRevoke(visibleIds, assignedIds) };
}
