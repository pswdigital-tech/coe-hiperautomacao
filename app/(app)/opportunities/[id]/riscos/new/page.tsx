import { notFound, redirect } from 'next/navigation';
import { fetchOpportunityById } from '@/lib/opportunities/queries';
import { RiskFormPage } from '@/components/opportunities/modal/risk/RiskFormPage';
import { isReadOnlyViewer } from '@/lib/security/role';

/**
 * Rota fullscreen REAL (não-interceptada) de criação de risco (D-02 deep-link).
 * Acesso direto via URL ou refresh renderiza o form em página inteira. O soft-path
 * (dialog empilhado) vive na aba Risco do modal — esta rota é só para deep-link.
 */
export default async function NewRiskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (await isReadOnlyViewer()) redirect(`/opportunities/${id}`);
  const opportunity = await fetchOpportunityById(id);
  if (!opportunity) notFound();

  return <RiskFormPage opportunityId={id} mode="create" />;
}
