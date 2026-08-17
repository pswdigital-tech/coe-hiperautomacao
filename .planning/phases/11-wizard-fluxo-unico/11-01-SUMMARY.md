---
phase: 11-wizard-fluxo-unico
plan: 01
subsystem: ui
tags: [wizard, fte, score, zod, vitest, tdd]

# Dependency graph
requires:
  - phase: 10-backend-queries-validation-score
    provides: "fteBucketEnum / frequencyEnum / sourceEnum em lib/opportunities/schema.ts; fórmula única score.ts (5 fatores)"
provides:
  - "deriveFteBucket(horas) — fonte única horas→bucket FTE (D-01/D-02), consumida por UI preview + submit"
  - "FteBucket type derivado de fteBucketEnum (sem duplicar literais)"
  - "stepsFor('*','create') = fluxo único de 5 steps (Identificação→Processo→Critérios→Benefícios→Priorização)"
  - "defaultFormData() fixa source='formulario' (criação sempre formulário, D-04)"
  - "validateStep com branch Processo + Identificação(nome+área+email) pt-BR (WIZARD-04/D-11)"
affects: [11-02, 11-03, wizard, criterios, beneficios, priorizacao, processo]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bucket FTE derivado por fn pura (fonte única) em vez de campo manual — impossível divergir display×persistência"
    - "Tipo derivado do enum Zod (typeof enum.options[number]) — single source of truth para literais"
    - "Fluxo único de wizard: mode='create' ignora source; split persona/formulário vira legado edit-only"

key-files:
  created:
    - lib/opportunities/fte.ts
    - tests/opportunities/fte.test.ts
  modified:
    - components/opportunities/wizard/state.ts
    - tests/wizard/state.test.ts

key-decisions:
  - "deriveFteBucket deriva FteBucket de fteBucketEnum.options (Zod 4) em vez de redeclarar literais — zero divergência com o schema"
  - "STEP_TIPO/STEP_CLASSIFICACAO/STEPS_PERSONA_EXTRA/STEPS_EDIT_AI_FIELDS preservados (usados só em mode='edit', escopo Phase 13)"
  - "validateStep('processo') é branch novo; checagem de processo removida de identificacao (migrou de step)"

patterns-established:
  - "FTE fonte única: deriveFteBucket é o único mapeamento horas→bucket — UI e submit usam a MESMA fn"
  - "Fluxo de criação único: stepsFor(mode='create') retorna STEPS_CREATE independente de source"

requirements-completed: [WIZARD-01, WIZARD-04]

# Metrics
duration: 6min
completed: 2026-06-04
---

# Phase 11 Plan 01: Fundação do Wizard de Fluxo Único Summary

**`deriveFteBucket` (fonte única horas→bucket FTE, derivada do `fteBucketEnum`) + `state.ts` reescrito para um fluxo único de criação de 5 steps que sempre grava `source='formulario'`, com `validateStep` Identificação/Processo em pt-BR.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-04T21:35:00Z
- **Completed:** 2026-06-04T21:39:30Z
- **Tasks:** 2
- **Files modified:** 4 (2 criados, 2 modificados)

## Accomplishments
- `deriveFteBucket(horas)` — função pura, fonte única horas→bucket FTE (D-01/D-02), com bordas inferior-inclusivas/superior-exclusivas e guard para entrada não-finita/negativa. Tipo `FteBucket` derivado do `fteBucketEnum` (sem duplicar literais).
- `stepsFor('*','create')` agora retorna um fluxo ÚNICO de 5 steps (Identificação → Processo → Critérios → Benefícios → Priorização), independente de `source` — sem Tipo/Classificação (D-04).
- `defaultFormData()` fixa `source='formulario'` (criação sempre formulário) e remove `escopo_automacao`/`beneficios_esperados` do default (D-08).
- `validateStep`: novo branch `processo` (Processo obrigatório); `identificacao` valida nome+área+email; mensagens pt-BR (WIZARD-04/D-11).
- `mode='edit'` preservado intocado (legado FGCoop — escopo Phase 13).

## Task Commits

Each task was committed atomically:

1. **Task 1 (TDD RED): failing test deriveFteBucket** - `404a807` (test)
2. **Task 1 (TDD GREEN): implement deriveFteBucket** - `2ea9e5b` (feat)
3. **Task 2: state.ts fluxo único + validateStep** - `02f19be` (feat)

_Task 1 followed TDD (RED→GREEN); REFACTOR não necessário (implementação já mínima/limpa)._

## Files Created/Modified
- `lib/opportunities/fte.ts` - `deriveFteBucket` + tipo `FteBucket` (derivado do enum). Fonte única horas→bucket.
- `tests/opportunities/fte.test.ts` - 7 specs cobrindo as 5 faixas + bordas + degenerados (negativo/NaN).
- `components/opportunities/wizard/state.ts` - `STEPS_CREATE` (5 steps), `stepsFor` single-flow create, `defaultFormData` source='formulario', `validateStep` Identificação/Processo pt-BR.
- `tests/wizard/state.test.ts` - reescrito para o novo contrato (11 specs).

## Decisions Made
- **`FteBucket` derivado de `fteBucketEnum.options`** (Zod 4 expõe `.options`) — single source of truth; nenhum literal-array de buckets duplicado em `fte.ts`.
- **`STEP_TIPO` e demais constantes do split persona/formulário mantidas** mesmo sem uso no caminho de create — são usadas no `mode='edit'` (legado, Phase 13). `tsconfig` não tem `noUnusedLocals`, então não há erro de compilação.
- **`processo` migrado de `identificacao` para o novo branch `processo`** no `validateStep`, alinhado ao fluxo de 5 steps.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npx tsc --noEmit` reporta **1 erro pré-existente** em `app/(app)/layout.tsx(7,4): TS2304: Cannot find name 'LayoutProps'`. Presente no commit base `68ad5c1` (arquivo não tocado por este plano). Causa: `LayoutProps<'/'>` é um helper de tipo gerado pelo Next.js 16 em `.next/types`, populado por `next dev`/`next build` — um `tsc --noEmit` puro sem build prévio não o enxerga. Fora do escopo (SCOPE BOUNDARY). Registrado em `.planning/phases/11-wizard-fluxo-unico/deferred-items.md`. Os arquivos tocados por este plano não introduzem nenhum erro de tipo.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- **11-02** (Critérios/Benefícios first-class) e **11-03** (Processo/Priorização) estão destravados: a nova sequência de 5 steps e `deriveFteBucket` (que 11-03 usa para derivar `prioridade_fte` no submit) estão entregues.
- Verificação: `npx vitest run tests/opportunities/fte.test.ts tests/wizard/state.test.ts` → 18 passed.

## Self-Check: PASSED

All created/modified files exist on disk; all 3 task commits (`404a807`, `2ea9e5b`, `02f19be`) present in git history. Verification suite green (18/18).

---
*Phase: 11-wizard-fluxo-unico*
*Completed: 2026-06-04*
