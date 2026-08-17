---
phase: 13-atualizacoes-tela
plan: 02
subsystem: ui
tags: [kpi-bar, table, rpa-fit, fte, sort, vitest, wave-2]

# Dependency graph
requires:
  - phase: 13-atualizacoes-tela (plan 01)
    provides: "deriveRpaScore, rpaTier (lib/opportunities/cells.ts), SORT_VALUES/fte_* keys, OpportunityKpis.fteTotal contract + 3 Wave 0 specs"
provides:
  - "KPI bar de 9 KPIs (paridade _giba:296-305): Total/Alta/Média/Baixa/Score Médio/FTE Total/Novos/Produção/Concluídos"
  - "OpportunityKpis reshaped — fteTotal + byStatus 3-status; personas/formularios/byTool removidos"
  - "computeKpis sem acumuladores legados, soma fte_horas (null→0), conta só os 3 status da barra"
  - "cells.tsx: FteCell + RpaFitBadge (reexporta rpaTier de lib como fonte única)"
  - "table.tsx: colunas FTE/mês (sortable) + RPA Fit; coluna Fonte mantida (D-04)"
  - "queries.ts: cases fte_asc/fte_desc no sort switch (order fte_horas)"
affects: [13-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Badge inline-style pill por faixa (RpaFitBadge espelha STATUS_INFO/ToolBadge idiom + cores hex _giba:520-525)"
    - "Sort por coluna via SORTABLE_COLS → querystring → queries.ts order() — estendido, não reinventado"

key-files:
  created: []
  modified:
    - lib/opportunities/types.ts
    - lib/opportunities/queries.ts
    - components/opportunities/kpi-bar.tsx
    - components/opportunities/cells.tsx
    - components/opportunities/table.tsx

key-decisions:
  - "rpaTier permanece fonte única em lib/opportunities/cells.ts (test-gated); cells.tsx reexporta em vez de duplicar — RpaFitBadge mapeia as cores hex inline da faixa"
  - "FTE/mês é coluna sortable (ThSort); RPA Fit é coluna não-sortable (A4/D-06: score+FTE são as obrigatórias)"
  - "Coluna Fonte/SourceBadge mantida (D-04, divergência consciente do mockup enquanto há dados legados FGCoop)"

patterns-established:
  - "Wave 0 contract → GREEN: kpis/rpa-badge/filters specs satisfeitos pela implementação real, sem RED intencional remanescente"

requirements-completed: [VIEW-01, VIEW-02, VIEW-03]

# Metrics
duration: ~9min
completed: 2026-06-05
---

# Phase 13 Plan 02: KPI 9-cells + colunas FTE/RPA Fit + sort FTE Summary

**Reshape de display do v0.2: KPI bar de 9 KPIs (drop dos buckets legados personas/formularios/byTool, +FTE Total/mês), tabela com colunas FTE/mês sortable + RPA Fit, e os 2 badges FteCell/RpaFitBadge — virando GREEN os 2 RED intencionais de kpis.test.ts.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-05T11:32Z
- **Completed:** 2026-06-05T11:36Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- `OpportunityKpis` + `computeKpis` reduzidos ao contrato de 9 KPIs do mockup (D-01..D-03): `fteTotal = Math.round(Σ fte_horas)`, `byStatus` estreitado a `novo/producao/concluido`; `personas`/`formularios`/`byTool` e a granularidade extra de status removidos.
- `kpi-bar.tsx` renderiza EXATAMENTE os 9 KPIs em ordem (`_giba:296-305`): Total · 🟢 Alta (≥70) · 🟡 Média (40-69) · 🔴 Baixa (<40) · Score Médio · FTE Total/mês · Novos · Produção · Concluídos.
- `cells.tsx` ganhou `FteCell` (`Xh`, null→travessão) + `RpaFitBadge` (pill por faixa de `rpa_score`, cores `_giba:520-525`), reusando `rpaTier` da fonte única em `lib/opportunities/cells.ts`.
- `table.tsx` ganhou colunas **FTE/mês** (sortable via `ThSort`/`toggleSort('fte')`) + **RPA Fit** (não-sortable), mantendo a coluna **Fonte** (D-04). `queries.ts` ganhou os cases `fte_asc`/`fte_desc` no sort switch → FTE round-trip ponta a ponta.
- Os 3 contratos Wave 0 (`kpis`/`rpa-badge`/`filters`) agora GREEN; nenhum RED intencional remanescente.

## Task Commits

1. **Task 1: Reshape OpportunityKpis + computeKpis + kpi-bar.tsx** - `4079555` (feat)
2. **Task 2: FteCell + RpaFitBadge em cells.tsx + fte sort cases em queries.ts** - `83ef726` (feat)
3. **Task 3: Colunas FTE/mês (sortable) + RPA Fit em table.tsx** - `1ace08b` (feat)

**Plan metadata:** (commit docs final — STATE/ROADMAP/SUMMARY)

## Files Created/Modified

- `lib/opportunities/types.ts` (mod) — `OpportunityKpis`: drop `personas`/`formularios`/`byTool`, `byStatus` narrow a `{novo,producao,concluido}`, `fteTotal` mantido.
- `lib/opportunities/queries.ts` (mod) — `computeKpis` reescrito (sem loops legados, soma `fte_horas` null→0, conta só 3 status); import `OpportunityStatus` removido (ficou unused); +2 cases `fte_asc`/`fte_desc` no sort switch (`order('fte_horas', {nullsFirst:false})`).
- `components/opportunities/kpi-bar.tsx` (mod) — KPI list reescrita p/ os 9 cells; primitivos `KpiCell`/`Divider` intactos.
- `components/opportunities/cells.tsx` (mod) — `RpaFitBadge` + `FteCell` + reexport de `rpaTier`.
- `components/opportunities/table.tsx` (mod) — `SORTABLE_COLS.fte`, header FTE/mês (ThSort) + RPA Fit (Th), body cells `FteCell`/`RpaFitBadge`; Fonte/SourceBadge preservados.

## Decisions Made

- **rpaTier não duplicado:** o `rpaTier` puro (rótulo/ícone) é test-gated em `lib/opportunities/cells.ts` (consumido por `rpa-badge.test.ts`). `cells.tsx` reexporta essa fn e o `RpaFitBadge` adiciona só o mapeamento de cores hex inline da faixa — evita uma 2ª cópia dos thresholds (risco de drift).
- **RPA Fit não-sortable:** D-06/A4 exige score+FTE sortable; RPA Fit fica como coluna de leitura (ordenar por `rpa_score` é opcional e não trivial sem nullsFirst tuning). Score já era sortable, FTE adicionado.
- **Coluna Fonte mantida (D-04):** divergência consciente do mockup enquanto há personas legadas FGCoop misturadas.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Remoção do import `OpportunityStatus` em queries.ts**
- **Found during:** Task 1 (reshape de computeKpis)
- **Issue:** Com o `byStatus` estreitado a `{novo,producao,concluido}` o tipo `Record<OpportunityStatus,number>` deixou de ser usado em `queries.ts`; o import `OpportunityStatus` virou unused → `tsc --noEmit` (convenção verde do repo).
- **Fix:** Removido o `OpportunityStatus` do bloco de import de `./types` (o tipo continua exportado de `types.ts`, consumido por filters/outros).
- **Files modified:** `lib/opportunities/queries.ts`
- **Verification:** `npx tsc --noEmit` exit 0.
- **Committed in:** `4079555` (Task 1)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Mudança mínima necessária para manter o gate de typecheck verde. Sem scope creep.

## Issues Encountered

None — baseline confirmava 2 RED em `kpis.test.ts` (rpa-badge/filters já green via 13-01, pois `lib/opportunities/cells.ts rpaTier` e as chaves `fte_*` em filters.ts já existiam). O reshape virou os 2 RED em GREEN.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Plan 13-03 (kanban FTE/coluna + chips, dep 02):** destravado — consome `rpaTier`/`RpaFitBadge` (mesmas faixas de D-05/D-16) e o padrão de chip FTE (`FteCell`) para o header de coluna (`Σ fte_horas`) e os cards.
- **Sem migration / sem schema:** tudo display puro sobre campos já presentes na view `opportunities_with_score`.

## Threat Surface

Nenhuma superfície nova além das previstas no `<threat_model>`: as chaves `fte_asc`/`fte_desc` já estavam no `SORT_VALUES` fechado (13-01), validadas por `pickEnum` — só `fte_horas` ordering é alcançável (T-13-02 mitigado). Nenhum novo write/parâmetro/endpoint.

## Self-Check: PASSED

- `lib/opportunities/types.ts` — FOUND (fteTotal, byStatus 3-status)
- `lib/opportunities/queries.ts` — FOUND (computeKpis reshaped + fte cases)
- `components/opportunities/kpi-bar.tsx` — FOUND (9 KPIs)
- `components/opportunities/cells.tsx` — FOUND (FteCell + RpaFitBadge + rpaTier)
- `components/opportunities/table.tsx` — FOUND (FTE/mês + RPA Fit + Fonte)
- Commit `4079555` — FOUND
- Commit `83ef726` — FOUND
- Commit `1ace08b` — FOUND
- Suite: 148 passed / 32 skipped / 0 failed; `tsc --noEmit` exit 0

---
*Phase: 13-atualizacoes-tela*
*Completed: 2026-06-05*
