import { notFound, redirect } from 'next/navigation';
import {
  fetchOpportunityById,
  fetchTaskById,
} from '@/lib/opportunities/queries';
import { fetchTaskAssignableProfiles } from '@/lib/opportunities/assignees';
import { TaskFormPage } from '@/components/opportunities/tasks/TaskFormPage';
import { isReadOnlyViewer } from '@/lib/security/role';

/**
 * Deep-link fullscreen fallback de criação de SUBTAREFA de `[taskId]`
 * (UI-SPEC §Routes) — mesmo esqueleto de `riscos/new/page.tsx`, mas com uma
 * checagem adicional que não existe no analog de risco (riscos não têm
 * hierarquia): se a tarefa alvo já é ela própria uma subtarefa
 * (`parent_task_id` não nulo), a rota devolve página não encontrada — a
 * hierarquia tem EXATAMENTE 2 níveis (D-01) e a UI não deve nem oferecer o
 * caminho que o trigger de profundidade (0037) recusaria no banco.
 *
 * `fetchTaskById` é RLS-scoped: tarefa de outro tenant devolve `null` →
 * `notFound()` (T-16-07). Os candidatos a responsável saem do tenant da
 * OPORTUNIDADE + o staff PSW atribuído a ela (ACCESS-11/D-14, Phase 17),
 * reusando `fetchTaskAssignableProfiles` — nenhuma query nova.
 */
export default async function NewSubtaskPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id, taskId } = await params;
  if (await isReadOnlyViewer()) redirect(`/opportunities/${id}/tarefas`);

  const parentTask = await fetchTaskById(taskId);
  if (!parentTask) notFound();

  // D-01: hierarquia de EXATAMENTE 2 níveis — uma subtarefa nunca tem filhas.
  if (parentTask.parent_task_id) notFound();

  const opportunity = await fetchOpportunityById(id);
  if (!opportunity) notFound();

  const assignableProfiles = await fetchTaskAssignableProfiles(
    opportunity.id,
    opportunity.tenant_id
  );

  return (
    <TaskFormPage
      opportunityId={id}
      assignableProfiles={assignableProfiles}
      parentTitle={parentTask.title}
      parentTaskId={parentTask.id}
    />
  );
}
