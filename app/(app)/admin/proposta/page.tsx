// app/(app)/admin/proposta/page.tsx
// =============================================================================
// Aba "Proposta" (admin-only — o /admin/layout já bloqueia não-platform_admin).
// Relatório consolidado das abas "Resumo" e "Frentes" da matriz FGCoop, com
// dados MOCK (lib/proposal/fgcoop-mock.ts).
//
// Gate: só mostra a proposta quando o admin selecionou FGCoop no dropdown
// (?empresa=fgcoop). Sem seleção — ou outra empresa — mostra o empty state
// "nenhuma proposta foi gerada ainda".
// =============================================================================

import Link from 'next/link';
import { PROPOSAL_SLUG, proposalMeta } from '@/lib/proposal/fgcoop-mock';
import { PropostaReport } from '@/components/proposal/PropostaReport';
import { PropostaTabs } from '@/components/proposal/PropostaTabs';

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function PropostaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const empresa = sp.empresa?.trim().toLowerCase();
  const hasProposal = empresa === PROPOSAL_SLUG;

  return (
    <div className="px-6 lg:px-8 py-6 flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-txt tracking-tight">Proposta</h1>
          <p className="text-[13px] text-mut mt-0.5">
            {hasProposal
              ? `${proposalMeta.cliente} · ${proposalMeta.titulo}`
              : 'Relatório consolidado de entregas por fase e frentes de automação por empresa.'}
          </p>
        </div>
      </header>

      <PropostaTabs />

      {hasProposal ? (
        <PropostaReport />
      ) : (
        <div className="bg-wh border border-bdr rounded-xl p-12 text-center flex flex-col items-center gap-2 shadow-sm">
          <div className="text-4xl">📄</div>
          <h2 className="text-[16px] font-bold text-txt">
            Nenhuma proposta foi gerada ainda
          </h2>
          <p className="text-[13px] text-mut max-w-sm">
            Selecione uma empresa com proposta gerada no seletor da barra lateral para
            visualizar o relatório consolidado (alocação, capacidade e frentes).
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
