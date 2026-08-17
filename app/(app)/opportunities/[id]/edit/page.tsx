import { notFound, redirect } from 'next/navigation';
import { fetchOpportunityById } from '@/lib/opportunities/queries';
import { WizardShell } from '@/components/opportunities/wizard/WizardShell';
import { opportunityToFormData } from '@/components/opportunities/wizard/state';
import { isReadOnlyViewer } from '@/lib/security/role';

/**
 * Fullscreen edit fallback. Acessado via URL direta ou refresh.
 * O fluxo padrão usa o intercepting route em @modal/(.)opportunities/[id]/edit.
 */
export default async function EditOpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (await isReadOnlyViewer()) redirect(`/opportunities/${id}`);
  const opp = await fetchOpportunityById(id);
  if (!opp) notFound();

  return (
    <WizardShell
      mode="edit"
      opportunityId={id}
      initialData={opportunityToFormData(opp)}
    />
  );
}
