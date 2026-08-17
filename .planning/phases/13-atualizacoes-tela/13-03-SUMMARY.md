---
phase: 13-atualizacoes-tela
plan: 03
subsystem: ui
tags: [kanban, gestao-a-vista, fte, rpa-fit, display, wave-3]

# Dependency graph
requires:
  - phase: 13-atualizacoes-tela (plan 02)
    provides: "RpaFitBadge (components/opportunities/cells.tsx) — pill por faixa de rpa_score, fonte única de faixas/cores reusando rpaTier"
provides:
  - "Kanban header: Σ fte_horas por coluna (⏱️ {sum}h FTE/mês), null-safe, Math.round"
  - "Kanban card: chip FTE (⏱️ {fte_horas}h/mês) + RpaFitBadge (rpa_score) — paridade _giba:698-741"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reuso de RpaFitBadge (Plan 13-02) no kanban — sem re-derivar thresholds de RPA nem formatação de FTE"
    - "Pill inline (Math.round(x ?? 0)) para Σ FTE de coluna e chip FTE de card, idioma do header/footer existente"

key-files:
  created: []
  modified:
    - components/opportunities/kanban/Column.tsx
    - components/opportunities/kanban/Card.tsx

key-decisions:
  - "Header da coluna: bloco de label + sub-linha FTE/mês agrupados num <div min-w-0>; count pill permanece à direita (justify-between intacto)"
  - "Card: chip FTE + RpaFitBadge em uma linha própria acima do rodapé SourceBadge/score (footer de score preservado), evitando overflow no card de 220px"
  - "FTE chip do card usa o idioma de pill cinza (bg-slate-100/text-slate-600) espelhando o tom neutro do mockup; RPA usa RpaFitBadge (cores por faixa do Plan 02)"

patterns-established:
  - "Terceira superfície de display do v0.2 (após KPI bar + tabela) consumindo fte_horas/rpa_score já presentes na view — zero novo fetch/migration"

requirements-completed: [VIEW-04]

# Metrics
duration: ~6min
completed: 2026-06-05
---

# Phase 13 Plan 03: Kanban FTE por coluna + chips FTE/RPA Fit no card Summary

**Reshape de display puro da Gestão à Vista: cada header de coluna soma e mostra FTE/mês das suas oportunidades, e cada card ganha chip de FTE + RPA Fit badge — reusando o `RpaFitBadge` do Plan 13-02, em paridade com `_giba:698-741`.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-05T11:39Z
- **Completed:** 2026-06-05T11:42Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `Column.tsx`: `fteSum = Math.round(opportunities.reduce((s,o) => s + (o.fte_horas ?? 0), 0))` (null-safe) renderizado como sub-linha `⏱️ {fteSum}h FTE/mês` abaixo do label, ao lado do count pill (mirror `_giba:704,734`). Wiring de drag-target (`useDroppable`/`setNodeRef`) e o count intactos.
- `Card.tsx`: importa `RpaFitBadge` de `../cells` (helper do Plan 13-02); adiciona uma linha de chips acima do rodapé com `⏱️ {Math.round(o.fte_horas ?? 0)}h/mês` + `<RpaFitBadge score={o.rpa_score} />` (mirror `_giba:718-721`). Draggable (`setNodeRef`/`listeners`/`attributes`) e `onClick` de navegação preservados — drag-and-drop intacto.
- Sem re-derivação dos thresholds de RPA nem da formatação de FTE: `RpaFitBadge` (que reusa `rpaTier`/`rpaColors` da fonte única) é consumido como está.

## Task Commits

1. **Task 1: Soma FTE/mês no header de cada coluna do kanban** - `cbc710e` (feat)
2. **Task 2: Chip FTE + RpaFitBadge em cada card do kanban** - `d63756d` (feat)

**Plan metadata:** (commit docs final — STATE/ROADMAP/SUMMARY)

## Files Created/Modified

- `components/opportunities/kanban/Column.tsx` (mod) — `fteSum` (Math.round + `?? 0`), header reagrupado em `<div min-w-0>` (label + sub-linha FTE/mês), count pill preservado à direita.
- `components/opportunities/kanban/Card.tsx` (mod) — import `RpaFitBadge`, linha de chips (FTE chip cinza + RpaFitBadge) acima do footer SourceBadge/score; dnd-kit e onClick intactos.

## Decisions Made

- **Header agrupado:** label e sub-linha FTE/mês ficam num único `<div min-w-0>` à esquerda; o count pill permanece à direita pelo `justify-between` existente — não inventei novo spacing.
- **Chips em linha própria no card:** num card de 220px, FTE + RPA Fit ficam numa linha (`flex-wrap`) acima do rodapé de score em vez de espremidos na mesma linha do SourceBadge — evita overflow e mantém o footer de score do mockup.
- **Idioma de chip reusado:** FTE chip usa pill cinza neutro (`bg-slate-100`/`text-slate-600`) como o tom do mockup; RPA Fit usa `RpaFitBadge` (cores por faixa, Plan 02) — nenhuma cópia de cor/threshold.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — `o.fte_horas`/`o.rpa_score` já presentes em `opportunities_with_score['Row']` (herdada de `opportunities.Row`, `database.types.ts:241,248`); display puro, sem novo fetch/migration.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Plan 13-05 (modal editável, dep 01+04, autonomous:no):** independente desta superfície; é o último plano da fase (termina em checkpoint:human-verify).
- Kanban agora em paridade com `_giba:698-741` (VIEW-04). UAT manual em VALIDATION.md cobre a parity visual do kanban.

## Threat Surface

Nenhuma superfície nova além do previsto em `<threat_model>` (T-13-03 aceito): display puro de `fte_horas`/`rpa_score` já tenant-autorizados na view RLS-scoped. Sem novo write/parâmetro/endpoint/fetch.

## Self-Check: PASSED

- `components/opportunities/kanban/Column.tsx` — FOUND (fte_horas, FTE/mês, Math.round, ?? 0)
- `components/opportunities/kanban/Card.tsx` — FOUND (RpaFitBadge import de ../cells, chip h/mês, Math.round + ?? 0, listeners/onClick intactos)
- Commit `cbc710e` — FOUND
- Commit `d63756d` — FOUND
- `tsc --noEmit` exit 0; suite 148 passed / 32 skipped / 0 failed (sem novas falhas)

---
*Phase: 13-atualizacoes-tela*
*Completed: 2026-06-05*
