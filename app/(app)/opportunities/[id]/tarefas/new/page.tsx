import { notFound, redirect } from 'next/navigation';
import { fetchOpportunityById } from '@/lib/opportunities/queries';
import { fetchTaskAssignableProfiles } from '@/lib/opportunities/assignees';
import { TaskFormPage } from '@/components/opportunities/tasks/TaskFormPage';
import { isReadOnlyViewer } from '@/lib/security/role';

/**
 * Rota fullscreen de criação de tarefa RAIZ (D-11 — bloqueia `viewer` mesmo por
 * URL direta). Espelha `riscos/new/page.tsx`. Os candidatos a responsável saem
 * do tenant da OPORTUNIDADE + o staff PSW atribuído a ela (ACCESS-11/D-14,
 * Phase 17), reusando `fetchTaskAssignableProfiles` — nenhuma query nova.
 */
export default async function NewTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (await isReadOnlyViewer()) redirect(`/opportunities/${id}/tarefas`);
  const opportunity = await fetchOpportunityById(id);
  if (!opportunity) notFound();

  const assignableProfiles = await fetchTaskAssignableProfiles(
    opportunity.id,
    opportunity.tenant_id
  );

  return (
    <TaskFormPage opportunityId={id} assignableProfiles={assignableProfiles} />
  );
}
