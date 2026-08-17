# Phase 10: Backend — Queries, Validação e Paridade de Score - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisões estão em `10-CONTEXT.md` — este log preserva as alternativas consideradas.

**Date:** 2026-06-04
**Phase:** 10-backend-queries-validation-score
**Areas discussed:** Paridade de Score (SCORE-04), Schema de input Zod, Escopo de opportunity_risks, Regeneração de tipos + testes legados

---

## Paridade de Score (SCORE-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Módulo único `lib/opportunities/score.ts` | Um `calcScore` compartilhado (ScorePreview + teste de paridade) verificado contra `opportunity_score()` numa tabela de casos | ✓ (via "Você decide" → recomendada) |
| Paridade contra o banco (skipIf) | Além do módulo, rodar a função SQL real e comparar linha-a-linha | ✓ (incorporada como 2º nível) |
| Você decide | Deixar a meu critério | ✓ (escolha do PO) |

**User's choice:** "Você decide" → travada a recomendada (módulo único) + nível 2 (teste SQL skipIf) por ser o mais robusto.
**Notes:** Achado-chave: `ScorePreview.tsx` tem a fórmula v0.1 obsoleta; `tests/schema/score-rule.test.ts` já tem a nova travada.

---

## Schema de input Zod

| Option | Description | Selected |
|--------|-------------|----------|
| Aditivo: novos campos, manter split | Adicionar campos novos + corrigir domínios; manter discriminatedUnion persona/formulário | ✓ (via "Você decide" → recomendada) |
| Reescrever para modelo único já | Colapsar split agora (antecipa P11) | |
| Você decide | Deixar a meu critério | ✓ (escolha do PO) |

**User's choice:** "Você decide" → travada a aditiva (não antecipar o wizard da P11).
**Notes:** `criterioEnum` uppercase→lowercase (D-08), `timeBucketEnum` duração→frequência.

---

## Escopo de opportunity_risks na P10

| Option | Description | Selected |
|--------|-------------|----------|
| Só tipos + validação Zod | `riskInputSchema` + tipos; CRUD fica na P12 | ✓ (via "Você decide" → recomendada) |
| Camada de dados completa | Tipos + Zod + queries + server actions; P12 vira UI pura | |
| Você decide | Deixar a meu critério | ✓ (escolha do PO) |

**User's choice:** "Você decide" → travada a mínima (tipos + Zod). CRUD de risco → Phase 12.
**Notes:** Satisfaz a dependência "validação" da P12; mantém P10 focada em SCORE-04.

---

## Regeneração de tipos + testes legados

| Option | Description | Selected |
|--------|-------------|----------|
| MCP Supabase + migrar testes | `generate_typescript_types` (MCP do Supabase) + migrar os ~7 testes legados | ✓ (via "Você decide" → recomendada) |
| `npm run gen:types` + migrar testes | CLI (ref já no `.env.local`) + migrar mesmos testes | ✓ (fallback) |
| Você decide | Deixar a meu critério | ✓ (escolha do PO) |

**User's choice:** "Você decide" → MCP como primário, `gen:types` como fallback; migrar todos os ~7 testes na fase.
**Notes:** Confirmar domínio de `p_tempo` da RPC `create_public_opportunity` antes de migrar os valores dos testes de public-form.

---

## Executor's Discretion

Todas as 4 áreas foram explicitamente delegadas pelo PO ("Você decide"). As direções recomendadas foram travadas no CONTEXT.md (D-01..D-04) com a flexibilidade residual registrada na seção "Executor's Discretion".

## Deferred Ideas

- CRUD de `opportunity_risks` → Phase 12
- Colapsar persona/formulário → Phase 11
- Thresholds `fte_horas`→bucket → Phase 11 / IA
- Destino do tenant `99999999` → decisão de dados (Phase 15 / limpeza dedicada)
