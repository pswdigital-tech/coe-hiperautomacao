import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { publicLogoUrl } from '@/lib/branding/queries';
import { normalizeHexColor } from '@/lib/branding/theme';

export type PublicTenant = {
  id: string;
  name: string;
  slug: string;
  /** Identidade visual (0033/0034) — null nos dois = padrão PSW. */
  brandColor: string | null;
  logoUrl: string | null;
};

type PublicTenantRow = {
  id: string;
  name: string;
  slug: string;
  brand_color: string | null;
  logo_path: string | null;
};

/**
 * Resolve tenant por slug. Usa RPC SECURITY DEFINER — qualquer usuário
 * (autenticado ou não) pode chamar. Retorna null se slug não existir.
 *
 * Traz o branding junto porque o formulário público é anônimo: o `anon` não lê
 * `tenants` (RLS), e esta RPC é a única porta. Ver 0034.
 */
export async function fetchPublicTenantBySlug(
  slug: string
): Promise<PublicTenant | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fetch_public_tenant', {
    p_slug: slug,
  });
  if (error) throw new Error(`Erro ao buscar tenant: ${error.message}`);
  const row = (data as PublicTenantRow[] | null)?.[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    brandColor: normalizeHexColor(row.brand_color),
    logoUrl: publicLogoUrl(row.logo_path),
  };
}

/** Item do seletor "projeto associado" do formulário público (0035). */
export type PublicOpportunityOption = {
  id: string;
  seqId: number;
  processo: string;
  area: string | null;
};

/**
 * Automações existentes da empresa, para o seletor de projeto que aparece
 * quando a solicitação pública é Melhoria ou Incidente.
 *
 * Recorte MÍNIMO e definido no banco (`fetch_public_opportunities`, 0035 +
 * 0036): só tenant ativo, só `visivel`, `processo` truncado em 160 chars.
 * Nenhum dado de contato, status ou score sai daqui. Falha vira lista vazia — o
 * formulário degrada para "não encontrei meu projeto" em vez de quebrar a
 * página pública.
 */
export async function fetchPublicOpportunities(
  slug: string
): Promise<PublicOpportunityOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fetch_public_opportunities', {
    p_slug: slug,
  });
  if (error) {
    console.error('[tenants/queries] fetch_public_opportunities:', error.message);
    return [];
  }
  const rows = (data ?? []) as {
    id: string;
    seq_id: number;
    processo: string | null;
    area: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    seqId: r.seq_id,
    processo: r.processo ?? 'Sem descrição',
    area: r.area,
  }));
}

/**
 * Resolve um slug de empresa → tenant_id, para o filtro do seletor de empresa
 * (platform_admin). Usa o client autenticado: o RLS de `tenants` garante que só
 * o platform_admin vê slugs de outros tenants (membro comum → null se alheio).
 * Mantém o UUID FORA da URL — a URL carrega só o slug legível.
 */
export async function fetchTenantIdBySlug(slug: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  return data?.id ?? null;
}

/** Item mínimo da coluna/filtro "Empresa" da listagem (Phase 17, Plan 17-07). */
export type TenantSummary = {
  id: string;
  name: string;
  slug: string;
};

/**
 * Busca empresas por ids — usada pela coluna e pelo filtro "Empresa" da
 * listagem do `psw_staff` (Phase 17). Whitelist explícita de colunas (nunca
 * `select('*')`, HARDEN-E-06); dedupe dos ids antes da query; retorno vazio
 * sem ida ao banco quando a lista de ids é vazia.
 *
 * Segurança: esta função NÃO filtra por papel — a RLS aditiva
 * `tenants_select_psw_staff` (0040) já garante que um `psw_staff` só resolve
 * ids de empresas onde tem oportunidade atribuída. Os ids passados aqui vêm
 * das oportunidades já retornadas por `fetchOpportunities()` (que a RLS já
 * filtrou), então não há "varredura" possível — é só um lookup de rótulo.
 *
 * Degrada para lista vazia em erro (mesmo padrão de `fetchPublicOpportunities`
 * acima): um rótulo de empresa que falhou não pode derrubar a listagem.
 */
export async function fetchTenantsByIds(ids: string[]): Promise<TenantSummary[]> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .in('id', uniqueIds)
    .order('name');

  if (error) {
    console.error('[tenants/queries] fetchTenantsByIds:', error.message);
    return [];
  }
  return (data ?? []) as TenantSummary[];
}

/**
 * Empresas em que o usuário corrente pode REGISTRAR uma oportunidade em nome
 * do cliente (tela `/opportunities/register`, 0051).
 *
 * FONTE ÚNICA: a função SQL `staff_writable_tenant_ids()` — a MESMA que a RPC
 * `create_staff_opportunity` consulta para autorizar a escrita. Montar a lista
 * do seletor por outro caminho (ex.: repetir aqui a união
 * `psw_tenant_admins` ∪ `opportunity_assignees`) abriria a porta clássica de
 * a UI oferecer uma empresa que o banco depois recusa — ou, pior, esconder
 * uma que ele aceitaria. Aqui a UI só pode oferecer o que o banco aceita,
 * por construção.
 *
 * Devolve lista vazia para papéis de cliente (`member`/`tenant_admin`/
 * `viewer`) — é o que faz a tela sumir para eles, mesmo por URL direta.
 * Degrada para vazio em erro, mesmo padrão de `fetchTenantsByIds`.
 */
export async function fetchStaffWritableTenants(): Promise<TenantSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('staff_writable_tenant_ids');
  if (error) {
    console.error('[tenants/queries] staff_writable_tenant_ids:', error.message);
    return [];
  }
  // A RPC devolve `setof uuid` → array de strings cru.
  const ids = (data ?? []) as unknown as string[];
  return fetchTenantsByIds(ids);
}

/**
 * Retorna o tenant + slug do usuário autenticado corrente.
 * Usado em páginas autenticadas que precisam do slug pra montar URLs públicas.
 */
export async function getCurrentTenant(): Promise<PublicTenant | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('tenant_id, tenants(id, name, slug, brand_color, logo_path)')
    .eq('id', user.id)
    .single();

  if (error || !data) return null;

  const tenants = data.tenants as PublicTenantRow | PublicTenantRow[] | null;
  const t = Array.isArray(tenants) ? tenants[0] : tenants;
  if (!t) return null;
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    brandColor: normalizeHexColor(t.brand_color),
    logoUrl: publicLogoUrl(t.logo_path),
  };
}

/**
 * Empresas em que o usuário corrente pode IMPORTAR oportunidades em massa
 * (tela `/opportunities/import`, migration 0059).
 *
 * FONTE ÚNICA: a função SQL `import_writable_tenant_ids()` — a MESMA que a RPC
 * `import_opportunities` consulta para autorizar a escrita, pelo mesmo motivo
 * de `fetchStaffWritableTenants()` acima: a UI não pode oferecer uma empresa
 * que o banco depois recusa, nem esconder uma que ele aceitaria.
 *
 * Não confundir com `fetchStaffWritableTenants()`: aquela inclui a empresa onde
 * um `psw_staff` só tem oportunidade ATRIBUÍDA (basta para registrar UMA
 * demanda); esta exige concessão de ADMIN da empresa (0045) — importar em massa
 * é ato de administração. Devolve vazio para `member`/`viewer`, que é o que faz
 * a tela sumir para eles mesmo por URL direta.
 */
export async function fetchImportableTenants(): Promise<TenantSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('import_writable_tenant_ids');
  if (error) {
    console.error('[tenants/queries] import_writable_tenant_ids:', error.message);
    return [];
  }
  const ids = (data ?? []) as unknown as string[];
  return fetchTenantsByIds(ids);
}
