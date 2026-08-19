'use client';

import { useState, useTransition } from 'react';
import type { Opportunity } from '@/lib/opportunities/types';
import type { OpportunityPhase } from '@/lib/opportunities/queries';
import { savePhasePlan } from '@/lib/opportunities/phase-actions';
import { PHASE_KEYS } from '@/lib/opportunities/phase-schema';
import { STATUS_META } from '@/lib/opportunities/status';
import { tempoAbertoCoe } from '@/lib/opportunities/coe';

type Props = {
  opportunity: Opportunity;
  phases: OpportunityPhase[];
  readOnly?: boolean;
};

// Pipeline linear, em ordem. `PHASE_KEYS` (phase-schema) é a fonte da ordem e
// do conjunto — a lista NÃO é redeclarada aqui. Rótulo e ícone vêm de
// `STATUS_META`: `phase_key` e `OpportunityStatus` compartilham as mesmas
// strings, então "em_analise" sai como "Refinamento" sem nenhum mapa local, e
// a etapa tem em toda a plataforma o nome que tem aqui.
//
// `descontinuado` fica FORA: é status terminal sem `phase_key`, não tem linha
// datada e não aceita estimativa. A antiga seção "Etapas temporais" existia só
// para exibi-lo, com dois inputs permanentemente desabilitados — ruído.

const FMT = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function fmt(ts: string | null): string {
  return ts ? FMT.format(new Date(ts)) : '—';
}

/** `date` do Postgres chega como `yyyy-mm-dd` — formato que o input espera. */
function toInputDate(d: string | null | undefined): string {
  return d ? d.slice(0, 10) : '';
}

/** Dias inteiros entre duas datas ISO. `null` se faltar alguma ponta. */
function duracao(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const t0 = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const t1 = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t0) || Number.isNaN(t1)) return null;
  return Math.round((t1 - t0) / 86_400_000) + 1; // inclusivo: 18→18 = 1 dia
}

function labelDuracao(d: number | null): string {
  if (d == null) return '';
  return d === 1 ? '1 dia' : `${d} dias`;
}

/**
 * Cronograma — estimativa e realizado por fase.
 *
 * Duas linhas do tempo, com autoridades diferentes:
 *   • ESTIMADO  — `planned_start_at`/`planned_end_at` (0048), editável à mão,
 *     gravado a cada mudança (sem botão de salvar).
 *   • REALIZADO — `started_at`/`finished_at`, carimbado pela trigger quando o
 *     status da oportunidade muda. Somente leitura, sempre.
 *
 * O layout é uma GRADE com colunas alinhadas, não uma pilha de linhas soltas:
 * a pergunta que se faz aqui é "o realizado bateu com o estimado?", e ela só
 * se responde comparando na horizontal. `phases` vem pré-buscado pelo Server
 * Component pai.
 */
export function FasesTab({ opportunity, phases, readOnly = false }: Props) {
  const byKey = new Map(phases.map((p) => [p.phase_key as string, p]));

  const [draft, setDraft] = useState<Record<string, { start: string; end: string }>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const hoje = new Date().toISOString().slice(0, 10);
  const coe = tempoAbertoCoe(
    opportunity.data_abertura_coe,
    opportunity.data_fechamento_coe
  );

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
      if (!res.ok) setErrors((e) => ({ ...e, [key]: res.error }));
    });
  }

  const inputCls =
    'w-[132px] font-mono text-[11px] px-2 py-1.5 rounded-md border border-bdr bg-wh ' +
    'text-txt disabled:text-slate-400 disabled:bg-bg disabled:cursor-not-allowed ' +
    'focus:outline-none focus:ring-2 focus:ring-pri/40 focus:border-pri transition-colors';

  return (
    <div className="px-5 py-4">
      {/* Cabeçalho da grade — some no mobile, onde as linhas empilham. */}
      <div className="hidden lg:grid grid-cols-[210px_1fr_1fr] gap-x-5 pb-2 border-b border-bdr">
        <span className="text-[10px] font-bold uppercase tracking-wider text-mut">
          Fase
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-mut">
          Estimado
          <span className="font-normal normal-case tracking-normal"> · editável</span>
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-mut">
          Realizado
          <span className="font-normal normal-case tracking-normal"> · automático</span>
        </span>
      </div>

      <div className="divide-y divide-bdr">
        {PHASE_KEYS.map((key) => {
          const meta = STATUS_META[key as keyof typeof STATUS_META];
          const row = byKey.get(key);
          const emAndamento = !!row?.started_at && !row?.finished_at;
          const concluida = !!row?.finished_at;
          const editable = !readOnly;
          const plan = planOf(key);
          const err = errors[key];
          const atrasada = !!plan.end && !concluida && plan.end < hoje;

          const dEstimado = labelDuracao(duracao(plan.start, plan.end));
          const dReal = labelDuracao(duracao(row?.started_at, row?.finished_at));

          return (
            <div
              key={key}
              className={
                'grid grid-cols-1 lg:grid-cols-[210px_1fr_1fr] gap-x-5 gap-y-2 py-3 px-2 -mx-2 rounded-lg ' +
                (emAndamento ? 'bg-emerald-50/70 dark:bg-emerald-950/30' : '')
              }
            >
              {/* Fase */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[14px] w-5 text-center flex-shrink-0" aria-hidden="true">
                  {concluida ? '✓' : meta.icon}
                </span>
                <span
                  className={
                    'text-[13px] truncate ' +
                    (emAndamento
                      ? 'font-bold text-emerald-700 dark:text-emerald-400'
                      : concluida
                        ? 'font-semibold text-txt'
                        : 'text-mut')
                  }
                >
                  {meta.label}
                </span>
                {emAndamento && (
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-bold whitespace-nowrap flex-shrink-0">
                    em andamento
                  </span>
                )}
              </div>

              {/* Estimado */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <input
                    type="date"
                    className={inputCls}
                    value={plan.start}
                    disabled={!editable}
                    aria-label={`Início estimado — ${meta.label}`}
                    onChange={(e) => commit(key, { ...plan, start: e.target.value })}
                  />
                  <span className="text-mut text-[11px]">→</span>
                  <input
                    type="date"
                    className={inputCls}
                    value={plan.end}
                    disabled={!editable}
                    aria-label={`Fim estimado — ${meta.label}`}
                    onChange={(e) => commit(key, { ...plan, end: e.target.value })}
                  />
                </div>
                <div className="text-[10px] mt-1 flex items-center gap-2 flex-wrap">
                  {dEstimado && <span className="text-mut">{dEstimado}</span>}
                  {atrasada && (
                    <span className="font-bold text-red-600 dark:text-red-400">
                      prazo vencido
                    </span>
                  )}
                  {savingKey === key && <span className="text-mut">salvando…</span>}
                </div>
                {err && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{err}</p>
                )}
              </div>

              {/* Realizado */}
              <div className="min-w-0 text-[11px]">
                <div className="flex items-center gap-1.5 flex-wrap font-mono">
                  <span className={row?.started_at ? 'text-txt' : 'text-slate-400 dark:text-slate-500'}>
                    {fmt(row?.started_at ?? null)}
                  </span>
                  <span className="text-mut">→</span>
                  <span className={row?.finished_at ? 'text-txt' : 'text-slate-400 dark:text-slate-500'}>
                    {emAndamento ? 'em curso' : fmt(row?.finished_at ?? null)}
                  </span>
                </div>
                {dReal && <div className="text-[10px] text-mut mt-1">{dReal}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
        <p className="text-[11px] text-mut bg-bg rounded-lg px-3 py-2">
          💡 O <strong>estimado</strong> é editável e salvo na hora. O{' '}
          <strong>realizado</strong> é preenchido sozinho quando o status da
          oportunidade muda.
        </p>
        {coe && (
          <p className="text-[11px] text-mut whitespace-nowrap">⏱️ {coe} no CoE</p>
        )}
      </div>
    </div>
  );
}
