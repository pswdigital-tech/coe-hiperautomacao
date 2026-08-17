import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { resolveEmpresaSlug } from '@/lib/tenants/scope';
import { fetchTenantIdBySlug } from '@/lib/tenants/queries';
import type { TenantRole } from '@/lib/opportunities/types';

// =============================================================================
// role.ts — RBAC simples (v0.3): 'viewer' é somente-leitura de verdade
// -----------------------------------------------------------------------------
// O bloqueio REAL é a RLS (migration 0015 — current_user_role() nas policies
// de insert/update/delete). Este helper é defesa em profundidade nas server
// actions (mesmo padrão de `.eq('tenant_id', profile.tenant_id)` em
// actions.ts) + fonte única pra UI decidir o que esconder (readOnly prop).
// =============================================================================

/**
 * Role do usuário autenticado corrente. `null` se não houver sessão/profile
 * (o caller decide o que fazer — normalmente as actions já checam `user`/
 * `profile` antes por outros motivos).
 */
export async function getCurrentUserRole(): Promise<TenantRole | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return data?.role ?? null;
}

/** Açúcar pra Server Components decidirem o que esconder na UI. */
export async function isReadOnlyViewer(): Promise<boolean> {
  const role = await getCurrentUserRole();
  return role === 'viewer';
}

/**
 * Guard de escrita para Server Actions — mesma mensagem pt-BR genérica usada
 * pelos outros erros de auth em actions.ts. Chamar ANTES de qualquer
 * insert/update/delete. A RLS (0015) bloqueia de qualquer forma, mas falhar
 * cedo aqui evita um round-trip ao banco só pra descobrir 42501.
 */
export async function requireEditorRole(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const role = await getCurrentUserRole();
  if (role === 'viewer') {
    return { ok: false, error: 'Seu perfil é somente leitura.' };
  }
  return { ok: true };
}

// =============================================================================
// getCurrentProfile / isPlatformAdmin — super-admin de plataforma (v0.3-admin,
// ported de origin/feat/v0.3-produtizacao). O bloqueio REAL de dados
// cross-tenant é a RLS aditiva (migration 0021, is_platform_admin()); estas
// funções são a contraparte server-side para decisões de UI/routing (guard de
// /admin, seletor de empresa na Sidebar).
// =============================================================================

export type CurrentProfile = {
  id: string;
  email: string;
  fullName: string | null;
  role: TenantRole;
  tenantId: string;
  tenantName: string | null;
  tenantSlug: string | null;
};

/**
 * Profile do usuário autenticado corrente, com role e tenant. Fonte única
 * para decisões de autorização no servidor (Server Components, Server
 * Actions, Route Handlers).
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, tenant_id, tenants(name, slug)')
    .eq('id', user.id)
    .single();

  if (error || !data) return null;

  // Supabase aninha o FK como objeto (single) ou array — normaliza.
  const tenantsField = data.tenants as
    | { name: string; slug: string }
    | { name: string; slug: string }[]
    | null;
  const tenant = Array.isArray(tenantsField) ? tenantsField[0] : tenantsField;

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    role: data.role,
    tenantId: data.tenant_id,
    tenantName: tenant?.name ?? null,
    tenantSlug: tenant?.slug ?? null,
  };
}

/**
 * Super-admin de plataforma (PSW): enxerga TODOS os tenants. Espelha o
 * predicado SQL `is_platform_admin()` usado nas policies de RLS cross-tenant
 * (migration 0021) — mantenha os dois em sincronia.
 */
export function isPlatformAdmin(profile: Pick<CurrentProfile, 'role'> | null): boolean {
  return profile?.role === 'platform_admin';
}

/**
 * Staff PSW multi-tenant por atribuição (Phase 17): espelha o predicado SQL
 * `current_user_role() = 'psw_staff'` usado nas policies aditivas das
 * migrations 0040+ — mantenha os dois em sincronia. **Não** é `platform_admin`
 * (D-06): são papéis distintos, um não é nível do outro. `platform_admin` vê
 * TODOS os tenants; `psw_staff` só enxerga as oportunidades que lhe foram
 * atribuídas via `opportunity_assignees` (0032), mesmo que sejam de tenants
 * diferentes ao mesmo tempo.
 */
export function isPswStaff(profile: Pick<CurrentProfile, 'role'> | null): boolean {
  return profile?.role === 'psw_staff';
}

/**
 * Papéis da PSW cujo tenant DE LOTAÇÃO nunca é o tenant do dado que eles
 * escrevem: `psw_staff` (multi-tenant por atribuição, 0040/0041) e
 * `platform_admin` (cross-tenant por RLS aditiva — SELECT na 0021,
 * INSERT/UPDATE/DELETE na 0025). Para os dois, o tenant-alvo de uma escrita
 * tem que sair do DADO-ALVO, nunca de `profile.tenantId`.
 *
 * POR QUE O `platform_admin` ENTROU AQUI (bug de 2026-08-13): ele ficava no
 * ramo "papel de cliente" de `resolveWriteTenantId()`, herdado de quando a
 * 0021 só lhe dava leitura cross-tenant. Quando a 0025 abriu a escrita, o
 * resolver não acompanhou — então um super-admin da PSW anotando numa
 * oportunidade de empresa cliente carimbava o tenant da PSW na linha filha e
 * levava o erro cru de `check_child_tenant_coherence()` (0043); e em
 * `updateOpportunity`, onde o mesmo valor vira `.eq('tenant_id', …)`, casava
 * ZERO LINHAS com `error: null` — "salvo com sucesso" sem ter salvo nada.
 *
 * Papéis de cliente (`member`/`viewer`/`tenant_admin`) continuam de fora: o
 * tenant deles É o tenant do dado, e o ramo sem ida ao banco é o que garante
 * zero regressão de latência (D-J).
 */
export function writesCrossTenant(profile: Pick<CurrentProfile, 'role'> | null): boolean {
  return isPswStaff(profile) || isPlatformAdmin(profile);
}

// =============================================================================
// resolveWriteTenantId — ponto único do escopo de escrita (Phase 17, D-11)
// -----------------------------------------------------------------------------
// POR QUE ESTA FUNÇÃO EXISTE: o padrão histórico de defesa em profundidade nas
// Server Actions de escrita era `.eq('tenant_id', profile.tenant_id)` — que
// pressupõe que o tenant DO PROFILE é o tenant DA LINHA sendo escrita. Isso é
// verdade para todo papel de cliente (`member`/`viewer`/`tenant_admin`) e
// **falso por design** para os papéis da PSW (`writesCrossTenant()`): o tenant
// do profile deles é o tenant da PSW, nunca o da oportunidade atribuída
// (`psw_staff`, Phase 17) nem o da empresa administrada (`platform_admin`,
// que ficou de fora daqui até 2026-08-13 — ver `writesCrossTenant()`).
//
// O SINTOMA que isso produz, se não corrigido: um `psw_staff` edita uma
// oportunidade legitimamente atribuída a ele; a RLS aditiva (0040/0041)
// libera a escrita; mas o `.eq('tenant_id', profile.tenant_id)` do call site
// casa ZERO LINHAS (o tenant do profile ≠ tenant da linha); o Supabase
// devolve `error: null`; a Server Action responde `{ ok: true }`; o usuário vê
// "salvo com sucesso" e NADA mudou no banco. É um sucesso silencioso
// mentiroso — o bug mais perigoso desta fase, porque não aparece como erro.
//
// A defesa em profundidade CONTINUA EXISTINDO — esta função não é uma forma
// de "remover o `.eq()` e confiar só na RLS". O que muda é a FONTE do valor:
// para papéis de cliente, é `profile.tenantId` (sem ida ao banco, idêntico ao
// que o `.eq()` cru já fazia); para os papéis da PSW, é o `tenant_id` lido da
// OPORTUNIDADE-ALVO, através do client autenticado — a RLS já limita essa
// leitura ao que cada um enxerga (`current_assigned_opportunity_ids()` para o
// staff, `is_platform_admin()` para o super-admin),
// então "oportunidade inexistente" e "oportunidade fora do escopo" colapsam
// no mesmo `null`, que é exatamente a semântica desejada (nunca revelar qual
// dos dois casos ocorreu).
// =============================================================================

/**
 * Mensagem pt-BR única para quando `resolveWriteTenantId` devolve `null` —
 * todos os call sites devem usar este texto (em vez de reescrevê-lo cada um a
 * sua maneira) para não divergir em redação nem revelar se a oportunidade não
 * existe ou simplesmente não está no escopo do usuário.
 */
export const WRITE_SCOPE_DENIED_MESSAGE =
  'Oportunidade não encontrada ou fora do seu escopo de acesso.';

/**
 * Resolve o `tenant_id` que uma Server Action de escrita deve usar como
 * filtro defensivo (`.eq('tenant_id', …)` ou como valor de `tenant_id` num
 * insert de tabela filha) — chamar DEPOIS do guard de papel
 * (`requireEditorRole()`) e ANTES de qualquer mutação.
 *
 * - Para `member`/`viewer`/`tenant_admin`: retorna `profile.tenantId` sem
 *   nenhuma consulta ao banco — comportamento idêntico ao
 *   `.eq('tenant_id', profile.tenant_id)` de hoje, zero regressão (SC-6).
 * - Para os papéis da PSW (`writesCrossTenant()` — `psw_staff` e
 *   `platform_admin`): lê `opportunities.tenant_id` pelo id informado, via o
 *   client autenticado (a RLS já filtra ao que cada um enxerga — o assignado,
 *   no caso do staff; tudo, no caso do super-admin). Devolve `null`
 *   quando a oportunidade não existe ou não está no escopo — o chamador DEVE
 *   tratar `null` como erro e retornar `{ ok: false, error:
 *   WRITE_SCOPE_DENIED_MESSAGE }` ANTES de tentar a mutação. É este early
 *   return que elimina o sucesso silencioso.
 */
export async function resolveWriteTenantId(
  profile: CurrentProfile,
  opportunityId: string
): Promise<string | null> {
  if (!writesCrossTenant(profile)) {
    return profile.tenantId;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('opportunities')
    .select('tenant_id')
    .eq('id', opportunityId)
    .maybeSingle();

  return data?.tenant_id ?? null;
}

/**
 * Admin da própria empresa (v0.4): gerencia a allowlist de convites do SEU
 * tenant — e só dele. Espelha o predicado das policies de 0029
 * (`current_user_role() = 'tenant_admin'` + escopo de tenant). NÃO é
 * platform_admin: o super-admin da PSW tem sua própria tela em /admin/invites,
 * com alcance global.
 */
export function isTenantAdmin(profile: Pick<CurrentProfile, 'role'> | null): boolean {
  return profile?.role === 'tenant_admin';
}

// =============================================================================
// isTenantAdminOf / resolveAdminTenantId — escopo de escrita de ADMIN (Phase
// 18, D-11/D-O), uma camada acima de resolveWriteTenantId()
// -----------------------------------------------------------------------------
// `resolveWriteTenantId()` (acima) resolve o tenant-alvo de uma Server Action
// a partir de uma OPORTUNIDADE. As Server Actions de admin (convite de
// equipe, branding) não têm oportunidade — têm uma EMPRESA. Este par é a
// irmã direta, uma camada acima, para esse caso: staff PSW pode agora
// administrar N empresas ao mesmo tempo (concessão em `psw_tenant_admins`,
// migration `0045`), e o tenant-alvo de uma escrita de admin precisa vir
// dessa concessão — nunca do tenant de lotação do profile.
// =============================================================================

/**
 * Mensagem pt-BR única para quando `resolveAdminTenantId` devolve `null` —
 * toda Server Action de admin que resolve tenant-alvo usa este texto (em vez
 * de reescrevê-lo cada uma a sua maneira), pela mesma disciplina de
 * `WRITE_SCOPE_DENIED_MESSAGE`: não revelar se a empresa não existe ou
 * simplesmente está fora do escopo de quem pediu — os dois casos colapsam de
 * propósito na mesma frase.
 */
export const ADMIN_SCOPE_DENIED_MESSAGE =
  'Empresa não encontrada ou fora do seu escopo de administração.';

/**
 * Espelha o predicado SQL `is_tenant_admin_of(t uuid)` (migration `0045`,
 * reemitido como fonte única das 11 policies vivas de `tenant_admin` pela
 * `0047`) — mantenha os dois em sincronia, como já acontece com
 * `isPlatformAdmin()`/`is_platform_admin()`.
 *
 * true quando (a) o profile é `tenant_admin` e `tenantId` é o tenant dele —
 * ramo SEM ida ao banco, byte-equivalente ao `isTenantAdmin()` de hoje (D-J:
 * zero regressão de latência para papéis de cliente) — ou (b) o profile é
 * `psw_staff` e existe uma linha de concessão dele para `tenantId` em
 * `psw_tenant_admins` (a policy `psw_tenant_admins_select` permite que a
 * própria pessoa leia suas concessões, então nenhum client privilegiado é
 * necessário aqui). Qualquer outro papel (`member`, `viewer`,
 * `platform_admin` — que tem o próprio caminho via `isPlatformAdmin()`) ou
 * profile nulo devolve `false` sem consulta.
 *
 * É assíncrona enquanto `isTenantAdmin()` (a irmã síncrona acima) continua
 * existindo — de propósito: a assinatura diferente força quem for tocar um
 * ponto de uso a olhar aquele ponto especificamente, em vez de uma troca
 * textual às cegas. Os pontos de uso desta fase precisavam ser revistos um a
 * um de qualquer forma (RESEARCH.md §6).
 */
export async function isTenantAdminOf(
  profile: CurrentProfile | null,
  tenantId: string
): Promise<boolean> {
  if (!profile) return false;

  if (profile.role === 'tenant_admin') {
    return profile.tenantId === tenantId;
  }

  if (profile.role !== 'psw_staff') return false;

  const supabase = await createClient();
  const { data } = await supabase
    .from('psw_tenant_admins')
    .select('id')
    .eq('profile_id', profile.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  return Boolean(data);
}

/**
 * Resolve o `tenant_id`-ALVO de uma Server Action de ADMIN — irmã de
 * `resolveWriteTenantId()` uma camada acima: lá o escopo vem da oportunidade,
 * aqui vem da empresa. Chamar DEPOIS de obter o profile e ANTES de qualquer
 * mutação.
 *
 * - Para `member`/`viewer`/`tenant_admin`/`platform_admin`: retorna
 *   `profile.tenantId` sem nenhuma consulta ao banco, IGNORANDO
 *   `requestedTenantId` — comportamento idêntico ao filtro por tenant de
 *   hoje, zero regressão (mesmo padrão do ramo "cliente" de
 *   `resolveWriteTenantId`).
 * - Para `psw_staff`: o tenant-alvo NUNCA vem do profile (o tenant dele é o
 *   da PSW, nunca o da empresa administrada). Sem `requestedTenantId` (sem
 *   empresa selecionada) devolve `null` sem consulta — adivinhar seria
 *   gravar no tenant errado. Com `requestedTenantId`, valida contra a
 *   concessão via `isTenantAdminOf()` e só devolve o id quando a concessão
 *   existir; caso contrário devolve `null`.
 *
 * O chamador DEVE tratar `null` como erro e retornar
 * `{ error: ADMIN_SCOPE_DENIED_MESSAGE }` (ou o early-return equivalente da
 * action) ANTES de tentar a mutação — é este early return que elimina o
 * sucesso silencioso (RLS que casa zero linhas e devolve sucesso).
 */
export async function resolveAdminTenantId(
  profile: CurrentProfile,
  requestedTenantId: string | undefined
): Promise<string | null> {
  if (!isPswStaff(profile)) {
    return profile.tenantId;
  }

  if (!requestedTenantId) return null;

  const allowed = await isTenantAdminOf(profile, requestedTenantId);
  return allowed ? requestedTenantId : null;
}

/**
 * Auxiliar de conveniência: resolve o tenant-alvo de uma Server Action de
 * admin diretamente a partir do CONTEXTO já existente do seletor de empresa
 * da Sidebar, em vez de cada call site repetir os três passos (resolver slug
 * → resolver id → validar concessão) — e um deles acabar esquecendo a
 * validação.
 *
 * A origem é sempre o seletor (`?empresa=` na URL, com queda para o cookie
 * `coe_empresa` via `resolveEmpresaSlug()`) — NUNCA um campo de formulário.
 * Numa Server Action não há `searchParams` de rota; passar um
 * `URLSearchParams` vazio faz `resolveEmpresaSlug()` cair direto no cookie,
 * que é exatamente o comportamento desejado (o seletor persiste ali entre
 * submits). A disciplina "o tenant não vem do formulário" (comentário de
 * cabeçalho de `team/actions.ts`) é preservada invertendo a FONTE, não
 * relaxando a regra.
 *
 * Para papéis de cliente, resolve direto para `profile.tenantId` sem nenhuma
 * consulta — o seletor de empresa nem aparece pra eles (D-J). Devolve `null`
 * quando não há slug selecionado, quando o slug não resolve a um tenant
 * existente, ou quando o tenant resolvido não é administrado pela pessoa —
 * mesmo contrato de `null` de `resolveAdminTenantId()`.
 */
export async function resolveAdminTenantIdFromSelector(
  profile: CurrentProfile
): Promise<string | null> {
  if (!isPswStaff(profile)) {
    return resolveAdminTenantId(profile, undefined);
  }

  const slug = await resolveEmpresaSlug(new URLSearchParams());
  if (!slug) return null;

  const tenantId = await fetchTenantIdBySlug(slug);
  if (!tenantId) return null;

  return resolveAdminTenantId(profile, tenantId);
}
