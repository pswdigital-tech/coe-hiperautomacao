'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteOpportunity } from '@/lib/opportunities/actions';

type Props = {
  opportunityId: string;
  /** Texto curto que descreve a oportunidade (ex: "#0010 · Maria Silva") — exibido no aviso */
  label: string;
  /**
   * Classes do BOTÃO disparador (o diálogo de confirmação nunca muda). Existe
   * porque o header v0.5 mostra "Excluir" como item de um menu "⋮" branco, e
   * não mais como pílula translúcida sobre o gradiente azul.
   */
  triggerClassName?: string;
};

const DEFAULT_TRIGGER =
  'px-2.5 py-1 rounded-full bg-red-500/30 hover:bg-red-500/50 text-white text-[11px] font-bold border border-red-300/40 inline-flex items-center gap-1';

export function DeleteButton({ opportunityId, label, triggerClassName }: Props) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open(e: React.MouseEvent) {
    e.stopPropagation();
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
      const result = await deleteOpportunity(opportunityId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Fecha popup + sai da URL com o id (o slot do modal vai pra default null).
      // Usa router.replace pra não deixar a URL deletada no histórico.
      setConfirmOpen(false);
      router.replace('/opportunities');
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        title="Excluir oportunidade"
        className={triggerClassName ?? DEFAULT_TRIGGER}
      >
        🗑️ Excluir
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
            <div className="bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-800 px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-xl">
                ⚠️
              </div>
              <div>
                <h2 className="text-[14px] font-bold text-red-900 dark:text-red-200">
                  Excluir esta oportunidade?
                </h2>
                <p className="text-[11px] text-red-700 dark:text-red-300 mt-0.5">
                  Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>

            <div className="px-5 py-4">
              <p className="text-[12px] text-txt mb-3">
                Você está prestes a excluir <strong>{label}</strong>.
                Todos os dados relacionados (histórico de fases incluído) serão
                removidos permanentemente.
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
                className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-txt text-[12px] font-semibold rounded-lg disabled:opacity-50"
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
