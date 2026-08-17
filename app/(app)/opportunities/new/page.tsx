import { redirect } from 'next/navigation';
import { WizardShell } from '@/components/opportunities/wizard/WizardShell';
import { getCurrentProfile, writesCrossTenant } from '@/lib/security/role';

export default async function NewOpportunityPage() {
  const profile = await getCurrentProfile();

  // RBAC (v0.3): viewer nunca chega ao formulário, nem por URL direta —
  // createOpportunity já rejeita no servidor (requireEditorRole), isto é UX.
  if (profile?.role === 'viewer') redirect('/opportunities');

  // Papéis da PSW (`psw_staff`/`platform_admin`) não têm empresa implícita:
  // este wizard gravaria no tenant de lotação deles (a PSW). O formulário
  // correto é o de registro em nome de uma empresa, que começa pelo
  // TenantStep. `createOpportunity` também recusa no servidor — isto é UX,
  // para não deixar ninguém preencher 5 steps até levar o não.
  if (writesCrossTenant(profile)) redirect('/opportunities/register');

  return <WizardShell mode="create" />;
}
