'use client';

import { Fragment, useState } from 'react';
import type { OpportunityTask } from '@/lib/opportunities/types';
import { TASK_STATUS_META } from '@/lib/opportunities/task-labels';
import { assigneeName, type AssignableProfile } from '@/lib/opportunities/assignee-types';
import { computeTaskRollup, groupTasksByParent } from '@/lib/opportunities/task-rollup';

// =============================================================================
// TaskGanttChart.tsx — Gantt de 2 níveis do Plano de Atividades (Phase 16,
// TASK-10/TASK-11, D-07 — zero dependência nova, mesma técnica leftPct/widthPct
// de `components/opportunities/gantt/GanttChart.tsx`).
//
// O módulo abre com as DUAS funções puras do domínio temporal — sem React,
// sem `@dnd-kit/core`, sem `@/lib/supabase/` (16-07 Task 1). A restrição mais
// importante é de ASSINATURA, não de implementação: `computeGanttDomain`
// recebe o array COMPLETO de tarefas (raízes e subtarefas, expandidas ou não)
// e NUNCA um parâmetro de expansão — é essa restrição que torna o Pitfall 3
// (RESEARCH §Pattern 4: "expandir uma tarefa nunca pode deslocar as outras
// barras") impossível de reintroduzir: se a função não aceita o estado de
// expansão como entrada, nenhum código que a chama pode acidentalmente
// filtrar por visibilidade antes de calcular o eixo.
//
// O componente `TaskGanttChart` (16-07 Task 2) envolve essas funções puras:
// usa `groupTasksByParent` (MESMO helper que `TaskList.tsx`, 16-04) para que
// a numeração T001/T001.1 e a ordem das linhas sejam idênticas às da Lista,
// e `computeTaskRollup` (MESMA fonte única, TASK-11/D-02) para a barra
// agregada da tarefa-pai — nunca uma segunda fórmula de span/percentual.
// Expandir/comprimir é estado local (`Set<string>`) PRÓPRIO deste
// componente, independente do da Lista (D-13).
// =============================================================================

const DAY_MS = 86_400_000;

/**
 * Largura mínima de uma barra, em %, para que um intervalo degenerado
 * (início igual ao fim de UMA tarefa) ainda seja visível — mesmo piso de
 * `components/opportunities/gantt/GanttChart.tsx` (`Math.max(..., 0.8)`).
 */
const MIN_BAR_WIDTH_PCT = 0.8;

export type GanttDomain = {
  /** Início do domínio (ms), com 1 dia de folga antes da menor data de início. */
  t0: number;
  /** Fim do domínio (ms), com 1 dia de folga depois da maior data de fim. */
  t1: number;
};

/**
 * Domínio temporal do Gantt — calculado sobre o array COMPLETO de tarefas
 * (raízes + subtarefas, TODAS, independentemente de expansão). Considera
 * apenas tarefas com `start_date` **e** `due_date` (A4 — tarefa com data
 * incompleta não distorce o eixo, e é tratada em outro lugar como linha sem
 * barra). Devolve `null` quando nenhuma tarefa qualifica — a UI trata isso
 * como "nada a posicionar", nunca dividindo por zero.
 *
 * Mesma técnica de `opportunities/gantt/GanttChart.tsx`: folga de 1 dia em
 * cada ponta e um piso mínimo de intervalo (`t1 - t0 >= DAY_MS`), garantindo
 * que nenhum consumidor precise proteger a divisão por `t1 - t0` em outro
 * lugar do código.
 */
export function computeGanttDomain(tasks: OpportunityTask[]): GanttDomain | null {
  let t0 = Infinity;
  let t1 = -Infinity;

  for (const task of tasks) {
    if (!task.start_date || !task.due_date) continue;
    const start = Date.parse(task.start_date);
    const due = Date.parse(task.due_date);
    if (start < t0) t0 = start;
    if (due > t1) t1 = due;
  }

  if (t0 === Infinity || t1 === -Infinity) return null;

  t0 -= DAY_MS;
  t1 += DAY_MS;
  if (t1 - t0 < DAY_MS) t1 = t0 + DAY_MS;

  return { t0, t1 };
}

/**
 * Posição de uma barra dentro do domínio — recebe o domínio já calculado e um
 * par de datas (início/fim da PRÓPRIA linha: da tarefa, ou do span agregado
 * de `computeTaskRollup` no caso da pai com subtarefas) e devolve a posição
 * inicial e a largura, ambas em porcentagem do domínio. A largura nunca cai
 * abaixo de `MIN_BAR_WIDTH_PCT`, para que um intervalo degenerado (início
 * igual ao fim) ainda produza uma barra visível.
 */
export function ganttBarPosition(
  domain: GanttDomain,
  startIso: string,
  dueIso: string
): { leftPct: number; widthPct: number } {
  const span = domain.t1 - domain.t0;
  const start = Date.parse(startIso);
  const due = Date.parse(dueIso);
  const leftPct = ((start - domain.t0) / span) * 100;
  const rightPct = ((due - domain.t0) / span) * 100;
  const widthPct = Math.max(rightPct - leftPct, MIN_BAR_WIDTH_PCT);

  return { leftPct, widthPct };
}

// -----------------------------------------------------------------------------
// Componente — envolve as funções puras acima. `'use client'` porque o
// expandir/comprimir é estado local (D-13); nenhuma mutação/Server Action
// acontece aqui (o Gantt desta fase é só leitura — datas se editam pelo
// formulário, ver CONTEXT "Fora de escopo").
// -----------------------------------------------------------------------------

type Props = {
  tasks: OpportunityTask[];
  /** Candidatos a responsável do tenant — reusado de D-08, sem query nova de nomes. */
  assignableProfiles: AssignableProfile[];
};

/** Camada base (neutra) da barra agregada da pai — representa o span inteiro. */
const ROLLUP_BASE_COLOR = '#e2e8f0'; // mesma cor de border-bdr
/** Camada de progresso sobreposta — verde de "Finalizado" (TASK_STATUS_META),
 *  reforçando "quanto já foi concluído" sem inventar uma cor de accent nova
 *  (accent é reservado para navegação/foco, nunca status — UI-SPEC Color). */
const ROLLUP_PROGRESS_COLOR = TASK_STATUS_META.finalizado.color;

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

// Data de input HTML (YYYY-MM-DD) → dd/mm/aa, sem `new Date()`/locale, mesma
// técnica de `TaskList.tsx`'s `fmtDate` — evita divergência SSR/hidratação.
function fmtDateIso(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : '—';
}

// Timestamp (ms) → dd/mm/aa em UTC — mesma técnica de
// `components/opportunities/gantt/GanttChart.tsx`'s `fmtDate`, usada só para
// as marcas do eixo (que trabalham em ms, não em string ISO de data).
function fmtTimestamp(ts: number): string {
  const d = new Date(ts);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

/**
 * View Gantt das tarefas de uma oportunidade, hierarquia de 2 níveis (D-01):
 * uma linha por tarefa raiz, expandir revela as linhas das subtarefas
 * (TASK-10, estado local — D-13, independente da Lista). A barra da
 * tarefa-pai com subtarefas cobre o span agregado de `computeTaskRollup` e
 * exibe o percentual de conclusão como preenchimento proporcional
 * (TASK-11/D-02, calculado em runtime, nunca persistido). Tarefa sem uma das
 * datas (em qualquer nível) continua aparecendo como linha, sem barra — não
 * entra no domínio (A4, Pitfall 3). Analog: `opportunities/gantt/GanttChart.tsx`
 * (estrutura visual, eixo, linha de "hoje").
 */
export function TaskGanttChart({ tasks, assignableProfiles }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const { roots, childrenByParent } = groupTasksByParent(tasks);
  const nameById = new Map(assignableProfiles.map((p) => [p.id, assigneeName(p)]));

  // Domínio sobre o array COMPLETO de tarefas — nunca filtrado por expansão
  // (Pitfall 3): expandir uma tarefa nunca desloca as demais barras.
  const domain = computeGanttDomain(tasks);
  const now = Date.now();
  const todayIso = new Date(now).toISOString().slice(0, 10);
  const todayPct =
    domain && now >= domain.t0 && now <= domain.t1
      ? ganttBarPosition(domain, todayIso, todayIso).leftPct
      : null;
  const ticks = domain
    ? Array.from({ length: 6 }, (_, i) => {
        const t = domain.t0 + ((domain.t1 - domain.t0) * i) / 5;
        return { leftPct: (i / 5) * 100, label: fmtTimestamp(t) };
      })
    : [];

  function toggleExpanded(taskId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  return (
    <div className="bg-wh border border-bdr rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          {/* Eixo de datas */}
          <div className="flex border-b border-bdr bg-bg">
            <div className="w-14 shrink-0" aria-hidden="true" />
            <div className="w-[240px] shrink-0 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
              Tarefa
            </div>
            <div className="relative flex-1 h-8">
              {domain ? (
                ticks.map((t, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 flex items-center text-[10px] text-mut -translate-x-1/2 whitespace-nowrap"
                    style={{ left: `${t.leftPct}%` }}
                  >
                    {t.label}
                  </div>
                ))
              ) : (
                <div className="flex items-center h-full text-[11px] text-mut italic px-2">
                  Nenhuma tarefa com datas definidas para posicionar no eixo temporal.
                </div>
              )}
            </div>
          </div>

          {/* Linhas */}
          {roots.map((root, i) => {
            const rootTid = `T${pad3(i + 1)}`;
            const children = childrenByParent.get(root.id) ?? [];
            const hasChildren = children.length > 0;
            const rollup = hasChildren ? computeTaskRollup(children) : null;
            const expanded = expandedIds.has(root.id);
            const assigneeLabel = root.assignee_id
              ? (nameById.get(root.assignee_id) ?? '—')
              : '—';
            const meta = TASK_STATUS_META[root.status];

            // Datas da barra: pai COM subtarefas usa o span do rollup, nunca
            // as próprias datas; pai SEM subtarefas usa as próprias (A3).
            const barStart = hasChildren ? rollup!.spanStart : root.start_date;
            const barDue = hasChildren ? rollup!.spanDue : root.due_date;
            const hasBar = domain !== null && barStart !== null && barDue !== null;
            const pos = hasBar ? ganttBarPosition(domain!, barStart!, barDue!) : null;

            return (
              <Fragment key={root.id}>
                <div className="flex border-b border-bdr/60 hover:bg-blue-50/40 dark:hover:bg-blue-950/30">
                  <div className="w-14 shrink-0 flex items-start justify-center pt-2">
                    {hasChildren && (
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={
                          expanded
                            ? `Comprimir subtarefas de ${root.title}`
                            : `Expandir subtarefas de ${root.title}`
                        }
                        title={
                          expanded
                            ? 'Comprimir subtarefas'
                            : `Expandir ${children.length} ${children.length === 1 ? 'subtarefa' : 'subtarefas'}`
                        }
                        onClick={() => toggleExpanded(root.id)}
                        className={`inline-flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-lg border text-[11px] font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-pri ${
                          expanded
                            ? 'bg-pri text-white border-pri'
                            : 'bg-bg text-pri border-bdr hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-block transition-transform leading-none ${expanded ? 'rotate-90' : ''}`}
                        >
                          ▶
                        </span>
                        <span className="leading-none tabular-nums">{children.length}</span>
                      </button>
                    )}
                  </div>
                  <div className="w-[240px] shrink-0 px-3 py-2.5 min-w-0">
                    <div className="text-[11px] font-semibold text-pri">{rootTid}</div>
                    <div
                      className="text-[12px] font-bold text-txt truncate"
                      title={root.title}
                    >
                      {root.title}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 min-w-0">
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap"
                        style={{ color: meta.color }}
                      >
                        {meta.icon} {meta.label}
                      </span>
                      <span className="text-[10px] text-mut truncate">
                        · {assigneeLabel}
                      </span>
                    </div>
                  </div>
                  <div className="relative flex-1 my-2 mr-3">
                    {todayPct !== null && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-red-400/70 z-10"
                        style={{ left: `${todayPct}%` }}
                        title="Hoje"
                      />
                    )}
                    {hasBar && pos ? (
                      hasChildren ? (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-5 rounded-md overflow-hidden"
                          style={{
                            left: `${pos.leftPct}%`,
                            width: `${pos.widthPct}%`,
                            background: ROLLUP_BASE_COLOR,
                          }}
                          title={`Span agregado: ${fmtDateIso(barStart)} → ${fmtDateIso(barDue)} · ${rollup!.percentComplete}% concluído (${rollup!.completedChildren}/${rollup!.totalChildren})`}
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

                {expanded &&
                  children.map((child, j) => {
                    const childTid = `${rootTid}.${j + 1}`;
                    const childAssigneeLabel = child.assignee_id
                      ? (nameById.get(child.assignee_id) ?? '—')
                      : '—';
                    const childMeta = TASK_STATUS_META[child.status];
                    const childHasBar =
                      domain !== null && child.start_date !== null && child.due_date !== null;
                    const childPos = childHasBar
                      ? ganttBarPosition(domain!, child.start_date!, child.due_date!)
                      : null;

                    return (
                      <div
                        key={child.id}
                        className="flex border-b border-bdr/60 bg-bg/40"
                      >
                        <div className="w-14 shrink-0" aria-hidden="true" />
                        <div className="w-[240px] shrink-0 px-3 py-2.5 pl-8 min-w-0">
                          <div className="text-[11px] font-semibold text-pri">
                            {childTid}
                          </div>
                          <div
                            className="text-[12px] font-medium text-txt truncate"
                            title={child.title}
                          >
                            {child.title}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5 min-w-0">
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap"
                              style={{ color: childMeta.color }}
                            >
                              {childMeta.icon} {childMeta.label}
                            </span>
                            <span className="text-[10px] text-mut truncate">
                              · {childAssigneeLabel}
                            </span>
                          </div>
                        </div>
                        <div className="relative flex-1 my-2 mr-3">
                          {todayPct !== null && (
                            <div
                              className="absolute top-0 bottom-0 w-px bg-red-400/70 z-10"
                              style={{ left: `${todayPct}%` }}
                              title="Hoje"
                            />
                          )}
                          {childHasBar && childPos ? (
                            <div
                              className="absolute top-1/2 -translate-y-1/2 h-5 rounded-md"
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
        </div>
      </div>

      <div className="text-[11px] text-mut px-4 py-2.5 border-t border-bdr">
        💡 Barra clara + preenchimento verde = progresso agregado das subtarefas. Linha
        vermelha = hoje.
      </div>
    </div>
  );
}
