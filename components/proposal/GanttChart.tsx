// components/proposal/GanttChart.tsx
// =============================================================================
// Gráfico de Gantt do programa FGCoop — Server Component puro. Cada frente vira
// uma barra (requisitos + construção) posicionada por data, com overlay de
// avanço (%) e marcador de "hoje". Datas de início são reais (Planilha1); fim é
// estimativa de janela de construção; progresso é placeholder (ver mock).
// =============================================================================

import { gantt, ganttToday, type GanttRow } from '@/lib/proposal/fgcoop-mock';

/** dd/mm/aaaa → timestamp (ms). Determinístico. */
function toTs(ddmmyyyy: string): number {
  const [d, m, y] = ddmmyyyy.split('/').map(Number);
  return new Date(y, m - 1, d).getTime();
}

const DAY = 86_400_000;

const faseColor: Record<string, { bar: string; soft: string; badge: string }> = {
  '1': { bar: '#2563eb', soft: '#bfdbfe', badge: 'bg-blue-50 text-blue-700' },
  '2': { bar: '#4f46e5', soft: '#c7d2fe', badge: 'bg-indigo-50 text-indigo-700' },
  '3': { bar: '#7c3aed', soft: '#ddd6fe', badge: 'bg-violet-50 text-violet-700' },
  '2027': { bar: '#b45309', soft: '#fde68a', badge: 'bg-amber-50 text-amber-700' },
};

const faseLabel: Record<string, string> = {
  '1': 'Fase 1',
  '2': 'Fase 2',
  '3': 'Fase 3',
  '2027': 'Roadmap 2027',
};

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function GanttChart() {
  // Janela do eixo: do 1º dia do mês mais cedo (início OU hoje) até o 1º dia do
  // mês seguinte ao fim mais tarde — assim o marcador "hoje" sempre cabe.
  const todayTs = toTs(ganttToday);
  const starts = [...gantt.map((g) => toTs(g.iniReq)), todayTs];
  const ends = [...gantt.map((g) => toTs(g.fim)), todayTs];
  const min = new Date(Math.min(...starts));
  const axisStart = new Date(min.getFullYear(), min.getMonth(), 1).getTime();
  const maxDate = new Date(Math.max(...ends));
  const axisEnd = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 1).getTime();
  const span = axisEnd - axisStart;

  const pct = (ts: number) => ((ts - axisStart) / span) * 100;

  // Colunas de mês para o cabeçalho / gridlines.
  const months: { label: string; leftPct: number; widthPct: number }[] = [];
  let cursor = new Date(axisStart);
  while (cursor.getTime() < axisEnd) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    months.push({
      label: `${MONTHS[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`,
      leftPct: pct(cursor.getTime()),
      widthPct: ((next.getTime() - cursor.getTime()) / span) * 100,
    });
    cursor = next;
  }

  const todayPct = pct(toTs(ganttToday));

  // Agrupa por fase preservando a ordem.
  const groups: { fase: string; rows: GanttRow[] }[] = [];
  for (const row of gantt) {
    const g = groups.find((x) => x.fase === row.fase);
    if (g) g.rows.push(row);
    else groups.push({ fase: row.fase, rows: [row] });
  }

  const LABEL_W = 260;

  return (
    <div className="bg-wh rounded-xl border border-bdr shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-bdr">
        <h3 className="text-[14px] font-bold text-txt">Cronograma das frentes (Gantt)</h3>
        <p className="text-[12px] text-mut mt-0.5">
          Barra clara = requisitos · barra sólida = construção · preenchimento = avanço.
          A linha vermelha marca hoje ({ganttToday}).
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[900px] p-5">
          {/* Cabeçalho de meses */}
          <div className="flex items-end" style={{ paddingLeft: LABEL_W }}>
            <div className="relative h-6 flex-1">
              {months.map((mo, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-6 border-l border-bdr text-[10px] font-semibold text-mut pl-1"
                  style={{ left: `${mo.leftPct}%`, width: `${mo.widthPct}%` }}
                >
                  {mo.label}
                </div>
              ))}
            </div>
          </div>

          {/* Corpo com gridlines + linha de hoje sobre todas as linhas */}
          <div className="relative">
            {/* gridlines de mês (fundo) */}
            <div className="absolute inset-0 pointer-events-none" style={{ left: LABEL_W }}>
              <div className="relative w-full h-full">
                {months.map((mo, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 border-l border-slate-100"
                    style={{ left: `${mo.leftPct}%` }}
                  />
                ))}
                {/* linha de hoje */}
                <div
                  className="absolute top-0 bottom-0 border-l-2 border-red-400"
                  style={{ left: `${todayPct}%` }}
                >
                  <span className="absolute -top-0 -translate-x-1/2 text-[9px] font-bold text-red-500 bg-wh px-1">
                    hoje
                  </span>
                </div>
              </div>
            </div>

            {/* Linhas por fase */}
            {groups.map((group) => (
              <div key={group.fase}>
                <div className="flex items-center gap-2 pt-4 pb-1.5">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${faseColor[group.fase]?.badge ?? 'bg-slate-100 text-slate-600'}`}>
                    {faseLabel[group.fase] ?? `Fase ${group.fase}`}
                  </span>
                </div>
                {group.rows.map((row) => {
                  const reqL = pct(toTs(row.iniReq));
                  const constrL = pct(toTs(row.iniConstr));
                  const endL = pct(toTs(row.fim));
                  const color = faseColor[row.fase] ?? faseColor['1'];
                  const constrW = endL - constrL;
                  const durDays = Math.round((toTs(row.fim) - toTs(row.iniConstr)) / DAY);
                  return (
                    <div key={row.num} className="flex items-center h-9">
                      <div
                        className="shrink-0 pr-3 text-[12px] text-txt truncate"
                        style={{ width: LABEL_W }}
                        title={row.label}
                      >
                        <span className="text-mut font-mono text-[11px] mr-1.5">F{row.num}</span>
                        {row.label}
                      </div>
                      <div className="relative flex-1 h-full">
                        {/* segmento requisitos */}
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-2.5 rounded-sm"
                          style={{
                            left: `${reqL}%`,
                            width: `${Math.max(constrL - reqL, 0.4)}%`,
                            background: color.soft,
                          }}
                          title={`Requisitos: ${row.iniReq} → ${row.iniConstr}`}
                        />
                        {/* segmento construção */}
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-4 rounded-md overflow-hidden"
                          style={{
                            left: `${constrL}%`,
                            width: `${Math.max(constrW, 0.6)}%`,
                            background: color.soft,
                          }}
                          title={`Construção: ${row.iniConstr} → ${row.fim} (~${durDays} dias) · ${row.progresso}% concluído`}
                        >
                          <div
                            className="h-full"
                            style={{ width: `${row.progresso}%`, background: color.bar }}
                          />
                        </div>
                        {/* rótulo de progresso */}
                        <div
                          className="absolute top-1/2 -translate-y-1/2 text-[10px] font-bold text-mut pl-1"
                          style={{ left: `${endL}%` }}
                        >
                          {row.progresso}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-5 pt-3 border-t border-bdr text-[11px] text-mut">
            <LegendItem swatch="#c7d2fe" label="Requisitos (janela)" />
            <LegendItem swatch="#4f46e5" label="Construção (avanço preenchido)" />
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-0.5 h-3.5 bg-red-400" /> Hoje
            </span>
            <span className="ml-auto italic">
              Datas de início: planilha · Fim e % de avanço: estimativa / placeholder.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block w-4 h-3 rounded-sm" style={{ background: swatch }} />
      {label}
    </span>
  );
}
