# 10-03 SUMMARY — Schema Zod aditivo + riskInputSchema + whitelist

**Status:** ✅ Complete | **Commit:** 9bdb027 | **Requirements:** SCORE-04 (SC1/SC2)

## O que foi construído
- **`schema.ts`** — `criterioEnum`→minúsculo (`sim/nao/parcial`), `timeBucketEnum`→
  `frequencyEnum`, `+fteBucketEnum`. baseSchema ganha (todos opcionais): `fte_horas` (≥0),
  `fonte`, `tipo_processo[]`, `beneficio_qualitativo`, `prioridade_fte`, e os 8 `criterios`/8
  `beneficios` como objetos top-level `.strict().partial()`. `discriminatedUnion('source')`
  preservado; `.strict()` mantém a defesa mass-assignment (rpa_score/score/priority/server-
  derived rejeitados). Legado `formulario_extras.criterios` isolado em `legacyCriterioEnum`
  (uppercase) para não regredir.
- **`risk-schema.ts`** — `riskInputSchema` `.strict()` (enums tipo/impacto/probabilidade/
  status + responsavel livre; sem `priority`, que é GENERATED). Só validação/tipos (P12 usa).
- **`queries.ts`** — `OPPORTUNITY_COLUMNS` ampliada (fte_horas, fonte, tipo_processo,
  beneficio_qualitativo, criterios, beneficios, fte, rpa_score) por decisão explícita
  (HARDEN-E-06); sem `select('*')`.
- **`actions.ts`** — create/update propagam os campos novos (`prioridade_fte`→coluna `fte`);
  rpa_score/score/priority não tocados.

## Verificação
- `tsc --noEmit` → 0 erros (gate 10-04). schema sem 'SIM'/'pequeno'; com frequencyEnum/
  fteBucketEnum/fte_horas/causaReclamacoes; sem rpa_score no input.

## Deviations (cascata de domínio — descoberta no tsc)
A troca `tempo` duração→frequência rippou para sites que o plano não enumerou. Corrigidos
minimamente (sem antecipar P11):
- `ScoreTab.tsx` (3ª cópia da fórmula v0.1) — breakdown retipado p/ frequência; score final
  já vem do backend; breakdown completo de 5 fatores fica p/ P13.
- `wizard/state.ts` + `PriorizacaoStep.tsx` — domínio de frequência (default de tempo removido;
  options atualizadas; pesos dos labels alinhados à fórmula real).
- `lib/ai/enrichment.ts` — NÃO sobrescreve `tempo` (REALIGN-7.6; ver 10-04-AI-COMPAT.md).
- `actions.ts PublicSubmitInput.tempo` — domínio de frequência (alinha à RPC 0012).
