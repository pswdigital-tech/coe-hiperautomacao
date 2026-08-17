import { redirect } from 'next/navigation';
import { WizardShell } from '@/components/opportunities/wizard/WizardShell';
import { isReadOnlyViewer } from '@/lib/security/role';

export default async function NewOpportunityModalPage() {
  if (await isReadOnlyViewer()) redirect('/opportunities');
  return <WizardShell mode="create" />;
}
