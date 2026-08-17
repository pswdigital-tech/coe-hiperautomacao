'use client';

import {
  calcPriorityScore,
  priorityLevel,
  type Prioridade,
} from '@/lib/opportunities/score';
import { scoreColor } from '@/lib/opportunities/utils';

// SCORE v0.4: consome a fórmula ÚNICA de lib/opportunities/score.ts. O score de
// prioridade agora é o blend 50/30/20 (Fatores + Benefícios + Critérios); por
// isso o preview recebe também `criterios` e `beneficios`. Props segue Prioridade
// (frequência p/ `tempo`, bucket p/ `fte`). A função SQL `opportunity_score()`
// (0027) replica o mesmo blend (parity-tested).
type Props = Prioridade & {
  criterios?: Record<string, string | null | undefined> | null;
  beneficios?: Record<string, number | null | undefined> | null;
};

export function ScorePreview({ criterios, beneficios, ...prioridade }: Props) {
  const score = calcPriorityScore({ prioridade, criterios, beneficios });
  const color = scoreColor(score);
  const level = priorityLevel(score);
  const pct = Math.min(100, score);
  const levelLabel = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }[level];

  return (
    <div
      className="rounded-xl p-4 text-white flex items-center gap-4"
      style={{
        background:
          'linear-gradient(90deg, var(--color-pri), var(--color-pril))',
      }}
    >
      <div className="text-3xl font-extrabold leading-none" style={{ color: '#fff' }}>
        {score}
      </div>
      <div className="flex-1">
        <div className="text-[10px] opacity-80 mb-1">Score Preview</div>
        <div className="bg-white/25 rounded-full h-2.5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: '#fff' }}
          />
        </div>
      </div>
      <div
        className="px-2.5 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0"
        style={{ background: color, color: '#fff' }}
      >
        {levelLabel}
      </div>
    </div>
  );
}
