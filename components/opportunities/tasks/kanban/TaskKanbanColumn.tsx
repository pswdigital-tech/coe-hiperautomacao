'use client';

import { useDroppable } from '@dnd-kit/core';
import type { OpportunityTask, TaskStatus } from '@/lib/opportunities/types';
import { TASK_STATUS_META } from '@/lib/opportunities/task-labels';
import type { AssignableProfile } from '@/lib/opportunities/assignee-types';
import { TaskKanbanCard } from './TaskKanbanCard';

type Props = {
  status: TaskStatus;
  tasks: OpportunityTask[];
  idLabelById: Map<string, string>;
  hierarchyCaptionById: Map<string, string | null>;
  assigneeById: Map<string, AssignableProfile>;
  readOnly: boolean;
  /** id da tarefa em transição (a11y aria-busy) — nenhum indicador visual de loading (UI-SPEC). */
  movingTaskId: string | null;
  onStatusChangeRequest: (taskId: string, targetStatus: TaskStatus) => void;
};

/**
 * Coluna droppable do Kanban de tarefas — clona `kanban/Column.tsx`: mesma
 * largura/forma fixa, mesmo realce quando há card sobre a zona, cabeçalho com
 * ícone+rótulo colorido (fonte única `TASK_STATUS_META`) + contador (sempre
 * renderizado, inclusive zero). Diferença deliberada em relação ao analog: o
 * Kanban de oportunidades mostra uma segunda linha de agregado (FTE/mês) no
 * cabeçalho — tarefas não têm equivalente, então essa linha simplesmente não
 * existe aqui (não é substituída por nada).
 */
export function TaskKanbanColumn({
  status,
  tasks,
  idLabelById,
  hierarchyCaptionById,
  assigneeById,
  readOnly,
  movingTaskId,
  onStatusChangeRequest,
}: Props) {
  const meta = TASK_STATUS_META[status];
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}`, data: { status } });

  return (
    <div className="bg-bg border border-bdr rounded-xl w-[220px] flex-shrink-0 flex flex-col overflow-hidden">
      <div
        className="px-3 py-2 flex items-center justify-between border-b border-bdr"
        style={{ background: `${meta.color}15` }}
      >
        <div className="text-[11px] font-bold flex items-center gap-1.5">
          <span>{meta.icon}</span>
          <span style={{ color: meta.color }}>{meta.label}</span>
        </div>
        <div
          className="rounded-full px-2 text-[10px] font-bold"
          style={{ background: meta.color, color: '#fff' }}
        >
          {tasks.length}
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={
          'p-2 flex flex-col gap-2 min-h-[80px] max-h-[72vh] overflow-y-auto flex-1 transition-colors ' +
          (isOver ? 'bg-blue-100/50 dark:bg-blue-900/60' : '')
        }
      >
        {tasks.length === 0 ? (
          <div className="text-[10px] text-mut text-center py-4 italic">Nenhuma</div>
        ) : (
          tasks.map((t) => (
            <TaskKanbanCard
              key={t.id}
              task={t}
              idLabel={idLabelById.get(t.id) ?? '?'}
              hierarchyCaption={hierarchyCaptionById.get(t.id) ?? null}
              assignee={t.assignee_id ? (assigneeById.get(t.assignee_id) ?? null) : null}
              readOnly={readOnly}
              isMoving={movingTaskId === t.id}
              onStatusChangeRequest={onStatusChangeRequest}
            />
          ))
        )}
      </div>
    </div>
  );
}
