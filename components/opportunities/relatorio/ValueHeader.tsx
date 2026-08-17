// components/opportunities/relatorio/ValueHeader.tsx
// =============================================================================
// Bloco ① da view Relatório estratégica — "Valor do portfólio".
// A manchete: capacidade humana já liberada (realizado) × ainda represada na
// esteira (potencial), em h/mês e FTE-equivalente (÷168h). Sem R$ (decisão de
// produto: só h/mês + FTE-eq). Alimentado por `buildValueSummary` (report.ts,
// puro/READ-ONLY). Sem recompute de score aqui.
// =============================================================================

import type { ValueSummary } from '@/lib/opportunities/report';

const fmt = (n: number) => n.toLocaleString('pt-BR');

export function ValueHeader({ value }: { value: ValueSummary }) {
  return (
    <section className="bg-wh rounded-[10px] p-[18px] shadow mb-4">
      <h3 className="text-sm font-bold text-pri mb-3.5 border-b border-bdr pb-2">
        💎 Valor do Portfólio — Capacidade Liberada
      </h3>

      <div
        className="grid gap-2.5 mb-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}
      >
        <ValueCard
          value={`${fmt(value.fteRealizado)}h`}
          label="FTE Liberado /mês"
          hint={`${value.emOperacao} em operação`}
          color="#10b981"
        />
        <ValueCard
          value={`${fmt(value.ftePotencial)}h`}
          label="FTE Potencial /mês"
          hint={`${value.emPipeline} na esteira`}
          color="#f59e0b"
        />
        <ValueCard
          value={`${fmt(value.fteTotal)}h`}
          label="FTE Total /mês"
          hint={`≈ ${value.fteEquivalente} FTE`}
          color="#8b5cf6"
        />
        <ValueCard
          value={`${value.pctRealizado}%`}
          label="Do potencial já ativo"
          hint="realizado / total"
          color="var(--color-pri)"
        />
      </div>

      {/* Esteira de valor: realizado (verde) vs. potencial (âmbar) */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-mut">
            Esteira de valor
          </span>
          <span className="text-[11px] text-mut">
            <strong className="text-emerald-600 dark:text-emerald-400">
              {fmt(value.fteRealizado)}h
            </strong>{' '}
            em produção ·{' '}
            <strong className="text-amber-600 dark:text-amber-400">
              {fmt(value.ftePotencial)}h
            </strong>{' '}
            represado
          </span>
        </div>
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-bg border border-bdr">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${value.pctRealizado}%` }}
            title={`Realizado: ${value.pctRealizado}%`}
          />
          <div
            className="h-full bg-amber-400 transition-all"
            style={{ width: `${100 - value.pctRealizado}%` }}
            title={`Potencial: ${100 - value.pctRealizado}%`}
          />
        </div>
      </div>
    </section>
  );
}

function ValueCard({
  value,
  label,
  hint,
  color,
}: {
  value: string;
  label: string;
  hint: string;
  color: string;
}) {
  return (
    <div className="bg-wh border border-bdr rounded-[10px] p-3">
      <div className="text-2xl font-extrabold leading-none" style={{ color }}>
        {value}
      </div>
      <div className="text-[9px] text-mut mt-1 uppercase tracking-wider font-semibold">
        {label}
      </div>
      <div className="text-[10px] text-mut mt-0.5">{hint}</div>
    </div>
  );
}
