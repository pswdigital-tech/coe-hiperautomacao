// components/opportunities/relatorio/RiskPanel.tsx
// =============================================================================
// Bloco ④ da view Relatório estratégica — "Riscos".
// Primeira visão AGREGADA do registro de riscos (opportunity_risks): críticos
// abertos, impedimentos abertos, oportunidades travadas e distribuição por
// prioridade (matriz impacto×probabilidade, coluna GENERATED). Alimentado por
// `buildRiskSummary` (report.ts, puro/READ-ONLY).
// =============================================================================

import type { RiskSummary } from '@/lib/opportunities/report';
import type { RiskPriority } from '@/lib/opportunities/types';

const PRIORITY_META: Record<RiskPriority, { label: string; color: string }> = {
  critica: { label: 'Crítica', color: '#ef4444' },
  alta: { label: 'Alta', color: '#f97316' },
  media: { label: 'Média', color: '#f59e0b' },
  baixa: { label: 'Baixa', color: '#22c55e' },
};

export function RiskPanel({ risk }: { risk: RiskSummary }) {
  return (
    <section className="bg-wh rounded-[10px] p-[18px] shadow mb-4">
      <h3 className="text-sm font-bold text-pri mb-3.5 border-b border-bdr pb-2">
        ⚠️ Riscos & Bloqueios do Portfólio
      </h3>

      {risk.total === 0 ? (
        <div className="text-[12px] text-mut border border-dashed border-bdr rounded-lg p-4 text-center">
          Nenhum risco registrado ainda. Registre impedimentos e riscos nas
          oportunidades para acompanhar bloqueios aqui.
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {/* Contadores acionáveis */}
          <div
            className="grid gap-2.5"
            style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))' }}
          >
            <RiskCard value={risk.criticosAbertos} label="Críticos/Altos abertos" color="#ef4444" />
            <RiskCard value={risk.impedimentosAbertos} label="Impedimentos abertos" color="#f97316" />
            <RiskCard value={risk.opsBloqueadas} label="Ops. bloqueadas" color="#dc2626" />
            <RiskCard value={risk.oportunidades} label="Oportunidades" color="#22c55e" />
          </div>

          {/* Distribuição por prioridade */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-2">
              Distribuição por prioridade ({risk.total} riscos)
            </div>
            <div className="flex flex-col gap-1.5">
              {(Object.keys(PRIORITY_META) as RiskPriority[]).map((p) => {
                const count = risk.byPriority[p];
                const pct = risk.total ? (count / risk.total) * 100 : 0;
                const meta = PRIORITY_META[p];
                return (
                  <div key={p} className="grid items-center gap-2" style={{ gridTemplateColumns: '52px 1fr 24px' }}>
                    <span className="text-[11px] font-semibold text-right" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    <div className="h-3.5 bg-bg rounded-md overflow-hidden">
                      <div
                        className="h-full rounded-md min-w-[2px]"
                        style={{ width: `${pct}%`, background: meta.color }}
                      />
                    </div>
                    <span className="text-[11px] font-bold tabular-nums text-right text-txt">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function RiskCard({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="bg-wh border border-bdr rounded-[10px] p-3 text-center">
      <div className="text-2xl font-extrabold leading-none" style={{ color }}>
        {value}
      </div>
      <div className="text-[9px] text-mut mt-1 uppercase tracking-wider font-semibold">
        {label}
      </div>
    </div>
  );
}
