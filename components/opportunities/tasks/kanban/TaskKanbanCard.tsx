'use client';

import { useDraggable } from '@dnd-kit/core';
import type { OpportunityTask, TaskStatus } from '@/lib/opportunities/types';
import {
  TASK_STATUS_ORDER,
  TASK_STATUS_META,
  TASK_PRIORITY_META,
} from '@/lib/opportunities/task-labels';
import {
  assigneeName,
  assigneeInitials,
  type AssignableProfile,
} from '@/lib/opportunities/assignee-types';

type Props = {
  task: OpportunityTask;
  /** "T001" / "T001.1" — calculado uma vez sobre o array COMPLETO em TaskKanbanBoard. */
  idLabel: string;
  /** "🧩 N subtarefa(s)" (pai) ou "↳ subtarefa de {título}" (filha) — null se não se aplica. */
  hierarchyCaption: string | null;
  assignee: AssignableProfile | null;
  readOnly?: boolean;
  /** true durante a transição de status deste card — só anúncio a11y, sem loading visual (UI-SPEC). */
  isMoving?: boolean;
  onStatusChangeRequest: (taskId: string, targetStatus: TaskStatus) => void;
};

// Data ISO (YYYY-MM-DD) → dd/mm, sem `new Date()` (mesma técnica de TaskList.fmtDate).
function fmtShortDate(iso: string | null): string | null {
  if (!iso) return null;
  const [, m, d] = iso.slice(0, 10).split('-');
  return m && d ? `${d}/${m}` : null;
}

/**
 * Card arrastável do Kanban de tarefas — clona `kanban/Card.tsx` na mecânica
 * de arraste (useDraggable, transform manual, opacidade/cursor durante o
 * drag). Kanban é PLANO (UI-SPEC): toda tarefa/subtarefa tem seu próprio
 * card; a legenda de hierarquia é informativa, nunca um controle de
 * expandir/comprimir.
 *
 * O controle de status por teclado (`<select>`) chama a MESMA
 * `onStatusChangeRequest` que o drop do TaskKanbanBoard usa — ambos passam
 * pela mesma função pura de decisão (decide-drop.ts), então escolher
 * Bloqueio por teclado também abre o diálogo de motivo.
 */
export function TaskKanbanCard({
  task,
  idLabel,
  hierarchyCaption,
  assignee,
  readOnly = false,
  isMoving = false,
  onStatusChangeRequest,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { status: task.status },
    disabled: readOnly,
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    cursor: readOnly ? 'default' : isDragging ? 'grabbing' : 'grab',
    touchAction: 'none',
  };

  const dueLabel = fmtShortDate(task.due_date);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(readOnly ? {} : listeners)}
      {...attributes}
      aria-busy={isMoving}
      className="bg-wh border border-bdr rounded-lg p-2.5 hover:border-pril hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
        <span className="text-[10px] font-bold text-pri">#{idLabel}</span>
        {/* Tag de prioridade (0049) — mesma fonte de metadados da Lista. */}
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap"
          style={{
            background: TASK_PRIORITY_META[task.priority].bg,
            color: TASK_PRIORITY_META[task.priority].color,
          }}
          title={`Prioridade: ${TASK_PRIORITY_META[task.priority].label}`}
        >
          <span aria-hidden="true">{TASK_PRIORITY_META[task.priority].icon}</span>
          <span>{TASK_PRIORITY_META[task.priority].label}</span>
        </span>
        {hierarchyCaption && (
          <span className="text-[10px] text-mut truncate" title={hierarchyCaption}>
            {hierarchyCaption}
          </span>
        )}
      </div>

      <div className="text-[11px] font-semibold leading-snug line-clamp-2 mb-1.5" title={task.title}>
        {task.title}
      </div>

      {task.status === 'bloqueio' && task.blocked_reason && (
        <div
          className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 rounded px-2 py-1 text-[10px] line-clamp-2 mb-1.5"
          title={task.blocked_reason}
        >
          🚫 {task.blocked_reason}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5 min-w-0">
          {assignee ? (
            <>
              <span className="w-5 h-5 rounded-full bg-pri text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                {assigneeInitials(assignee)}
              </span>
              <span className="text-[10px] text-mut truncate">{assigneeName(assignee)}</span>
            </>
          ) : (
            <span className="text-[10px] text-mut italic">Sem responsável</span>
          )}
        </div>
        {dueLabel && (
          <span className="text-[10px] text-mut whitespace-nowrap flex-shrink-0">📅 {dueLabel}</span>
        )}
      </div>

      {!readOnly && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
          <label className="sr-only" htmlFor={`task-status-${task.id}`}>
            Mover {task.title} para outro status
          </label>
          <select
            id={`task-status-${task.id}`}
            value={task.status}
            onChange={(e) => onStatusChangeRequest(task.id, e.target.value as TaskStatus)}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full text-[10px] border border-bdr rounded px-1.5 py-1 bg-wh text-txt focus:outline-none focus:ring-1 focus:ring-pri"
          >
            {TASK_STATUS_ORDER.map((s) => {
              const meta = TASK_STATUS_META[s];
              return (
                <option key={s} value={s}>
                  {meta.icon} {meta.label}
                </option>
              );
            })}
          </select>
        </div>
      )}
    </div>
  );
}
