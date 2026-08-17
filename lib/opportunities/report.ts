// lib/opportunities/report.ts
// =============================================================================
// Agregação PURA do portfólio por área para a view "Relatório" (Phase 14).
// Porta a lógica de `renderRelatorio` (_giba_wsi-dashboard.html:853-896) para
// uma função testável sobre Opportunity[]. Módulo puro (sem JSX/React, sem
// import de servidor) — importável em vitest. Read-only: nunca persiste nada
// (docs/PROJETO.md §3).
//
// D-05  agrupa por área (count desc, fallback "Sem Área")
// D-06  prioridade lida da coluna computada `priority_level` (NÃO recomputa score)
// D-07  RPA: Ideal >= 5, RPA+n8n >= 3 && < 5 (consistente com rpaTier)
// D-08  FTE null → 0; totais arredondados
// D-02a mesma cor por área nos 3 blocos (cards/barras/donuts) via PALETTE+índice
// =============================================================================

import type {
  Opportunity,
  OpportunityPhase,
  OpportunityRisk,
  OpportunityStatus,
} from '@/lib/opportunities/types';
import type {
  EffortLevel,
  ComplexityLevel,
  PhaseKey,
  RiskPriority,
} from '@/lib/database.types';

/**
 * Paleta de 18 cores — porta LITERAL de _giba_wsi-dashboard.html:817.
 * Ciclada por índice de área (ordem ordenada por count desc), garantindo a
 * mesma cor por área nos cards, barras e donuts (D-02a). Exportada para reuso
 * por pie.tsx e relatorio.tsx.
 */
export const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#e11d48',
  '#0891b2', '#65a30d', '#d97706', '#7c3aed', '#0284c7', '#dc2626',
];

export type AreaStat = {
  area: string;
  count: number;
  fte: number;
  color: string;
};

export type PortfolioReport = {
  areas: AreaStat[]; // ordenado por count desc (D-05)
  totalCount: number;
  totalFte: number; // soma global arredondada (D-08)
  maxCount: number; // maior count entre áreas (largura relativa das barras)
  maxFte: number; // maior fte entre áreas
  prioAlta: number; // priority_level === 'alta'
  prioMedia: number; // priority_level === 'media'
  rpaIdeal: number; // rpa_score >= 5 (D-07)
  rpaHybrid: number; // rpa_score >= 3 && < 5 (D-07)
};

/**
 * Agrega Opportunity[] em PortfolioReport — réplica exata de renderRelatorio
 * (_giba:853-896). Função pura: não busca dados, não escreve no banco, não
 * recomputa score (usa a coluna `priority_level` da view — D-06).
 */
export function buildReport(opps: Opportunity[]): PortfolioReport {
  const areaMap: Record<string, { count: number; fte: number }> = {};

  for (const o of opps) {
    const a = (o.area || 'Sem Área').trim();
    if (!areaMap[a]) areaMap[a] = { count: 0, fte: 0 };
    areaMap[a].count++;
    areaMap[a].fte += o.fte_horas ?? 0;
  }

  const sortedKeys = Object.keys(areaMap).sort(
    (a, b) => areaMap[b].count - areaMap[a].count
  );

  const areas: AreaStat[] = sortedKeys.map((area, i) => ({
    area,
    count: areaMap[area].count,
    fte: Math.round(areaMap[area].fte),
    color: PALETTE[i % PALETTE.length],
  }));

  // Guard contra Math.max() sem args (retorna -Infinity).
  const maxCount = areas.length ? Math.max(...areas.map((a) => a.count)) : 0;
  const maxFte = areas.length ? Math.max(...areas.map((a) => a.fte)) : 0;

  const totalCount = opps.length;
  const totalFte = Math.round(
    opps.reduce((sum, o) => sum + (o.fte_horas ?? 0), 0)
  );

  let prioAlta = 0;
  let prioMedia = 0;
  let rpaIdeal = 0;
  let rpaHybrid = 0;

  for (const o of opps) {
    // D-06: usar a coluna computada da view, idêntica a calcScore via parity
    // test — NÃO recomputar com score.ts, NÃO persistir.
    if (o.priority_level === 'alta') prioAlta++;
    else if (o.priority_level === 'media') prioMedia++;

    // D-07: consistente com rpaTier (cells.ts).
    const rpa = o.rpa_score ?? 0;
    if (rpa >= 5) rpaIdeal++;
    else if (rpa >= 3) rpaHybrid++;
  }

  return {
    areas,
    totalCount,
    totalFte,
    maxCount,
    maxFte,
    prioAlta,
    prioMedia,
    rpaIdeal,
    rpaHybrid,
  };
}

// =============================================================================
// VIEW ESTRATÉGICA (v0.4) — agregações puras que sustentam a aba Relatório
// redesenhada: Valor (realizado × potencial), Matriz Esforço×Impacto, Funil +
// Cycle time, Riscos e Mix de ferramenta. Todas READ-ONLY: leem colunas
// computadas da view (`score`, `priority_level`, `rpa_score`) e nunca
// recomputam nem persistem nada (docs/PROJETO.md §3). Módulo puro (sem JSX/servidor)
// → testável em vitest.
// =============================================================================

/** Jornada mensal de 1 FTE (h/mês) para converter h/mês → FTE-equivalente. */
export const HOURS_PER_FTE = 168;

/**
 * Status que representam valor JÁ ENTREGUE e em operação (capacidade já
 * liberada). `descontinuado` fica de fora de realizado E de potencial (esforço
 * morto). `gestao`/`manutencao` são automações vivas → contam como realizado.
 */
const REALIZED_STATUSES = new Set<OpportunityStatus>([
  'producao',
  'concluido',
  'gestao',
  'manutencao',
]);

/** Status ainda em construção na esteira (valor potencial, ainda represado). */
const PIPELINE_STATUSES = new Set<OpportunityStatus>([
  'novo',
  'em_analise',
  'planejamento',
  'backlog',
  'desenvolvimento',
  'homologacao',
]);

// ── ① VALOR ──────────────────────────────────────────────────────────────

export type ValueSummary = {
  /** Soma de fte_horas das automações já em operação (REALIZED_STATUSES). */
  fteRealizado: number;
  /** Soma de fte_horas das automações ainda na esteira (PIPELINE_STATUSES). */
  ftePotencial: number;
  /** realizado + potencial (exclui descontinuado). */
  fteTotal: number;
  /** (realizado + potencial) ÷ 168h → FTE-equivalente, 1 casa decimal. */
  fteEquivalente: number;
  /** Contagem de automações em operação. */
  emOperacao: number;
  /** Contagem de automações na esteira. */
  emPipeline: number;
  /** % do FTE total que já virou operação: realizado / (realizado+potencial). */
  pctRealizado: number;
};

export function buildValueSummary(opps: Opportunity[]): ValueSummary {
  let fteRealizado = 0;
  let ftePotencial = 0;
  let emOperacao = 0;
  let emPipeline = 0;

  for (const o of opps) {
    const h = o.fte_horas ?? 0;
    if (REALIZED_STATUSES.has(o.status)) {
      fteRealizado += h;
      emOperacao++;
    } else if (PIPELINE_STATUSES.has(o.status)) {
      ftePotencial += h;
      emPipeline++;
    }
    // descontinuado: ignorado em ambos.
  }

  const base = fteRealizado + ftePotencial;
  return {
    fteRealizado: Math.round(fteRealizado),
    ftePotencial: Math.round(ftePotencial),
    fteTotal: Math.round(base),
    fteEquivalente: Math.round((base / HOURS_PER_FTE) * 10) / 10,
    emOperacao,
    emPipeline,
    pctRealizado: base > 0 ? Math.round((fteRealizado / base) * 100) : 0,
  };
}

// ── ② MATRIZ ESFORÇO × IMPACTO ───────────────────────────────────────────

const EFFORT_VAL: Record<EffortLevel, number> = { baixo: 1, medio: 2, alto: 3 };
const COMPLEX_VAL: Record<ComplexityLevel, number> = { baixo: 1, medio: 2, alto: 3 };

/** Linha divisória dos quadrantes: esforço no meio da escala 1–3, impacto em 50. */
export const EFFORT_MID = 2;
export const IMPACT_MID = 50;

export type MatrixQuadrant =
  | 'quick_win' // baixo esforço + alto impacto → fazer primeiro
  | 'strategic' // alto esforço + alto impacto → aposta estratégica
  | 'fill_in' //   baixo esforço + baixo impacto → preenche capacidade
  | 'reconsider'; // alto esforço + baixo impacto → reavaliar

export type MatrixPoint = {
  id: string;
  seqId: number | null;
  label: string;
  area: string;
  /** Esforço combinado (média esforço+complexidade), escala 1–3. */
  effort: number;
  /** Impacto = score de prioridade (0–100), coluna computada da view. */
  impact: number;
  /** RPA fit (0–6), coluna GENERATED. */
  rpa: number;
  /** FTE em h/mês (null → 0). */
  fte: number;
  quadrant: MatrixQuadrant;
};

/** Média esforço+complexidade → 1–3. Ambos null → 2 (médio, neutro). */
function effortScore(o: Opportunity): number {
  const e = o.esforco ? EFFORT_VAL[o.esforco] : null;
  const c = o.complexidade ? COMPLEX_VAL[o.complexidade] : null;
  if (e != null && c != null) return (e + c) / 2;
  return e ?? c ?? EFFORT_MID;
}

function quadrantOf(effort: number, impact: number): MatrixQuadrant {
  const lowEffort = effort <= EFFORT_MID;
  const highImpact = impact >= IMPACT_MID;
  if (lowEffort && highImpact) return 'quick_win';
  if (!lowEffort && highImpact) return 'strategic';
  if (lowEffort && !highImpact) return 'fill_in';
  return 'reconsider';
}

export type PriorityMatrix = {
  points: MatrixPoint[];
  /** Só quadrante quick_win, ordenado por impacto desc, menor esforço, FTE desc. */
  quickWins: MatrixPoint[];
  counts: Record<MatrixQuadrant, number>;
};

export function buildPriorityMatrix(opps: Opportunity[]): PriorityMatrix {
  const points: MatrixPoint[] = opps.map((o) => {
    const effort = effortScore(o);
    const impact = typeof o.score === 'number' ? o.score : 0;
    return {
      id: o.id,
      seqId: o.seq_id ?? null,
      label:
        (o.processo || o.area || o.solicitante || '').trim() ||
        (o.seq_id != null ? `#${o.seq_id}` : 'Sem título'),
      area: (o.area || 'Sem Área').trim(),
      effort,
      impact,
      rpa: o.rpa_score ?? 0,
      fte: Math.round(o.fte_horas ?? 0),
      quadrant: quadrantOf(effort, impact),
    };
  });

  const counts: Record<MatrixQuadrant, number> = {
    quick_win: 0,
    strategic: 0,
    fill_in: 0,
    reconsider: 0,
  };
  for (const p of points) counts[p.quadrant]++;

  const quickWins = points
    .filter((p) => p.quadrant === 'quick_win')
    .sort(
      (a, b) =>
        b.impact - a.impact || a.effort - b.effort || b.fte - a.fte
    );

  return { points, quickWins, counts };
}

// ── ③ FUNIL (esteira) ────────────────────────────────────────────────────

/** Esteira linear exibida no funil (exclui backlog/gestao/manutencao/descontinuado). */
export const FUNNEL_ORDER: OpportunityStatus[] = [
  'novo',
  'em_analise',
  'planejamento',
  'desenvolvimento',
  'homologacao',
  'producao',
  'concluido',
];

export type FunnelStage = { status: OpportunityStatus; count: number };

export type Funnel = {
  stages: FunnelStage[];
  /** Maior contagem entre estágios (largura relativa das barras). */
  maxCount: number;
  /** Total considerado no funil (todas as oportunidades do escopo). */
  total: number;
  /** producao + concluido. */
  entregues: number;
  /** entregues / total × 100 (0 se total 0). */
  conversao: number;
};

export function buildFunnel(opps: Opportunity[]): Funnel {
  const countByStatus = Object.fromEntries(
    FUNNEL_ORDER.map((s) => [s, 0])
  ) as Record<OpportunityStatus, number>;

  let entregues = 0;
  for (const o of opps) {
    if (o.status in countByStatus) countByStatus[o.status]++;
    if (o.status === 'producao' || o.status === 'concluido') entregues++;
  }

  const stages: FunnelStage[] = FUNNEL_ORDER.map((s) => ({
    status: s,
    count: countByStatus[s],
  }));
  const maxCount = stages.reduce((m, s) => Math.max(m, s.count), 0);
  const total = opps.length;

  return {
    stages,
    maxCount,
    total,
    entregues,
    conversao: total > 0 ? Math.round((entregues / total) * 100) : 0,
  };
}

// ── ④ CYCLE TIME (a partir de opportunity_phases) ────────────────────────

/** Ordem das fases datadas no cálculo de cycle time (sem backlog). */
export const CYCLE_ORDER: PhaseKey[] = [
  'em_analise',
  'planejamento',
  'desenvolvimento',
  'homologacao',
  'producao',
  'concluido',
];

export type CycleStat = {
  phase: PhaseKey;
  /** Média de dias entre started_at e finished_at das fases FECHADAS. */
  avgDays: number;
  /** Quantas fases fechadas entraram na média. */
  count: number;
};

export type CycleTime = {
  perPhase: CycleStat[];
  /** Média, por oportunidade, da soma das durações de fases fechadas (dias). */
  cicloMedioDias: number | null;
};

const MS_PER_DAY = 86_400_000;

/** Duração em dias de uma fase fechada; null se faltar timestamp ou for inválida. */
function phaseDays(p: OpportunityPhase): number | null {
  if (!p.started_at || !p.finished_at) return null;
  const start = new Date(p.started_at).getTime();
  const end = new Date(p.finished_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const days = (end - start) / MS_PER_DAY;
  return days >= 0 ? days : null;
}

export function buildCycleTime(phases: OpportunityPhase[]): CycleTime {
  const acc: Record<string, { sum: number; count: number }> = {};
  const perOpp: Record<string, number> = {};

  for (const p of phases) {
    const days = phaseDays(p);
    if (days == null) continue;
    const key = p.phase_key;
    if (!CYCLE_ORDER.includes(key)) continue;
    if (!acc[key]) acc[key] = { sum: 0, count: 0 };
    acc[key].sum += days;
    acc[key].count++;
    perOpp[p.opportunity_id] = (perOpp[p.opportunity_id] ?? 0) + days;
  }

  const perPhase: CycleStat[] = CYCLE_ORDER.filter((k) => acc[k]).map((k) => ({
    phase: k,
    avgDays: Math.round((acc[k].sum / acc[k].count) * 10) / 10,
    count: acc[k].count,
  }));

  const oppTotals = Object.values(perOpp);
  const cicloMedioDias =
    oppTotals.length > 0
      ? Math.round(
          (oppTotals.reduce((a, d) => a + d, 0) / oppTotals.length) * 10
        ) / 10
      : null;

  return { perPhase, cicloMedioDias };
}

// ── ⑤ RISCOS (a partir de opportunity_risks) ─────────────────────────────

/** Riscos "abertos" = ainda ativos (novo/gerenciado); mitigado/ocorrido = fechados. */
const OPEN_RISK_STATUSES = new Set(['novo', 'gerenciado']);

export type RiskSummary = {
  total: number;
  byPriority: Record<RiskPriority, number>;
  /** priority crítica|alta E status novo|gerenciado. */
  criticosAbertos: number;
  /** tipo impedimento E status novo|gerenciado. */
  impedimentosAbertos: number;
  /** tipo oportunidade (todos os status). */
  oportunidades: number;
  /** Oportunidades distintas com ao menos um impedimento aberto. */
  opsBloqueadas: number;
};

export function buildRiskSummary(risks: OpportunityRisk[]): RiskSummary {
  const byPriority: Record<RiskPriority, number> = {
    critica: 0,
    alta: 0,
    media: 0,
    baixa: 0,
  };
  let criticosAbertos = 0;
  let impedimentosAbertos = 0;
  let oportunidades = 0;
  const bloqueadas = new Set<string>();

  for (const r of risks) {
    if (r.priority) byPriority[r.priority]++;
    const aberto = OPEN_RISK_STATUSES.has(r.status);
    if (aberto && (r.priority === 'critica' || r.priority === 'alta')) {
      criticosAbertos++;
    }
    if (r.tipo === 'impedimento' && aberto) {
      impedimentosAbertos++;
      bloqueadas.add(r.opportunity_id);
    }
    if (r.tipo === 'oportunidade') oportunidades++;
  }

  return {
    total: risks.length,
    byPriority,
    criticosAbertos,
    impedimentosAbertos,
    oportunidades,
    opsBloqueadas: bloqueadas.size,
  };
}

// ── ⑥ MIX DE FERRAMENTA ──────────────────────────────────────────────────

export type ToolMix = {
  rpa: number;
  n8n: number;
  ambos: number;
  /** 0055 — só ferramentas de fora do par RPA/n8n (SAP, UiPath, registradas
   *  pelo tenant…). Antes essas caíam em `semFerramenta`, que passava a
   *  impressão errada de "ninguém definiu ferramenta". */
  outras: number;
  semFerramenta: number;
};

/**
 * Uma oportunidade conta UMA vez (as fatias somam o total): RPA+n8n é 'ambos',
 * um dos dois é o próprio, nenhum dos dois mas alguma ferramenta é 'outras', e
 * array vazio é 'semFerramenta'. Ler de `ferramentas` (e não do enum legado)
 * é o que faz {sap} aparecer como ferramenta definida.
 */
export function buildToolMix(opps: Opportunity[]): ToolMix {
  const mix: ToolMix = { rpa: 0, n8n: 0, ambos: 0, outras: 0, semFerramenta: 0 };
  for (const o of opps) {
    const tools = o.ferramentas ?? [];
    const temRpa = tools.includes('rpa');
    const temN8n = tools.includes('n8n');
    if (temRpa && temN8n) mix.ambos++;
    else if (temRpa) mix.rpa++;
    else if (temN8n) mix.n8n++;
    else if (tools.length > 0) mix.outras++;
    else mix.semFerramenta++;
  }
  return mix;
}
