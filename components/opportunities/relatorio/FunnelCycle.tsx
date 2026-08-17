// components/opportunities/relatorio/FunnelCycle.tsx
// =============================================================================
// Bloco ③ da view Relatório estratégica — "Esteira & Cycle time".
// Esquerda: distribuição pela esteira linear (barras por status + taxa de
// conversão). Direita: tempo médio por fase (dias), a partir dos timestamps de
// opportunity_phases — expõe onde o pipeline emperra. Alimentado por
// `buildFunnel` + `buildCycleTime` (report.ts, puro). Labels/cores dos status
// vêm da fonte única STATUS_META.
// =============================================================================

import type { Funnel, CycleTime } from '@/lib/opportunities/report';
import { STATUS_META } from '@/lib/opportunities/status';

export function FunnelCycle({
  funnel,
  cycle,
}: {
  funnel: Funnel;
  cycle: CycleTime;
}) {
  const maxAvg = cycle.perPhase.reduce((m, s) => Math.max(m, s.avgDays), 0);

  return (
    <section className="grid gap-4 mb-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
      {/* ── Funil / esteira ── */}
      <div className="bg-wh rounded-[10px] p-[18px] shadow">
        <h3 className="text-sm font-bold text-pri mb-3.5 border-b border-bdr pb-2 flex items-center justify-between">
          <span>🚦 Distribuição pela Esteira</span>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            {funnel.conversao}% entregue
          </span>
        </h3>

        <div className="flex flex-col gap-1.5">
          {funnel.stages.map((s) => {
            const meta = STATUS_META[s.status];
            const pct = funnel.maxCount ? (s.count / funnel.maxCount) * 100 : 0;
            return (
              <div key={s.status} className="grid items-center gap-2" style={{ gridTemplateColumns: '120px 1fr 32px' }}>
                <span className="text-[11px] font-semibold text-right truncate flex items-center justify-end gap-1" title={meta.label}>
                  <span>{meta.icon}</span>
                  <span className="truncate">{meta.label}</span>
                </span>
                <div className="h-4 bg-bg rounded-md overflow-hidden">
                  <div
                    className="h-full rounded-md min-w-[3px] transition-all"
                    style={{ width: `${pct}%`, background: meta.color }}
                  />
                </div>
                <span className="text-[11px] font-bold tabular-nums text-center" style={{ color: meta.color }}>
                  {s.count}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-3 text-[11px] text-mut">
          <strong>{funnel.entregues}</strong> de <strong>{funnel.total}</strong>{' '}
          oportunidades já em produção/concluídas.
        </div>
      </div>

      {/* ── Cycle time ── */}
      <div className="bg-wh rounded-[10px] p-[18px] shadow">
        <h3 className="text-sm font-bold text-pri mb-3.5 border-b border-bdr pb-2 flex items-center justify-between">
          <span>⏱️ Tempo Médio por Fase</span>
          {cycle.cicloMedioDias != null && (
            <span className="text-[11px] font-semibold text-mut">
              ciclo médio {cycle.cicloMedioDias}d
            </span>
          )}
        </h3>

        {cycle.perPhase.length === 0 ? (
          <div className="text-[12px] text-mut border border-dashed border-bdr rounded-lg p-4 text-center">
            Ainda sem fases concluídas com data de início e fim. O tempo de ciclo
            aparece conforme as automações avançam pela esteira.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {cycle.perPhase.map((s) => {
              const meta = STATUS_META[s.phase];
              const pct = maxAvg ? (s.avgDays / maxAvg) * 100 : 0;
              return (
                <div key={s.phase} className="grid items-center gap-2" style={{ gridTemplateColumns: '120px 1fr 54px' }}>
                  <span className="text-[11px] font-semibold text-right truncate flex items-center justify-end gap-1" title={meta.label}>
                    <span>{meta.icon}</span>
                    <span className="truncate">{meta.label}</span>
                  </span>
                  <div className="h-4 bg-bg rounded-md overflow-hidden">
                    <div
                      className="h-full rounded-md min-w-[3px] transition-all"
                      style={{ width: `${pct}%`, background: meta.color }}
                    />
                  </div>
                  <span className="text-[11px] font-bold tabular-nums text-right" style={{ color: meta.color }}>
                    {s.avgDays}d
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
