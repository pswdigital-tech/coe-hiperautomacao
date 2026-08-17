'use client';

import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  pending?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

/**
 * Prompt obrigatório e cancelável do motivo do bloqueio (D-03/TASK-09).
 * Espelha a estrutura de sobreposição de `DeleteRiskButton.tsx`: mesmo nível
 * de empilhamento (z-[60]), overlay que fecha no clique fora, ESC fecha.
 * **ESC e clique fora contam como CANCELAR — nunca como confirmar.**
 *
 * Controlado pelo pai (`TaskKanbanBoard`), que decide quando abrir
 * (`pendingBlock !== null`) — este componente não guarda nenhum estado sobre
 * QUAL tarefa está sendo bloqueada, só o texto do motivo em edição.
 */
export function BlockedReasonDialog({ open, pending = false, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState('');

  // Limpa o campo sempre que o diálogo abre — nunca reaproveita o motivo de
  // uma tentativa anterior (cancelada ou de outra tarefa).
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const trimmed = reason.trim();

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
    >
      <div className="bg-wh rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="px-5 py-4 border-b border-bdr">
          <h2 className="text-[14px] font-bold text-txt">Motivo do bloqueio</h2>
          <p className="text-[12px] text-mut mt-1">
            Descreva por que esta tarefa está bloqueada antes de mover para esta coluna.
          </p>
        </div>

        <div className="px-5 py-4">
          <textarea
            autoFocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full text-[12px] border border-bdr rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-pri resize-y"
            placeholder="Ex.: Aguardando aprovação do cliente"
          />
        </div>

        <div className="bg-bg border-t border-bdr px-5 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-txt text-[12px] font-semibold rounded-lg disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={pending || !trimmed}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[12px] font-bold rounded-lg disabled:opacity-50"
          >
            {pending ? 'Confirmando...' : 'Confirmar bloqueio'}
          </button>
        </div>
      </div>
    </div>
  );
}
