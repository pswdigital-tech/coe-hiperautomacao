'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteRisk } from '@/lib/opportunities/risk-actions';

type Props = {
  riskId: string;
  opportunityId: string;
  /** Rótulo curto exibido na confirmação (ex: "R001"). */
  label: string;
};

/**
 * Botão 🗑️ de exclusão de risco com confirmação (D-06 — mais seguro que o mockup,
 * que exclui imediato). Modela DeleteButton.tsx: overlay z-[60], confirm/cancel,
 * useTransition. Sucesso => fecha overlay + router.refresh() — NÃO navega para fora
 * (o modal/aba permanece aberto, D-05).
 */
export function DeleteRiskButton({ riskId, opportunityId, label }: Props) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    setConfirmOpen(true);
    setError(null);
  }

  function close() {
    if (pending) return;
    setConfirmOpen(false);
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteRisk(riskId, opportunityId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        title="Excluir risco"
        className="bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-800 dark:text-red-300 rounded px-2 py-1 text-[10px]"
      >
        🗑️
      </button>

      {confirmOpen && (
        <div
          role="alertdialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
        >
          <div className="bg-wh rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-red-50 border-b border-red-200 dark:bg-red-950/40 dark:border-red-800 px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-xl">
                ⚠️
              </div>
              <div>
                <h2 className="text-[14px] font-bold text-red-900 dark:text-red-200">
                  Excluir este risco?
                </h2>
                <p className="text-[11px] text-red-700 dark:text-red-300 mt-0.5">
                  Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>

            <div className="px-5 py-4">
              <p className="text-[12px] text-txt mb-3">
                Você está prestes a excluir o risco <strong>{label}</strong>.
              </p>

              {error && (
                <div className="text-[11px] text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </div>

            <div className="bg-bg border-t border-bdr px-5 py-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-txt text-[12px] font-semibold rounded-lg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={pending}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[12px] font-bold rounded-lg disabled:opacity-50"
              >
                {pending ? 'Excluindo...' : '🗑️ Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
