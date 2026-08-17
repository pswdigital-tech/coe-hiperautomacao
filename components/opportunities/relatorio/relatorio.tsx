// components/opportunities/relatorio/relatorio.tsx
// =============================================================================
// Client Component da view "Relatório" — REDESENHO estratégico (v0.4).
// Deixa de ser um retrato por área (contagem/FTE) e vira uma narrativa de
// decisão de cima pra baixo:
//   ① Valor (realizado × potencial)  → ValueHeader
//   ② Priorização (matriz 2×2 + quick wins) → PriorityMatrix
//   ③ Esteira & cycle time → FunnelCycle
//   ④ Riscos & bloqueios → RiskPanel
//   ⑤ Composição (área + mix de ferramenta) → seção final
//
// `opportunities`/`phases`/`risks` chegam já resolvidos (RLS-scoped) do Server
// Component pai; o filtro de área abaixo é uma refinada client-side sobre os
// arrays já carregados (sem round-trip). Tudo READ-ONLY: as agregações
// (report.ts) leem colunas computadas da view e NUNCA recalculam/persistem
// score (docs/PROJETO.md §3).
// =============================================================================

'use client';

import { useMemo, useState } from 'react';
import type {
  Opportunity,
  OpportunityPhase,
  OpportunityRisk,
} from '@/lib/opportunities/types';
import {
  buildReport,
  buildValueSummary,
  buildPriorityMatrix,
  buildFunnel,
  buildCycleTime,
  buildRiskSummary,
  buildToolMix,
} from '@/lib/opportunities/report';
import { PieCard, type PieSlice } from '@/components/opportunities/relatorio/pie';
import { ValueHeader } from '@/components/opportunities/relatorio/ValueHeader';
import { PriorityMatrix } from '@/components/opportunities/relatorio/PriorityMatrix';
import { FunnelCycle } from '@/components/opportunities/relatorio/FunnelCycle';
import { RiskPanel } from '@/components/opportunities/relatorio/RiskPanel';

type Props = {
  opportunities: Opportunity[];
  phases: OpportunityPhase[];
  risks: OpportunityRisk[];
  /** Rótulo real de origem (nome do tenant) — NÃO hardcodar. */
  sourceLabel: string | null;
};

export function Relatorio({ opportunities, phases, risks, sourceLabel }: Props) {
  const [areaFiltro, setAreaFiltro] = useState('');

  const todasAreas = useMemo(
    () =>
      Array.from(new Set(opportunities.map((o) => (o.area || 'Sem Área').trim())))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt')),
    [opportunities]
  );

  // Escopo = portfólio inteiro ou uma área. Fases/riscos são refiltrados pelos
  // ids do escopo para manter cycle time e riscos coerentes com o filtro.
  const { escopo, escopoPhases, escopoRisks } = useMemo(() => {
    const esc = areaFiltro
      ? opportunities.filter((o) => (o.area || 'Sem Área').trim() === areaFiltro)
      : opportunities;
    if (!areaFiltro) return { escopo: esc, escopoPhases: phases, escopoRisks: risks };
    const ids = new Set(esc.map((o) => o.id));
    return {
      escopo: esc,
      escopoPhases: phases.filter((p) => ids.has(p.opportunity_id)),
      escopoRisks: risks.filter((r) => ids.has(r.opportunity_id)),
    };
  }, [areaFiltro, opportunities, phases, risks]);

  const report = useMemo(() => buildReport(escopo), [escopo]);
  const value = useMemo(() => buildValueSummary(escopo), [escopo]);
  const matrix = useMemo(() => buildPriorityMatrix(escopo), [escopo]);
  const funnel = useMemo(() => buildFunnel(escopo), [escopo]);
  const cycle = useMemo(() => buildCycleTime(escopoPhases), [escopoPhases]);
  const riskSummary = useMemo(() => buildRiskSummary(escopoRisks), [escopoRisks]);
  const toolMix = useMemo(() => buildToolMix(escopo), [escopo]);

  const areaSelect = todasAreas.length > 0 && (
    <div className="bg-wh rounded-[10px] p-3 shadow mb-4 flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-bold uppercase tracking-wider text-mut">
        📍 Área:
      </span>
      <select
        value={areaFiltro}
        onChange={(e) => setAreaFiltro(e.target.value)}
        className="px-2.5 py-1.5 border border-bdr rounded-md text-[12px] bg-bg"
      >
        <option value="">Todas as áreas</option>
        {todasAreas.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <span className="text-[11px] text-mut">
        {areaFiltro ? `Exibindo: ${areaFiltro}` : 'visão geral (todas as áreas)'}
      </span>
    </div>
  );

  // Empty state: sem oportunidades no escopo atual.
  if (report.totalCount === 0) {
    return (
      <div>
        {areaSelect}
        <div className="rounded-[10px] bg-wh border border-bdr p-10 text-center text-mut shadow">
          <div className="text-base font-bold text-pri mb-2">
            📈 Nenhuma oportunidade{areaFiltro ? ` em "${areaFiltro}"` : ' ainda'}
          </div>
          <p>
            {areaFiltro
              ? 'Escolha outra área ou volte para "Todas as áreas".'
              : 'Cadastre oportunidades para ver a visão estratégica do portfólio (valor, priorização, esteira e riscos).'}
          </p>
        </div>
      </div>
    );
  }

  const pieCount: PieSlice[] = report.areas.map((a) => ({
    label: a.area,
    value: a.count,
    color: a.color,
  }));
  const pieFte: PieSlice[] = report.areas.map((a) => ({
    label: a.area,
    value: a.fte,
    color: a.color,
  }));

  const escopoLabel = areaFiltro
    ? ` — ${areaFiltro}`
    : sourceLabel
      ? ` — ${sourceLabel}`
      : '';

  return (
    <div>
      {areaSelect}

      {/* ① Valor */}
      <ValueHeader value={value} />

      {/* ② Priorização */}
      <PriorityMatrix matrix={matrix} />

      {/* ③ Esteira & cycle time */}
      <FunnelCycle funnel={funnel} cycle={cycle} />

      {/* ④ Riscos */}
      <RiskPanel risk={riskSummary} />

      {/* ⑤ Composição — perfil do portfólio (contexto, não protagonista) */}
      <section className="bg-wh rounded-[10px] p-[18px] shadow mb-4">
        <h3 className="text-sm font-bold text-pri mb-3.5 border-b border-bdr pb-2">
          🧩 Composição do Portfólio{escopoLabel}
        </h3>

        {/* Mix de ferramenta */}
        <div className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-mut mb-1.5">
            Ferramenta de automação
          </div>
          <div className="flex h-5 w-full overflow-hidden rounded-md border border-bdr">
            <ToolSeg count={toolMix.rpa} total={report.totalCount} color="var(--color-rpa)" label="RPA" />
            <ToolSeg count={toolMix.n8n} total={report.totalCount} color="var(--color-n8n)" label="n8n" />
            <ToolSeg count={toolMix.ambos} total={report.totalCount} color="var(--color-both)" label="Ambos" />
            {/* 0055 — SAP, UiPath e o que o tenant registrar. */}
            <ToolSeg count={toolMix.outras} total={report.totalCount} color="#64748b" label="Outras" />
            <ToolSeg count={toolMix.semFerramenta} total={report.totalCount} color="#94a3b8" label="—" />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
            <ToolLegend color="var(--color-rpa)" label="🤖 RPA" count={toolMix.rpa} />
            <ToolLegend color="var(--color-n8n)" label="⚡ n8n" count={toolMix.n8n} />
            <ToolLegend color="var(--color-both)" label="🔁 Ambos" count={toolMix.ambos} />
            {toolMix.outras > 0 && (
              <ToolLegend color="#64748b" label="🛠️ Outras" count={toolMix.outras} />
            )}
            {toolMix.semFerramenta > 0 && (
              <ToolLegend color="#94a3b8" label="Não definida" count={toolMix.semFerramenta} />
            )}
          </div>
        </div>

        {/* Distribuição por área — barras oportunidades/FTE */}
        <div
          className="grid gap-2 border-b-2 border-bdr pb-1.5 mb-0.5"
          style={{ gridTemplateColumns: '160px 1fr 55px 90px' }}
        >
          <div className="text-[10px] font-bold text-mut text-right pr-2">ÁREA</div>
          <div className="text-[10px] font-bold text-mut">
            DISTRIBUIÇÃO{' '}
            <span style={{ color: '#3b82f6' }}>■ Oportunidades</span>{' '}
            <span style={{ color: '#10b981' }}>■ FTE</span>
          </div>
          <div className="text-[10px] font-bold text-mut text-center">QTD</div>
          <div className="text-[10px] font-bold text-mut text-center">FTE/MÊS</div>
        </div>

        {report.areas.map((a) => (
          <div
            key={a.area}
            className="grid gap-2 items-center border-b border-bdr py-1.5"
            style={{ gridTemplateColumns: '160px 1fr 55px 90px' }}
          >
            <div className="text-[11px] font-semibold text-right pr-2 truncate" title={a.area}>
              {a.area}
            </div>
            <div className="flex flex-col gap-[3px]">
              <div className="flex items-center gap-1">
                <div
                  style={{
                    height: 12,
                    width: `${(a.count / report.maxCount) * 100}%`,
                    background: a.color,
                    borderRadius: 3,
                    minWidth: 4,
                  }}
                />
                <span className="text-[10px] font-bold" style={{ color: a.color }}>
                  {a.count} op.
                </span>
              </div>
              <div className="flex items-center gap-1">
                <div
                  style={{
                    height: 8,
                    width: `${report.maxFte ? (a.fte / report.maxFte) * 100 : 0}%`,
                    background: '#10b981',
                    borderRadius: 3,
                    minWidth: 4,
                  }}
                />
                <span className="text-[10px]" style={{ color: '#10b981' }}>
                  ⏱️ {a.fte}h
                </span>
              </div>
            </div>
            <div className="text-center">
              <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-[7px] py-0.5 rounded-[10px] text-[11px] font-bold">
                {a.count}
              </span>
            </div>
            <div className="text-center">
              <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 px-[7px] py-0.5 rounded-[10px] text-[10px] font-bold">
                {a.fte}h
              </span>
            </div>
          </div>
        ))}

        <div className="mt-2.5 text-[11px] text-mut flex gap-4 flex-wrap">
          <span>
            Total: <strong>{report.totalCount}</strong> oportunidades em{' '}
            <strong>{report.areas.length}</strong> áreas
          </span>
          <span>
            FTE Total: <strong>{report.totalFte}h/mês</strong>
          </span>
        </div>

        {/* Donuts por área */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <PieCard slices={pieCount} title="🔵 Oportunidades por Área" valueSuffix="op." />
          <PieCard slices={pieFte} title="⏱️ FTE Estimado por Área (h/mês)" valueSuffix="h" />
        </div>
      </section>
    </div>
  );
}

function ToolSeg({
  count,
  total,
  color,
  label,
}: {
  count: number;
  total: number;
  color: string;
  label: string;
}) {
  if (count === 0) return null;
  const pct = total ? (count / total) * 100 : 0;
  return (
    <div
      className="h-full flex items-center justify-center text-[9px] font-bold text-white overflow-hidden"
      style={{ width: `${pct}%`, background: color }}
      title={`${label}: ${count}`}
    >
      {pct >= 8 ? label : ''}
    </div>
  );
}

function ToolLegend({
  color,
  label,
  count,
}: {
  color: string;
  label: string;
  count: number;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-mut">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      {label} <strong className="text-txt">{count}</strong>
    </span>
  );
}
