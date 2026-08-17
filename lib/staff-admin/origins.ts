// =============================================================================
// staff-admin/origins.ts — as duas origens de acesso, a redundância e o
// impacto da revogação, como funções PURAS (Phase 18, Plan 04, GRANT-07/08/09)
// -----------------------------------------------------------------------------
// A tela /admin/staff responde a uma pergunta diagnóstica — "por que fulano vê
// isto?" — e um `psw_staff` pode enxergar uma oportunidade por DOIS caminhos
// independentes: é admin da empresa inteira (psw_tenant_admins) ou foi
// atribuído nominalmente a ela (opportunity_assignees). Somar os dois num
// número só produz conclusão errada sobre o alcance real da pessoa, porque
// atribuição dentro de empresa já administrada não acrescenta nada (D-F).
//
// Módulo PURO de propósito: sem client Supabase, sem o marcador de só-servidor
// do Next, sem React — só tipos e funções sobre dados já buscados. É essa
// pureza que permite testar a regra de negócio sem banco e sem browser (mesma
// disciplina de
// `lib/opportunities/score.ts` para valor derivado: calculado, nunca
// persistido — docs/PROJETO.md §3). A redundância e o impacto de revogação seguem a
// MESMA regra: nunca gravados em coluna, sempre recalculados em runtime.
// =============================================================================

/** Origem 1 — uma empresa que a pessoa administra (linha de `psw_tenant_admins`). */
export type StaffTenantGrant = {
  /** id da linha em `psw_tenant_admins` — usado para revogar e para contar o impacto. */
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  grantedAt: string;
};

/** Origem 2, dado bruto — uma atribuição nominal, antes de saber se é redundante. */
export type StaffAssignmentInput = {
  opportunityId: string;
  tenantId: string;
  /** Identificação legível da oportunidade (processo, ou `#seq_id` como fallback). */
  label: string;
};

/** Origem 2, já processada — com a marca de redundância que só existe olhando as duas origens juntas. */
export type StaffAssignment = StaffAssignmentInput & {
  /** true quando `tenantId` já está entre os tenants administrados pela pessoa (D-F). */
  redundant: boolean;
};

/** Agregado por pessoa: os DOIS blocos, sempre presentes, nunca somados num total único. */
export type StaffAccessOrigins = {
  grants: StaffTenantGrant[];
  assignments: StaffAssignment[];
  /** Quantas atribuições são redundantes — 0 quando nenhuma, e o consumidor sabe omitir o parêntese. */
  redundantCount: number;
};

/**
 * Monta as duas origens de acesso de uma pessoa, marcando cada atribuição como
 * redundante quando o tenant dela já está entre os tenants concedidos.
 *
 * Nunca devolve `undefined` em nenhum dos dois blocos — mesmo pessoa sem
 * concessão e sem atribuição devolve `{ grants: [], assignments: [], redundantCount: 0 }`,
 * porque D-F exige os dois blocos sempre visíveis na UI, cada um com seu
 * próprio texto de vazio, nunca omitidos.
 *
 * O valor é derivado (calculado a partir das duas listas recebidas) e nunca
 * deve ser persistido — mesma regra do score (docs/PROJETO.md §3): se fosse gravado,
 * uma concessão nova ou revogada deixaria a marca de redundância desatualizada
 * até um recálculo manual, um bug silencioso e cumulativo.
 */
export function buildStaffAccessOrigins(
  grants: StaffTenantGrant[],
  assignmentsInput: StaffAssignmentInput[]
): StaffAccessOrigins {
  const grantedTenantIds = new Set(grants.map((g) => g.tenantId));

  const assignments: StaffAssignment[] = assignmentsInput.map((a) => ({
    ...a,
    redundant: grantedTenantIds.has(a.tenantId),
  }));

  const redundantCount = assignments.reduce((n, a) => n + (a.redundant ? 1 : 0), 0);

  return { grants, assignments, redundantCount };
}

/**
 * Impacto de revogar a concessão de um tenant: quantas oportunidades a pessoa
 * DEIXA DE VER naquele tenant.
 *
 * É diferença de CONJUNTOS (`visível \ atribuída`), não subtração de
 * contagens (`visible.length - assigned.length`) — porque um id pode se
 * repetir nas duas listas ou vir duplicado na origem, e subtrair contagens
 * conta errado nesses casos (ex.: 3 ids visíveis com uma repetição e 1
 * atribuído não é "3 - 1 = 2 por coincidência certa", é o tamanho do conjunto
 * de ids visíveis distintos que não estão no conjunto de atribuídos). A conta
 * é sempre feita em runtime, no momento em que o diálogo de revogação abre —
 * nunca persistida, pela mesma razão de `buildStaffAccessOrigins` acima.
 */
export function countOpportunitiesLostOnRevoke(
  visibleOpportunityIds: string[],
  assignedOpportunityIds: string[]
): number {
  const assigned = new Set(assignedOpportunityIds);
  const visibleDistinct = new Set(visibleOpportunityIds);
  let lost = 0;
  for (const id of visibleDistinct) {
    if (!assigned.has(id)) lost += 1;
  }
  return lost;
}

/**
 * Frase pt-BR do diálogo de revogação (§Copywriting Contract do 18-UI-SPEC.md,
 * copiada literalmente, não parafraseada), com concordância correta:
 * singular para 1, plural para N>=2, e "nenhuma oportunidade" (singular) para 0
 * — nunca "0 oportunidades". `count` é sempre calculado em runtime por
 * `countOpportunitiesLostOnRevoke`, nunca hardcoded nem omitido (D-G): o
 * comportamento de revogar é correto, mas surpreendente o bastante para não
 * acontecer em silêncio.
 */
export function formatRevokeImpact(
  personName: string,
  tenantName: string,
  count: number
): string {
  const isSingular = count === 1;
  const quantity =
    count === 0 ? 'nenhuma oportunidade' : `${count} oportunidade${count === 1 ? '' : 's'}`;
  const verb = isSingular || count === 0 ? 'não está atribuída' : 'não estão atribuídas';

  return (
    `${personName} vai deixar de enxergar ${quantity} de ${tenantName} que ` +
    `${verb} a ela diretamente. Atribuições individuais continuam valendo.`
  );
}

/**
 * Uma concessão é ÓRFÃ quando a pessoa concedida já não tem o papel
 * `psw_staff` (ex.: foi despromovida a `member`). A linha em
 * `psw_tenant_admins` sobrevive inerte por desenho (nenhum trigger de
 * limpeza) — apagar destruiria a informação de que a concessão existiu e de
 * que basta repromover a pessoa para ela voltar a valer (D-S). Esta função só
 * calcula o sinalizador; quem chama decide como desenhar a linha (opacidade
 * reduzida + badge "Órfã").
 */
export function isOrphanGrant(currentRole: string | null | undefined): boolean {
  return currentRole !== 'psw_staff';
}
