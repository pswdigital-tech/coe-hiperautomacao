import { notFound, redirect } from 'next/navigation';
import {
  fetchOpportunityById,
  fetchTaskById,
} from '@/lib/opportunities/queries';
import { fetchTaskAssignableProfiles } from '@/lib/opportunities/assignees';
import { TaskFormPage } from '@/components/opportunities/tasks/TaskFormPage';
import { isReadOnlyViewer } from '@/lib/security/role';

/**
 * Deep-link fullscreen fallback de edição de tarefa/subtarefa (UI-SPEC
 * §Routes) — espelha `riscos/[riskId]/edit/page.tsx`. `fetchTaskById` é
 * RLS-scoped: tarefa de outro tenant devolve `null` → `notFound()` (T-16-07,
 * Information Disclosure mitigada — a rota nunca distingue "não existe" de
 * "não é sua"). Os candidatos a responsável saem do tenant da OPORTUNIDADE +
 * o staff PSW atribuído a ela (ACCESS-11/D-14, Phase 17), reusando
 * `fetchTaskAssignableProfiles` — nenhuma query nova de pessoas do tenant.
 */
export default async function EditTaskPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id, taskId } = await params;
  if (await isReadOnlyViewer()) redirect(`/opportunities/${id}/tarefas`);

  const task = await fetchTaskById(taskId);
  if (!task) notFound();

  const opportunity = await fetchOpportunityById(id);
  if (!opportunity) notFound();

  const assignableProfiles = await fetchTaskAssignableProfiles(
    opportunity.id,
    opportunity.tenant_id
  );

  // Legenda somente-leitura da pai (D-01 — nunca editável) quando a tarefa
  // alvo é uma subtarefa.
  const parent = task.parent_task_id
    ? await fetchTaskById(task.parent_task_id)
    : null;

  return (
    <TaskFormPage
      opportunityId={id}
      assignableProfiles={assignableProfiles}
      parentTitle={parent?.title}
      parentTaskId={parent?.id}
      mode="edit"
      taskId={task.id}
      initial={task}
    />
  );
}
