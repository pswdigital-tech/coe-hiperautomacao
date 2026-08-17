import type {
  OpportunitySource,
  OpportunityStatus,
  PriorityLevel,
} from './types';
import type { OpportunityRequestType } from '@/lib/database.types';
import { SEGMENTO_STATUSES, type Segmento } from './status';
import { CARGOS, type Cargo } from '@/lib/security/cargo';

export type SortKey =
  // `manual_asc` (0049) é a ÚNICA ordenação em que a lista pode ser
  // rearranjada por arrasto — nas demais o handle some, porque arrastar
  // dentro de uma ordem calculada produziria um resultado que o próximo
  // render desfaz. Ver `isManualSort` abaixo (fonte única dessa pergunta).
  | 'manual_asc'
  // Espelho decrescente da ordem manual. Só LEITURA: arrastar exige
  // `manual_asc`, senão a posição solta na tela seria o inverso da gravada.
  | 'manual_desc'
  // 0050 — ordena pela TAG manual (`priority_tag`), não pelo score. A ordem de
  // declaração do enum no banco já é alta→media→baixa, então `asc` = "altas
  // primeiro" sem CASE nenhum.
  | 'tag_asc'
  | 'tag_desc'
  | 'score_desc'
  | 'score_asc'
  | 'fte_desc'
  | 'fte_asc'
  | 'seq_asc'
  | 'seq_desc'
  | 'nome_asc'
  | 'nome_desc'
  | 'area_asc'
  | 'processo_asc'
  | 'status_asc';

// 0055 — o filtro de ferramenta deixou de ser um enum fechado: o catálogo
// `automation_tools` cresce em runtime (o usuário registra ferramenta nova), e
// nenhuma união de tipos consegue acompanhar isso. O que valida a entrada agora
// é o FORMATO do slug (`pickToolSlug`), não uma lista — mesmo desenho do filtro
// de `area`, que também é texto vindo do banco.
type ToolFilter = string;
// PriorityLevel também pode ser null em alguns edges; restringimos pro filter
type PriorityFilter = NonNullable<PriorityLevel>;

export type OpportunityFilters = {
  q?: string;
  source?: OpportunitySource;
  area?: string;
  ferramenta?: ToolFilter;
  /** Filtro pela prioridade CALCULADA (`priority_level`, faixa do score). */
  priority?: PriorityFilter;
  /** Filtro pela tag MANUAL (`priority_tag`, 0050) — independente de
   *  `priority`: os dois podem ser usados juntos (interseção). O valor
   *  especial `'sem'` recorta as ainda NÃO classificadas (`is null`), que é a
   *  fila de trabalho de quem vai priorizar. */
  priorityTag?: PriorityFilter | 'sem';
  status?: OpportunityStatus;
  sort?: SortKey;
  /** Range de data de criação (`created_at`), formato ISO `YYYY-MM-DD`. Inclusivo
   *  nas duas pontas (o `to` cobre o dia inteiro — ver fetchOpportunities). */
  dateFrom?: string;
  dateTo?: string;
  /** Segmentação de portfólio (v0.3) — grupo de status, além do filtro fino de `status`. */
  segmento?: Segmento;
  /** Filtro "Membro" (v0.4, 0032) — `profiles.id` de quem está atribuído. Vem
   *  da URL (`?assignee=<uuid>`), então é validado como UUID e depois checado
   *  contra a lista de pessoas do tenant; a RLS de `opportunity_assignees`
   *  fecha o resto (um id de outro tenant simplesmente não casa com nada). */
  assignee?: string;
  /** Filtro "Cargo" (v0.4, 0031+0032) — casa com QUALQUER pessoa atribuída que
   *  tenha esse cargo. Independente de `assignee`: os dois podem ser usados
   *  juntos (interseção). */
  cargo?: Cargo;
  /** Filtro de empresa — `tenant_id` JÁ RESOLVIDO (a URL carrega o slug em
   *  `?empresa=`, resolvido server-side via `fetchTenantIdBySlug`; NUNCA expõe
   *  UUID). Efetivo para `platform_admin` **e**, desde a Phase 17 (Plan
   *  17-07, D-03), também para `psw_staff` — sua listagem é unificada
   *  cross-tenant, e este é o filtro que restringe a uma empresa dentro do
   *  escopo atribuído. Em ambos os casos NÃO vem de `parseFilters` (não é
   *  lido direto da URL) para não virar um vetor de `tenant_id` arbitrário;
   *  quem popula este campo é a page, depois de resolver o slug. */
  tenant?: string;
  /** Tipo de solicitação (0008/0035) — Nova Oportunidade / Melhoria / Incidente /
   *  Treinamento. `duvidas_terceiros` continua no enum (histórico) mas saiu do
   *  formulário público, então não aparece no dropdown. */
  requestType?: OpportunityRequestType;
};

const SOURCE_VALUES: OpportunitySource[] = ['persona', 'formulario'];
const PRIORITY_VALUES: PriorityFilter[] = ['alta', 'media', 'baixa'];
/** 0050 — as 3 tags + `sem` (não classificadas). */
const PRIORITY_TAG_VALUES: (PriorityFilter | 'sem')[] = [
  'alta',
  'media',
  'baixa',
  'sem',
];
const STATUS_VALUES: OpportunityStatus[] = [
  'novo',
  'em_analise',
  'planejamento',
  'backlog',
  'desenvolvimento',
  'homologacao',
  'producao',
  'concluido',
  'gestao',
  'manutencao',
  'descontinuado',
];
/** Opções do dropdown "Tipo" — ordem e rótulos curtos da toolbar. */
export const REQUEST_TYPE_OPTIONS: { value: OpportunityRequestType; label: string }[] = [
  { value: 'nova_oportunidade', label: 'Nova Oportunidade' },
  { value: 'incidente', label: 'Incidente' },
  { value: 'melhoria_automacao', label: 'Melhoria' },
  { value: 'treinamento', label: 'Treinamento' },
];
// Aceito na URL: as 4 opções + o legado `duvidas_terceiros`.
const REQUEST_TYPE_VALUES: OpportunityRequestType[] = [
  ...REQUEST_TYPE_OPTIONS.map((o) => o.value),
  'duvidas_terceiros',
];
const SEGMENTO_VALUES: Segmento[] =['todos', 'legado', 'gestao', 'novas', 'manutencao'];
export const SORT_VALUES: SortKey[] = [
  'manual_asc',
  'manual_desc',
  'tag_asc',
  'tag_desc',
  'score_desc',
  'score_asc',
  'fte_desc',
  'fte_asc',
  'seq_asc',
  'seq_desc',
  'nome_asc',
  'nome_desc',
  'area_asc',
  'processo_asc',
  'status_asc',
];

function pickEnum<T extends string>(value: string | null, allowed: T[]): T | undefined {
  if (!value) return undefined;
  return (allowed as string[]).includes(value) ? (value as T) : undefined;
}

/**
 * Slug de ferramenta (0055) — mesmo formato do CHECK
 * `automation_tools_slug_chk`. Rejeitar por formato (e não por lista) mantém a
 * URL sanitizada sem precisar consultar o catálogo aqui.
 */
function pickToolSlug(value: string | null): string | undefined {
  if (!value) return undefined;
  return /^[a-z0-9][a-z0-9_-]{0,39}$/.test(value) ? value : undefined;
}

/** Aceita só UUID v4-ish; qualquer outra coisa vira undefined. */
function pickUuid(value: string | null): string | undefined {
  if (!value) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

/** Aceita só `YYYY-MM-DD` válido; qualquer outra coisa vira undefined. */
function pickDate(value: string | null): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(t) ? undefined : value;
}

/**
 * Lê URL params e retorna objeto tipado de filtros.
 * Valores inválidos viram undefined (não derruba a página).
 */
export function parseFilters(
  sp: URLSearchParams | { get(name: string): string | null }
): OpportunityFilters {
  const get = (k: string) => sp.get(k);

  return {
    q: get('q')?.trim() || undefined,
    source: pickEnum(get('source'), SOURCE_VALUES),
    area: get('area')?.trim() || undefined,
    ferramenta: pickToolSlug(get('ferramenta')),
    priority: pickEnum(get('priority'), PRIORITY_VALUES),
    priorityTag: pickEnum(get('priorityTag'), PRIORITY_TAG_VALUES),
    status: pickEnum(get('status'), STATUS_VALUES),
    sort: pickEnum(get('sort'), SORT_VALUES),
    dateFrom: pickDate(get('dateFrom')),
    dateTo: pickDate(get('dateTo')),
    segmento: pickEnum(get('segmento'), SEGMENTO_VALUES),
    assignee: pickUuid(get('assignee')),
    cargo: pickEnum(get('cargo'), [...CARGOS]),
    requestType: pickEnum(get('requestType'), REQUEST_TYPE_VALUES),
  };
}

/**
 * Constrói query string canônica a partir dos filtros.
 * Preserva params não-relacionados (ex: ?view=cards) se vier `currentSp`.
 */
export function buildQuery(
  filters: OpportunityFilters,
  currentSp?: URLSearchParams
): string {
  const next = new URLSearchParams();

  // Preserva params não-filtro do estado atual (ex: view)
  if (currentSp) {
    for (const [k, v] of currentSp.entries()) {
      if (!FILTER_KEYS.includes(k as keyof OpportunityFilters)) {
        next.set(k, v);
      }
    }
  }

  if (filters.q) next.set('q', filters.q);
  if (filters.source) next.set('source', filters.source);
  if (filters.area) next.set('area', filters.area);
  if (filters.ferramenta) next.set('ferramenta', filters.ferramenta);
  if (filters.priority) next.set('priority', filters.priority);
  if (filters.priorityTag) next.set('priorityTag', filters.priorityTag);
  if (filters.status) next.set('status', filters.status);
  if (filters.sort && filters.sort !== 'score_desc') next.set('sort', filters.sort);
  if (filters.dateFrom) next.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) next.set('dateTo', filters.dateTo);
  if (filters.segmento && filters.segmento !== 'todos') next.set('segmento', filters.segmento);
  if (filters.assignee) next.set('assignee', filters.assignee);
  if (filters.cargo) next.set('cargo', filters.cargo);
  if (filters.requestType) next.set('requestType', filters.requestType);

  return next.toString();
}

export const FILTER_KEYS: (keyof OpportunityFilters)[] = [
  'q',
  'source',
  'area',
  'ferramenta',
  'priority',
  'priorityTag',
  'status',
  'sort',
  'dateFrom',
  'dateTo',
  'segmento',
  'assignee',
  'cargo',
  'requestType',
];

export const SORT_LABELS: Record<SortKey, string> = {
  manual_asc: '✋ Prioridade manual: 1 → N',
  manual_desc: '✋ Prioridade manual: N → 1',
  tag_asc: '🔺 Prioridade: Alta → Baixa',
  tag_desc: 'Prioridade: Baixa → Alta',
  score_desc: '🏆 Score: Maior primeiro',
  score_asc: 'Score: Menor primeiro',
  fte_desc: 'FTE: Maior primeiro',
  fte_asc: 'FTE: Menor primeiro',
  seq_asc: 'ID: Menor → Maior',
  seq_desc: 'ID: Maior → Menor',
  nome_asc: 'Nome A → Z',
  nome_desc: 'Nome Z → A',
  area_asc: 'Área A → Z',
  processo_asc: 'Processo A → Z',
  status_asc: 'Status',
};

/**
 * Fonte única do "esta lista é rearranjável por arrasto?" (0049). Table, Cards
 * e Kanban perguntam AQUI em vez de cada um comparar a string por conta —
 * quando um segundo modo manual existir, muda-se um lugar só.
 */
export function isManualSort(sort: SortKey | undefined): boolean {
  return sort === 'manual_asc';
}
