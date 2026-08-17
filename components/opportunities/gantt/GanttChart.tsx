'use client';

import { Fragment, useState } from 'react';
import type {
  Opportunity,
  OpportunityPhase,
  OpportunityTask,
} from '@/lib/opportunities/types';
import { STATUS_META } from '@/lib/opportunities/status';
import { TASK_STATUS_META } from '@/lib/opportunities/task-labels';
import { computeTaskRollup, groupTasksByParent } from '@/lib/opportunities/task-rollup';

type Props = {
  opportunities: Opportunity[];
  phases: OpportunityPhase[];
  /** Tarefas (raízes + subtarefas) de TODAS as oportunidades da lista. */
  tasks?: OpportunityTask[];
};

// Fases exibidas na legenda / barras (mesmas do pipeline datado). backlog entra
// porque tem phase_key datado; novo/descontinuado não têm linha de fase.
const LEGEND_KEYS = [
  'em_analise',
  'planejamento',
  'backlog',
  'desenvolvimento',
  'homologacao',
  'producao',
  'concluido',
] as const;

const DAY = 86_400_000;

/** Piso de largura da barra, em % — intervalo degenerado ainda fica visível. */
const MIN_BAR_WIDTH_PCT = 0.8;

/** Fundo da barra agregada da tarefa-pai (mesma cor de border-bdr). */
const ROLLUP_BASE_COLOR = '#e2e8f0';
const ROLLUP_PROGRESS_COLOR = TASK_STATUS_META.finalizado.color;

function metaFor(phaseKey: string) {
  return (STATUS_META as Record<string, (typeof STATUS_META)[keyof typeof STATUS_META]>)[
    phaseKey
  ];
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

/** Granularidade do eixo. `pxPerDay` define a largura total da faixa de tempo. */
const ZOOM_META = {
  diario: { label: 'Diário', pxPerDay: 44 },
  semanal: { label: 'Semanal', pxPerDay: 26 },
  mensal: { label: 'Mensal', pxPerDay: 7 },
  trimestral: { label: 'Trimestral', pxPerDay: 2.2 },
  semestral: { label: 'Semestral', pxPerDay: 1.1 },
} as const;

type Zoom = keyof typeof ZOOM_META;
const ZOOM_KEYS = Object.keys(ZOOM_META) as Zoom[];

const MONTH_ABBR = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

/** Largura mínima do trilho — evita faixa degenerada em spans curtos. */
const MIN_TRACK_PX = 520;
/** Trava de segurança: nunca renderiza mais que isso de marcadores. */
const MAX_TICKS = 800;
/** Acima disso, a grade vertical some das linhas (só o cabeçalho mantém). */
const MAX_GRID_TICKS = 120;

/**
 * Marcadores alinhados a fronteiras reais de calendário (segunda-feira, 1º do
 * mês/trimestre/semestre), em UTC — mesma base de `Date.parse` das datas ISO.
 */
function buildTicks(t0: number, t1: number, zoom: Zoom): { ts: number; label: string }[] {
  const out: { ts: number; label: string }[] = [];
  const d = new Date(t0);
  d.setUTCHours(0, 0, 0, 0);

  if (zoom === 'diario' || zoom === 'semanal') {
    // Semanal recua até a segunda-feira da semana de t0; diário começa em t0.
    const stepDays = zoom === 'diario' ? 1 : 7;
    if (zoom === 'semanal') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    for (
      let ts = d.getTime();
      ts <= t1 && out.length < MAX_TICKS;
      ts += stepDays * DAY
    ) {
      const c = new Date(ts);
      out.push({
        ts,
        label: `${String(c.getUTCDate()).padStart(2, '0')}/${String(
          c.getUTCMonth() + 1,
        ).padStart(2, '0')}`,
      });
    }
    return out;
  }

  const step = zoom === 'mensal' ? 1 : zoom === 'trimestral' ? 3 : 6;
  d.setUTCDate(1);
  d.setUTCMonth(Math.floor(d.getUTCMonth() / step) * step);

  while (d.getTime() <= t1 && out.length < MAX_TICKS) {
    const m = d.getUTCMonth();
    const yy = String(d.getUTCFullYear()).slice(2);
    const label =
      zoom === 'mensal'
        ? `${MONTH_ABBR[m]}/${yy}`
        : zoom === 'trimestral'
          ? `T${m / 3 + 1}/${yy}`
          : `S${m / 6 + 1}/${yy}`;
    out.push({ ts: d.getTime(), label });
    d.setUTCMonth(m + step);
  }
  return out;
}

// Data ISO (YYYY-MM-DD) → dd/mm/aa sem `new Date()`/locale — mesma técnica de
// `tasks/gantt/TaskGanttChart.tsx`, evita divergência SSR/hidratação.
function fmtDateIso(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : '—';
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

type Bar = {
  key: string;
  label: string;
  color: string;
  leftPct: number;
  widthPct: number;
  ongoing: boolean;
  title: string;
};

export function GanttChart({ opportunities, phases, tasks = [] }: Props) {
  // Expansão em 2 níveis, estado local (nenhuma mutação aqui — Gantt é leitura):
  // oportunidade → tarefas raiz; tarefa raiz → subtarefas.
  const [expandedOpps, setExpandedOpps] = useState<Set<string>>(new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState<Zoom>('semanal');

  // Quantizado no início do dia UTC: `now` entra na largura das barras em
  // andamento e na linha de "hoje" — sem quantizar, servidor e cliente rendem
  // percentuais diferentes e o React acusa mismatch de hidratação a cada load.
  const now = Math.floor(Date.now() / DAY) * DAY;

  // Fases por oportunidade, só as que têm início datado.
  const byOpp = new Map<string, OpportunityPhase[]>();
  for (const p of phases) {
    if (!p.started_at) continue;
    const arr = byOpp.get(p.opportunity_id) ?? [];
    arr.push(p);
    byOpp.set(p.opportunity_id, arr);
  }

  // Tarefas por oportunidade, preservando a ordem vinda do banco.
  const tasksByOpp = new Map<string, OpportunityTask[]>();
  for (const t of tasks) {
    const arr = tasksByOpp.get(t.opportunity_id) ?? [];
    arr.push(t);
    tasksByOpp.set(t.opportunity_id, arr);
  }

  // Só oportunidades com ≥1 fase datada, preservando a ordenação da lista.
  const rows = opportunities.filter((o) => byOpp.has(o.id));

  if (rows.length === 0) {
    return (
      <div className="bg-wh border border-bdr rounded-xl p-12 text-center text-mut">
        Nenhuma oportunidade com fases datadas para exibir no Gantt.
        <div className="text-[12px] mt-1">
          As datas são registradas automaticamente quando o status avança no
          pipeline.
        </div>
      </div>
    );
  }

  // Domínio temporal: menor início → maior fim (fase em andamento estende p/ hoje).
  // Inclui as datas de TODAS as tarefas — inclusive as que estão comprimidas —
  // para que expandir uma linha nunca desloque as barras das outras.
  let t0 = Infinity;
  let t1 = -Infinity;
  for (const o of rows) {
    for (const p of byOpp.get(o.id)!) {
      const s = Date.parse(p.started_at!);
      const e = p.finished_at ? Date.parse(p.finished_at) : now;
      if (s < t0) t0 = s;
      if (e > t1) t1 = e;
    }
    for (const t of tasksByOpp.get(o.id) ?? []) {
      if (!t.start_date || !t.due_date) continue;
      const s = Date.parse(t.start_date);
      const e = Date.parse(t.due_date);
      if (s < t0) t0 = s;
      if (e > t1) t1 = e;
    }
  }
  // Padding de 1 dia em cada ponta + span mínimo p/ evitar divisão por zero.
  t0 -= DAY;
  t1 += DAY;
  if (t1 - t0 < DAY) t1 = t0 + DAY;
  const span = t1 - t0;
  const xPct = (t: number) => ((t - t0) / span) * 100;

  /** Posição de uma barra a partir de um par de datas ISO (tarefas). */
  function barPositionIso(startIso: string, dueIso: string) {
    const leftPct = xPct(Date.parse(startIso));
    const widthPct = Math.max(xPct(Date.parse(dueIso)) - leftPct, MIN_BAR_WIDTH_PCT);
    return { leftPct, widthPct };
  }

  // Largura do trilho derivada do zoom: a faixa cresce e o container rola
  // horizontalmente, em vez de comprimir tudo na largura da tela.
  const trackPx = Math.max(
    Math.round(((span / DAY) * ZOOM_META[zoom].pxPerDay)),
    MIN_TRACK_PX,
  );

  const ticks = buildTicks(t0, t1, zoom)
    .map((t) => ({ ...t, leftPct: xPct(t.ts) }))
    .filter((t) => t.leftPct >= 0 && t.leftPct <= 100);
  const todayPct = now >= t0 && now <= t1 ? xPct(now) : null;

  // Linhas verticais da grade, repetidas em cada trilho. Acima de ~120 marcadores
  // (zoom diário em spans longos) a grade sai — seriam milhares de nós por render.
  const gridLines = (ticks.length > MAX_GRID_TICKS ? [] : ticks).map((t, i) => (
    <div
      key={`g${i}`}
      className="absolute top-0 bottom-0 w-px bg-bdr/50"
      style={{ left: `${t.leftPct}%` }}
      aria-hidden="true"
    />
  ));

  function toggle(setter: typeof setExpandedOpps, id: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const rowData = rows.map((o) => {
    const bars: Bar[] = byOpp
      .get(o.id)!
      .map((p) => {
        const s = Date.parse(p.started_at!);
        const e = p.finished_at ? Date.parse(p.finished_at) : now;
        const meta = metaFor(p.phase_key);
        const left = xPct(s);
        const width = Math.max(xPct(e) - left, MIN_BAR_WIDTH_PCT);
        const label = meta?.label ?? p.phase_key;
        return {
          key: p.id,
          label,
          color: meta?.color ?? '#94a3b8',
          leftPct: left,
          widthPct: width,
          ongoing: !p.finished_at,
          title: `${label}: ${fmtDate(s)} → ${
            p.finished_at ? fmtDate(e) : 'em andamento'
          }`,
        };
      })
      .sort((a, b) => a.leftPct - b.leftPct);
    return { o, bars };
  });

  /** Linha de "hoje" — repetida em cada trilho, como já era. */
  const todayLine =
    todayPct !== null ? (
      <div
        className="absolute top-0 bottom-0 w-px bg-red-400/70 z-10"
        style={{ left: `${todayPct}%` }}
        title="Hoje"
      />
    ) : null;

  return (
    <div className="bg-wh border border-bdr rounded-xl shadow-sm overflow-hidden">
      {/* Legenda + zoom do eixo */}
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-bdr">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {LEGEND_KEYS.map((k) => {
            const m = metaFor(k);
            return (
              <div key={k} className="flex items-center gap-1.5 text-[11px] text-mut">
                <span
                  className="w-3 h-3 rounded-sm"
                  style={{ background: m?.color ?? '#94a3b8' }}
                />
                {m?.label ?? k}
              </div>
            );
          })}
        </div>
        <label className="flex items-center gap-2 shrink-0 text-[11px] text-mut">
          Intervalo
          <select
            value={zoom}
            onChange={(e) => setZoom(e.target.value as Zoom)}
            aria-label="Intervalo do eixo de datas"
            className="border border-bdr rounded-md bg-wh text-txt text-[11px] px-2 py-1"
          >
            {ZOOM_KEYS.map((k) => (
              <option key={k} value={k}>
                {ZOOM_META[k].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 32 + 240 + trackPx + 12 }}>
          {/* Eixo de datas */}
          <div className="flex border-b border-bdr bg-bg">
            <div className="flex shrink-0 sticky left-0 z-20 bg-bg">
              <div className="w-8 shrink-0" aria-hidden="true" />
              <div className="w-[240px] shrink-0 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
                Oportunidade
              </div>
            </div>
            <div className="relative h-8 shrink-0" style={{ width: trackPx }}>
              {ticks.map((t, i) => (
                <Fragment key={i}>
                  <div
                    className="absolute top-0 bottom-0 w-px bg-bdr/70"
                    style={{ left: `${t.leftPct}%` }}
                    aria-hidden="true"
                  />
                  <div
                    className="absolute top-0 bottom-0 flex items-center pl-1 text-[10px] text-mut whitespace-nowrap"
                    style={{ left: `${t.leftPct}%` }}
                  >
                    {t.label}
                  </div>
                </Fragment>
              ))}
            </div>
          </div>

          {/* Linhas */}
          {rowData.map(({ o, bars }) => {
            const oppTasks = tasksByOpp.get(o.id) ?? [];
            const { roots, childrenByParent } = groupTasksByParent(oppTasks);
            const hasTasks = roots.length > 0;
            const oppExpanded = expandedOpps.has(o.id);

            return (
              <Fragment key={o.id}>
                <div className="flex border-b border-bdr group hover:bg-blue-50/40 dark:hover:bg-blue-950/30">
                  <div className="flex shrink-0 sticky left-0 z-10 bg-wh group-hover:bg-blue-50/40 dark:group-hover:bg-blue-950/30">
                    <div className="w-8 shrink-0 flex items-start justify-center pt-2.5">
                      {hasTasks ? (
                        <button
                          type="button"
                          onClick={() => toggle(setExpandedOpps, o.id)}
                          aria-expanded={oppExpanded}
                          aria-label={
                            oppExpanded
                              ? `Ocultar tarefas de ${o.processo}`
                              : `Mostrar tarefas de ${o.processo}`
                          }
                          title={`${roots.length} tarefa${roots.length > 1 ? 's' : ''}`}
                          className="w-5 h-5 rounded flex items-center justify-center text-[10px] text-mut hover:bg-bdr/60 hover:text-txt"
                        >
                          {oppExpanded ? '▼' : '▶'}
                        </button>
                      ) : null}
                    </div>
                    <div className="w-[240px] shrink-0 px-4 py-2.5 min-w-0">
                      <div
                        className="text-[12px] font-semibold text-txt truncate"
                        title={o.processo}
                      >
                        #{String(o.seq_id).padStart(4, '0')} · {o.processo}
                      </div>
                      <div className="text-[10px] text-mut truncate">
                        {o.solicitante}
                        {hasTasks ? ` · ${roots.length} tarefa${roots.length > 1 ? 's' : ''}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="relative my-2 shrink-0" style={{ width: trackPx }}>
                    {todayLine}
                    {/* trilho */}
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-6">
                      {bars.map((b) => (
                        <div
                          key={b.key}
                          title={b.title}
                          className={
                            'absolute top-0 h-6 rounded-md flex items-center px-1.5 overflow-hidden ' +
                            (b.ongoing ? 'ring-1 ring-inset ring-white/50' : '')
                          }
                          style={{
                            left: `${b.leftPct}%`,
                            width: `${b.widthPct}%`,
                            background: b.ongoing
                              ? `repeating-linear-gradient(45deg, ${b.color}, ${b.color} 6px, ${b.color}cc 6px, ${b.color}cc 12px)`
                              : b.color,
                          }}
                        >
                          <span className="text-[10px] font-semibold text-white truncate">
                            {b.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {oppExpanded &&
                  roots.map((root, i) => {
                    const rootTid = `T${pad3(i + 1)}`;
                    const children = childrenByParent.get(root.id) ?? [];
                    const hasChildren = children.length > 0;
                    const rollup = hasChildren ? computeTaskRollup(children) : null;
                    const taskExpanded = expandedTasks.has(root.id);
                    const meta = TASK_STATUS_META[root.status];

                    // Pai COM subtarefas usa o span agregado do rollup; pai sem
                    // subtarefas usa as próprias datas (mesma regra do Gantt de tarefas).
                    const barStart = hasChildren ? rollup!.spanStart : root.start_date;
                    const barDue = hasChildren ? rollup!.spanDue : root.due_date;
                    const pos =
                      barStart && barDue ? barPositionIso(barStart, barDue) : null;

                    return (
                      <Fragment key={root.id}>
                        <div className="flex border-b border-bdr/60 bg-bg/40">
                          <div className="flex shrink-0 sticky left-0 z-10 bg-bg">
                            <div className="w-8 shrink-0 flex items-start justify-end pt-2.5 pr-0.5">
                              {hasChildren ? (
                                <button
                                  type="button"
                                  onClick={() => toggle(setExpandedTasks, root.id)}
                                  aria-expanded={taskExpanded}
                                  aria-label={
                                    taskExpanded
                                      ? `Ocultar subtarefas de ${root.title}`
                                      : `Mostrar subtarefas de ${root.title}`
                                  }
                                  className="w-4 h-4 rounded flex items-center justify-center text-[9px] text-mut hover:bg-bdr/60 hover:text-txt"
                                >
                                  {taskExpanded ? '▼' : '▶'}
                                </button>
                              ) : null}
                            </div>
                            <div className="w-[240px] shrink-0 px-4 py-2.5 pl-6 min-w-0">
                              <div className="text-[11px] font-semibold text-pri">
                                {rootTid}
                              </div>
                              <div
                                className="text-[12px] font-medium text-txt truncate"
                                title={root.title}
                              >
                                {root.title}
                              </div>
                              <div className="text-[10px] whitespace-nowrap" style={{ color: meta.color }}>
                                {meta.icon} {meta.label}
                                {hasChildren
                                  ? ` · ${rollup!.completedChildren}/${rollup!.totalChildren}`
                                  : ''}
                              </div>
                            </div>
                          </div>
                          <div className="relative my-2 shrink-0" style={{ width: trackPx }}>
                            {todayLine}
                            {pos ? (
                              hasChildren ? (
                                <div
                                  className="absolute top-1/2 -translate-y-1/2 h-5 rounded-md overflow-hidden"
                                  style={{
                                    left: `${pos.leftPct}%`,
                                    width: `${pos.widthPct}%`,
                                    background: ROLLUP_BASE_COLOR,
                                  }}
                                  title={`${fmtDateIso(barStart)} → ${fmtDateIso(barDue)} · ${rollup!.percentComplete}% (${rollup!.completedChildren}/${rollup!.totalChildren})`}
                                >
                                  <div
                                    className="h-full"
                                    style={{
                                      width: `${rollup!.percentComplete}%`,
                                      background: ROLLUP_PROGRESS_COLOR,
                                    }}
                                  />
                                </div>
                              ) : (
                                <div
                                  className="absolute top-1/2 -translate-y-1/2 h-5 rounded-md"
                                  style={{
                                    left: `${pos.leftPct}%`,
                                    width: `${pos.widthPct}%`,
                                    background: meta.color,
                                  }}
                                  title={`${fmtDateIso(barStart)} → ${fmtDateIso(barDue)}`}
                                />
                              )
                            ) : (
                              <div className="absolute inset-y-0 left-0 flex items-center text-[11px] text-mut italic whitespace-nowrap">
                                Sem data definida
                              </div>
                            )}
                          </div>
                        </div>

                        {taskExpanded &&
                          children.map((child, j) => {
                            const childMeta = TASK_STATUS_META[child.status];
                            const childPos =
                              child.start_date && child.due_date
                                ? barPositionIso(child.start_date, child.due_date)
                                : null;

                            return (
                              <div
                                key={child.id}
                                className="flex border-b border-bdr/60 bg-bg/60"
                              >
                                <div className="flex shrink-0 sticky left-0 z-10 bg-bg">
                                  <div className="w-8 shrink-0" aria-hidden="true" />
                                  <div className="w-[240px] shrink-0 px-4 py-2 pl-11 min-w-0">
                                    <div className="text-[11px] font-semibold text-pri">
                                      {`${rootTid}.${j + 1}`}
                                    </div>
                                    <div
                                      className="text-[12px] text-txt truncate"
                                      title={child.title}
                                    >
                                      {child.title}
                                    </div>
                                    <div
                                      className="text-[10px] whitespace-nowrap"
                                      style={{ color: childMeta.color }}
                                    >
                                      {childMeta.icon} {childMeta.label}
                                    </div>
                                  </div>
                                </div>
                                <div className="relative my-2 shrink-0" style={{ width: trackPx }}>
                                  {todayLine}
                                  {childPos ? (
                                    <div
                                      className="absolute top-1/2 -translate-y-1/2 h-4 rounded-md"
                                      style={{
                                        left: `${childPos.leftPct}%`,
                                        width: `${childPos.widthPct}%`,
                                        background: childMeta.color,
                                      }}
                                      title={`${fmtDateIso(child.start_date)} → ${fmtDateIso(child.due_date)}`}
                                    />
                                  ) : (
                                    <div className="absolute inset-y-0 left-0 flex items-center text-[11px] text-mut italic whitespace-nowrap">
                                      Sem data definida
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </Fragment>
                    );
                  })}
              </Fragment>
            );
          })}
        </div>
      </div>

      <div className="text-[11px] text-mut px-4 py-2.5 border-t border-bdr">
        💡 Use ▶ para abrir as tarefas de uma oportunidade e as subtarefas de cada
        tarefa. Barras hachuradas = fase em andamento (sem data de fim). Barra clara
        com preenchimento verde = progresso agregado das subtarefas. Linha vermelha =
        hoje. Passe o mouse para ver as datas.
      </div>
    </div>
  );
}
