import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantRole } from './types';
import type { Assignee, AssignableProfile } from './assignee-types';
import type { Cargo } from '@/lib/security/cargo';

export type { Assignee, AssignableProfile };

// =============================================================================
// assignees.ts — quem está atribuído a uma oportunidade (0032)
// -----------------------------------------------------------------------------
// Substitui, na UI, o texto livre `opportunities.responsavel`: agora é vínculo
// real com `profiles` (N:N). A tabela tem `tenant_id` + RLS (0032), então estas
// queries não precisam passar tenant — mas, seguindo o docs/PROJETO.md, quem tem o
// tenant em mãos filtra explicitamente mesmo assim.
//
// Leitura: qualquer pessoa do tenant. Escrita: só admin — ver assignee-actions.ts.
// =============================================================================

type JoinedProfile = {
  email: string;
  full_name: string | null;
  /** Ausente quando a 0031 ainda não foi aplicada — ver fallback abaixo. */
  cargo?: string | null;
  role: TenantRole;
};

type JoinedRow = {
  opportunity_id: string;
  profile_id: string;
  profiles: JoinedProfile | JoinedProfile[] | null;
};

/** Supabase aninha o FK como objeto (single) ou array — normaliza. */
function flatten(row: JoinedRow): Assignee | null {
  const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  if (!p) return null;
  return {
    profileId: row.profile_id,
    email: p.email,
    fullName: p.full_name,
    cargo: p.cargo ?? null,
    role: p.role,
  };
}

/** Ordem estável de exibição: nome (ou e-mail, se sem nome). */
function byName(a: Assignee, b: Assignee): number {
  return (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email, 'pt-BR');
}

// `cargo` só existe a partir da 0031. Se a 0032 (esta tabela) estiver aplicada
// mas a 0031 não, o join abaixo falha inteiro com 42703 e a UI mostraria
// "Ninguém atribuído" logo depois de um salvamento bem-sucedido — o pior tipo
// de bug, porque parece perda de dado. Estas duas constantes permitem repetir a
// query sem a coluna nesse caso.
// O embed precisa nomear a CONSTRAINT: a tabela tem dois FKs para `profiles`
// (`profile_id` e `created_by`), e sem isso o PostgREST recusa com
// "more than one relationship was found".
const PROFILE_FK = 'profiles!opportunity_assignees_profile_id_fkey';
const JOIN_WITH_CARGO = `opportunity_id, profile_id, ${PROFILE_FK}(email, full_name, cargo, role)`;
const JOIN_WITHOUT_CARGO = `opportunity_id, profile_id, ${PROFILE_FK}(email, full_name, role)`;

function warnMissingCargo() {
  console.warn(
    '[assignees] coluna `cargo` ausente — aplique a migration 0031 para ver o cargo das pessoas.'
  );
}

/** Assignees de UMA oportunidade. */
export async function fetchAssigneesForOpportunity(
  opportunityId: string
): Promise<Assignee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('opportunity_assignees')
    .select(JOIN_WITH_CARGO)
    .eq('opportunity_id', opportunityId);

  let rows = (data ?? []) as JoinedRow[];

  if (error) {
    if (error.code !== '42703') {
      console.error('[assignees] falha ao ler atribuições:', error.message);
      return [];
    }
    warnMissingCargo();
    const { data: fallback, error: fallbackError } = await supabase
      .from('opportunity_assignees')
      .select(JOIN_WITHOUT_CARGO)
      .eq('opportunity_id', opportunityId);
    if (fallbackError) {
      console.error('[assignees] falha ao ler atribuições:', fallbackError.message);
      return [];
    }
    rows = (fallback ?? []) as JoinedRow[];
  }

  return rows
    .map(flatten)
    .filter((a): a is Assignee => a !== null)
    .sort(byName);
}

/**
 * Assignees de VÁRIAS oportunidades, agrupados por id — uma query só, para a
 * listagem não cair em N+1.
 */
export async function fetchAssigneesForOpportunities(
  opportunityIds: string[]
): Promise<Record<string, Assignee[]>> {
  if (opportunityIds.length === 0) return {};

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('opportunity_assignees')
    .select(JOIN_WITH_CARGO)
    .in('opportunity_id', opportunityIds);

  let rows = (data ?? []) as JoinedRow[];

  if (error) {
    if (error.code !== '42703') {
      console.error('[assignees] falha ao ler atribuições:', error.message);
      return {};
    }
    warnMissingCargo();
    const { data: fallback, error: fallbackError } = await supabase
      .from('opportunity_assignees')
      .select(JOIN_WITHOUT_CARGO)
      .in('opportunity_id', opportunityIds);
    if (fallbackError) {
      console.error('[assignees] falha ao ler atribuições:', fallbackError.message);
      return {};
    }
    rows = (fallback ?? []) as JoinedRow[];
  }

  const grouped: Record<string, Assignee[]> = {};
  for (const row of rows) {
    const assignee = flatten(row);
    if (!assignee) continue;
    (grouped[row.opportunity_id] ??= []).push(assignee);
  }
  for (const list of Object.values(grouped)) list.sort(byName);
  return grouped;
}

/**
 * Pessoas que PODEM ser atribuídas. `tenantId` é obrigatório: mesmo o
 * platform_admin atribui dentro de um tenant por vez (a trigger de 0032 recusa
 * vínculo cruzado). Viewers entram na lista — acompanhar não é editar.
 */
export async function fetchAssignableProfiles(
  tenantId: string
): Promise<AssignableProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, cargo, role')
    .eq('tenant_id', tenantId)
    .order('email');

  if (!error) {
    return (data ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      fullName: p.full_name,
      cargo: p.cargo,
      role: p.role,
    }));
  }

  // `cargo` só existe a partir da migration 0031. Enquanto ela não for aplicada
  // no ambiente, a query acima falha inteira (42703) e o filtro "Membro"
  // sumiria da toolbar sem explicação — degradamos para a versão sem cargo em
  // vez de devolver lista vazia. Qualquer outro erro é logado e propagado como
  // lista vazia (a page não deve quebrar por causa do filtro).
  if (error.code !== '42703') {
    console.error('[assignees] falha ao listar profiles do tenant:', error.message);
    return [];
  }

  const { data: fallback, error: fallbackError } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('tenant_id', tenantId)
    .order('email');

  if (fallbackError) {
    console.error('[assignees] falha ao listar profiles do tenant:', fallbackError.message);
    return [];
  }

  console.warn(
    '[assignees] coluna `cargo` ausente — aplique a migration 0031 para ver o cargo das pessoas.'
  );
  return (fallback ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    fullName: p.full_name,
    cargo: null,
    role: p.role,
  }));
}

/** Mesma ordenação de `byName`, mas para `AssignableProfile` (campo `id`, não `profileId`). */
function byProfileName(a: AssignableProfile, b: AssignableProfile): number {
  return (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email, 'pt-BR');
}

/**
 * Lista de possíveis RESPONSÁVEIS DE TAREFA de UMA oportunidade específica
 * (ACCESS-11/D-14, Phase 17): as pessoas do tenant da oportunidade +
 * qualquer `psw_staff` que esteja de fato ATRIBUÍDO a esta `opportunityId`
 * via `opportunity_assignees`. As duas condições — papel `psw_staff` E
 * vínculo com ESTA oportunidade — são obrigatórias e espelham exatamente o
 * que `check_task_tenant_coherence()` (migration 0041) aceita como
 * responsável de outro tenant: oferecer aqui alguém que o banco rejeitaria
 * produz um erro incompreensível na hora de salvar a tarefa. Composta sobre
 * `fetchAssignableProfiles` (tenant da oportunidade) e
 * `fetchAssigneesForOpportunity` (vínculo por oportunidade) — nenhuma query
 * nova nem reimplementação da degradação de `cargo`.
 */
export async function fetchTaskAssignableProfiles(
  opportunityId: string,
  opportunityTenantId: string
): Promise<AssignableProfile[]> {
  const [base, assignees] = await Promise.all([
    fetchAssignableProfiles(opportunityTenantId),
    fetchAssigneesForOpportunity(opportunityId),
  ]);

  const byId = new Map<string, AssignableProfile>();
  for (const p of base) byId.set(p.id, p);

  for (const a of assignees) {
    if (a.role !== 'psw_staff') continue; // só o papel novo pode ser cross-tenant aqui
    if (byId.has(a.profileId)) continue; // já é do tenant da oportunidade — não duplica
    byId.set(a.profileId, {
      id: a.profileId,
      email: a.email,
      fullName: a.fullName,
      cargo: a.cargo,
      role: a.role,
    });
  }

  return Array.from(byId.values()).sort(byProfileName);
}

/**
 * Lista do painel de atribuição de `opportunity_assignees` QUANDO quem opera
 * é da PSW — `platform_admin` (ACCESS-09/D-05, Phase 17) ou `psw_staff` com
 * concessão de admin naquela empresa (`psw_tenant_admins`, 0045): as pessoas
 * do tenant da oportunidade + os `psw_staff` do tenant da PSW — candidatos a
 * RECEBER uma nova atribuição cross-tenant.
 *
 * O `psw_staff` admin entrou aqui porque, sem isso, ele **não encontrava o
 * próprio nome** no painel de atribuição de uma empresa que administra: a
 * lista vinha de `fetchAssignableProfiles(opportunity.tenant_id)`, que só
 * enxerga profiles cujo `tenant_id` é o da oportunidade — e o dele é o da
 * PSW, por design (ver `resolveWriteTenantId`). O banco sempre aceitou esse
 * vínculo (`check_assignee_tenant()` reescrito na 0040 abre exceção para
 * `psw_staff`), e as policies de escrita da 0047 já autorizam um staff-admin
 * de A a atribuir dentro de A — a lacuna era só de UI. Isso destrava também o
 * responsável de TAREFA: `check_task_tenant_coherence()` (0041) exige que o
 * staff esteja em `opportunity_assignees` desta oportunidade, então sem
 * conseguir se atribuir à oportunidade ele nunca aparecia em
 * `fetchTaskAssignableProfiles`.
 *
 * `tenant_admin` de cliente e demais papéis continuam chamando
 * `fetchAssignableProfiles(opportunity.tenant_id)` sem composição nenhuma
 * (D-05 — cliente nunca enxerga pessoas de fora do próprio tenant). Quem de
 * fato autoriza o vínculo continua sendo a trigger/policy de
 * `opportunity_assignees` — esta função só monta a lista de candidatos.
 *
 * PREMISSA (documentar sempre junto de quem chama): `pswTenantId` é o
 * `tenantId` do próprio ator logado (`getCurrentProfile()`), que por
 * construção é o tenant da PSW — não existe hoje uma marcação explícita
 * separada de "qual é o tenant da PSW". Isso deixaria de valer se um dia
 * existir um `platform_admin` lotado num tenant de cliente; nesse caso o
 * caminho correto é introduzir uma marcação explícita do tenant da PSW, não
 * presumir a partir do ator logado.
 */
export async function fetchAssignableProfilesForPswActor(
  opportunityTenantId: string,
  pswTenantId: string
): Promise<AssignableProfile[]> {
  const [base, pswTenantProfiles] = await Promise.all([
    fetchAssignableProfiles(opportunityTenantId),
    fetchAssignableProfiles(pswTenantId),
  ]);

  const byId = new Map<string, AssignableProfile>();
  for (const p of base) byId.set(p.id, p);

  for (const p of pswTenantProfiles) {
    if (p.role !== 'psw_staff') continue;
    if (byId.has(p.id)) continue;
    byId.set(p.id, p);
  }

  return Array.from(byId.values()).sort(byProfileName);
}

/**
 * Todas as pessoas visíveis para o usuário corrente, sem recorte de tenant —
 * usado só pelo platform_admin em "Todas as empresas", para que o filtro
 * "Membro" não desapareça. Para os demais roles a RLS (profiles_select_same_
 * tenant, 0001) já limita ao próprio tenant, então o resultado é o mesmo de
 * fetchAssignableProfiles.
 */
export async function fetchAllAssignableProfiles(): Promise<AssignableProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, cargo, role')
    .order('email');

  if (error) {
    // Mesma degradação da versão por tenant: sem a 0031 não existe `cargo`.
    const { data: fallback } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .order('email');
    return (fallback ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      fullName: p.full_name,
      cargo: null,
      role: p.role,
    }));
  }

  return (data ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    fullName: p.full_name,
    cargo: p.cargo,
    role: p.role,
  }));
}

/**
 * Pessoas que ESTÃO de fato atribuídas a alguma oportunidade do escopo —
 * inclusive quem NÃO pertence ao tenant (tipicamente `psw_staff` atribuído
 * cross-tenant, ACCESS-09/D-05). Alimenta o filtro "Membro" da listagem junto
 * com `fetchAssignableProfiles`: sem isto, um staff PSW aparece na coluna de
 * atribuídos mas não existe como opção de filtro.
 *
 * `tenantId` recorta pelo `tenant_id` DA OPORTUNIDADE (coluna denormalizada em
 * `opportunity_assignees`), não pelo tenant da pessoa — é justamente isso que
 * deixa o de fora entrar. Sem `tenantId` (platform_admin em "Todas as
 * empresas") a RLS já limita o que é visível.
 */
export async function fetchAssignedProfiles(
  tenantId?: string
): Promise<AssignableProfile[]> {
  const supabase = await createClient();

  const run = async (select: string) => {
    let q = supabase.from('opportunity_assignees').select(select);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    return q;
  };

  let { data, error } = await run(JOIN_WITH_CARGO);

  if (error) {
    if (error.code !== '42703') {
      console.error('[assignees] falha ao listar pessoas atribuídas:', error.message);
      return [];
    }
    warnMissingCargo();
    ({ data, error } = await run(JOIN_WITHOUT_CARGO));
    if (error) {
      console.error('[assignees] falha ao listar pessoas atribuídas:', error.message);
      return [];
    }
  }

  const byId = new Map<string, AssignableProfile>();
  for (const row of (data ?? []) as unknown as JoinedRow[]) {
    const a = flatten(row);
    if (!a || byId.has(a.profileId)) continue;
    byId.set(a.profileId, {
      id: a.profileId,
      email: a.email,
      fullName: a.fullName,
      cargo: a.cargo,
      role: a.role,
    });
  }

  return Array.from(byId.values()).sort(byProfileName);
}

/**
 * Ids das oportunidades que têm PELO MENOS UMA pessoa daquele cargo atribuída
 * — alimenta o filtro "Cargo" da listagem. `!inner` no join faz o Postgrest
 * descartar as linhas cujo profile não bate, em vez de trazer com null.
 */
export async function fetchOpportunityIdsForCargo(cargo: Cargo): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('opportunity_assignees')
    .select(`opportunity_id, ${PROFILE_FK}!inner(cargo)`)
    .eq('profiles.cargo', cargo);

  if (error) {
    console.error('[assignees] falha ao filtrar por cargo:', error.message);
    return [];
  }

  // Uma oportunidade pode ter dois Devs — deduplica.
  return Array.from(new Set((data ?? []).map((r) => r.opportunity_id)));
}

/**
 * Ids das oportunidades atribuídas a um profile — alimenta o filtro "Membro"
 * da listagem. Retorna `[]` quando não há nenhuma (o caller trata isso como
 * "nenhum resultado", não como "sem filtro").
 */
export async function fetchOpportunityIdsForAssignee(
  profileId: string
): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('opportunity_assignees')
    .select('opportunity_id')
    .eq('profile_id', profileId);

  return (data ?? []).map((r) => r.opportunity_id);
}
