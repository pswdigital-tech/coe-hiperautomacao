---
phase: 13-atualizacoes-tela
plan: 01
subsystem: testing
tags: [vitest, rpa-score, kpis, filters, contract-tests, wave-0]

# Dependency graph
requires:
  - phase: 09-schema-evolution-foundation
    provides: "regra rpa_score GENERATED (0011:127-136) + spec de paridade inline (rpa-score-rule.test.ts)"
  - phase: 11-wizard-fluxo-unico
    provides: "lib/opportunities/fte.ts deriveFteBucket (convenção de módulo lib puro)"
provides:
  - "lib/opportunities/rpa.ts deriveRpaScore — fonte única client-side do rpa_score GENERATED"
  - "Contratos Wave 0 (RED-até-Plan-02): computeKpis shape (fteTotal), rpaTier thresholds, sort keys fte_asc/fte_desc"
  - "lib/opportunities/cells.ts rpaTier() — tiers RPA Fit (_giba:520-525)"
  - "OpportunityKpis.fteTotal + computeKpis somando fte_horas (null→0)"
  - "SORT_VALUES export + chaves fte_asc/fte_desc em SortKey/SORT_VALUES/SORT_LABELS"
affects: [13-02, 13-03, 13-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 contract spec: spec puro define a shape antes da implementação; RED-runtime intencional, typecheck mantido clean via alvos mínimos"
    - "Mirror client-side de coluna GENERATED parity-tested (deriveRpaScore vs SQL 0011)"

key-files:
  created:
    - lib/opportunities/rpa.ts
    - lib/opportunities/cells.ts
    - tests/opportunities/kpis.test.ts
    - tests/opportunities/rpa-badge.test.ts
    - tests/opportunities/filters.test.ts
  modified:
    - tests/schema/rpa-score-rule.test.ts
    - lib/opportunities/filters.ts
    - lib/opportunities/types.ts
    - lib/opportunities/queries.ts

key-decisions:
  - "deriveRpaScore extraído para lib/ como fonte única; o spec de paridade (64/64 do _giba) vira portão da função extraída"
  - "Alvos mínimos criados (Rule 3) para os specs Wave 0 COLETAREM sem crash de import e manterem tsc --noEmit clean — sem antecipar o reshape de UI do Plan 02"
  - "rpaTier implementada por inteiro (fn pura totalmente especificada pelo spec); reshape de computeKpis que dropa personas/formularios/byTool fica para o Plan 02"

patterns-established:
  - "Wave 0 scaffold: contrato em spec puro, RED-runtime nos símbolos pendentes, mas tsc clean + collect sem crash"

requirements-completed: [VIEW-01, VIEW-03]

# Metrics
duration: ~10min
completed: 2026-06-05
---

# Phase 13 Plan 01: Foundation (deriveRpaScore + contratos Wave 0) Summary

**Extraiu a regra `rpa_score` para `lib/opportunities/rpa.ts deriveRpaScore` (mirror exato do GENERATED de 0011, parity-tested 64/64) e criou os 3 contratos Wave 0 — `computeKpis` shape (fteTotal), tiers `rpaTier`, e sort keys de FTE — que destravam os Plans 13-02/03/05.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-06-05T11:17Z
- **Completed:** 2026-06-05T11:23Z
- **Tasks:** 2
- **Files modified:** 9 (5 criados, 4 modificados)

## Accomplishments

- `deriveRpaScore` agora é a fonte ÚNICA client-side do `rpa_score` (criterios null/undefined → null), espelhando byte-a-byte a expressão GENERATED de `supabase/migrations/0011_schema_evolution_v02.sql:127-136`.
- `tests/schema/rpa-score-rule.test.ts` deixou de definir a fn inline e passou a importá-la de `@/lib/opportunities/rpa` — vira o portão de paridade (10 specs / 64 casos do `_giba`) da função extraída.
- 3 contratos Wave 0 criados encodando o que o Plan 13-02 deve implementar: nova shape de `computeKpis` (`fteTotal`, `byStatus` só novo/producao/concluido, sem buckets legados), thresholds de `rpaTier` (`_giba:520-525`), e sort keys `fte_asc`/`fte_desc` (VIEW-03).

## Task Commits

1. **Task 1: Extrai deriveRpaScore + rewire do parity test** - `9c6095f` (feat) — TDD: a função extraída é o GREEN, o spec de paridade pré-existente é o portão que valida.
2. **Task 2: Contratos Wave 0 (KPI shape, rpaTier, sort FTE)** - `9844ebe` (test)

**Plan metadata:** (commit docs final — STATE/ROADMAP/SUMMARY)

## Files Created/Modified

- `lib/opportunities/rpa.ts` (criado) — `deriveRpaScore(criterios)`: mirror exato do `rpa_score` GENERATED; null/undefined → null.
- `lib/opportunities/cells.ts` (criado) — `rpaTier(score)` puro (sem JSX): 0–6 → `{label, icon}` por tier (⭐≥5 / ✓≥3 / else). Consumido pelo badge "RPA Fit" no Plan 13-02.
- `tests/opportunities/kpis.test.ts` (criado) — contrato da nova shape de `computeKpis` (D-03/VIEW-01).
- `tests/opportunities/rpa-badge.test.ts` (criado) — contrato dos thresholds de `rpaTier`.
- `tests/opportunities/filters.test.ts` (criado) — contrato das sort keys de FTE.
- `tests/schema/rpa-score-rule.test.ts` (modificado) — remove fn inline, importa `deriveRpaScore`.
- `lib/opportunities/filters.ts` (modificado) — `SORT_VALUES` exportado; `fte_asc`/`fte_desc` em `SortKey`, `SORT_VALUES`, `SORT_LABELS`.
- `lib/opportunities/types.ts` (modificado) — `OpportunityKpis.fteTotal: number`.
- `lib/opportunities/queries.ts` (modificado) — `computeKpis` soma `fte_horas` (null→0) e retorna `fteTotal: Math.round(...)`.

## Decisions Made

- **Extração com o teste como portão:** o spec de paridade (64/64 do `_giba`, validado contra SQL 0011) passou a importar a fn extraída, garantindo que qualquer drift `lib/` vs SQL quebre o build (mitiga T-13-01).
- **Alvos mínimos para manter `tsc --noEmit` clean:** o repo tem convenção firme de typecheck verde (todos os SUMMARYs anteriores). Specs Wave 0 que referenciam símbolos futuros gerariam 4 erros TS. Resolvido adicionando só os contratos de TIPO + a fn `rpaTier` (totalmente especificada) — RED fica no runtime, não no collect nem no typecheck.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Criação do módulo `lib/opportunities/cells.ts` + implementação de `rpaTier`**
- **Found during:** Task 2 (contratos Wave 0)
- **Issue:** O plano manda o spec `rpa-badge.test.ts` importar `rpaTier` de `@/lib/opportunities/cells`, mas esse módulo não existia (o `cells` real é `components/opportunities/cells.tsx`, com JSX, não importável como unit puro). Import de módulo inexistente → crash de resolução no collect, violando o acceptance criterion "must COLLECT/parse without import-resolution crashes".
- **Fix:** Criado `lib/opportunities/cells.ts` (puro, sem React) exportando `rpaTier` com os thresholds exatos do spec (`_giba:520-525`). O Plan 13-02 consome essa fn no badge.
- **Files modified:** `lib/opportunities/cells.ts`
- **Verification:** `rpa-badge.test.ts` 6/6 verde; `tsc --noEmit` clean.
- **Committed in:** `9844ebe` (Task 2)

**2. [Rule 3 - Blocking] Alvos de tipo p/ manter `tsc --noEmit` clean (fteTotal, SORT_VALUES export + chaves fte_*)**
- **Found during:** Task 2 (contratos Wave 0)
- **Issue:** Os specs referenciam `result.fteTotal`, `SORT_VALUES` exportado e `parseFilters('sort=fte_desc')`. Sem os tipos/exports correspondentes, `tsc --noEmit` ficava com 4 erros (TS2459/TS2339/TS2724) — viola o gate de typecheck do projeto e do orquestrador.
- **Fix:** `OpportunityKpis.fteTotal: number` adicionado + `computeKpis` passou a somar `fte_horas` (null→0); `SORT_VALUES` exportado e `fte_asc`/`fte_desc` adicionados a `SortKey`/`SORT_VALUES`/`SORT_LABELS`. Mudanças puramente ADITIVAS — nenhuma quebra os 128 testes pré-existentes. A ORDENAÇÃO real por coluna FTE no DB e o reshape que DROPA `personas`/`formularios`/`byTool` ficam para o Plan 13-02 (escopo de UI).
- **Files modified:** `lib/opportunities/types.ts`, `lib/opportunities/queries.ts`, `lib/opportunities/filters.ts`
- **Verification:** `tsc --noEmit` exit 0; suite 146 passed / 2 RED intencionais / 32 skipped.
- **Committed in:** `9844ebe` (Task 2)

---

**Total deviations:** 2 auto-fixed (ambas Rule 3 - blocking)
**Impact on plan:** Necessárias para os contratos Wave 0 COLETAREM e o gate de typecheck (convenção do repo) ficar verde. Sem scope creep — mudanças aditivas; o reshape de UI e a ordenação por FTE permanecem com o Plan 13-02.

## Issues Encountered

- **2 specs RED intencionais (esperado para Wave 0):** `kpis.test.ts` falha em `'personas'/'formularios'/'byTool' in result === false` porque `computeKpis` ainda retorna os buckets legados. Removê-los exige tocar os consumidores (tabela/cards/kanban) — explicitamente escopo do Plan 13-02. O acceptance criterion da Task 2 permite RED pendente do Plan 02. Todo o restante (12/14) verde.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Plan 13-02 (KPI 9-cells + colunas FTE/RPA Fit + sort FTE):** destravado — consome `deriveRpaScore`, `rpaTier`, `SORT_VALUES`/chaves FTE e o contrato `fteTotal`. Deve completar o reshape de `computeKpis` (dropar `personas`/`formularios`/`byTool`, narrow do `byStatus`) e a ordenação real por coluna FTE no DB → os 2 RED viram verde.
- **Plan 13-05 (modal editável):** destravado — `deriveRpaScore` disponível para recompute read-only ao vivo (D-15).
- **Sem migration / sem schema:** tudo é `lib/` puro + testes.

## TDD Gate Compliance

- Task 1 (`tdd="true"`): o gate de paridade (`rpa-score-rule.test.ts`, 64/64 do `_giba`, já existente desde a Phase 9) cobre a função extraída — RED genuíno não se aplica (a regra já estava travada inline; este plano a move para `lib/` sem mudar a expressão). Commit `feat` (`9c6095f`) com o spec re-apontado para a fn extraída, verde imediato. Sem regressão de contrato.

## Self-Check: PASSED

- `lib/opportunities/rpa.ts` — FOUND
- `lib/opportunities/cells.ts` — FOUND
- `tests/opportunities/kpis.test.ts` — FOUND
- `tests/opportunities/rpa-badge.test.ts` — FOUND
- `tests/opportunities/filters.test.ts` — FOUND
- Commit `9c6095f` — FOUND
- Commit `9844ebe` — FOUND

---
*Phase: 13-atualizacoes-tela*
*Completed: 2026-06-05*
