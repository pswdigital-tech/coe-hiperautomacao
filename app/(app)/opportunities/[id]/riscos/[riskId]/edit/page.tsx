import { notFound, redirect } from 'next/navigation';
import { fetchRiskById } from '@/lib/opportunities/queries';
import { RiskFormPage } from '@/components/opportunities/modal/risk/RiskFormPage';
import { isReadOnlyViewer } from '@/lib/security/role';

/**
 * Rota fullscreen REAL (não-interceptada) de edição de risco (D-02 deep-link).
 * `fetchRiskById` é RLS-scoped: risco de outro tenant retorna null → notFound()
 * (T-12-07 — Information Disclosure mitigada). O soft-path (dialog) vive no modal.
 */
export default async function EditRiskPage({
  params,
}: {
  params: Promise<{ id: string; riskId: string }>;
}) {
  const { id, riskId } = await params;
  if (await isReadOnlyViewer()) redirect(`/opportunities/${id}`);
  const risk = await fetchRiskById(riskId);
  if (!risk) notFound();

  return (
    <RiskFormPage
      opportunityId={id}
      mode="edit"
      riskId={riskId}
      initial={risk}
    />
  );
}
