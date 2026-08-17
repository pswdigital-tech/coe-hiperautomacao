---
phase: 12-registro-riscos-modal
plan: 01
subsystem: api
tags: [supabase, server-actions, zod, rls, nextjs, risk-register]

# Dependency graph
requires:
  - phase: 09-schema-evolution-foundation
    provides: "tabela opportunity_risks + RLS (4 policies) + trigger set_risk_priority() (migration 0011)"
  - phase: 10-backend-queries-validation-score
    provides: "riskInputSchema (.strict()) + enums + tipos opportunity_risks em database.types.ts"
provides:
  - "fetchRisksForOpportunity(id) + fetchRiskById(riskId) — queries whitelisted de riscos"
  - "createRisk / updateRisk / deleteRisk — server actions ('use server') de mutação de risco"
  - "risk-labels.ts — mapas enum minúsculo → PT Title-Case + badges (tipo/prioridade) + sugestões de responsável"
  - "tipo OpportunityRisk + enums Risk* reexportados em types.ts"
affects: [12-02, "RiscoTab", "RiskForm", "RiskTable", phase-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Risk server actions modeladas em actions.ts: Zod safeParse → auth → tenant server-derived → enumeração explícita → revalidatePath"
    - "Query whitelisted RISK_COLUMNS (sem select('*')) espelhando OPPORTUNITY_COLUMNS"
    - "Módulo único de labels (enum DB → PT UI) type-safe via Record<Enum, string>"

key-files:
  created:
    - lib/opportunities/risk-actions.ts
    - lib/opportunities/risk-labels.ts
    - tests/security/risk-mass-assignment.test.ts
  modified:
    - lib/opportunities/queries.ts
    - lib/opportunities/types.ts

key-decisions:
  - "Ordenação dos riscos por created_at asc no DB; rank de severidade (critica>alta>media>baixa) fica no client em 12-02 (Pitfall 6: .order('priority') é alfabético, não semântico)"
  - "priority NUNCA no payload de insert/update — trigger set_risk_priority() (before insert OR update, 0011:294) é a única autoridade; updateRisk não faz nada de especial p/ recalcular"
  - "updateRisk/deleteRisk recebem opportunityId só para revalidatePath da rota do modal; escopo de tenant via .eq('tenant_id', profile.tenant_id) (defesa em profundidade sobre RLS)"
  - "PRIORITY_BADGE_CLASS hand-rolled em Tailwind (shadcn ausente no repo); cores: critica vermelho / alta laranja / media âmbar / baixa verde"

patterns-established:
  - "RISK_COLUMNS whitelist: padrão HARDEN-E-06 estendido a opportunity_risks"
  - "RiskActionResult / MutationResult: discriminated union { ok } com fieldErrors opcional, espelhando CreateOpportunityResult/UpdateOpportunityResult"

requirements-completed: [RISK-01, RISK-02, RISK-03]

# Metrics
duration: 5min
completed: 2026-06-05
---

# Phase 12 Plan 01: Camada de Dados e Mutação de Riscos Summary

**Query whitelisted + 3 server actions (create/update/deleteRisk) com tenant/opportunity_id server-derived e priority trigger-set, mais módulo único de labels enum→PT — toda a fiação de backend dos riscos sem UI.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-05T12:18:41Z
- **Completed:** 2026-06-05T12:23:53Z
- **Tasks:** 3
- **Files modified:** 5 (3 criados, 2 modificados)

## Accomplishments
- `fetchRisksForOpportunity(id)` + `fetchRiskById(riskId)` lendo `opportunity_risks` com whitelist `RISK_COLUMNS` (sem `select('*')`), incluindo `priority` trigger-set
- `createRisk` / `updateRisk` / `deleteRisk` em `'use server'`: validação `riskInputSchema.strict()`, `tenant_id`/`opportunity_id` server-derived, enumeração explícita de colunas (sem spread), `revalidatePath` nas três; `priority` nunca enviada
- `risk-labels.ts`: 5 mapas (TIPO/IMPACTO/PROBABILIDADE/STATUS/PRIORITY) enum minúsculo → PT Title-Case, badges emoji (🚧/⚠️/💡) + `PRIORITY_BADGE_CLASS` por cor, `RESPONSAVEL_SUGGESTIONS` (PSW/UnidaSul)
- Tipo `OpportunityRisk` + enums `Risk*` reexportados em `types.ts` para o front do Plan 12-02
- 15 asserts de mass-assignment para a camada de validação das actions; matriz de prioridade parity test confirmado verde (17 asserts)

## Task Commits

1. **Task 1: Query whitelisted + tipo OpportunityRisk** — `4fb21eb` (feat)
2. **Task 2 (TDD): Server actions create/update/delete de risco** — `26d22d0` (test/RED) → `e68b693` (feat/GREEN)
3. **Task 3: Módulo de labels + parity test confirmado** — `a9eb080` (feat)

**Plan metadata:** (final docs commit)

## Files Created/Modified
- `lib/opportunities/risk-actions.ts` — server actions createRisk/updateRisk/deleteRisk (Zod + tenant server-derived + revalidatePath; priority trigger-set)
- `lib/opportunities/risk-labels.ts` — labels enum→PT, badges, sugestões de responsável
- `tests/security/risk-mass-assignment.test.ts` — 15 asserts: priority/tenant_id/opportunity_id/id forjados rejeitados pelo `.strict()`
- `lib/opportunities/queries.ts` — `RISK_COLUMNS` + `fetchRisksForOpportunity` + `fetchRiskById`
- `lib/opportunities/types.ts` — `OpportunityRisk` + enums `RiskType/Impact/Probability/Status/Priority`

## Decisions Made
- **Ordenação por `created_at asc`** no DB (não `.order('priority')` — alfabético, não semântico; Pitfall 6). Rank de severidade fica no client em 12-02. Documentado no JSDoc de `fetchRisksForOpportunity`.
- **`priority` fora de todo payload** — trigger `set_risk_priority()` é `before insert OR update` (0011:294), então `updateRisk` não precisa de tratamento especial; editar impacto/probabilidade recalcula sozinho (RISK-02/03 são app-layer puro, sem migration).
- **Tipos via `Database['public']['Enums']['risk_*']`** em vez de redeclarar — fonte única, type-safe; `risk-labels.ts` usa `Record<Enum, string>` para que o TS force cobertura completa das chaves.
- **`PRIORITY_BADGE_CLASS` hand-rolled** (Tailwind), seguindo o padrão de overlays do repo (shadcn não instalado).

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

Task 2 (`tdd="true"`) seguiu RED→GREEN, mas com uma nuance documentada:

- **RED:** o teste (`tests/security/risk-mass-assignment.test.ts`, commit `26d22d0`) **passou imediatamente** ao ser escrito, porque exercita a camada de validação que as actions consomem — `riskInputSchema.strict()`, já entregue na Phase 10. Per o fail-fast rule, isso foi **investigado**: o comportamento de segurança sob teste (rejeição de `priority`/`tenant_id`/`opportunity_id`/`id`) realmente já existe no schema. Não é um teste mal-formado — é a 1ª linha de defesa mass-assignment das novas actions, legitimamente locked.
- **GREEN:** o artefato genuinamente novo — `risk-actions.ts` (insert/update/delete) — exige auth + Supabase real; seu teste é **integração-only** (`tests/security/opportunity-risks-isolation.test.ts`, 5 specs já existentes em modo skipIf, Wave 0 fechada na Phase 9). O repo **nunca mocka Supabase** (STATE.md: integração roda contra Postgres real). `risk-actions.ts` foi implementado (commit `e68b693`) e verificado por `tsc --noEmit` clean + acceptance greps + re-run do test (15/15 green).
- Gate commits presentes: `test(12-01)` (`26d22d0`) → `feat(12-01)` (`e68b693`). REFACTOR não necessário (código modela `actions.ts` 1:1).

## Issues Encountered
None. `gsd-sdk query` indisponível nesta máquina (binário global expõe só run/auto/init) — STATE.md/ROADMAP.md atualizados via edição direta e commit manual, conforme nota do prompt.

## Threat Surface
Nenhuma superfície de segurança nova fora do `<threat_model>` do plano. As mitigações T-12-01..05 foram todas implementadas:
- T-12-01/02 (tampering/priority forjado): `.strict()` + enumeração explícita + `priority` nunca no payload
- T-12-03 (info disclosure cross-tenant na leitura): RLS filtra; query não passa tenant_id
- T-12-04 (update/delete cross-tenant): `.eq('tenant_id', profile.tenant_id)` em ambas
- T-12-05 (select estrela): `RISK_COLUMNS` whitelist

## User Setup Required
None - no external service configuration required. (Tabela/RLS/trigger já aplicados na Phase 9, migration 0011.)

## Next Phase Readiness
- **Plan 12-02 desbloqueado:** consome `fetchRisksForOpportunity`/`fetchRiskById`, `createRisk`/`updateRisk`/`deleteRisk`, `OpportunityRisk` e todos os mapas de `risk-labels.ts`.
- Isolamento de tenant das risk-actions já tem spec (skipIf) — ativa quando `.env.test` apontar para projeto Cloud de teste.
- Nenhum blocker.

## Self-Check: PASSED

Todos os 6 arquivos (3 criados, 2 modificados, 1 SUMMARY) presentes em disco; todos os 4 commits de task (`4fb21eb`, `26d22d0`, `e68b693`, `a9eb080`) presentes no git log. `tsc --noEmit` clean; suite tests/security + tests/schema 78 passed / 32 skipped (integração skipIf) / 0 failed.

---
*Phase: 12-registro-riscos-modal*
*Completed: 2026-06-05*
