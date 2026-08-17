// components/proposal/PropostaReport.tsx
// =============================================================================
// Relatório consolidado da proposta (aba admin "Proposta"). Server Component
// puro — renderiza os dados MOCK de lib/proposal/fgcoop-mock.ts em duas visões:
//   1) Entregas por Fase (cards)  — Planilha2
//   2) Tabela detalhada de Frentes — Planilha1 (scroll horizontal)
// Espelha _____essa_aqui.xlsx: nada além do que está nas duas abas é exibido.
// =============================================================================

import {
  proposalMeta,
  phases,
  frentes,
  frentesTotals,
} from '@/lib/proposal/fgcoop-mock';

const faseBadge: Record<string, string> = {
  '1': 'bg-blue-50 text-blue-700',
  '2': 'bg-indigo-50 text-indigo-700',
  '3': 'bg-violet-50 text-violet-700',
  '2027': 'bg-amber-50 text-amber-700',
};

export function PropostaReport() {
  const noEscopo = frentes.filter((f) => f.noEscopo).length;

  return (
    <div className="flex flex-col gap-6">
      {/* ── KPIs de topo ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard value={`~${proposalMeta.programaHoras.toLocaleString('pt-BR')}h`} label="Programa total estimado" sub="4 fases (Fundação + 3)" />
        <SummaryCard value={`${frentesTotals.hTotal.toLocaleString('pt-BR')}h`} label="Horas nas frentes" sub="H Total das 10 frentes" />
        <SummaryCard value={`${noEscopo} de ${frentes.length}`} label="Frentes no escopo" sub={`${frentesTotals.qtd} pedidos consolidados`} />
        <SummaryCard value={`${frentes.length}`} label="Frentes de automação" sub="10 frentes · 26 pedidos" />
      </div>

      {/* ── Entregas por Fase (Planilha2) ── */}
      <section className="bg-wh rounded-xl border border-bdr shadow-sm p-5">
        <h3 className="text-[14px] font-bold text-txt">
          {proposalMeta.cliente} · {proposalMeta.titulo}
        </h3>
        <p className="text-[12px] text-mut mt-0.5 mb-4">{proposalMeta.descricao}</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {phases.map((p) => (
            <div key={p.key} className="rounded-lg border border-bdr overflow-hidden">
              <div
                className="px-4 py-2.5 flex items-center justify-between text-white"
                style={{ backgroundColor: p.cor }}
              >
                <span className="text-[13px] font-bold">{p.titulo}</span>
                <span className="text-[11px] font-semibold opacity-90">{p.periodo}</span>
              </div>
              <dl className="divide-y divide-bdr text-[12px]">
                <PhaseRow label="Frentes" value={p.frentes} />
                <PhaseRow label="O que faz" value={p.oQueFaz} />
                <PhaseRow label="O que resolve" value={p.oQueResolve} />
                <PhaseRow label="Tempo estimado" value={p.tempoEstimado} strong />
              </dl>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tabela detalhada de Frentes (Planilha1) ── */}
      <section className="bg-wh rounded-xl border border-bdr shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-bdr">
          <h3 className="text-[14px] font-bold text-txt">
            Frentes de automação ({frentes.length})
          </h3>
          <p className="text-[12px] text-mut mt-0.5">
            Processos consolidados, plataforma por frente, esforço e janela (1ª passada, a refinar no discovery).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="text-sm min-w-[1500px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-mut align-bottom">
                <th className="px-3 py-2.5 font-bold">#</th>
                <th className="px-3 py-2.5 font-bold min-w-[260px]">Processos consolidados</th>
                <th className="px-3 py-2.5 font-bold min-w-[150px]">Áreas solicitantes</th>
                <th className="px-3 py-2.5 font-bold text-center">Qtd</th>
                <th className="px-3 py-2.5 font-bold text-center">Escopo</th>
                <th className="px-3 py-2.5 font-bold min-w-[180px]">Databricks</th>
                <th className="px-3 py-2.5 font-bold min-w-[200px]">Power Automate / M365</th>
                <th className="px-3 py-2.5 font-bold min-w-[150px]">n8n</th>
                <th className="px-3 py-2.5 font-bold min-w-[140px]">Dependência</th>
                <th className="px-3 py-2.5 font-bold text-right">H Dados</th>
                <th className="px-3 py-2.5 font-bold text-right">H Autom.</th>
                <th className="px-3 py-2.5 font-bold text-right">H Requis.</th>
                <th className="px-3 py-2.5 font-bold text-right">H Refin.</th>
                <th className="px-3 py-2.5 font-bold text-right">H Total</th>
                <th className="px-3 py-2.5 font-bold text-center">Fase</th>
                <th className="px-3 py-2.5 font-bold text-center whitespace-nowrap">Início req.</th>
                <th className="px-3 py-2.5 font-bold text-center whitespace-nowrap">Início constr.</th>
              </tr>
            </thead>
            <tbody className="tabular-nums align-top">
              {frentes.map((f) => (
                <tr
                  key={f.num}
                  className={`border-t border-slate-100 ${f.noEscopo ? '' : 'bg-slate-50/50'}`}
                >
                  <td className="px-3 py-2.5">{f.num}</td>
                  <td className="px-3 py-2.5 text-[12px] text-mut">
                    <ul className="list-none flex flex-col gap-0.5">
                      {f.processos.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-mut">{f.areas.join(' · ')}</td>
                  <td className="px-3 py-2.5 text-center">{f.qtd}</td>
                  <td className="px-3 py-2.5 text-center">
                    {f.noEscopo ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">S</span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500">N</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-mut">{f.databricks}</td>
                  <td className="px-3 py-2.5 text-[12px] text-mut">{f.powerAutomate}</td>
                  <td className="px-3 py-2.5 text-[12px] text-mut">{f.n8n}</td>
                  <td className="px-3 py-2.5 text-[12px] text-mut">{f.dependencia}</td>
                  <td className="px-3 py-2.5 text-right">{f.hDados}</td>
                  <td className="px-3 py-2.5 text-right">{f.hAutom}</td>
                  <td className="px-3 py-2.5 text-right">{f.hRequis}</td>
                  <td className="px-3 py-2.5 text-right">{f.hRefin}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-txt">{f.hTotal}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${faseBadge[f.fase] ?? 'bg-slate-100 text-slate-600'}`}>
                      {f.fase}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center whitespace-nowrap">{f.iniReq}</td>
                  <td className="px-3 py-2.5 text-center whitespace-nowrap">{f.iniConstr}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-bdr bg-slate-50 font-bold text-txt">
                <td className="px-3 py-2.5" colSpan={3}>TOTAL</td>
                <td className="px-3 py-2.5 text-center">{frentesTotals.qtd}</td>
                <td className="px-3 py-2.5" colSpan={5} />
                <td className="px-3 py-2.5 text-right">{frentesTotals.hDados}</td>
                <td className="px-3 py-2.5 text-right">{frentesTotals.hAutom.toLocaleString('pt-BR')}</td>
                <td className="px-3 py-2.5 text-right">{frentesTotals.hRequis}</td>
                <td className="px-3 py-2.5 text-right">{frentesTotals.hRefin}</td>
                <td className="px-3 py-2.5 text-right">{frentesTotals.hTotal.toLocaleString('pt-BR')}</td>
                <td className="px-3 py-2.5" colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11px] text-mut">
        Dados de levantamento técnico (1ª passada, a refinar no discovery). Escopo, horas e
        alocação finais ficam com o comercial.
      </p>
    </div>
  );
}

function SummaryCard({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="bg-wh rounded-xl border border-bdr p-5 shadow-sm">
      <div className="text-[12px] font-medium text-mut">{label}</div>
      <div className="mt-3 text-[28px] font-bold text-txt leading-none tabular-nums">{value}</div>
      {sub && <div className="mt-1.5 text-[12px] text-mut">{sub}</div>}
    </div>
  );
}

function PhaseRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 px-4 py-2.5">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-mut">{label}</dt>
      <dd className={strong ? 'text-txt font-semibold' : 'text-txt'}>{value}</dd>
    </div>
  );
}
