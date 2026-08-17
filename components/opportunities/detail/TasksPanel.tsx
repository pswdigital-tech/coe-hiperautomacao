'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { OpportunityTask } from '@/lib/opportunities/types';
import type { AssignableProfile } from '@/lib/opportunities/assignee-types';
import { TaskList } from '@/components/opportunities/tasks/TaskList';
import { TaskFormDialog } from '@/components/opportunities/tasks/TaskFormDialog';
import {
  TaskViewSwitcher,
  type TaskView,
} from '@/components/opportunities/tasks/TaskViewSwitcher';
import { TaskKanbanBoard } from '@/components/opportunities/tasks/kanban/TaskKanbanBoard';
import { TaskGanttChart } from '@/components/opportunities/tasks/gantt/TaskGanttChart';

type Props = {
  opportunityId: string;
  tasks: OpportunityTask[];
  assignableProfiles: AssignableProfile[];
  readOnly?: boolean;
};

/** Fallback seguro: valor ausente/inválido cai em `lista` (mesma regra da sub-rota). */
function parseTaskView(raw: string | null): TaskView {
  return raw === 'kanban' || raw === 'gantt' ? raw : 'lista';
}

/**
 * Plano de Atividades embutido como a PRIMEIRA aba do detalhe (v0.5) — antes
 * era uma sub-rota alcançada por um card "Ver tarefas →", o que custava um
 * clique e uma navegação para chegar ao conteúdo mais usado da tela.
 *
 * A sub-rota `/opportunities/[id]/tarefas` continua existindo (tela cheia, útil
 * para Kanban/Gantt em telas estreitas e para deep-link): este painel monta os
 * MESMOS componentes sobre o MESMO array já buscado, e a mecânica de
 * `?view=`/`?tarefa=` é idêntica porque `TaskViewSwitcher`/`TaskFormDialog`
 * trabalham sobre `usePathname()` — funcionam em qualquer rota que os monte.
 */
export function TasksPanel({
  opportunityId,
  tasks,
  assignableProfiles,
  readOnly = false,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = parseTaskView(searchParams.get('view'));

  // Href do CTA: preserva os parâmetros correntes (em especial `?view=`) e
  // acrescenta `tarefa=new` — mesma regra de preservação de `TaskFormDialog`.
  const qs = new URLSearchParams(searchParams.toString());
  qs.set('tarefa', 'new');
  const novaTarefaHref = `${pathname}?${qs.toString()}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-bold text-txt">Plano de Atividades</h2>
          <span className="px-2 py-0.5 rounded-full bg-bg border border-bdr text-[11px] font-semibold text-mut">
            {tasks.length === 1 ? '1 tarefa' : `${tasks.length} tarefas`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <TaskViewSwitcher currentView={view} />
          {!readOnly && (
            <Link
              href={novaTarefaHref}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold rounded-lg"
            >
              + Nova Tarefa
            </Link>
          )}
        </div>
      </div>

      {/* Oportunidade sem nenhuma tarefa → estado vazio embutido em TaskList
          vale para as 3 views; o switcher acima continua visível. */}
      {tasks.length === 0 || view === 'lista' ? (
        <TaskList
          opportunityId={opportunityId}
          tasks={tasks}
          assignableProfiles={assignableProfiles}
          readOnly={readOnly}
        />
      ) : view === 'kanban' ? (
        <TaskKanbanBoard
          tasks={tasks}
          assignableProfiles={assignableProfiles}
          readOnly={readOnly}
        />
      ) : (
        <TaskGanttChart tasks={tasks} assignableProfiles={assignableProfiles} />
      )}

      <TaskFormDialog
        opportunityId={opportunityId}
        tasks={tasks}
        assignableProfiles={assignableProfiles}
      />
    </div>
  );
}
