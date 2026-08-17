'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { revokeTenantAdmin, countRevokeImpact } from './actions';
import { formatRevokeImpact } from '@/lib/staff-admin/origins';

// =============================================================================
// RevokeGrantButton.tsx — diálogo de revogação quantificada (Phase 18, Plan
// 04, GRANT-08, D-G). Reusa literalmente a estrutura de
// components/opportunities/modal/risk/DeleteRiskButton.tsx: overlay, card,
// cabeçalho de aviso, rodapé cancelar/ação vermelha, useTransition, banner de
// erro dentro do diálogo.
//
// Único elemento novo em relação ao molde: a contagem de impacto é buscada
// no momento em que o diálogo abre (nunca uma prop estática do pai) — o
// diálogo mostra "Calculando impacto…" enquanto a resposta não chega, nunca
// abre já com um número desatualizado.
// =============================================================================

type Props = {
  grantId: string;
  tenantName: string;
  personName: string;
};

export function RevokeGrantButton({ grantId, tenantName, personName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countPending, startCountTransition] = useTransition();
  const [revokePending, startRevokeTransition] = useTransition();

  function openDialog() {
    setOpen(true);
    setError(null);
    setImpact(null);
    startCountTransition(async () => {
      const result = await countRevokeImpact(grantId);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setImpact(result.count);
    });
  }

  function closeDialog() {
    if (revokePending) return;
    setOpen(false);
  }

  function confirmRevoke() {
    setError(null);
    startRevokeTransition(async () => {
      const result = await revokeTenantAdmin(grantId);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const pending = countPending || revokePending;

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="text-[11px] font-bold text-red-600 dark:text-red-400 hover:underline"
      >
        Revogar
      </button>

      {open && (
        <div
          role="alertdialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDialog();
          }}
          className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
        >
          <div className="bg-wh rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-red-50 border-b border-red-200 dark:bg-red-950/40 dark:border-red-800 px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-xl">
                ⚠️
              </div>
              <div className="min-w-0">
                <h2
                  className="text-[14px] font-bold text-red-900 dark:text-red-200 truncate"
                  title={`Revogar acesso de admin em ${tenantName}?`}
                >
                  Revogar acesso de admin em {tenantName}?
                </h2>
                <p className="text-[11px] text-red-700 dark:text-red-300 mt-0.5">
                  Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>

            <div className="px-5 py-4">
              <p className="text-[12px] text-txt mb-3">
                {error
                  ? 'Impacto não pôde ser calculado.'
                  : impact === null
                    ? 'Calculando impacto…'
                    : formatRevokeImpact(personName, tenantName, impact)}
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
                onClick={closeDialog}
                disabled={revokePending}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-txt text-[12px] font-bold rounded-lg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmRevoke}
                disabled={pending}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[12px] font-bold rounded-lg disabled:opacity-50"
              >
                {revokePending ? 'Revogando...' : 'Revogar acesso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
