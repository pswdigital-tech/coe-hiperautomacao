'use client';

import { useState, useTransition } from 'react';
import type { Opportunity } from '@/lib/opportunities/types';
import type { OpportunityPhase } from '@/lib/opportunities/queries';
import { savePhasePlan } from '@/lib/opportunities/phase-actions';
import { PHASE_KEYS } from '@/lib/opportunities/phase-schema';

type Props = {
  opportunity: Opportunity;
  phases: OpportunityPhase[];
  readOnly?: boolean;
};

// Pipeline linear (fluxo principal, em ordem). `novo`/Registrado é o estado de
// entrada e não tem phase_key (sem linha datada), por isso não aparece aqui.
// `backlog` entra aqui entre Planejamento e Desenvolvimento: é a espera entre
// "planejado" e "em construção", e o time quer estimá-la na mesma leitura do
// pipeline.
const PIPELINE_PHASES: { key: string; label: string; icon: string }[] = [
  { key: 'em_analise', label: 'Refinamento', icon: '🔍' },
  { key: 'planejamento', label: 'Planejamento', icon: '📋' },
  { key: 'backlog', label: 'Backlog', icon: '⏳' },
  { key: 'desenvolvimento', label: 'Desenvolvimento', icon: '⚙️' },
  { key: 'homologacao', label: 'Homologação', icon: '🧪' },
  { key: 'producao', label: 'Produção', icon: '🚀' },
  { key: 'concluido', label: 'Concluído', icon: '✅' },
];

// Etapas fora do pipeline linear. `descontinuado` é terminal e não tem linha de
// fase — por isso não aceita estimativa (não existe phase_key para gravá-la).
const TEMPORAL_PHASES: { key: string; label: string; icon: string }[] = [
  { key: 'descontinuado', label: 'Descontinuado', icon: '⛔' },
];

const FMT = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function fmt(ts: string | null): string {
  if (!ts) return '—';
  return FMT.format(new Date(ts));
}

/** `date` do Postgres chega como `yyyy-mm-dd` — formato que o input espera. */
function toInputDate(d: string | null | undefined): string {
  return d ? d.slice(0, 10) : '';
}

/**
 * Timeline de fases. Phases pré-buscadas pelo Server Component pai
 * (não busca aqui pra ficar safe pra render em Client Component wrapper).
 *
 * Duas linhas do tempo por fase:
 *   • ESTIMADO  — `planned_start_at`/`planned_end_at` (0048), editável à mão.
 *   • REALIZADO — `started_at`/`finished_at`, carimbado pela trigger quando o
 *     status muda. Somente leitura, como sempre foi.
 */
export function FasesTab({ opportunity, phases, readOnly = false }: Props) {
  const byKey = new Map(phases.map((p) => [p.phase_key as string, p]));

  // Estimativas em edição (otimista) + erro por fase. Chave = phase_key.
  const [draft, setDraft] = useState<Record<string, { start: string; end: string }>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function planOf(key: string) {
    const row = byKey.get(key);
    return (
      draft[key] ?? {
        start: toInputDate(row?.planned_start_at),
        end: toInputDate(row?.planned_end_at),
      }
    );
  }

  function commit(key: string, next: { start: string; end: string }) {
    setDraft((d) => ({ ...d, [key]: next }));
    setErrors((e) => ({ ...e, [key]: null }));
    setSavingKey(key);

    startTransition(async () => {
      const res = await savePhasePlan(opportunity.id, {
        phase_key: key,
        planned_start_at: next.start,
        planned_end_at: next.end,
      });
      setSavingKey((k) => (k === key ? null : k));
      if (!res.ok) {
        setErrors((e) => ({ ...e, [key]: res.error }));
      }
    });
  }

  function renderRow(p: { key: string; label: string; icon: string }) {
    const row = byKey.get(p.key);
    const isActive = !!row?.started_at && !row?.finished_at;
    const editable = !readOnly && (PHASE_KEYS as readonly string[]).includes(p.key);
    const plan = planOf(p.key);
    const err = errors[p.key];

    const inputCls =
      'font-mono text-[11px] px-1.5 py-1 rounded-md border border-bdr bg-card ' +
      'text-txt disabled:text-slate-400 disabled:bg-bg';

    return (
      <div
        key={p.key}
        className={
          'py-2.5 px-2 -mx-2 rounded-lg ' +
          (isActive ? 'bg-emerald-50 dark:bg-emerald-950/40' : '')
        }
      >
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-7 text-base flex-shrink-0 text-center">{p.icon}</div>
          <div className="min-w-[130px] text-[12px] font-semibold flex items-center gap-2 pt-1">
            {p.label}
            {isActive && (
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-bold">
                em andamento
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-w-[280px]">
            {/* Estimado — editável */}
            <div className="flex items-center gap-2 text-[11px] text-mut flex-wrap">
              <span className="uppercase tracking-wide font-bold w-[62px]">Estimado</span>
              <input
                type="date"
                className={inputCls}
                value={plan.start}
                disabled={!editable}
                aria-label={`Início estimado — ${p.label}`}
                onChange={(e) => commit(p.key, { ...plan, start: e.target.value })}
              />
              <span>→</span>
              <input
                type="date"
                className={inputCls}
                value={plan.end}
                disabled={!editable}
                aria-label={`Fim estimado — ${p.label}`}
                onChange={(e) => commit(p.key, { ...plan, end: e.target.value })}
              />
              {savingKey === p.key && <span className="text-[10px]">salvando…</span>}
            </div>

            {/* Realizado — automático, somente leitura */}
            <div className="flex items-center gap-3 text-[11px] text-mut flex-wrap">
              <span className="uppercase tracking-wide font-bold w-[62px]">Realizado</span>
              <span className="flex items-center gap-1.5">
                <span>Início:</span>
                <span
                  className={
                    'font-mono ' +
                    (row?.started_at ? 'text-txt' : 'text-slate-400 dark:text-slate-500')
                  }
                >
                  {fmt(row?.started_at ?? null)}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span>Fim:</span>
                <span
                  className={
                    'font-mono ' +
                    (row?.finished_at ? 'text-txt' : 'text-slate-400 dark:text-slate-500')
                  }
                >
                  {fmt(row?.finished_at ?? null)}
                </span>
              </span>
            </div>

            {err && <div className="text-[11px] text-red-600 dark:text-red-400">{err}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-mut mb-1">
        Pipeline
      </div>
      <div className="space-y-0 divide-y divide-bdr mb-5">
        {PIPELINE_PHASES.map(renderRow)}
      </div>

      <div className="text-[11px] font-bold uppercase tracking-wider text-mut mb-1">
        Etapas temporais
      </div>
      <div className="space-y-0 divide-y divide-bdr mb-4">
        {TEMPORAL_PHASES.map(renderRow)}
      </div>

      <div className="text-[11px] text-mut bg-bg rounded-lg px-3 py-2">
        💡 <strong>Estimado</strong> é o que você planeja — editável aqui, salvo na hora.{' '}
        <strong>Realizado</strong> é preenchido automaticamente quando o status muda. Fase ativa
        em verde.
      </div>
    </div>
  );
}
