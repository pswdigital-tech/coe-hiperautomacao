'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { OpportunityRisk } from '@/lib/opportunities/types';
import { RiskForm } from './RiskForm';

type Props = {
  opportunityId: string;
  mode: 'create' | 'edit';
  riskId?: string;
  initial?: OpportunityRisk;
};

/**
 * Layout de PÁGINA (não overlay) que envolve o RiskForm — usado pelas rotas
 * fullscreen não-interceptadas (deep-link, D-02). Espelha
 * opportunities/[id]/edit/page.tsx. Ao concluir, volta para o detalhe da
 * oportunidade (router.push).
 */
export function RiskFormPage({
  opportunityId,
  mode,
  riskId,
  initial,
}: Props) {
  const router = useRouter();

  function onDone() {
    router.push(`/opportunities/${opportunityId}`);
  }

  return (
    <div className="px-6 py-4">
      <div className="max-w-lg mx-auto">
        <div className="mb-3">
          <Link
            href={`/opportunities/${opportunityId}`}
            className="text-[11px] font-semibold text-pri hover:text-pril inline-flex items-center gap-1"
          >
            ← Voltar
          </Link>
        </div>
        <div className="bg-wh rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-bg border-b border-bdr px-5 py-3">
            <h1 className="text-[14px] font-bold text-pri">
              {mode === 'create' ? '➕ Novo Risco' : '✏️ Editar Risco'}
            </h1>
          </div>
          <div className="px-5 py-4">
            <RiskForm
              opportunityId={opportunityId}
              mode={mode}
              riskId={riskId}
              initial={initial}
              onDone={onDone}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
