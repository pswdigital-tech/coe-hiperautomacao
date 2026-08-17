# Plan 09-03 — Summary

**Plan:** Camada de validação (Nyquist) da migration 0011
**Status:** ✅ Complete
**Requirements:** RISK-04 (SC4), SCORE-01, SCORE-03

## What was built

Testes que travam as regras determinísticas da migration 0011 contra o contrato `_giba`:

- **`tests/schema/rpa-score-rule.test.ts`** (10 testes) — regra de `rpa_score` (6 indicadores; `causaReclamacoes`/`temDocumentacao` ignorados; `totalmenteManual` em sim|parcial; `decisaoHumana` em nao; null→null). Fixtures reais do `_giba` (WSI03/34/58).
- **`tests/schema/score-rule.test.ts`** (6 testes) — `opportunity_score` 5-fatores (`_giba:483-490`) com fallbacks; casos `(alto,baixo,diario,5,muito_alto)=100`, `(alto,alto,anual,1,muito_baixo)=36`, intermediário=59, fallbacks=67; `priority_level`. **Seed da paridade SCORE-04 (Phase 10 reusa).**
- **`tests/schema/risk-priority-matrix.test.ts`** (17 testes) — as 16 células da matriz impacto×probabilidade (`_giba:1180-1185`).
- **`tests/security/opportunity-risks-isolation.test.ts`** (5 specs, skipIf) — A≠B em `opportunity_risks`: SELECT=[]/UPDATE 0/DELETE 0 cross-tenant + INSERT forjado=erro + SELECT próprio=1 (priority='critica'). Skip mode até `.env.test` apontar p/ Cloud de teste com 0011.

## Key files
- Created: `tests/schema/{rpa-score-rule,score-rule,risk-priority-matrix}.test.ts`, `tests/security/opportunity-risks-isolation.test.ts`

## Verification
- `npx vitest run tests/schema/` → **33 passed** (sem skip) ✓
- isolation test → **5 skipped** (skip mode sem `.env.test`, exit 0) ✓
- suite completa: **103 passed / 27 skipped / 0 failed** ✓ · `tsc --noEmit` clean ✓

## Deviations
- **any-cast** nas chamadas a `opportunity_risks`/`tempo:'mensal'` no teste de isolamento — `lib/database.types.ts` só conhece 0011 após apply + `gen:types`. Mesmo padrão de `lib/public-form/log.ts` pós-0007; remover os casts na Phase 10.

## Cross-phase note (regressão conhecida, NÃO bloqueia esta fase)
7 arquivos de teste existentes inserem `tempo:'medio'`/`'pequeno'` (domínio antigo `time_bucket`). Pós-0011, esses valores ficam inválidos para INSERT no DB. Os testes **puros** (mass-assignment/actions/enrichment) ainda passam (validam contra o Zod antigo); os de **integração** (tenant-isolation/atomicity/public-form) estão em skip mode e quebrarão quando o test DB tiver 0011. **Resolver na Phase 10** (atualizar Zod + valores de `tempo` nos testes para frequências).

## Self-Check: PASSED
