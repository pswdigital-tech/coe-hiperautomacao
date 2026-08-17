'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { Opportunity, OpportunityRisk } from '@/lib/opportunities/types';
import { RiskTable } from '../risk/RiskTable';
import { RiskFormDialog } from '../risk/RiskFormDialog';

type Props = {
  opportunity: Opportunity;
  risks: OpportunityRisk[];
  readOnly?: boolean;
};

/**
 * Aba "Risco" do modal (D-01/D-03, RISK-05). Client component que recebe `risks`
 * por props do RSC pai (Pitfall 5 — não pode ser async RSC dentro de
 * OpportunityDetail 'use client'). Renderiza o cabeçalho "⚠️ Registro de Riscos",
 * a tabela estruturada e o botão "+ Adicionar Risco". O campo legado de texto
 * livre `risco` foi REMOVIDO (D-03). O CRUD usa o dialog empilhado dirigido pelo
 * search param ?risco (montado uma vez aqui, resolve `initial` a partir de `risks`).
 */
export function RiscoTab({ opportunity, risks, readOnly = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function openCreate() {
    router.push(`${pathname}?risco=new`);
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] font-bold text-pri">
          ⚠️ Registro de Riscos — {risks.length} registro(s)
        </span>
        {!readOnly && (
          <button
            type="button"
            onClick={openCreate}
            className="bg-pri hover:bg-pril text-white rounded-lg px-3 py-1.5 text-[11px] font-bold"
          >
            + Adicionar Risco
          </button>
        )}
      </div>

      <RiskTable opportunity={opportunity} risks={risks} readOnly={readOnly} />

      {!readOnly && <RiskFormDialog opportunityId={opportunity.id} risks={risks} />}
    </div>
  );
}
