# 10-01 SUMMARY — Tipos pós-0011 + migration 0012 (RPC frequência)

**Status:** ✅ Complete (Tasks 1–4) | **Commits:** bd979e4, 3aa438a (T4), <fix overload> | **Requirements:** SCORE-04

> **Task 3 (apply 0012) — APLICADO E CONFIRMADO pelo PO.** Introspecção pós-apply: **um único**
> overload (21 params), `frequency_bucket` presente, `time_bucket` cast **ausente** → regressão
> eliminada e ambiguidade (42725) resolvida. Paridade SCORE-04 validada AO VIVO contra
> `opportunity_score()` (100/88/59/36/67, todos batem). Correção pós-apply: ver Deviation 3.

## O que foi construído
- **`lib/database.types.ts`** (Task 1) — regenerado refletindo o schema vivo pós-0011,
  **hand-derived + VERIFICADO por introspecção do catálogo** (o caminho do plano falhou —
  ver Deviations). Adiciona: enums `frequency_bucket`/`fte_bucket`/`risk_*`; colunas novas de
  `opportunities` (fte_horas, fonte, tipo_processo, beneficio_qualitativo, criterios, beneficios,
  fte, rpa_score GENERATED); `tempo`→FrequencyBucket; `opportunity_score(5 args)`; tabela
  `opportunity_risks`; view atualizada (herda os campos novos).
- **`supabase/migrations/0012_public_rpc_frequency.sql`** (Task 2) — recria
  `create_public_opportunity` (18 params, da definição VIVA) com `p_tempo`→`frequency_bucket`.
  Corrige regressão latente do formulário público (0011 mudou tempo→frequency_bucket).
- **`10-01-MIGRATION-HANDOFF.md`** (Task 2) — apply manual copy-paste + smoke.
- **`opportunity-risks-isolation.test.ts`** (Task 4) — `any`-casts removidos (tipos agora
  conhecem opportunity_risks); `tsc` limpo.

## Verificação
- `grep opportunity_risks/frequency_bucket/fte_horas` em database.types.ts → match.
- 0012 usa domínio de frequência (mapeamento executável sem 'pequeno/medio/grande').
- `npx tsc --noEmit` → 0 erros (gate final do 10-04).

## Deviations (importantes)
1. **Regeneração de tipos NÃO foi possível pelos caminhos do plano (D-04).** O MCP
   o MCP do Supabase aponta para OUTRO projeto (`yzjlhezmvdkwdhibyvwh`, sem as tabelas do CoE);
   `npm run gen:types` falha (conta sem privilégio em `vxgthycrjetniejsjmee`, sem
   SUPABASE_ACCESS_TOKEN). **Resolução:** os tipos foram derivados à mão do `0011.sql` e
   **verificados contra o catálogo vivo** via uma query de introspecção rodada pelo PO
   (information_schema/pg_catalog). O arquivo `database.types.ts` deste projeto **já era
   hand-maintained** (cabeçalho "ARQUIVO PROVISÓRIO escrito à mão"), então isso mantém o
   padrão. TODO: rodar `gen:types` quando houver token (deve ser no-op de verificação).
2. **A RPC viva tem 18 params, não 21** (o plano supôs 21 de `0009`). 0012 foi construída da
   definição viva (18 params), confirmada por `pg_get_functiondef`.

3. **Dois overloads descobertos no apply.** O smoke deu `42725 is not unique`: existiam
   overloads de 18 e 21 params (este com defaults, chamado pela app). 0012 foi **revisado**
   para dropar o de 18 e recriar o de 21 com `frequency_bucket`. Confirmado: 1 overload,
   sem cast `time_bucket`. Também corrigido `actions.ts` (`p_tempo: input.tempo ?? ''` em vez
   de `'medio'`) e os tipos (`create_public_opportunity` → 21 params).
