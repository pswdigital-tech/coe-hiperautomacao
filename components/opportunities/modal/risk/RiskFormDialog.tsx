'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { OpportunityRisk } from '@/lib/opportunities/types';
import { RiskForm } from './RiskForm';

type Props = {
  opportunityId: string;
  /** Lista já em memória (props da RiscoTab) — resolve `initial` para edit. */
  risks: OpportunityRisk[];
};

/**
 * Dialog empilhado de risco (D-02 soft-path). Overlay client `z-[60]` SOBRE o
 * painel do modal (`z-50` do ModalShell) — modela DeleteButton.tsx. Dirigido pelo
 * search param `?risco`: `new` => criar; `<riskId>` => editar (initial resolvido
 * de `risks`). NÃO é uma intercepting route (RESEARCH: slot = 1 active subpage;
 * empilhar 2ª intercept no @modal substituiria o detalhe). Fechar = router.replace
 * removendo `?risco` (preserva o modal subjacente: aba/scroll mantidos). ESC e
 * click-outside fecham (como ModalShell/DeleteButton).
 */
export function RiskFormDialog({ opportunityId, risks }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const risco = searchParams.get('risco');
  const isOpen = risco !== null && risco !== '';

  function close() {
    router.replace(pathname);
  }

  // ESC fecha (apenas quando aberto).
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const mode: 'create' | 'edit' = risco === 'new' ? 'create' : 'edit';
  const initial =
    mode === 'edit' ? risks.find((r) => r.id === risco) : undefined;

  // ?risco=<id> mas o risco não está na lista (ex: removido) → fecha.
  if (mode === 'edit' && !initial) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="fixed inset-0 z-[60] bg-black/60 flex items-start justify-center overflow-y-auto p-4"
    >
      <div className="relative my-8 w-full max-w-lg bg-wh rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-bg border-b border-bdr px-5 py-3 flex items-center justify-between">
          <h2 className="text-[14px] font-bold text-pri">
            {mode === 'create' ? '➕ Novo Risco' : '✏️ Editar Risco'}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Fechar"
            className="w-7 h-7 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-txt text-sm font-bold flex items-center justify-center"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">
          <RiskForm
            opportunityId={opportunityId}
            mode={mode}
            riskId={mode === 'edit' ? initial!.id : undefined}
            initial={initial}
            onDone={close}
          />
        </div>
      </div>
    </div>
  );
}
