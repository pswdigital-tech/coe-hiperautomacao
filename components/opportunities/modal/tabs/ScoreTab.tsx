import type { Opportunity } from '@/lib/opportunities/types';
import {
  calcScore,
  calcPriorityScore,
  priorityLevel,
  beneficiosSubscore,
  criteriosSubscore,
} from '@/lib/opportunities/score';
import { PriorityPill } from '@/components/opportunities/cells';

// SCORE v0.4: o total é a MÉDIA PONDERADA de 3 blocos (Fatores 50% + Benefícios
// 30% + Critérios 20%). O TOTAL prefere `o.score` da view (DB-authoritative);
// calcPriorityScore replica o blend (parity-tested vs opportunity_score() 0027).
// Os 5 fatores continuam detalhados abaixo — eles compõem o bloco Fatores.
// INVERTIDO (2026-08-14): menor esforço pontua mais — idem complexidade.
const EFFORT_VALUES: Record<string, number> = { baixo: 20, medio: 14, alto: 8 };
const COMPLEX_VALUES: Record<string, number> = { baixo: 20, medio: 13, alto: 6 }; // INVERTIDO
const TIME_VALUES: Record<string, number> = { diario: 20, semanal: 16, quinzenal: 12, mensal: 8, anual: 2 };
const OBJ_VALUES: Record<number, number> = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20 };
const FTE_VALUES: Record<string, number> = { muito_baixo: 4, baixo: 8, medio: 12, alto: 16, muito_alto: 20 };

const EFFORT_FALLBACK = 14;
const COMPLEX_FALLBACK = 13;
const TIME_FALLBACK = 16;
const OBJ_FALLBACK = 12;
const FTE_FALLBACK = 12;

type Props = { opportunity: Opportunity };

export function ScoreTab({ opportunity: o }: Props) {
  const esforcoPts = o.esforco ? (EFFORT_VALUES[o.esforco] ?? EFFORT_FALLBACK) : 0;
  const complexPts = o.complexidade ? (COMPLEX_VALUES[o.complexidade] ?? COMPLEX_FALLBACK) : 0;
  const tempoPts = o.tempo ? (TIME_VALUES[o.tempo] ?? TIME_FALLBACK) : 0;
  const objetivoPts = o.objetivo ? (OBJ_VALUES[o.objetivo] ?? OBJ_FALLBACK) : 0;
  const ftePts = o.fte ? (FTE_VALUES[o.fte] ?? FTE_FALLBACK) : 0;

  const prioridade = {
    esforco: o.esforco ?? undefined,
    complexidade: o.complexidade ?? undefined,
    tempo: o.tempo ?? undefined,
    objetivo: o.objetivo ?? undefined,
    fte: o.fte ?? undefined,
  };
  // Sub-scores dos 3 blocos (0–100; null = bloco ausente, fora do blend).
  const subFatores = calcScore(prioridade);
  const subBeneficios = beneficiosSubscore(
    o.beneficios as Record<string, number | null | undefined> | null,
  );
  const subCriterios = criteriosSubscore(
    o.criterios as Record<string, string | null | undefined> | null,
  );

  const computed = calcPriorityScore({
    prioridade,
    beneficios: o.beneficios as Record<string, number | null | undefined> | null,
    criterios: o.criterios as Record<string, string | null | undefined> | null,
  });
  const score = o.score ?? computed;
  const level = o.priority_level ?? priorityLevel(score);

  return (
    <div className="px-5 py-5">
      {/* Total — linha completa em gradiente, no topo */}
      <div className="rounded-xl bg-gradient-to-br from-pril to-pri text-white text-center px-4 py-4">
        <div className="text-[12px] text-white/70 mb-1">Score de Prioridade (máx 100)</div>
        <div className="text-[40px] font-extrabold leading-none">{score}</div>
        <div className="mt-2.5 flex justify-center">
          <PriorityPill level={level} />
        </div>
      </div>

      {/* Composição — 3 blocos ponderados */}
      <div className="mt-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-mut mb-2">
          Composição do score
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <BlockRow label="Fatores" weight="50%" sub={subFatores} />
          <BlockRow label="Benefícios" weight="30%" sub={subBeneficios} />
          <BlockRow label="Critérios" weight="20%" sub={subCriterios} />
        </div>
      </div>

      {/* Detalhe do bloco Fatores (os 5 fatores) */}
      <div className="mt-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-mut mb-2">
          Detalhe dos Fatores
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <FactorRow label="Esforço / Viabilidade (20 pts)" value={labelEsforco(o.esforco)} points={esforcoPts} />
          <FactorRow label="Complexidade (20 pts)" value={labelEsforco(o.complexidade)} points={complexPts} />
          <FactorRow label="Frequência / Retorno (20 pts)" value={labelTempo(o.tempo)} points={tempoPts} />
          <FactorRow label="Alinhamento Estratégico (20 pts)" value={o.objetivo ? `${o.objetivo}/5` : '—'} points={objetivoPts} />
          <FactorRow full label="FTE — Impacto em Horas (20 pts)" value={labelFte(o.fte)} points={ftePts} />
        </div>
      </div>

      <div className="mt-3 text-[12px] text-mut bg-bg rounded-lg px-3.5 py-2.5">
        💡 Score = média ponderada de Fatores (50%), Benefícios (30%) e Critérios
        (20%), cada bloco de 0 a 100. Blocos não informados saem do cálculo
        (os pesos são renormalizados).
      </div>
    </div>
  );
}

function BlockRow({
  label,
  weight,
  sub,
}: {
  label: string;
  weight: string;
  sub: number | null;
}) {
  const pct = sub ?? 0;
  return (
    <div className="bg-bg rounded-lg px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[12px] text-mut">{label}</span>
        <span className="text-[10px] font-bold text-mut bg-slate-200 dark:bg-slate-700 rounded-full px-2 py-0.5">
          {weight}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[15px] font-extrabold text-txt">
          {sub == null ? '—' : sub}
          {sub != null && <span className="text-[11px] text-mut font-normal"> / 100</span>}
        </span>
        {sub == null && (
          <span className="text-[10px] text-mut">não informado</span>
        )}
      </div>
      <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full bg-pri rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FactorRow({
  label,
  value,
  points,
  full,
}: {
  label: string;
  value: string;
  points: number;
  full?: boolean;
}) {
  const pct = (points / 20) * 100;
  return (
    <div className={`bg-bg rounded-lg px-4 py-3 ${full ? 'lg:col-span-2' : ''}`}>
      <div className="text-[12px] text-mut mb-1">{label}</div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[15px] font-extrabold text-txt">{value}</span>
        <span className="text-[11px] text-mut tabular-nums">+{points} / 20</span>
      </div>
      <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full bg-pri rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function labelEsforco(v: 'baixo' | 'medio' | 'alto' | null): string {
  if (!v) return '—';
  return { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' }[v];
}

function labelTempo(
  v: 'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'anual' | null,
): string {
  if (!v) return '—';
  return {
    diario: 'Diário',
    semanal: 'Semanal',
    quinzenal: 'Quinzenal',
    mensal: 'Mensal',
    anual: 'Anual',
  }[v];
}

function labelFte(
  v: 'muito_baixo' | 'baixo' | 'medio' | 'alto' | 'muito_alto' | null,
): string {
  if (!v) return '—';
  return {
    muito_baixo: 'Muito Baixo',
    baixo: 'Baixo',
    medio: 'Médio',
    alto: 'Alto',
    muito_alto: 'Muito Alto',
  }[v];
}
