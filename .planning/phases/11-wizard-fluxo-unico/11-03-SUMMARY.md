---
phase: 11-wizard-fluxo-unico
plan: 03
subsystem: ui
tags: [wizard, fte, score, processo, priorizacao, frequencia]

# Dependency graph
requires:
  - phase: 11-wizard-fluxo-unico
    plan: 01
    provides: "deriveFteBucket(horas) — fonte única horas→bucket FTE; state.ts fluxo único de 5 steps"
  - phase: 10-backend-queries-validation-score
    provides: "frequencyEnum/toolEnum/fteBucketEnum em schema.ts; fórmula única score.ts; ScorePreview (prop fte)"
provides:
  - "ProcessoStep: select Frequência→fator `tempo` (fonte única) + select Ferramenta Sugerida (default n8n)"
  - "PriorizacaoStep: 4 fatores manuais + bucket FTE derivado read-only (com peso) + ScorePreview com os 5 fatores"
  - "WizardShell.onSubmit(create): prioridade_fte derivado de fte_horas → coluna `fte` persiste o 5º fator"
affects: [11-verify, wizard, processo, priorizacao, score]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Frequência fonte única: o select de frequência (step Processo) alimenta o fator de score `tempo` — não pedido duas vezes"
    - "Bucket FTE: a MESMA deriveFteBucket alimenta o display (Priorização) e a persistência (submit) — impossível divergir preview × coluna `fte`"
    - "Bucket FTE read-only no display (sem onChange) — derivado, nunca input manual (D-01)"

key-files:
  created: []
  modified:
    - components/opportunities/wizard/steps/ProcessoStep.tsx
    - components/opportunities/wizard/steps/PriorizacaoStep.tsx
    - components/opportunities/wizard/WizardShell.tsx

key-decisions:
  - "Frequência vira SelectField (diario..anual) em Processo = fonte única do fator `tempo`; espelha rótulo legível em `frequencia` (texto) p/ compat de display"
  - "Ferramenta Sugerida default n8n quando data.ferramenta indefinido (D-07), domínio toolEnum"
  - "Tempo Estimado removido de Priorização — fator `tempo` migra para fonte única em Processo"
  - "Bucket FTE exibido read-only com peso (muito_baixo +4 .. muito_alto +20); ausência de fte_horas → estado vazio pt-BR"
  - "prioridade_fte derivado no submit do create (não no edit, Phase 13); actions.ts não alterado (já lê data.prioridade_fte)"

requirements-completed: [WIZARD-01, WIZARD-02]

# Metrics
duration: 8min
completed: 2026-06-04
---

# Phase 11 Plan 03: Processo (frequência/ferramenta) + Priorização (5 fatores) + persistência FTE Summary

**Fecha os 5 fatores e a redundância frequência×tempo: o select de Frequência em Processo vira a fonte única do fator `tempo` (+ select Ferramenta default n8n); Priorização exibe o bucket FTE derivado read-only e passa o `fte` ao `ScorePreview`; o submit do create deriva `prioridade_fte` de `fte_horas` para a coluna `fte` persistir o 5º fator — tudo via a MESMA `deriveFteBucket`, sem divergência preview × banco.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-06-04
- **Tasks:** 3
- **Files modified:** 3 (0 criados, 3 modificados)

## Accomplishments
- **ProcessoStep:** Frequência passa de TextField livre para `SelectField` (diario..anual com pesos visíveis), gravando `onChange({ tempo: ..., frequencia: <rótulo legível> })` — fonte única do fator de score `tempo`. Adicionado `SelectField` "Ferramenta Sugerida" (toolEnum RPA/n8n/Ambos) com default `n8n` (D-07). Ramo `persona_extras` preservado (legado/edit).
- **PriorizacaoStep:** Removido o `SelectField` "Tempo Estimado" (o fator `tempo` agora vem de Processo). Adicionado bloco read-only "Impacto FTE (derivado)" que exibe o bucket derivado de `fte_horas` via `deriveFteBucket`, seu peso (+4..+20), as horas de origem e nota pt-BR; estado vazio quando `fte_horas` ausente. `ScorePreview` agora recebe `fte={fteBucket}` → o score reflete os 5 fatores.
- **WizardShell.onSubmit:** No ramo `mode === 'create'`, deriva `prioridade_fte` de `fte_horas` via `deriveFteBucket` e injeta no payload antes de `createOpportunity` — fecha o gap onde `actions.ts` persistia `fte: data.prioridade_fte` como null. Mesma fn do display → impossível divergir. Ramo `edit` (Phase 13) intocado; `actions.ts` não alterado.

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: ProcessoStep frequência→tempo (fonte única) + Ferramenta n8n** - `571451a` (feat)
2. **Task 2: PriorizacaoStep bucket FTE read-only + ScorePreview fte** - `14a98f3` (feat)
3. **Task 3: WizardShell deriva prioridade_fte no create** - `9e5a1df` (feat)

## Files Created/Modified
- `components/opportunities/wizard/steps/ProcessoStep.tsx` — Frequência como select→`tempo` (fonte única) + Ferramenta Sugerida (default n8n). Type alias `Frequency` p/ o cast inline.
- `components/opportunities/wizard/steps/PriorizacaoStep.tsx` — 4 fatores manuais; bucket FTE derivado read-only com peso; `ScorePreview` recebe `fte`. "Tempo Estimado" removido.
- `components/opportunities/wizard/WizardShell.tsx` — submit do create injeta `prioridade_fte` derivado de `fte_horas` no payload.

## Decisions Made
- **Frequência como fonte única do `tempo`:** mantém um rótulo legível espelhado em `frequencia` (texto) para compat de display/legado, mas o fator de score é `data.tempo`. Resolve a redundância sinalizada no CONTEXT ("Executor's Discretion").
- **`tempo` patch inline em uma linha** (`onChange({ tempo: v as Frequency, frequencia: ... })`) — satisfaz o critério de aceite greppável (`onChange({ tempo:`) e mantém o mirror de `frequencia` no mesmo handler.
- **Bucket FTE read-only:** nenhum `onChange({ fte_horas })`/`onChange({ prioridade_fte })` em Priorização — o bucket é derivado, nunca input manual (D-01/D-03).
- **`prioridade_fte` derivado só no create:** o ramo `edit` (Phase 13) permanece inalterado; `createOpportunity` já lê `data.prioridade_fte`, então nenhuma mudança em `actions.ts`.

## Threat Model Compliance
- **T-11-05 (Tampering — bucket FTE):** mitigado. `prioridade_fte` é DERIVADO de `fte_horas` pela `deriveFteBucket` (fonte única) tanto no display (Task 2) quanto na persistência (Task 3) — a MESMA fn, impossível divergir. `fteBucketEnum` revalida server-side via `opportunityInputSchema`.
- **T-11-06 (Tampering/Mass-assignment — selects + spread):** mitigado. Frequência/Ferramenta restritas a `frequencyEnum`/`toolEnum`. O `{ ...data, prioridade_fte }` no submit é re-filtrado pelo `.strict()` do `opportunityInputSchema` em `createOpportunity` (campos server-derived rejeitados). Score nunca é enviado pelo client.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npx tsc --noEmit` reporta **1 erro pré-existente** em `app/(app)/layout.tsx(7,4): TS2304: Cannot find name 'LayoutProps'` — mesmo erro documentado no 11-01-SUMMARY (helper de tipo gerado pelo Next.js 16 em `.next/types`, populado por `next dev`/`next build`; um `tsc --noEmit` puro não o enxerga). Fora do escopo (SCOPE BOUNDARY), já registrado em `.planning/phases/11-wizard-fluxo-unico/deferred-items.md`. Os arquivos tocados por este plano introduzem **0 erros de tipo** (verificado filtrando o erro de layout).

## User Setup Required
None - no external service configuration required.

## Self-Check: PASSED

All 3 modified files exist on disk; all 3 task commits (`571451a`, `14a98f3`, `9e5a1df`) present in git history. Verification block green: `onChange({ tempo:` em ProcessoStep, `fte=` em PriorizacaoStep, `prioridade_fte` em WizardShell; `tsc` sem novos erros (apenas o LayoutProps pré-existente).

---
*Phase: 11-wizard-fluxo-unico*
*Completed: 2026-06-04*
