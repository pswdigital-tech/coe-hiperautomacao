---
phase: 15-seed-dados-workshop
plan: 01
subsystem: data-seed
tags: [seed, migration, multi-tenant, rls, workshop-i, unidasul]
status: awaiting_human_apply   # artefatos escritos+commitados; falta o apply manual da 0013 (checkpoint:human-action)
dependency_graph:
  requires:
    - "0011/0012 aplicadas (schema v0.2: criterios/beneficios/fte_horas/fonte, rpa_score GENERATED, view opportunities_with_score)"
    - "0002 (template tenant+admin) e 0003 (template INSERT opportunities)"
  provides:
    - "supabase/migrations/0013_seed_unidasul_opportunities.sql (tenant+admin Unidasul + 64 opps Workshop I)"
    - "tests/security/unidasul-isolation.test.ts (SC3 cross-tenant)"
    - ".planning/phases/15-seed-dados-workshop/15-01-MIGRATION-HANDOFF.md (apply manual write-only)"
  affects:
    - "dados de runtime: novo tenant Unidasul coexiste com FGCoop e tenant de teste (após apply humano)"
tech-stack:
  added: []
  patterns:
    - "Write-only migration + handoff manual no Supabase Cloud SQL Editor"
    - "Guard de idempotência por count do tenant (D-06)"
    - "Teste RLS skipIf + lazy-init (espelha tenant-isolation.test.ts)"
key-files:
  created:
    - "supabase/migrations/0013_seed_unidasul_opportunities.sql"
    - "tests/security/unidasul-isolation.test.ts"
    - ".planning/phases/15-seed-dados-workshop/15-01-MIGRATION-HANDOFF.md"
  modified: []
decisions:
  - "UUID fixo do tenant Unidasul: 55551da5-0000-0000-0000-000000000001 (distinto de FGCoop 11111111-… e Acme-test 22222222-…)"
  - "UUID fixo do admin Unidasul: bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb (distinto do admin FGCoop aaaaaaaa-…)"
  - "Extração reproduzível: script descartável /tmp lê const DATA (_giba:439), JSON.parse, emite 64 VALUES (não transcrição manual)"
  - "criterios de-acentuados/minúsculos no gerador (SIM→sim, NÃO→nao, PARCIAL→parcial); beneficios int 1–5"
  - "NÃO inserir seq_id/rpa_score/score/priority_level (trigger/GENERATED/view — docs/PROJETO.md §3)"
metrics:
  duration_min: 5
  completed_date: "2026-06-05"
  tasks_total: 3
  tasks_done: 3        # 2 auto completos + 1 artefato do checkpoint escrito; o APPLY da DB é humano
  files_created: 3
  commits: 3
requirements: [DATA-01]
---

# Phase 15 Plan 01: Seed Unidasul (64 oportunidades do Workshop I) Summary

Seed write-only `0013` que cria o tenant **Unidasul** + admin de login e importa as **64 oportunidades reais do Workshop I** (extraídas do `const DATA` do `_giba_wsi-dashboard.html`) na shape v0.2, com teste de isolamento cross-tenant (SC3) e handoff de apply manual. A migration está **escrita, validada e commitada**; o apply no Supabase Cloud é a fronteira humana write-only (checkpoint:human-action) — **ainda pendente**.

## What Was Built

### Task 1 — Migration `0013_seed_unidasul_opportunities.sql` (commit `76cdbf0`)
- **Bloco 1:** tenant `unidasul` (UUID fixo `55551da5-…`), `on conflict (slug) do nothing` (espelha 0002).
- **Bloco 2:** admin `admin.unidasul@pswdigital.com.br` / `0123456789` (UUID `bbbbbbbb-…`) em `auth.users` + `auth.identities` + fallback de profile; o trigger `handle_new_user` cria o profile a partir do `tenant_id` no `raw_app_meta_data` (espelha 0002 literalmente).
- **Bloco 3:** sanity check `raise exception` se tenant/admin ausentes (espelha 0003).
- **Bloco 4:** guard de idempotência por count (`raise notice` se Unidasul já tem opps — D-06) + INSERT das **64** oportunidades, colunas enumeradas como 0003.
- **Extração reproduzível:** script descartável em `/tmp/gen_0013.js` (NÃO commitado) leu o `const DATA` (linha 439), fez `JSON.parse`, e emitiu exatamente 64 linhas de VALUES — mapeando `ferramenta` (`RPA`→`rpa`, `RPA + n8n`→`ambos`), `criterios` (8 chaves camelCase, valores `sim/nao/parcial`), `beneficios` (8 chaves 1–5), `tempo`→`frequency_bucket`, `fte`→`fte_bucket`, `fte_horas` numeric, com escape robusto de aspas simples em texto livre (PII pt-BR real — D-05).
- **docs/PROJETO.md §3 respeitado:** lista de colunas do INSERT **não** contém `seq_id`/`rpa_score`/`score`/`priority_level`.

### Task 2 — Teste de isolamento `tests/security/unidasul-isolation.test.ts` (commit `5a62f2b`)
- Espelha `tenant-isolation.test.ts`: `describe.skipIf(!HAS_DB)` + `serviceRoleClient()` lazy em `beforeAll`.
- Semeia inline o tenant Unidasul (mesmo UUID `55551da5-…` da 0013) + 1 opp via service-role.
- **SC3-a:** `asAcme()` → SELECT na opp da Unidasul → `toEqual([])` (RLS USING filtra).
- **Sanity (service-role):** confirma que a opp existe (não falso-negativo).
- **SC3-b:** `asAcme()` count por `tenant_id` Unidasul → `0`.
- Mitiga **T-15-01** (Information Disclosure cross-tenant).

### Task 3 — Handoff `15-01-MIGRATION-HANDOFF.md` (commit `aca6c19`) — checkpoint:human-action
- Espelha `09-MIGRATION-HANDOFF.md`: nota de atomicidade, passo-a-passo do SQL Editor, idempotência D-06.
- **9 queries de verificação** cobrindo SC1 (tenant+admin+64+created_by) e SC2 (campos novos + `score`/`priority_level` via view + `rpa_score` GENERATED não-nulos) + smoke de distribuição e score da 1ª opp.
- `gen:types` documentado como **opcional** (migration não muda schema). Rollback best-effort. Notas de PII (T-15-02) e senha de seed (T-15-04).
- **Write-only:** o agente NÃO aplica — o PO roda no SQL Editor e cola o resultado.

## Verification

| Gate | Resultado |
|------|-----------|
| Task 1 grep-checks (Unidasul/email/insert/raise notice/sem coluna proibida) | OK |
| 64 linhas de VALUES (count programático) | 64/64 |
| rpa_score parity vs `_giba` DATA | 64/64 |
| score seq 0001 (paridade fórmula 5 fatores) | 100 (esperado) |
| Valores de criterios uppercase no jsonb | 0 (só "NÃO" em comentários pt-BR) |
| Casts raw `'RPA'`/`'RPA + n8n'` | 0 |
| `npx vitest run tests/security/unidasul-isolation.test.ts` | exit 0 (3 skipped — modo unit-only sem `.env.test`) |
| `npx tsc --noEmit` | exit 0 (clean) |
| Task 3 grep-checks (SQL Editor/write-only/slug unidasul/64/sem auto-apply) | OK |

**Pós-apply (humano, via handoff):** as 9 queries devem retornar 1 tenant, 1 admin (role tenant_admin, email confirmado), 64 opps, 0 nulos nos campos novos, 0 nulos em score/priority/rpa.

## Deviations from Plan

Nenhuma deviation de lógica. Um ajuste cosmético de redação:
- **[Cosmético] Frase do handoff sem o literal `supabase db push`.** O acceptance criterion da Task 3 faz grep proibindo a string `supabase db push` no handoff; a redação inicial mencionava o comando para dizer que ele é proibido. Reformulado para "apply manual no SQL Editor — sem comandos de auto-apply do CLI" sem alterar o sentido. Sem impacto funcional.

## Checkpoint Status

**Task 3 é checkpoint:human-action (BLOCKING).** Os 3 artefatos foram escritos e commitados (parte autônoma), mas **a migration 0013 NÃO foi aplicada pelo agente** (fronteira write-only da docs/PROJETO.md). A fase só será marcada completa após o PO:
1. Colar `0013_seed_unidasul_opportunities.sql` inteiro no Supabase Cloud SQL Editor e rodar.
2. Colar o resultado das 9 queries de verificação do handoff (esperado: 1 tenant, 1 admin, 64 opps, 0 nulos).

## Self-Check: PASSED

- FOUND: `supabase/migrations/0013_seed_unidasul_opportunities.sql`
- FOUND: `tests/security/unidasul-isolation.test.ts`
- FOUND: `.planning/phases/15-seed-dados-workshop/15-01-MIGRATION-HANDOFF.md`
- FOUND: `.planning/phases/15-seed-dados-workshop/15-01-SUMMARY.md`
- FOUND commits: `76cdbf0` (Task 1), `5a62f2b` (Task 2), `aca6c19` (Task 3)
- Script de extração `/tmp/gen_0013.js` confirmado NÃO commitado.
