'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateOpportunityStatus } from '@/lib/opportunities/actions';
import type { OpportunityStatus } from '@/lib/opportunities/types';
import { STATUS_OPTIONS, STATUS_META } from '@/lib/opportunities/status';

type Props = {
  opportunityId: string;
  currentStatus: OpportunityStatus;
  readOnly?: boolean;
  /**
   * `dark` = sobre o header em gradiente azul (branco translúcido, contraste
   * pela cor do fundo). `light` = sobre card branco (detalhe v0.5): pinta com
   * as cores do próprio status (STATUS_META), como os badges da lista — sem
   * `bg-white/20`, que sumiria no branco.
   */
  variant?: 'dark' | 'light';
};

export function StatusSelector({
  opportunityId,
  currentStatus,
  readOnly = false,
  variant = 'dark',
}: Props) {
  const router = useRouter();
  const [optimisticStatus, setOptimisticStatus] =
    useState<OpportunityStatus>(currentStatus);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as OpportunityStatus;
    const prev = optimisticStatus;
    setOptimisticStatus(next);
    setError(null);

    startTransition(async () => {
      const result = await updateOpportunityStatus(opportunityId, next);
      if (!result.ok) {
        setOptimisticStatus(prev);
        setError(result.error);
        return;
      }
      // Reconcilia os server components da página (aba Fases, Histórico, etc.)
      // com o novo estado — a trigger sync_opportunity_phase (0017) já atualizou
      // as datas de fase no banco; sem o refresh a UI ficaria defasada.
      router.refresh();
    });
  }

  const meta = STATUS_META[optimisticStatus];
  const light = variant === 'light';
  const lightStyle = light
    ? { background: meta.bg, color: meta.color, borderColor: `${meta.color}55` }
    : undefined;

  if (readOnly) {
    const s = STATUS_OPTIONS.find((o) => o.value === optimisticStatus);
    return (
      <span
        className={
          'px-2.5 py-1 rounded-full text-[11px] font-bold border-2 ' +
          (light ? '' : 'bg-white/20 border-white/40 text-white')
        }
        style={lightStyle}
      >
        {s ? `${s.icon} ${s.label}` : optimisticStatus}
      </span>
    );
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <select
        value={optimisticStatus}
        onChange={onChange}
        disabled={pending}
        style={lightStyle}
        className={
          'px-2.5 py-1 rounded-full text-[11px] font-bold border-2 disabled:opacity-60 cursor-pointer focus:outline-none focus:ring-2 ' +
          (light
            ? 'focus:ring-pri'
            : 'bg-white/20 border-white/40 text-white focus:ring-white/60')
        }
        aria-label="Alterar status"
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s.value} value={s.value} className="text-pri">
            {s.icon} {s.label}
          </option>
        ))}
      </select>
      {error && (
        <div className="text-[10px] text-red-200 bg-red-900/40 rounded px-1.5 py-0.5">
          {error}
        </div>
      )}
    </div>
  );
}
