# 10-02 SUMMARY — SCORE-04: fórmula única + paridade

**Status:** ✅ Complete | **Commit:** 36e4e69 | **Requirements:** SCORE-04

## O que foi construído
- **`lib/opportunities/score.ts`** — módulo cliente-safe (sem marca server-side) exportando
  `calcScore` (5 fatores, pesos/fallbacks de `_giba:483-490`) e `priorityLevel`. Fonte única.
- **`ScorePreview.tsx`** — removida a fórmula v0.1 obsoleta (×25, 4 fatores, domínio
  pequeno/medio/grande); passa a importar do módulo único. `Props = Prioridade` (loose) para
  não quebrar o call-site legado de PriorizacaoStep (fallback em runtime até P11).
- **`tests/schema/score-parity.test.ts`** — prova em 2 níveis: (1) puro vs casos canônicos
  (inclui a armadilha `(baixo,baixo,diario,5,muito_alto)=88`); (2) `describe.skipIf` SQL vs
  `opportunity_score()` real (it.each, 5 casos), pula limpo em unit-only.

## Verificação
- `npx vitest run tests/schema/score-parity.test.ts` → 6 passed | 5 skipped (SQL).
- ScorePreview: 0 fórmula local, importa do módulo, sem domínio antigo.

## Deviations
- `Props = Prioridade` (em vez do union estrito do plano) — necessário p/ o call-site
  `PriorizacaoStep` (data.tempo) compilar sem reescrever o wizard (P11). calcScore valida
  por lookup+fallback, então é seguro.
