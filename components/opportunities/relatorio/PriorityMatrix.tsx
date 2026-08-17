// components/opportunities/relatorio/PriorityMatrix.tsx
// =============================================================================
// Bloco ② da view Relatório estratégica — "Priorização".
// Scatter 2×2 Esforço × Impacto (a ferramenta de decisão): X = esforço
// combinado (1–3), Y = score de prioridade (0–100), raio = RPA fit (0–6), cor =
// quadrante. Ao lado, o Top 10 quick wins (tabela acionável). Alimentado por
// `buildPriorityMatrix` (report.ts, puro/READ-ONLY) — nada é recalculado aqui.
// SVG à mão, zero dependência de lib de gráfico (mesma linha do pie.tsx).
// =============================================================================

import type {
  PriorityMatrix as PriorityMatrixData,
  MatrixPoint,
  MatrixQuadrant,
} from '@/lib/opportunities/report';
import { EFFORT_MID, IMPACT_MID } from '@/lib/opportunities/report';
import { ScoreDisplay, RpaFitBadge } from '@/components/opportunities/cells';

const QUAD_COLOR: Record<MatrixQuadrant, string> = {
  quick_win: '#10b981',
  strategic: '#3b82f6',
  fill_in: '#94a3b8',
  reconsider: '#ef4444',
};

const QUAD_LABEL: Record<MatrixQuadrant, string> = {
  quick_win: 'Quick Wins',
  strategic: 'Apostas',
  fill_in: 'Preenchimento',
  reconsider: 'Reavaliar',
};

// Geometria do plot.
const W = 380;
const H = 300;
const PAD_L = 44;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 36;
const plotL = PAD_L;
const plotR = W - PAD_R;
const plotT = PAD_T;
const plotB = H - PAD_B;

const xOf = (effort: number) => {
  const e = Math.min(3, Math.max(1, effort));
  return plotL + ((e - 1) / 2) * (plotR - plotL);
};
const yOf = (impact: number) => {
  const i = Math.min(100, Math.max(0, impact));
  return plotT + (1 - i / 100) * (plotB - plotT);
};
const rOf = (rpa: number) => 4 + Math.min(6, Math.max(0, rpa)) * 1.1;

const xMid = xOf(EFFORT_MID);
const yMid = yOf(IMPACT_MID);

export function PriorityMatrix({ matrix }: { matrix: PriorityMatrixData }) {
  const top = matrix.quickWins.slice(0, 10);

  return (
    <section className="bg-wh rounded-[10px] p-[18px] shadow mb-4">
      <h3 className="text-sm font-bold text-pri mb-3.5 border-b border-bdr pb-2">
        🎯 Priorização — Matriz Esforço × Impacto
      </h3>

      <div className="grid gap-5" style={{ gridTemplateColumns: '380px 1fr' }}>
        {/* ── Scatter 2×2 ── */}
        <div className="min-w-0">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            className="max-w-[380px] text-mut"
          >
            {/* Fundos dos quadrantes (tint sutil) */}
            <rect x={plotL} y={plotT} width={xMid - plotL} height={yMid - plotT} fill={QUAD_COLOR.quick_win} fillOpacity={0.07} />
            <rect x={xMid} y={plotT} width={plotR - xMid} height={yMid - plotT} fill={QUAD_COLOR.strategic} fillOpacity={0.07} />
            <rect x={plotL} y={yMid} width={xMid - plotL} height={plotB - yMid} fill={QUAD_COLOR.fill_in} fillOpacity={0.07} />
            <rect x={xMid} y={yMid} width={plotR - xMid} height={plotB - yMid} fill={QUAD_COLOR.reconsider} fillOpacity={0.07} />

            {/* Rótulos dos quadrantes */}
            <text x={plotL + 4} y={plotT + 12} fontSize={8.5} fontWeight={700} fill={QUAD_COLOR.quick_win}>★ QUICK WINS</text>
            <text x={plotR - 4} y={plotT + 12} fontSize={8.5} fontWeight={700} fill={QUAD_COLOR.strategic} textAnchor="end">APOSTAS</text>
            <text x={plotL + 4} y={plotB - 5} fontSize={8.5} fontWeight={700} fill={QUAD_COLOR.fill_in}>PREENCHIMENTO</text>
            <text x={plotR - 4} y={plotB - 5} fontSize={8.5} fontWeight={700} fill={QUAD_COLOR.reconsider} textAnchor="end">REAVALIAR</text>

            {/* Eixos + linhas divisórias */}
            <line x1={plotL} y1={plotT} x2={plotL} y2={plotB} stroke="currentColor" strokeOpacity={0.35} />
            <line x1={plotL} y1={plotB} x2={plotR} y2={plotB} stroke="currentColor" strokeOpacity={0.35} />
            <line x1={xMid} y1={plotT} x2={xMid} y2={plotB} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 3" />
            <line x1={plotL} y1={yMid} x2={plotR} y2={yMid} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 3" />

            {/* Ticks do eixo X (esforço) */}
            {[
              { e: 1, l: 'Baixo' },
              { e: 2, l: 'Médio' },
              { e: 3, l: 'Alto' },
            ].map((t) => (
              <text key={t.e} x={xOf(t.e)} y={plotB + 14} fontSize={9} fill="currentColor" textAnchor="middle">
                {t.l}
              </text>
            ))}
            <text x={(plotL + plotR) / 2} y={H - 3} fontSize={9} fontWeight={700} fill="currentColor" textAnchor="middle">
              Esforço →
            </text>

            {/* Ticks do eixo Y (impacto) */}
            {[0, 50, 100].map((v) => (
              <text key={v} x={plotL - 6} y={yOf(v) + 3} fontSize={8.5} fill="currentColor" textAnchor="end">
                {v}
              </text>
            ))}
            <text
              x={11}
              y={(plotT + plotB) / 2}
              fontSize={9}
              fontWeight={700}
              fill="currentColor"
              textAnchor="middle"
              transform={`rotate(-90 11 ${(plotT + plotB) / 2})`}
            >
              Impacto (score) →
            </text>

            {/* Bolhas — jitter determinístico por índice reduz overlap */}
            {matrix.points.map((p, i) => {
              const jx = ((i % 7) - 3) * 2.1;
              const jy = ((i % 5) - 2) * 2.1;
              return (
                <circle
                  key={p.id}
                  cx={xOf(p.effort) + jx}
                  cy={yOf(p.impact) + jy}
                  r={rOf(p.rpa)}
                  fill={QUAD_COLOR[p.quadrant]}
                  fillOpacity={0.55}
                  stroke={QUAD_COLOR[p.quadrant]}
                  strokeWidth={1}
                >
                  <title>{`${p.label} · score ${p.impact} · RPA ${p.rpa}/6 · ${p.fte}h`}</title>
                </circle>
              );
            })}
          </svg>

          {/* Legenda de quadrantes + contagem */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
            {(Object.keys(QUAD_LABEL) as MatrixQuadrant[]).map((q) => (
              <span key={q} className="inline-flex items-center gap-1 text-[10px] text-mut">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: QUAD_COLOR[q] }} />
                {QUAD_LABEL[q]} <strong className="text-txt">{matrix.counts[q]}</strong>
              </span>
            ))}
          </div>
          <p className="text-[10px] text-mut text-center mt-1">
            Tamanho da bolha = RPA fit (0–6)
          </p>
        </div>

        {/* ── Top 10 quick wins ── */}
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-mut mb-2">
            ★ Top {top.length} Quick Wins — atacar primeiro
          </div>
          {top.length === 0 ? (
            <div className="text-[12px] text-mut border border-dashed border-bdr rounded-lg p-4 text-center">
              Nenhuma oportunidade no quadrante de quick wins (baixo esforço +
              alto impacto). Ajuste esforço/complexidade ou score.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-mut border-b border-bdr">
                    <th className="text-left font-bold py-1.5 pr-2 w-6">#</th>
                    <th className="text-left font-bold py-1.5 pr-2">Processo</th>
                    <th className="text-center font-bold py-1.5 px-2">Score</th>
                    <th className="text-right font-bold py-1.5 px-2">FTE</th>
                    <th className="text-left font-bold py-1.5 pl-2">RPA Fit</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((p, i) => (
                    <QuickWinRow key={p.id} rank={i + 1} p={p} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function QuickWinRow({ rank, p }: { rank: number; p: MatrixPoint }) {
  return (
    <tr className="border-b border-bdr/60 hover:bg-bg/60">
      <td className="py-1.5 pr-2 text-mut tabular-nums">{rank}</td>
      <td className="py-1.5 pr-2 min-w-0">
        <div className="font-semibold text-txt truncate max-w-[220px]" title={p.label}>
          {p.label}
        </div>
        <div className="text-[10px] text-mut truncate">{p.area}</div>
      </td>
      <td className="py-1.5 px-2">
        <div className="flex justify-center">
          <ScoreDisplay score={p.impact} />
        </div>
      </td>
      <td className="py-1.5 px-2 text-right tabular-nums">{p.fte}h</td>
      <td className="py-1.5 pl-2">
        <RpaFitBadge score={p.rpa} />
      </td>
    </tr>
  );
}
