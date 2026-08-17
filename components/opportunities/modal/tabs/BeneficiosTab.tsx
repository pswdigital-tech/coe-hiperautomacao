import type { Opportunity } from '@/lib/opportunities/types';

type Props = { opportunity: Opportunity };

// D-11: lê a coluna first-class v0.2 `o.beneficios` (8 chaves camelCase, escala 1–5)
// + `o.fte_horas` + `o.beneficios_esperados` + `o.beneficio_qualitativo`.
// Layout espelha `renderBenTab` do mockup (_giba:1076-1123): 2 cards FTE/score
// médio, grid quantitativo, top 3, esperados e benefício qualitativo.
type BeneficioKey =
  | 'reducaoTempo'
  | 'eliminacaoErros'
  | 'produtividade'
  | 'qualidadeDados'
  | 'reducaoCustos'
  | 'reducaoRetrabalho'
  | 'compliance'
  | 'objetivosEstrategicos';

const BENEFICIOS: { key: BeneficioKey; label: string }[] = [
  { key: 'reducaoTempo', label: 'Redução de Tempo' },
  { key: 'eliminacaoErros', label: 'Eliminação de Erros' },
  { key: 'produtividade', label: 'Aumento de Produtividade' },
  { key: 'qualidadeDados', label: 'Qualidade de Dados' },
  { key: 'reducaoCustos', label: 'Redução de Custos' },
  { key: 'reducaoRetrabalho', label: 'Redução de Retrabalho' },
  { key: 'compliance', label: 'Compliance & Regulatório' },
  { key: 'objetivosEstrategicos', label: 'Objetivos Estratégicos' },
];

// Cor da barra pelo valor (mockup): ≥4 verde · ≥3 azul · resto âmbar.
function barColor(v: number): string {
  return v >= 4 ? '#22c55e' : v >= 3 ? '#3b82f6' : '#f59e0b';
}

export function BeneficiosTab({ opportunity: o }: Props) {
  const beneficios = (o.beneficios ?? null) as Partial<
    Record<BeneficioKey, number>
  > | null;

  const rows = beneficios
    ? BENEFICIOS.map((b) => ({ ...b, value: beneficios[b.key] })).filter(
        (r): r is { key: BeneficioKey; label: string; value: number } =>
          r.value != null,
      )
    : [];

  const fteHoras = o.fte_horas;
  const esperados = (o.beneficios_esperados ?? []).filter(
    (s) => s.trim() !== '',
  );
  const qualitativo = (o.beneficio_qualitativo ?? '').trim();

  if (rows.length === 0 && fteHoras == null) {
    return (
      <div className="px-5 py-10 text-center text-mut text-[13px]">
        Benefícios ainda não pontuados para esta oportunidade.
      </div>
    );
  }

  const avg =
    rows.length > 0
      ? Math.round((rows.reduce((a, r) => a + r.value, 0) / rows.length) * 10) /
        10
      : 0;
  const top3 = [...rows].sort((a, b) => b.value - a.value).slice(0, 3);

  return (
    <div className="px-5 py-5">
      {/* Cards de resumo: FTE economizado + score médio */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-gradient-to-br from-sky-50 to-sky-100 dark:from-sky-950/50 dark:to-sky-900/30 px-4 py-4 text-center">
          <div className="text-[34px] font-extrabold text-sky-700 dark:text-sky-300 leading-none">
            {fteHoras != null ? `${fteHoras}h` : '—'}
          </div>
          <div className="text-[12px] text-sky-700/70 dark:text-sky-300/70 mt-1.5">
            ⏱️ FTE economizado por mês
          </div>
        </div>
        <div className="rounded-xl border border-violet-300 dark:border-violet-800 bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950/50 dark:to-violet-900/30 px-4 py-4 text-center">
          <div className="text-[34px] font-extrabold text-violet-800 dark:text-violet-300 leading-none">
            {avg || '—'}
          </div>
          <div className="text-[12px] text-violet-800/80 dark:text-violet-300/70 mt-1.5">
            📊 Score médio de benefícios (1–5)
          </div>
        </div>
      </div>

      {/* Avaliação quantitativa */}
      {rows.length > 0 && (
        <div className="mb-4">
          <SectionLabel>📈 Avaliação Quantitativa dos Benefícios</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {rows.map((r) => (
              <div key={r.key} className="bg-bg rounded-lg px-4 py-3">
                <div className="text-[12px] text-mut mb-1.5">{r.label}</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(r.value / 5) * 100}%`,
                        background: barColor(r.value),
                      }}
                    />
                  </div>
                  <div
                    className="text-[13px] font-bold min-w-[16px] text-right"
                    style={{ color: barColor(r.value) }}
                  >
                    {r.value}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top 3 */}
      {top3.length > 0 && (
        <div className="mb-4 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40 px-4 py-3.5">
          <SectionLabel className="text-green-800 dark:text-green-300">
            🏆 Top 3 Benefícios Identificados
          </SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {top3.map((b) => (
              <span
                key={b.key}
                className="bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
              >
                {b.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Benefícios esperados (texto livre) */}
      <div className="mb-4">
        <SectionLabel>📝 Benefícios Esperados da Automação</SectionLabel>
        {esperados.length > 0 ? (
          <ul className="m-0 p-0 list-none">
            {esperados.map((b, i) => (
              <li
                key={i}
                className="flex gap-2 py-1.5 text-[13px] text-txt border-b border-bdr last:border-b-0"
              >
                <span className="text-pri flex-shrink-0">→</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="bg-bg rounded-lg px-3.5 py-3 text-[12px] text-mut italic">
            Nenhum benefício esperado descrito ainda.
          </div>
        )}
      </div>

      {/* Benefício qualitativo */}
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3.5">
        <SectionLabel className="text-amber-800 dark:text-amber-300">
          💡 Benefício Qualitativo
        </SectionLabel>
        <div className="text-[13px] leading-relaxed text-amber-900 dark:text-amber-100">
          {qualitativo !== '' ? (
            qualitativo
          ) : (
            <em className="text-mut not-italic">Nenhuma descrição qualitativa.</em>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${className || 'text-mut'}`}
    >
      {children}
    </div>
  );
}
