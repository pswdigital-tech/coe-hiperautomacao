'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { Opportunity, OpportunityRisk } from '@/lib/opportunities/types';
import {
  TIPO_LABEL,
  IMPACTO_LABEL,
  PROBABILIDADE_LABEL,
  STATUS_LABEL,
  TIPO_BADGE_EMOJI,
  priorityLabel,
  priorityBadgeClass,
} from '@/lib/opportunities/risk-labels';
import { DeleteRiskButton } from './DeleteRiskButton';

type Props = {
  opportunity: Opportunity;
  risks: OpportunityRisk[];
  readOnly?: boolean;
};

/**
 * Tabela estruturada de riscos (RISK-05, D-01). Layout fiel a _giba:1198-1232.
 * 9 colunas; ID = "R" + índice 1-based zero-padded (D Discrição, espelha o mockup).
 * Tipo/Prioridade com badges (risk-labels.ts). Ações: ✏️ (abre dialog edit via
 * ?risco=<id>) + 🗑️ (DeleteRiskButton, confirmação). Vazio = "Nenhum risco
 * registrado". `risks` chega por props do RSC pai (Pitfall 5).
 */
export function RiskTable({ opportunity, risks, readOnly = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function openEdit(riskId: string) {
    router.push(`${pathname}?risco=${riskId}`);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-bdr">
            <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
              ID
            </th>
            <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
              Descrição
            </th>
            <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
              Tipo
            </th>
            <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
              Responsável
            </th>
            <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
              Impacto
            </th>
            <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
              Probabilidade
            </th>
            <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
              Prioridade
            </th>
            <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
              Status
            </th>
            {!readOnly && (
              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">
                Ações
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {risks.length === 0 ? (
            <tr>
              <td
                colSpan={readOnly ? 8 : 9}
                className="px-2 py-4 text-center text-[12px] text-mut italic"
              >
                Nenhum risco registrado
              </td>
            </tr>
          ) : (
            risks.map((r, i) => {
              const rid = `R${String(i + 1).padStart(3, '0')}`;
              return (
                <tr key={r.id} className="border-b border-bdr/60 align-top">
                  <td className="px-2 py-2 text-[12px] font-bold text-pri whitespace-nowrap">
                    {rid}
                  </td>
                  <td className="px-2 py-2 text-[12px] text-txt max-w-[180px] whitespace-normal">
                    {r.descricao}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span className="text-[11px]">
                      {TIPO_BADGE_EMOJI[r.tipo]} {TIPO_LABEL[r.tipo]}
                    </span>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {r.responsavel ? (
                      <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                        {r.responsavel}
                      </span>
                    ) : (
                      <span className="text-[11px] text-mut">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-[11px] text-txt whitespace-nowrap">
                    {IMPACTO_LABEL[r.impacto]}
                  </td>
                  <td className="px-2 py-2 text-[11px] text-txt whitespace-nowrap">
                    {PROBABILIDADE_LABEL[r.probabilidade]}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priorityBadgeClass(r.priority)}`}
                    >
                      {priorityLabel(r.priority)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-[10px] text-mut whitespace-nowrap">
                    {STATUS_LABEL[r.status]}
                  </td>
                  {!readOnly && (
                    <td className="px-2 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(r.id)}
                          title="Editar risco"
                          className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-800 dark:text-blue-300 rounded px-2 py-1 text-[10px]"
                        >
                          ✏️
                        </button>
                        <DeleteRiskButton
                          riskId={r.id}
                          opportunityId={opportunity.id}
                          label={rid}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
