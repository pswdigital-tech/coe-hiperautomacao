# Plan 09-01 — Summary

**Plan:** Migration 0011 — schema evolution v0.2
**Status:** ✅ Complete — migration **APLICADA** no Supabase Cloud (2026-06-04, confirmada via dry-run transacional + apply real "applied" pelo PO). `gen:types` pendente (Phase 10 — falta `SUPABASE_PROJECT_REF`).
**Requirements:** MODEL-01..10, SCORE-01/02/03, RISK-04

## What was built

- **`supabase/migrations/0011_schema_evolution_v02.sql`** (idempotente, write-only) cobrindo:
  - Enums `frequency_bucket`, `fte_bucket` + 5 enums de risco.
  - `opportunities` +7 colunas (`fte_horas`, `fonte`, `tipo_processo[]`, `beneficio_qualitativo`, `criterios` jsonb, `beneficios` jsonb, `fte`) + `rpa_score` **GENERATED** (regra dos 6 indicadores, reproduz `_giba` 64/64; null p/ personas).
  - `tempo` migrado `time_bucket → frequency_bucket` (derivado de `frequencia`; ALTER guardado contra re-aplicação; view dropada antes).
  - `opportunity_score()` reescrita p/ 5 fatores (`_giba:483-490`); **old overload de 4 args dropado** (evita ambiguidade — deviation documentada abaixo).
  - Backfill FGCoop: `criterios` (coalesce resiliente p/ 'nao' — aguenta seq_id 18 sem `padronizacao_docs`), `beneficios` (6 chaves legadas), `fonte='FGCoop'`.
  - 2 CHECKs jsonb (`criterios` exato-8-chaves; `beneficios` subconjunto).
  - `opportunity_risks` (tenant_id + RLS + 4 policies + `priority` GENERATED da matriz + índices + trigger updated_at).
  - View `opportunities_with_score` recriada (5 args, `security_invoker=true`).
- **`09-MIGRATION-HANDOFF.md`** — passo a passo de apply (ênfase em atomicidade/paste único), 9 queries de verificação pós-apply, `gen:types`, rollback best-effort, opção de validar em branch.

## Key files
- Created: `supabase/migrations/0011_schema_evolution_v02.sql`, `.planning/phases/09-schema-evolution-foundation/09-MIGRATION-HANDOFF.md`

## Verification (file-level, pré-apply)
- 7 `create type`, 2 `generated always as`, 4 policies de `opportunity_risks`, score com 5 args + pesos `diario...20`, backfill resiliente, CHECKs guardados ✓ (todos os greps do plano passam)
- **Apply real ainda não feito** — é o checkpoint bloqueante.

## Deviations (5 — todas descobertas/corrigidas no apply, validadas por dry-run 11/11)
1. **Drop do overload antigo `opportunity_score(...,time_bucket,smallint)`** antes do create da nova assinatura de 5 args (evita overload órfão; a view, único dependente, já foi dropada no passo 3).
2. **CHECKs sem subquery** (Postgres `0A000`): a validação `jsonb_each`+`bool_and` da RESEARCH §5 é inválida em CHECK. Trocada por validação por-chave explícita (`?&` p/ presença + `in (...)` por chave; beneficios valida range por chave conhecida).
3. **`opportunity_risks.priority` via TRIGGER, não GENERATED** (Postgres `42P17`): qualquer cast de enum (`enum_in` E `enum_out`) é tratado como não-imutável → coluna GENERATED rejeitada. `set_risk_priority()` BEFORE INSERT/UPDATE sempre sobrescreve `new.priority` (mesma garantia "nunca manual", padrão do seq_id em 0006). priority volta a ser enum `risk_priority`.
4. **Backfill de `fonte` escopado ao tenant FGCoop** (`11111111-…`): o banco tinha 33 oportunidades, 4 de um tenant distinto (`99999999-…`); o `update` cego carimbaria 'FGCoop' neles. Escopado → 29 (validado). Os 4 do tenant 9999 ficam `fonte` NULL.
5. **2 valores de `frequencia` mapeados** (`eventual`→`anual`, `5 vezes por dia`→`diario`) para zerar `tempo` NULL em formulário.

## Validação (dry-run transacional begin/rollback contra dados reais)
11/11 checks: criterios_null=0, padronizacaoDocs_fora_dominio=0, formulario_tempo_null=0, fonte_FGCoop=29, risk_policies=4, tempo_type=frequency_bucket, score=100/36, rpa_score max=6, trigger alto×provavel=critica, trigger moderado×remota=baixa. Depois aplicada pra valer.

## Pending (Phase 10, não bloqueia)
- `npm run gen:types` (precisa de `SUPABASE_PROJECT_REF`) — vai trocar `tempo` p/ frequency_bucket nos tipos e quebrar o typecheck dos 7 testes com `tempo:'medio'` (corrigir junto na Phase 10) + permitir remover os `any`-casts do teste de riscos.
- Decidir destino do tenant `99999999` (4 rows, ≥1 de teste `dev coe`).

## Self-Check: PASSED — migration aplicada e validada
