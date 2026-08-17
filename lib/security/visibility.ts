// =============================================================================
// visibility.ts — recorte de visibilidade POR PESSOA (migration 0053)
// -----------------------------------------------------------------------------
// O que este módulo NÃO faz: filtrar oportunidade nenhuma. O recorte é feito
// pela RLS (policies RESTRICTIVE da 0053) — se este arquivo inteiro sumisse, a
// visibilidade de todo mundo continuaria correta. O que existe aqui é só a
// LEITURA do estado do recorte, para as telas de administração conseguirem
// mostrar e editar o que já vale no banco.
//
// Modelo, resumido (detalhe no cabeçalho da 0053):
//   • scope 'all' (padrão, e ausência de linha) → vê tudo do tenant, como hoje.
//   • scope 'restricted' → vê só o que estiver em `profile_opportunity_access`.
// =============================================================================

import { createClient } from '@/lib/supabase/server';

export type VisibilityScope = 'all' | 'restricted';

export type ProfileVisibility = {
  scope: VisibilityScope;
  /** Ids liberados. Só tem significado quando `scope === 'restricted'`. */
  opportunityIds: string[];
};

/**
 * Estado do recorte de UMA pessoa. Ausência de linha em `profile_visibility`
 * é lida como 'all' — é isso que faz todo perfil pré-0053 continuar vendo
 * tudo sem precisar de backfill.
 *
 * A RLS de `profile_visibility` deixa ler quem administra a empresa (ou a
 * própria pessoa); se o chamador não for nenhum dos dois, a query volta vazia
 * e o resultado é 'all' — o que é seguro, porque quem não pode ler também não
 * pode escrever, e a tela nunca chega a ser renderizada para ele.
 */
export async function fetchProfileVisibility(profileId: string): Promise<ProfileVisibility> {
  const supabase = await createClient();

  const [scopeRes, accessRes] = await Promise.all([
    supabase.from('profile_visibility').select('scope').eq('profile_id', profileId).maybeSingle(),
    supabase.from('profile_opportunity_access').select('opportunity_id').eq('profile_id', profileId),
  ]);

  return {
    scope: (scopeRes.data?.scope as VisibilityScope | undefined) ?? 'all',
    opportunityIds: (accessRes.data ?? []).map((r) => r.opportunity_id),
  };
}

/**
 * Recorte pendurado num CONVITE ainda não usado (0054). Mesma leitura de
 * ausência que a de perfil: sem linha ≡ 'all'. Quando a pessoa criar a conta,
 * `handle_new_user()` copia isto para as tabelas de perfil e a partir dali
 * quem manda é a 0053 — editar o convite depois disso não muda mais nada.
 */
export async function fetchInviteVisibility(inviteId: string): Promise<ProfileVisibility> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('invite_visibility')
    .select('scope, opportunity_ids')
    .eq('invited_email_id', inviteId)
    .maybeSingle();

  return {
    scope: (data?.scope as VisibilityScope | undefined) ?? 'all',
    opportunityIds: data?.opportunity_ids ?? [],
  };
}

/**
 * Resumo para a lista de convites pendentes: convite → quantas oportunidades.
 * Só os restritos entram no Map — quem não aparece herda tudo da empresa.
 */
export async function fetchInviteVisibilitySummary(
  inviteIds: string[],
): Promise<Map<string, number>> {
  if (inviteIds.length === 0) return new Map();

  const supabase = await createClient();

  const { data } = await supabase
    .from('invite_visibility')
    .select('invited_email_id, opportunity_ids')
    .eq('scope', 'restricted')
    .in('invited_email_id', inviteIds);

  return new Map((data ?? []).map((r) => [r.invited_email_id, r.opportunity_ids.length]));
}

/**
 * Irmã cross-tenant de `fetchTenantVisibilitySummary`, para a lista global do
 * `platform_admin` em `/admin/invites` — mesmas duas queries, recortadas por
 * um conjunto de pessoas em vez de por empresa. Só o `platform_admin` obtém
 * linhas de outras empresas aqui: a RLS da 0053 é quem decide, não o filtro.
 */
export async function fetchRestrictedCountsForProfiles(
  profileIds: string[],
): Promise<Map<string, number>> {
  if (profileIds.length === 0) return new Map();

  const supabase = await createClient();

  const { data: restricted } = await supabase
    .from('profile_visibility')
    .select('profile_id')
    .eq('scope', 'restricted')
    .in('profile_id', profileIds);

  const restrictedIds = (restricted ?? []).map((r) => r.profile_id);
  if (restrictedIds.length === 0) return new Map();

  const { data: access } = await supabase
    .from('profile_opportunity_access')
    .select('profile_id')
    .in('profile_id', restrictedIds);

  const counts = new Map<string, number>(restrictedIds.map((id) => [id, 0]));
  for (const row of access ?? []) {
    counts.set(row.profile_id, (counts.get(row.profile_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Quantas oportunidades cada pessoa da empresa enxerga, para o resumo da
 * lista de equipe. Devolve um Map profile_id → contagem, contendo APENAS os
 * perfis restritos — quem não aparece no Map vê tudo.
 *
 * Duas queries e não uma por pessoa: a tela lista N pessoas, e uma chamada
 * por linha viraria N+1 round-trips só para desenhar um rótulo.
 */
export async function fetchTenantVisibilitySummary(
  tenantId: string,
): Promise<Map<string, number>> {
  const supabase = await createClient();

  const { data: restricted } = await supabase
    .from('profile_visibility')
    .select('profile_id')
    .eq('tenant_id', tenantId)
    .eq('scope', 'restricted');

  const restrictedIds = (restricted ?? []).map((r) => r.profile_id);
  if (restrictedIds.length === 0) return new Map();

  const { data: access } = await supabase
    .from('profile_opportunity_access')
    .select('profile_id')
    .eq('tenant_id', tenantId)
    .in('profile_id', restrictedIds);

  // Toda pessoa restrita entra no Map — inclusive com 0. "Restrito a nenhuma
  // oportunidade" é um estado legítimo e precisa aparecer como tal na tela,
  // não como "vê tudo".
  const counts = new Map<string, number>(restrictedIds.map((id) => [id, 0]));
  for (const row of access ?? []) {
    counts.set(row.profile_id, (counts.get(row.profile_id) ?? 0) + 1);
  }
  return counts;
}
