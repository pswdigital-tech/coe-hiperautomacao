import type { OpportunityKpis, OpportunityStatus } from '@/lib/opportunities/types';
import { STATUS_META } from '@/lib/opportunities/status';

type Props = { kpis: OpportunityKpis };

// Esteira analítica: Total + estágios do pipeline linear (Em Análise → Concluído).
// A ordem reflete o avanço da demanda da entrada à conclusão (esquerda→direita).
// Backlog e Descontinuado ficam de fora (etapas temporais, não do fluxo linear).
const STAGES: OpportunityStatus[] = [
  'em_analise',
  'planejamento',
  'desenvolvimento',
  'homologacao',
  'producao',
  'concluido',
];

type CardProps = {
  label: string;
  value: number | string;
  sub: string;
  icon: React.ReactNode;
  color: string; // hex — tinge ícone e (com alpha) o fundo do chip
};

function KpiCard({ label, value, sub, icon, color }: CardProps) {
  return (
    <div className="bg-wh rounded-xl border border-bdr p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-medium text-mut">{label}</span>
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[15px] leading-none shrink-0"
          style={{ color, backgroundColor: `${color}1a` }}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3 text-[26px] font-bold text-txt leading-none tabular-nums">
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-mut">{sub}</div>
    </div>
  );
}

function pct(part: number, total: number): string {
  if (!total) return '0% do total';
  return `${Math.round((part / total) * 100)}% do total`;
}

// Ícone "Total" (camadas) — mantém o estilo de stroke dos cards.
const TotalIcon = (
  <svg
    className="w-[18px] h-[18px]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2 2 7l10 5 10-5-10-5Z" />
    <path d="m2 17 10 5 10-5" />
    <path d="m2 12 10 5 10-5" />
  </svg>
);

// Ícone "FTE Total" (relógio) — horas/mês de esforço humano acumulado.
const FteIcon = (
  <svg
    className="w-[18px] h-[18px]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export function KpiBar({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
      <KpiCard
        label="Total"
        value={kpis.total}
        sub={`Score médio: ${kpis.scoreMedio}`}
        icon={TotalIcon}
        color="#64748b"
      />
      <KpiCard
        label="FTE Total"
        value={kpis.fteTotal.toLocaleString('pt-BR')}
        sub="Horas/mês estimadas"
        icon={FteIcon}
        color="#7c3aed"
      />
      {STAGES.map((s) => {
        const meta = STATUS_META[s];
        const value = kpis.byStage[s];
        return (
          <KpiCard
            key={s}
            label={meta.label}
            value={value}
            sub={pct(value, kpis.total)}
            icon={<span>{meta.icon}</span>}
            color={meta.color}
          />
        );
      })}
    </div>
  );
}
