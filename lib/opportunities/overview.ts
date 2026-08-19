import type {
  Opportunity,
  OpportunityPhase,
  OpportunityRisk,
  OpportunityTask,
  OpportunityStatus,
  RiskPriority,
} from './types';
import type { PhaseKey } from '@/lib/database.types';
import { PHASE_KEYS } from './phase-schema';
import { STATUS_META } from './status';
import { summarizeTasks } from './task-summary';
import type { TimelineEntry } from '@/lib/audit/timeline';
import { scoredBenefits } from './benefit-labels';

// =============================================================================
// overview.ts — agregados da seção "Visão Geral" do detalhe da oportunidade
// -----------------------------------------------------------------------------
// Mesma disciplina de `task-summary.ts` e `task-rollup.ts`: funções PURAS sobre
// os arrays que a página já buscou, NUNCA persistidas e sem função SQL espelho.
// Nada aqui é input de nada — é tudo leitura derivada.
//
// `today` (ISO `YYYY-MM-DD`) entra SEMPRE por parâmetro, nunca `new Date()`
// aqui dentro: mantém as funções determinísticas/testáveis e faz o SSR e a
// hidratação renderizarem o mesmo markup. Datas ISO ordenam lexicograficamente
// igual a cronologicamente, então comparação é `<`/`>` direto.
//
// O pipeline de fases NÃO redeclara rótulo nem cor: `phase_key` e
// `OpportunityStatus` compartilham as mesmas strings, então tudo vem de
// `STATUS_META` (fonte única, `status.ts`) — é por isso que "em_analise"
// aparece como "Refinamento" aqui sem nenhum mapa local.
// =============================================================================

const DAY_MS = 86_400_000;

/** Dias inteiros de `from` até `to` (ISO `YYYY-MM-DD`). Negativo = `to` no passado. */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / DAY_MS);
}

// ─── Pipeline de fases ───────────────────────────────────────────────────────

export type PipelineStep = {
  key: PhaseKey;
  label: string;
  icon: string;
  color: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** `concluida` = já terminou · `atual` = começou e não terminou · `futura` = não começou. */
  state: 'concluida' | 'atual' | 'futura';
  /** Fim estimado no passado sem fim realizado. */
  atrasada: boolean;
};

export function buildPipeline(
  phases: OpportunityPhase[],
  today: string
): PipelineStep[] {
  const byKey = new Map(phases.map((p) => [p.phase_key as string, p]));

  return PHASE_KEYS.map((key) => {
    const row = byKey.get(key);
    const meta = STATUS_META[key as OpportunityStatus];
    const startedAt = row?.started_at ?? null;
    const finishedAt = row?.finished_at ?? null;
    const plannedEnd = row?.planned_end_at ?? null;

    return {
      key,
      label: meta.label,
      icon: meta.icon,
      color: meta.color,
      plannedStart: row?.planned_start_at ?? null,
      plannedEnd,
      startedAt,
      finishedAt,
      state: finishedAt ? 'concluida' : startedAt ? 'atual' : 'futura',
      atrasada: !!plannedEnd && !finishedAt && plannedEnd < today,
    } satisfies PipelineStep;
  });
}

/**
 * Qual data mostrar numa fase do resumo do cronograma.
 *
 * A regra existe porque as duas linhas do tempo têm autoridades diferentes:
 *   • REALIZADO (`started_at`/`finished_at`) é FATO — carimbado pela trigger
 *     quando o status muda. Onde existe, ele manda.
 *   • ESTIMADO (`planned_*`) é PLANO — editado à mão. Vale para o que ainda
 *     não aconteceu.
 * Numa fase concluída, mostrar a estimativa e esconder o realizado seria
 * mentir sobre o que aconteceu; numa fase futura, só existe estimativa.
 *
 * Devolve as datas JÁ ROTULADAS ("real." / "prev.") — sem rótulo, o leitor não
 * tem como saber qual das duas está vendo, que era exatamente o problema.
 * Fase antiga sem realizado gravado cai no estimado, sempre rotulado como tal.
 */
export type PhaseDates = {
  /** Linha principal. `null` = não há data nenhuma para esta fase. */
  principal: { label: 'real.' | 'prev.'; inicio: string | null; fim: string | null } | null;
  /** Linha secundária — só na fase em andamento (fim ainda estimado). */
  secundaria: { label: 'prev.'; inicio: null; fim: string } | null;
};

export function phaseDates(p: PipelineStep): PhaseDates {
  // Concluída: o realizado é o fato. Sem realizado gravado (dado legado), cai
  // no estimado — mas rotulado como estimado, nunca disfarçado de realizado.
  if (p.state === 'concluida') {
    if (p.startedAt || p.finishedAt) {
      return {
        principal: { label: 'real.', inicio: p.startedAt, fim: p.finishedAt },
        secundaria: null,
      };
    }
  }

  // Em andamento: começou de fato, mas o fim ainda é previsão. As duas linhas.
  if (p.state === 'atual') {
    return {
      principal: { label: 'real.', inicio: p.startedAt, fim: null },
      secundaria: p.plannedEnd ? { label: 'prev.', inicio: null, fim: p.plannedEnd } : null,
    };
  }

  // Futura (ou concluída sem realizado): só existe plano.
  if (!p.plannedStart && !p.plannedEnd) return { principal: null, secundaria: null };
  return {
    principal: { label: 'prev.', inicio: p.plannedStart, fim: p.plannedEnd },
    secundaria: null,
  };
}

/**
 * Próximo marco = a próxima fase que ainda NÃO começou e tem início estimado.
 * No nível do projeto o marco é a transição de fase — por isso ele sai daqui e
 * não de um campo próprio (não existe entidade "marco" no modelo).
 */
export type NextMilestone = {
  label: string;
  icon: string;
  date: string;
  /** Negativo = a data estimada já passou e a fase não começou. */
  diasRestantes: number;
};

export function nextMilestone(
  pipeline: PipelineStep[],
  today: string
): NextMilestone | null {
  const next = pipeline.find((p) => p.state === 'futura' && p.plannedStart);
  if (!next?.plannedStart) return null;
  return {
    label: next.label,
    icon: next.icon,
    date: next.plannedStart,
    diasRestantes: daysBetween(today, next.plannedStart),
  };
}

// ─── Prazo: estimado (fases) × projetado (tarefas) ───────────────────────────

export type DeadlineComparison = {
  /** Maior fim ESTIMADO entre as fases — o compromisso planejado. */
  estimado: string | null;
  /** Maior data de entrega entre as tarefas — o que a execução projeta. */
  projetado: string | null;
  /** Dias de diferença (projetado − estimado). Positivo = atraso projetado. */
  desvioDias: number | null;
};

export function buildDeadline(
  phases: OpportunityPhase[],
  tasks: OpportunityTask[]
): DeadlineComparison {
  let estimado: string | null = null;
  for (const p of phases) {
    if (p.planned_end_at && (estimado === null || p.planned_end_at > estimado)) {
      estimado = p.planned_end_at;
    }
  }

  let projetado: string | null = null;
  for (const t of tasks) {
    if (t.due_date && (projetado === null || t.due_date > projetado)) {
      projetado = t.due_date;
    }
  }

  return {
    estimado,
    projetado,
    desvioDias:
      estimado && projetado ? daysBetween(estimado, projetado) : null,
  };
}

// ─── Riscos ──────────────────────────────────────────────────────────────────

/** Status que contam como risco ABERTO — `mitigado`/`ocorrido` já se resolveram. */
const OPEN_RISK_STATUSES = new Set(['novo', 'gerenciado']);

const RISK_PRIORITY_RANK: Record<RiskPriority, number> = {
  critica: 0,
  alta: 1,
  media: 2,
  baixa: 3,
};

export type RiskSummary = {
  abertos: OpportunityRisk[];
  total: number;
  byPriority: Record<RiskPriority, number>;
};

export function summarizeRisks(risks: OpportunityRisk[]): RiskSummary {
  const abertos = risks
    .filter((r) => OPEN_RISK_STATUSES.has(r.status))
    .sort((a, b) => {
      const pa = a.priority ? RISK_PRIORITY_RANK[a.priority] : 99;
      const pb = b.priority ? RISK_PRIORITY_RANK[b.priority] : 99;
      return pa !== pb ? pa - pb : a.descricao.localeCompare(b.descricao, 'pt');
    });

  const byPriority: Record<RiskPriority, number> = {
    critica: 0,
    alta: 0,
    media: 0,
    baixa: 0,
  };
  for (const r of abertos) if (r.priority) byPriority[r.priority]++;

  return { abertos, total: abertos.length, byPriority };
}

/** Impedimentos = tarefas paradas. O motivo é obrigatório ao bloquear (0037). */
export function blockedTasks(tasks: OpportunityTask[]): OpportunityTask[] {
  return tasks.filter((t) => t.status === 'bloqueio');
}

/**
 * Última movimentação do PLANO (não da oportunidade): maior `updated_at` entre
 * as tarefas. Plano parado há semanas é o sinal mais honesto de projeto
 * travado, e não aparecia em lugar nenhum. `null` = plano vazio.
 */
export function planIdleDays(tasks: OpportunityTask[], today: string): number | null {
  let last: string | null = null;
  for (const t of tasks) {
    if (last === null || t.updated_at > last) last = t.updated_at;
  }
  return last === null ? null : daysBetween(last.slice(0, 10), today);
}

// ─── Pendências do plano ─────────────────────────────────────────────────────

/**
 * Destinos de navegação da Visão Geral — "ver todos" leva a quem é dono do
 * assunto. `risco` e `historico` viraram sub-itens da Governança; o mapa de
 * aba + sub-item fica em `OpportunityDetail`, não aqui: este módulo é puro e
 * não conhece a estrutura de abas.
 */
export type OverviewTarget = 'tarefas' | 'risco' | 'cronograma' | 'historico' | 'processo';

/** Dias sem movimentação no plano a partir dos quais o aviso aparece. */
export const PLAN_IDLE_ALERT_DAYS = 14;

/** Vencidas: entrega no passado e tarefa não finalizada. Da mais atrasada para a menos. */
export function overdueTasks(
  tasks: OpportunityTask[],
  today: string
): OpportunityTask[] {
  return tasks
    .filter((t) => t.due_date != null && t.status !== 'finalizado' && t.due_date < today)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
}

// ─── Valor: top 3 benefícios ─────────────────────────────────────────────────

/**
 * Top N benefícios para o resumo da Visão Geral. A lista e a ordenação vêm de
 * `benefit-labels.ts` — fonte única compartilhada com a seção Solução.
 */
export function topBenefits(
  beneficios: unknown,
  limit = 3
): { label: string; value: number }[] {
  return scoredBenefits(beneficios)
    .slice(0, limit)
    .map(({ label, value }) => ({ label, value }));
}

// ─── "O que mudou recentemente" ──────────────────────────────────────────────

export type ActivityItem = {
  key: string;
  /** Dia ISO — a UI decide se vira "Hoje"/"Ontem"/data. */
  day: string;
  icon: string;
  /** Frase de negócio pronta, com o NOME do registro quando existe. */
  text: string;
  actor: string | null;
  /** `true` na linha que resume a cauda de um lote ("+54 outras tarefas editadas"). */
  isTail?: boolean;
};

/** Substantivo por tabela, com gênero — sem isso a concordância sai errada. */
const NOUN: Record<string, { one: string; many: string; fem: boolean }> = {
  opportunity_tasks: { one: 'Tarefa', many: 'tarefas', fem: true },
  opportunity_risks: { one: 'Risco', many: 'riscos', fem: false },
  opportunity_notes: { one: 'Anotação', many: 'anotações', fem: true },
  opportunity_documents: { one: 'Documento', many: 'documentos', fem: false },
  opportunity_assignees: { one: 'Responsável', many: 'responsáveis', fem: false },
  opportunities: { one: 'Oportunidade', many: 'oportunidades', fem: true },
};

const FALLBACK_NOUN = { one: 'Registro', many: 'registros', fem: false };

function nounOf(table: string | null) {
  return NOUN[table ?? ''] ?? FALLBACK_NOUN;
}

/** Particípio concordando com o gênero do substantivo. */
function participle(action: string, fem: boolean): string {
  const base =
    action === 'insert' ? 'criad' : action === 'delete' ? 'excluíd' : 'editad';
  return base + (fem ? 'a' : 'o');
}

function statusPara(e: TimelineEntry): string | null {
  const v = e.changes?.status?.para;
  return typeof v === 'string' ? v : null;
}

/** Nome do registro entre aspas, quando a auditoria conseguiu identificá-lo. */
function quoted(alvo: string | null): string {
  if (!alvo) return '';
  // `recordName` já devolve coisas como `Tarefa: revisar contrato` — fica só o
  // que vem depois dos dois pontos, porque o substantivo a frase já traz.
  const nome = alvo.includes(': ') ? alvo.slice(alvo.indexOf(': ') + 2) : alvo;
  return ` “${nome}”`;
}

/**
 * Frase de UMA ocorrência. Casos que merecem verbo próprio ganham verbo
 * próprio — "concluída" diz muito mais que "editada", e é o evento que as
 * pessoas procuram quando abrem este bloco.
 */
function phraseOf(e: TimelineEntry): { icon: string; text: string } {
  if (e.action === 'legado') {
    return { icon: '🕘', text: e.resumo ?? 'Alteração registrada' };
  }

  const n = nounOf(e.table);
  const novo = statusPara(e);

  if (e.table === 'opportunities' && novo) {
    const meta = STATUS_META[novo as OpportunityStatus];
    if (meta) return { icon: meta.icon, text: `Projeto entrou em ${meta.label}` };
  }

  if (e.table === 'opportunity_tasks' && e.action === 'update') {
    if (novo === 'finalizado')
      return { icon: '✅', text: `Tarefa${quoted(e.alvo)} concluída` };
    if (novo === 'bloqueio')
      return { icon: '🚫', text: `Tarefa${quoted(e.alvo)} bloqueada` };
    if (novo === 'homologacao')
      return { icon: '🧪', text: `Tarefa${quoted(e.alvo)} foi para homologação` };
  }

  if (e.action === 'insert') {
    if (e.table === 'opportunity_risks')
      return { icon: '⚠️', text: `Risco registrado${quoted(e.alvo)}` };
    if (e.table === 'opportunity_documents')
      return { icon: '📎', text: `Documento anexado${quoted(e.alvo)}` };
    if (e.table === 'opportunity_notes')
      return { icon: '💬', text: 'Anotação adicionada' };
    if (e.table === 'opportunity_assignees')
      return { icon: '👤', text: `Responsável atribuído${quoted(e.alvo)}` };
  }

  const icon = e.action === 'insert' ? '➕' : e.action === 'delete' ? '🗑️' : '✏️';
  return {
    icon,
    text: `${n.one}${quoted(e.alvo)} ${participle(e.action, n.fem)}`,
  };
}

/** Quantas ocorrências individuais de um mesmo lote aparecem antes de resumir. */
const MAX_POR_LOTE = 2;

/**
 * Resumir só compensa a partir de 2 itens na cauda: "+1 tarefa criada" ocupa a
 * mesma linha que a própria tarefa ocuparia, e diz menos.
 */
const MIN_CAUDA = 2;

/**
 * As últimas ocorrências, NOMEADAS.
 *
 * A primeira versão agregava tudo por (dia + tabela + ação + autor) e produzia
 * linhas como "59 tarefas editadas" — que evitam repetição e, no caminho,
 * apagam a única coisa que interessa: O QUE mudou. Aqui a ocorrência é
 * individual e traz o nome do registro; a agregação sobrou só para a CAUDA de
 * um lote grande (importação, edição em massa), onde a partir da terceira
 * linha o volume vira mais informativo que o item.
 */
export function recentActivity(entries: TimelineEntry[], limit = 6): ActivityItem[] {
  const ordenadas = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Agrupa preservando a ordem de chegada (mais recente primeiro).
  const grupos = new Map<string, TimelineEntry[]>();
  for (const e of ordenadas) {
    const day = e.created_at.slice(0, 10);
    const g = `${day}|${e.table ?? '-'}|${e.action}|${statusPara(e) ?? ''}|${e.actor ?? '-'}`;
    const arr = grupos.get(g);
    if (arr) arr.push(e);
    else grupos.set(g, [e]);
  }

  const out: ActivityItem[] = [];
  for (const [g, itens] of grupos) {
    // Cauda pequena demais para valer um resumo → mostra tudo nomeado.
    const individuais =
      itens.length - MAX_POR_LOTE < MIN_CAUDA ? itens.length : MAX_POR_LOTE;

    for (const e of itens.slice(0, individuais)) {
      const { icon, text } = phraseOf(e);
      out.push({ key: e.key, day: e.created_at.slice(0, 10), icon, text, actor: e.actor });
      if (out.length >= limit) return out;
    }

    const resto = itens.length - individuais;
    if (resto > 0) {
      const primeiro = itens[0];
      const n = nounOf(primeiro.table);
      out.push({
        key: `${g}|tail`,
        day: primeiro.created_at.slice(0, 10),
        icon: '⋯',
        text: `+${resto} ${resto === 1 ? n.one.toLowerCase() : n.many} ${participle(primeiro.action, n.fem)}${resto === 1 ? '' : 's'}`,
        actor: primeiro.actor,
        isTail: true,
      });
      if (out.length >= limit) return out;
    }
  }

  return out;
}

/** Rótulo relativo do dia — "Hoje", "Ontem" ou `dd/mm`. */
export function dayLabel(day: string, today: string): string {
  const diff = daysBetween(day, today);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  const [, m, d] = day.split('-');
  return `${d}/${m}`;
}

// ─── Ficha de identidade (atributos estáticos do projeto) ────────────────────

export type ProjectTrait = { label: string; value: string; icon: string };

const LEVEL_LABEL: Record<string, string> = {
  baixo: 'Baixo',
  medio: 'Médio',
  alto: 'Alto',
};

const CRITICIDADE_TRAIT: Record<string, { label: string; icon: string }> = {
  baixa: { label: 'Baixa', icon: '🟢' },
  media: { label: 'Média', icon: '🟡' },
  alta: { label: 'Alta', icon: '🟠' },
  critica: { label: 'Crítica', icon: '🔴' },
};

/**
 * Complexidade, esforço e criticidade — atributos que NÃO mudam com o
 * andamento. Ficam junto do objetivo (contexto de leitura), nunca na faixa de
 * indicadores: dado estático entre números vivos faz a faixa mentir sobre ser
 * "o estado agora". Nenhum deles é campo novo.
 */
export function projectTraits(o: Opportunity): ProjectTrait[] {
  const traits: ProjectTrait[] = [];

  if (o.complexidade) {
    traits.push({
      label: 'Complexidade',
      value: LEVEL_LABEL[o.complexidade] ?? o.complexidade,
      icon: '⚙️',
    });
  }
  if (o.esforco) {
    traits.push({
      label: 'Esforço',
      value: LEVEL_LABEL[o.esforco] ?? o.esforco,
      icon: '◔',
    });
  }
  if (o.criticidade) {
    const meta = CRITICIDADE_TRAIT[o.criticidade];
    if (meta) {
      traits.push({ label: 'Criticidade', value: meta.label, icon: meta.icon });
    }
  }

  return traits;
}

/** Dias desde a abertura no CoE — contextualiza o percentual concluído. */
export function diasNoCoe(o: Opportunity, today: string): number | null {
  if (!o.data_abertura_coe) return null;
  const fim = o.data_fechamento_coe ?? today;
  const d = daysBetween(o.data_abertura_coe.slice(0, 10), fim.slice(0, 10));
  return d >= 0 ? d : null;
}
