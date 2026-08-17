// app/(app)/admin/proposta/gantt/page.tsx
// =============================================================================
// Subpágina "Cronograma" (Gantt) da Proposta (admin-only — /admin/layout guarda).
// Mesmo gate da Proposta: só com ?empresa=fgcoop mostra o cronograma.
// =============================================================================

import Link from 'next/link';
import { PROPOSAL_SLUG, proposalMeta } from '@/lib/proposal/fgcoop-mock';
import { PropostaTabs } from '@/components/proposal/PropostaTabs';
import { GanttChart } from '@/components/proposal/GanttChart';

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function PropostaGanttPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const empresa = sp.empresa?.trim().toLowerCase();
  const hasProposal = empresa === PROPOSAL_SLUG;

  return (
    <div className="px-6 lg:px-8 py-6 flex flex-col gap-6">
      <header>
        <h1 className="text-[26px] font-bold text-txt tracking-tight">Proposta</h1>
        <p className="text-[13px] text-mut mt-0.5">
          {hasProposal
            ? `${proposalMeta.cliente} · Cronograma de implementação`
            : 'Cronograma de implementação das frentes por empresa.'}
        </p>
      </header>

      <PropostaTabs />

      {hasProposal ? (
        <GanttChart />
      ) : (
        <div className="bg-wh border border-bdr rounded-xl p-12 text-center flex flex-col items-center gap-2 shadow-sm">
          <div className="text-4xl">📅</div>
          <h2 className="text-[16px] font-bold text-txt">
            Nenhuma proposta foi gerada ainda
          </h2>
          <p className="text-[13px] text-mut max-w-sm">
            Selecione uma empresa com proposta gerada no seletor da barra lateral para
            visualizar o cronograma (Gantt) das frentes.
          </p>
          <Link
            href="/opportunities"
            className="mt-2 text-[12px] font-semibold text-primary hover:underline"
          >
            ← Voltar às oportunidades
          </Link>
        </div>
      )}
    </div>
  );
}
