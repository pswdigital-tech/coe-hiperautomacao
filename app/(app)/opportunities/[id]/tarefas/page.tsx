import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  fetchOpportunityById,
  fetchTasksForOpportunity,
} from '@/lib/opportunities/queries';
import { fetchTaskAssignableProfiles } from '@/lib/opportunities/assignees';
import { isReadOnlyViewer } from '@/lib/security/role';
import { TaskList } from '@/components/opportunities/tasks/TaskList';
import { TaskFormDialog } from '@/components/opportunities/tasks/TaskFormDialog';
import { TaskViewSwitcher, type TaskView } from '@/components/opportunities/tasks/TaskViewSwitcher';
import { TaskKanbanBoard } from '@/components/opportunities/tasks/kanban/TaskKanbanBoard';
import { TaskGanttChart } from '@/components/opportunities/tasks/gantt/TaskGanttChart';

// Fallback seguro: valor ausente ou inválido cai em 'lista' — mesmo padrão de
// `parseView` em `toolbar.tsx` (UI-SPEC §Routes).
function parseTaskView(raw: string | undefined): TaskView {
  return raw === 'kanban' || raw === 'gantt' ? raw : 'lista';
}

/**
 * Sub-rota fullscreen do Plano de Atividades (RESEARCH §Pattern 6 — o Kanban
 * de status e o Gantt não cabem na largura do modal). A view Lista (16-04) já
 * mostra a hierarquia de 2 níveis com rollup; o Kanban (16-06) e o Gantt
 * (16-07) ramificam pelo parâmetro `?view=`, ambos sobre a MESMA busca única
 * — nenhuma query nova por view. Mesmo wrapper de padding/largura máxima de
 * `app/(app)/opportunities/[id]/page.tsx`. Uma única busca do array PLANO de
 * tarefas (raízes + subtarefas juntas) — o agrupamento por `parent_task_id`
 * e o rollup acontecem na renderização de `TaskList`/`TaskKanbanBoard`/
 * `TaskGanttChart`, nunca em outra query.
 *
 * 16-05: monta `TaskFormDialog` (soft-path `?tarefa=`) sobre o conteúdo da
 * página, reusando o mesmo array de tarefas e a mesma lista de profiles
 * atribuíveis já buscados aqui — nenhuma query nova. O CTA "+ Nova Tarefa" do
 * cabeçalho passa a abrir o diálogo pelo parâmetro de busca; a rota de
 * deep-link `/tarefas/new` continua servindo como fallback para acesso
 * direto/recarregamento (UI-SPEC §Routes).
 *
 * 16-06: uma oportunidade sem NENHUMA tarefa mostra o mesmo estado vazio
 * (embutido em `TaskList`) independente da view pedida na URL — o switcher
 * continua renderizado (UI-SPEC "zero-one-many"), só o corpo é substituído.
 *
 * 16-07: fecha a fase — Gantt de 2 níveis (TASK-10) reusando `computeTaskRollup`
 * (16-04) como fonte única do span/percentual agregado da pai (TASK-11).
 */
export default async function TarefasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const opportunity = await fetchOpportunityById(id);
  if (!opportunity) notFound();

  const [tasks, readOnly, rawSearchParams] = await Promise.all([
    fetchTasksForOpportunity(id),
    isReadOnlyViewer(),
    searchParams,
  ]);

  // Reusa fetchTaskAssignableProfiles (ACCESS-11/D-14, Phase 17) para resolver
  // o nome do responsável na Lista/Kanban e popular o form do diálogo — inclui
  // o staff PSW atribuído a ESTA oportunidade, além das pessoas do tenant.
  const assignableProfiles = await fetchTaskAssignableProfiles(
    opportunity.id,
    opportunity.tenant_id
  );

  const view = parseTaskView(rawSearchParams.view);

  // Href do CTA de cabeçalho: preserva qualquer parâmetro corrente (em
  // especial `?view=`) e acrescenta `tarefa=new` — mesma regra de
  // preservação de `TaskFormDialog.close()`.
  const ctaParams = new URLSearchParams();
  for (const [key, value] of Object.entries(rawSearchParams)) {
    if (typeof value === 'string') ctaParams.set(key, value);
  }
  ctaParams.set('tarefa', 'new');

  return (
    <div className="px-6 lg:px-8 py-6">
      <div className="max-w-screen-2xl mx-auto">
        <div className="mb-4">
          <Link
            href={`/opportunities/${id}`}
            className="text-[12px] font-semibold text-pri hover:text-pril inline-flex items-center gap-1"
          >
            ← Voltar à oportunidade
          </Link>
        </div>

        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h1 className="text-[14px] font-bold text-txt">🗂️ Plano de Atividades</h1>
          <div className="flex items-center gap-3">
            <TaskViewSwitcher currentView={view} />
            {!readOnly && (
              <Link
                href={`/opportunities/${id}/tarefas?${ctaParams.toString()}`}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold rounded-lg"
              >
                + Nova Tarefa
              </Link>
            )}
          </div>
        </div>

        {/* Oportunidade sem nenhuma tarefa → o estado vazio embutido em
            TaskList vale para as 3 views (UI-SPEC "zero-one-many"); o
            switcher acima continua visível. */}
        {tasks.length === 0 || view === 'lista' ? (
          <TaskList
            opportunityId={id}
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
          opportunityId={id}
          tasks={tasks}
          assignableProfiles={assignableProfiles}
        />
      </div>
    </div>
  );
}
