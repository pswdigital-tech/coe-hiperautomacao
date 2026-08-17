// components/opportunities/relatorio/pie.tsx
// =============================================================================
// Componentes SVG donut (PieChart + PieCard) — porta de svgPie/pieCard
// (_giba_wsi-dashboard.html:818-850). React puros, server-safe (sem diretiva de
// cliente, sem hooks): renderizam SVG estático e são usáveis num Server
// Component. Zero dependência de lib de gráfico — a matemática do arco é
// portada à mão (D-02).
// =============================================================================

export type PieSlice = { label: string; value: number; color: string };

/**
 * PieChart — porta literal de svgPie (_giba:818-832), emitindo <path> JSX.
 * Donut com raio externo R=size*0.4 e raio interno ri=size*0.22. Em total 0
 * renderiza "Sem dados" centralizado (D-04).
 */
function PieChart({ slices, size }: { slices: PieSlice[]; size: number }) {
  const total = slices.reduce((a, s) => a + s.value, 0);

  if (total === 0) {
    return (
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        fontSize="10"
        fill="#94a3b8"
      >
        Sem dados
      </text>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.4;
  const ri = size * 0.22;

  let ang = -Math.PI / 2;

  return (
    <>
      {slices.map((s, i) => {
        const a = (s.value / total) * 2 * Math.PI;
        const sa = ang;
        const ea = ang + a;
        ang = ea;

        const x1 = cx + R * Math.cos(sa);
        const y1 = cy + R * Math.sin(sa);
        const x2 = cx + R * Math.cos(ea);
        const y2 = cy + R * Math.sin(ea);
        const ix1 = cx + ri * Math.cos(sa);
        const iy1 = cy + ri * Math.sin(sa);
        const ix2 = cx + ri * Math.cos(ea);
        const iy2 = cy + ri * Math.sin(ea);
        const lg = a > Math.PI ? 1 : 0;

        const d =
          `M${ix1},${iy1}L${x1},${y1}` +
          `A${R},${R} 0 ${lg},1 ${x2},${y2}` +
          `L${ix2},${iy2}` +
          `A${ri},${ri} 0 ${lg},0 ${ix1},${iy1}Z`;

        return (
          <path
            key={`${s.label}-${i}`}
            d={d}
            fill={s.color}
            stroke="currentColor"
            strokeWidth={2}
          />
        );
      })}
    </>
  );
}

/**
 * PieCard — porta de pieCard (_giba:833-850), size=160. Donut + legenda
 * (rótulo truncado + valor + %). `valueSuffix` 'h' → "{v}h", senão "{v} op.".
 */
export function PieCard({
  slices,
  title,
  valueSuffix,
}: {
  slices: PieSlice[];
  title: string;
  valueSuffix: string;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);

  return (
    <div className="bg-wh rounded-[10px] p-4 shadow">
      <div className="text-xs font-bold text-pri mb-2.5 text-center">
        {title}
      </div>
      <div className="flex gap-3 items-start">
        <svg
          width={160}
          height={160}
          viewBox="0 0 160 160"
          className="text-wh dark:text-wh"
          style={{ flexShrink: 0 }}
        >
          <PieChart slices={slices} size={160} />
        </svg>
        <div className="flex-1 min-w-0">
          {slices.map((s, i) => (
            <div
              key={`${s.label}-${i}`}
              className="flex items-center gap-1.5 mb-[3px] text-[10px]"
            >
              <div
                className="w-2 h-2 rounded-sm flex-shrink-0"
                style={{ background: s.color }}
              />
              <span
                className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                title={s.label}
              >
                {s.label}
              </span>
              <span
                className="font-bold whitespace-nowrap"
                style={{ color: s.color }}
              >
                {valueSuffix === 'h' ? `${s.value}h` : `${s.value} op.`} (
                {total ? Math.round((s.value / total) * 100) : 0}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
