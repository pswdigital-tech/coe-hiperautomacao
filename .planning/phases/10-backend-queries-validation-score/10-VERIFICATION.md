---
phase: 10-backend-queries-validation-score
verified: 2026-06-04T19:30:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 10: Backend — Queries, Validação e Paridade de Score Verification Report

**Phase Goal:** A camada de aplicação (queries de leitura, server actions de mutação, Zod schema e tipos gerados) cobre o novo modelo, e o preview de score exibido no cliente é idêntico ao calculado no backend.
**Verified:** 2026-06-04T19:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth (ROADMAP SC) | Status | Evidence |
| --- | ------------------ | ------ | -------- |
| SC1 | Tipos expõem novos campos + `opportunity_risks`; queries usam whitelist (sem `select('*')`) | ✓ VERIFIED | `lib/database.types.ts` (502 ln) tem `opportunity_risks` Table (L362) + Insert/Update/Relationships; todos os novos campos presentes (fte_horas, fonte, tipo_processo, beneficio_qualitativo, criterios, beneficios, fte, rpa_score) + enums frequency_bucket/fte_bucket. `OPPORTUNITY_COLUMNS` (queries.ts L23) inclui os 8 novos campos; nenhum `select('*')` (apenas comentário descritivo na L15) |
| SC2 | `opportunityInputSchema` aditivo, valida novos campos, rejeita não reconhecidos (anti mass-assignment) | ✓ VERIFIED | schema.ts: `frequencyEnum`(L47), `fteBucketEnum`(L49), `criterioEnum` minúsculo sim/nao/parcial (L51), `discriminatedUnion('source')`(L287) com `.strict()` por variant (L293,299), tempo=frequencyEnum (L201), 8 criterios + prioridade_fte (L243-254), fte_horas (L226). rpa_score/score/priority NÃO no input (comentário L225). Test mass-assignment.test.ts (18 tests) prova unrecognized_keys |
| SC3 (SCORE-04) | Preview do cliente == `opportunity_score()` backend, provado por teste de paridade | ✓ VERIFIED | `lib/opportunities/score.ts` (50 ln) — módulo único cliente-safe, sem server-only/'use server'; calcScore replica literal _giba:483-490 (ef/cx/tm/ob/ft + fallbacks). ScorePreview.tsx importa de `@/lib/opportunities/score` (L3), sem fórmula local. score-parity.test.ts: nível 1 puro (casos 100/88/59/36/67 incl. armadilha 88) + nível 2 `describe.skipIf` vs RPC opportunity_score. Paridade LIVE confirmada pelo usuário (5 casos batem) |
| SC4 (MODEL-10) | Schema permanece compatível com enrichment IA; campos preenchíveis manual/IA depois | ✓ VERIFIED | `10-04-AI-COMPAT.md` (59 ln) documenta read-set inalterado de enrichOpportunity (não lê campos novos) + write-set 8 campos + KNOWN ISSUE REALIGN-7.6. enrichment.ts NÃO sobrescreve `tempo` (comentário L154-158); tipos novos não quebram assinatura |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/database.types.ts` | opportunity_risks + novos campos + enums | ✓ VERIFIED | 502 ln; hand-derived de 0011 e validado vs catálogo vivo (per context). Substantivo, wired (consumido por queries.ts/actions.ts) |
| `supabase/migrations/0012_public_rpc_frequency.sql` | RPC create_public_opportunity p_tempo→frequency_bucket | ✓ VERIFIED | Único overload 21 params (L37), drop do overload 18-params (L31), cast frequency_bucket (L198), sem time_bucket. Aplicado no Cloud (per context) |
| `lib/opportunities/score.ts` | calcScore + priorityLevel (5 fatores) | ✓ VERIFIED | Exporta ambos; fórmula literal _giba; cliente-safe; WIRED por ScorePreview + teste |
| `lib/opportunities/schema.ts` | input aditivo, domínios corrigidos, mass-assignment | ✓ VERIFIED | WIRED por actions.ts safeParse (L301,426) |
| `lib/opportunities/risk-schema.ts` | riskInputSchema .strict() sem priority | ✓ VERIFIED | 46 ln; `.strict()` (L44); priority é GENERATED (comentário L11); enums tipo/impacto/probabilidade/status + responsavel text livre |
| `lib/opportunities/queries.ts` | OPPORTUNITY_COLUMNS ampliada | ✓ VERIFIED | Whitelist com novos campos (L23-37); WIRED em fetchOpportunities (L56) e single-fetch (L140) |
| `tests/schema/score-parity.test.ts` | paridade 2 níveis | ✓ VERIFIED | 89 ln; describe.skipIf + casos canônicos |
| `10-04-AI-COMPAT.md` | MODEL-10/SC4 verificação | ✓ VERIFIED | 59 ln; cobre read-set + REALIGN-7.6 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| ScorePreview.tsx | lib/opportunities/score.ts | import calcScore/priorityLevel | ✓ WIRED | L3 import; L15-17 uso; sem fórmula local |
| score-parity.test.ts | opportunity_score() | rpc sob skipIf | ✓ WIRED | Nível 2 chama sb.rpc('opportunity_score') |
| queries.ts | opportunities_with_score (novos campos) | OPPORTUNITY_COLUMNS whitelist | ✓ WIRED | criterios/beneficios/fte/rpa_score na string |
| actions.ts | opportunityInputSchema | safeParse | ✓ WIRED | L301 create, L426 update |
| 0012.sql | opportunities.tempo | cast p_tempo::frequency_bucket | ✓ WIRED | L198 |
| public-form.test.ts | create_public_opportunity (0012) | p_tempo frequência | ✓ WIRED | (skipped em unit-only; alinhado à RPC) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Type safety | `npx tsc --noEmit` | exit 0, 0 errors | ✓ PASS |
| Full suite | `npx vitest run` | 109 passed, 0 failed, 32 skipped (integration unit-only) | ✓ PASS |
| Score parity (pure) | score-parity.test.ts nível 1 | 6 tests incl. armadilha (baixo,baixo,diario,5,muito_alto)=88 | ✓ PASS |
| Mass-assignment | mass-assignment.test.ts | 18 tests, unrecognized_keys rejeitados | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SCORE-04 | 10-01/02/03/04 | Preview de score no wizard usa a mesma fórmula do backend | ✓ SATISFIED | Módulo único score.ts; ScorePreview sem fórmula local; teste paridade puro + skipIf SQL; paridade LIVE confirmada (5 casos) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| lib/ai/schema.ts | 31 | `tempo` no domínio antigo (duração) gerado pela IA | ℹ️ Info | KNOWN ISSUE REALIGN-7.6, documentado em 10-04-AI-COMPAT.md; mitigado — enrichment NÃO sobrescreve tempo. Deferido para Phase 7.6 realign |

Nenhum blocker. O ScoreTab.tsx do modal usa um widget de breakdown de 3 fatores próprio (EFFORT_VALUES 25/15/5) distinto do preview SCORE-04 de 5 fatores — fora do escopo da paridade, mas o domínio de `tempo` (TIME_VALUES diario/semanal/...) está corretamente migrado para frequência (cascade fix real).

### Cascade Fixes (descobertos durante execução)

| File | Fix | Status |
| ---- | --- | ------ |
| components/opportunities/modal/tabs/ScoreTab.tsx | TIME_VALUES no domínio de frequência | ✓ Real |
| components/opportunities/wizard/state.ts | tempo opcional (output de IA/priorização) | ✓ Real |
| components/opportunities/wizard/steps/PriorizacaoStep.tsx | tempo no domínio frequência (diario..anual) | ✓ Real |
| lib/ai/enrichment.ts | NÃO escreve tempo (REALIGN-7.6) | ✓ Real |

### Human Verification Required

Nenhum. Toda a fase é backend/validação/testes verificável programaticamente; a paridade LIVE de score já foi confirmada pelo usuário contra o backend.

### Gaps Summary

Nenhum gap. Os 4 success criteria do ROADMAP e todos os must_haves dos 4 planos estão verificados no código real:
- SC1: tipos + whitelist confirmados no arquivo (não só na summary).
- SC2: schema aditivo com domínios corrigidos e mass-assignment preservado (.strict por variant + 18 tests verdes).
- SC3 (SCORE-04): módulo único, ScorePreview reescrito sem fórmula local, teste de paridade 2 níveis, paridade LIVE confirmada.
- SC4 (MODEL-10): read-set inalterado e known-issue documentado.
- tsc 0 erros, vitest 109 passed / 0 failed. Specs de integração skipped em modo unit-only (esperado e aceitável).

---

_Verified: 2026-06-04T19:30:00Z_
_Verifier: agente gsd-verifier_
