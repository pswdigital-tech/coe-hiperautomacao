---
phase: 14-relatorio
plan: 01
subsystem: frontend
tags: [relatorio, report, svg-pie, donut, server-component, zero-dep, portfolio]

# Dependency graph
requires:
  - phase: 13-atualizacoes-tela
    provides: "lib/opportunities/cells.ts rpaTier (thresholds RPA Fit), padrão de módulo lib puro"
  - phase: 10-backend-queries-validation-score
    provides: "view opportunities_with_score expõe priority_level computado (D-06)"
provides:
  - "lib/opportunities/report.ts buildReport — agregação pura do portfólio por área (count/fte/prioridades/RPA)"
  - "lib/opportunities/report.ts PALETTE — 18 cores (porta de _giba:817), reusada nos 3 blocos (D-02a)"
  - "components/opportunities/relatorio/pie.tsx PieCard/PieChart — donut SVG zero-dep (porta _giba:818-850)"
  - "components/opportunities/relatorio/relatorio.tsx Relatorio — Server Component das 3 seções (cards/distribuição/donuts), props { opportunities, sourceLabel }"
affects: [14-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SVG donut portado à mão (large-arc, ri=size*0.22/R=size*0.4) em JSX — zero dependência de chart (recharts/visx/d3)"
    - "Server Component agrega via função pura (buildReport) e recebe dados por prop — sem fetch no componente (escopo de tenant fica no page.tsx, Plan 14-02)"
    - "Derivados lidos de colunas computadas da view (priority_level/rpa_score), nunca recomputados nem persistidos (docs/PROJETO.md §3)"

key-files:
  created:
    - lib/opportunities/report.ts
    - components/opportunities/relatorio/pie.tsx
    - components/opportunities/relatorio/relatorio.tsx
  modified: []

# Requirements
requirements: [REPORT-02, REPORT-03, REPORT-04]

commits:
  - 0ab3532 feat(14-01): agregação pura do portfólio por área (buildReport + PALETTE)
  - 9cdf84d feat(14-01): componentes SVG donut PieChart + PieCard (zero-dep)
  - f0efcd3 feat(14-01): Server Component Relatorio com as 3 seções
---

# Plan 14-01 — Núcleo da view "Relatório"

## O que foi construído

Núcleo analítico da view "Relatório", em paridade visual com `renderRelatorio()`
do mockup (`_giba_wsi-dashboard.html:853-928`), **sem nenhuma dependência nova**.

1. **`lib/opportunities/report.ts`** — `buildReport(opps: Opportunity[]): PortfolioReport`,
   função pura que agrega o portfólio por área: `areaMap` por `(area||'Sem Área').trim()`,
   `areas` ordenadas por `count` desc, cor por índice via `PALETTE` (18 cores, D-02a),
   `fte` por área arredondado (null→0), `maxCount`/`maxFte` com guard contra
   `Math.max()` vazio, totais globais, prioridades via coluna computada
   `priority_level` (D-06 — não recomputa `score.ts`), `rpaIdeal` (≥5) / `rpaHybrid`
   (≥3 && <5) consistentes com `rpaTier` (D-07). Read-only, importável em vitest.

2. **`components/opportunities/relatorio/pie.tsx`** — `PieChart` (interno) + `PieCard`
   (exportado), porta de `svgPie`/`pieCard`: donut `ri=size*0.22`/`R=size*0.4`,
   large-arc, `<path>` JSX (sem `dangerouslySetInnerHTML` — React escapa), legenda
   rótulo truncado + valor + %, "Sem dados" em `total === 0` (D-04). Server-safe,
   zero-dep.

3. **`components/opportunities/relatorio/relatorio.tsx`** — `Relatorio` (Server
   Component, D-03), props `{ opportunities, sourceLabel }`. Empty state global pt-BR
   quando `totalCount === 0` (D-04a). Caso contrário, 3 seções: **Resumo do Portfólio**
   (7 cards na ordem do mockup, badge de fonte real via `sourceLabel` — sem hardcode),
   **Distribuição por Área** (header + barra azul de quantidade + barra verde de FTE
   com `minWidth:4` para áreas com FTE 0, badges QTD/FTE, rodapé de totais), **dois
   donuts** (Oportunidades por Área / FTE por Área) com a mesma cor por área (D-02a).

## Verificação

- `npx tsc --noEmit` → exit 0, 0 erros.
- Todos os acceptance criteria das 3 tasks passam: `buildReport`/`PALETTE` (18 cores)
  exportados; `report.ts` sem `server-only` nem import de `score.ts`; `pie.tsx`/
  `relatorio.tsx` sem `use client` nem `recharts|visx|d3`; títulos pt-BR exatos;
  empty state global; sem hardcode "Workshop I".

## Desvios

Nenhum desvio de lógica. Ajuste cosmético: comentários de cabeçalho reescritos
para não conterem os literais `server-only`/`use client`/`d3` que os greps de
acceptance proíbem (os greps são literais e não distinguem comentários). O título
da Seção 2 usa `&` literal (válido em texto JSX) em vez de `&amp;` para casar com
o acceptance criterion exato.

## O que isto habilita

Plan 14-02 (wiring): registrar a view `relatorio` na toolbar e adicionar o branch
de render no `page.tsx` com fetch não-filtrado do portfólio completo (RLS-scoped),
passando `tenant.name` como `sourceLabel`.

## Self-Check: PASSED
