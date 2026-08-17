---
phase: 16
slug: tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: true
wave_0_complete: true   # não há Wave 0 nesta fase — vitest e todos os helpers já existem
created: 2026-08-04
planned: 2026-08-04
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by `/gsd-plan-phase`. The planner fills the Per-Task Verification Map
> and the Wave 0 / Manual-Only sections while writing the PLAN.md files.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (`vitest.config.ts` at repo root) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/schema tests/opportunities` |
| **Full suite command** | `npm test` |
| **Typecheck** | `npm run typecheck` (`tsc --noEmit`) — mandatory alongside tests, `lib/database.types.ts` is hand-edited this phase |
| **Estimated runtime** | ~20–40s full suite (baseline: 148 passed / 32 skipped at end of Phase 13) |

**Existing suites relevant to this phase:** `tests/schema/` (pure rule tests +
`skipIf`-guarded live-SQL tests), `tests/security/` (cross-tenant isolation,
mass-assignment defense), `tests/opportunities/`, `tests/helpers/`,
`tests/setup/`.

---

## Sampling Rate

- **After every task commit:** `npm run typecheck` + `npx vitest run tests/schema tests/opportunities`
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** full suite green + `npm run typecheck` exit 0
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

*Filled by `gsd-planner` (2026-08-04) — one row per task across os 7 PLAN.md desta fase.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-T1 | 16-01 | 1 | TASK-01, TASK-02, TASK-03, TASK-04 | T-16-01…06 | Tabela com RLS e 4 policies, gate de escrita "todos menos viewer", 2 triggers de guarda, CHECK de motivo de bloqueio, zero colunas derivadas | source assertion | gate `bash` inline no `<verify>` da task (14 colunas, 4 policies, gate D-11, `is_platform_admin`, `security definer`, guards de idempotência) | ➕ cria `supabase/migrations/0037_opportunity_tasks.sql` | ⬜ pending |
| 16-01-T2 | 16-01 | 1 | TASK-01, TASK-04 | T-16-02 | Tipos hand-maintained refletem exatamente as 14 colunas; nenhum campo derivado no `Row` | typecheck + source | `npm run typecheck` + gate `bash` inline | ✏️ edita `lib/database.types.ts`, `lib/opportunities/types.ts` | ⬜ pending |
| 16-01-T3 | 16-01 | 1 | TASK-01…TASK-04 | T-16-01 | Apply verificado no Cloud + prova de idempotência (rodar duas vezes) | manual (checkpoint bloqueante) | gate `bash` do handoff + roteiro humano de 8 verificações | ➕ cria `16-01-MIGRATION-HANDOFF.md` | ⬜ pending |
| 16-02-T1 | 16-02 | 2 | TASK-01, TASK-04, TASK-05 | T-16-02, T-16-05, T-16-06, T-16-08 | Zod `.strict()`, motivo condicional, tenant derivado no servidor, whitelist de colunas | unit | `npx vitest run tests/schema/task-schema.test.ts` | ➕ cria `tests/schema/task-schema.test.ts` | ⬜ pending |
| 16-02-T2 | 16-02 | 2 | TASK-03, TASK-05 | T-16-03, T-16-05 | Rota de criação redireciona viewer; select de responsável só do tenant da oportunidade | typecheck + source | `npm run typecheck` + gate `bash` inline | ✔️ usa `tests/schema/task-schema.test.ts` (16-02-T1) | ⬜ pending |
| 16-02-T3 | 16-02 | 2 | TASK-01, TASK-05 | T-16-07 | Oportunidade invisível vira página não encontrada; Lista consome só o retorno RLS-escopado | typecheck + suíte + source | `npm run typecheck && npm test` + gate `bash` inline | ✔️ suíte existente | ⬜ pending |
| 16-03-T1 | 16-03 | 2 | TASK-02, TASK-03 | T-16-03, T-16-04 | Banco rejeita 3º nível por INSERT e por UPDATE de re-parentamento; rejeita responsável de outro tenant | integration (skipIf) | `npx vitest run tests/schema/task-depth-guard.test.ts tests/schema/task-tenant-coherence.test.ts` | ➕ cria os dois arquivos | ⬜ pending |
| 16-03-T2 | 16-03 | 2 | TASK-04 | T-16-01, T-16-02 | Tenant A não lê, não edita e não remove tarefas do tenant B; INSERT com tenant forjado é rejeitado | integration (skipIf) | `npx vitest run tests/security/opportunity-tasks-isolation.test.ts` | ➕ cria o arquivo | ⬜ pending |
| 16-03-T3 | 16-03 | 2 | TASK-04 | T-16-05 | Papel viewer não escreve; papel member escreve | integration (skipIf) | `npx vitest run tests/security/opportunity-tasks-viewer-write.test.ts` | ➕ cria o arquivo | ⬜ pending |
| 16-04-T1 | 16-04 | 3 | TASK-11 | T-16-10 | Rollup é função pura, sem I/O, e nada dele é persistido | unit | `npx vitest run tests/schema/task-rollup.test.ts` | ➕ cria o arquivo | ⬜ pending |
| 16-04-T2 | 16-04 | 3 | TASK-07, TASK-11 | T-16-01, T-16-11 | Expansão por tarefa (nunca global); agregados calculados na renderização | typecheck + suíte + source | `npm run typecheck && npm test` + gate `bash` inline (`aria-expanded`, `computeTaskRollup`) | ✔️ usa `tests/schema/task-rollup.test.ts` | ⬜ pending |
| 16-05-T1 | 16-05 | 4 | TASK-06 | T-16-02, T-16-05, T-16-06 | Normalização única de status/motivo; escopo por tenant nas mutações | unit | `npx vitest run tests/opportunities/task-actions.test.ts` | ➕ cria o arquivo | ⬜ pending |
| 16-05-T2 | 16-05 | 4 | TASK-06 | T-16-12, T-16-13 | Confirmação de exclusão nomeia a cascata; erro de mutação sempre genérico em pt-BR | typecheck + source | `npm run typecheck` + gate `bash` inline (`childCount`, preservação do parâmetro de view) | ✔️ usa `tests/opportunities/task-actions.test.ts` | ⬜ pending |
| 16-05-T3 | 16-05 | 4 | TASK-03, TASK-05, TASK-06 | T-16-04, T-16-05, T-16-07 | Deep-links escopados por RLS; viewer redirecionado; subtarefa de subtarefa recusada na rota | typecheck + suíte + source | `npm run typecheck && npm test` + gate `bash` inline | ✔️ suíte existente | ⬜ pending |
| 16-06-T1 | 16-06 | 5 | TASK-09 | T-16-06, T-16-15 | Nenhuma mutação otimista antes de o motivo ser confirmado; cancelar não produz efeito | unit | `npx vitest run tests/opportunities/task-kanban-drop.test.ts` | ➕ cria o arquivo | ⬜ pending |
| 16-06-T2 | 16-06 | 5 | TASK-08, TASK-09 | T-16-05, T-16-14 | Motivo visível no card; caminho de teclado equivalente ao arraste; arraste desabilitado para viewer | typecheck + source | `npm run typecheck` + gate `bash` inline (`blocked_reason`, `aria-busy`) | ✔️ usa `tests/opportunities/task-kanban-drop.test.ts` | ⬜ pending |
| 16-06-T3 | 16-06 | 5 | TASK-08 | T-16-16 | Parâmetro de view com fallback seguro; exatamente uma busca de tarefas por render | typecheck + suíte + source | `npm run typecheck && npm test` + gate `bash` inline | ✔️ suíte existente | ⬜ pending |
| 16-07-T1 | 16-07 | 6 | TASK-10 | T-16-17 | Domínio temporal invariante ao estado de expansão; sem divisão por intervalo degenerado | unit | `npx vitest run tests/opportunities/task-gantt-domain.test.ts` | ➕ cria o arquivo | ⬜ pending |
| 16-07-T2 | 16-07 | 6 | TASK-10, TASK-11 | T-16-10, T-16-SC | Rollup como fonte única na barra da pai; nenhuma dependência de Gantt adicionada | typecheck + suíte + source | `npm run typecheck && npm test` + gate `bash` inline (`computeTaskRollup`, `package.json` sem lib de Gantt) | ✔️ usa `tests/opportunities/task-gantt-domain.test.ts` | ⬜ pending |
| 16-07-T3 | 16-07 | 6 | TASK-08, TASK-09, TASK-10, TASK-11 | T-16-01 | Roteiro manual das 3 views, do fluxo de bloqueio e da contenção responsiva | manual (checkpoint bloqueante) | `npm run typecheck && npm test` como gate técnico + roteiro humano de 6 passos | ✔️ suíte existente | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Continuidade de amostragem:** nenhuma sequência de 3 tasks consecutivas fica sem
comando automatizado — todas as 20 tasks têm ao menos `npm run typecheck` ou um
`npx vitest run` específico no seu `<verify>`. Nenhum comando de modo watch
aparece em nenhum plano.

---

## Non-negotiable verifications for this phase

*Mapeamento planner → task (2026-08-04):*

| # | Verificação | Task | Comando |
|---|-------------|------|---------|
| 1 | TASK-04 — isolamento cross-tenant | 16-03-T2 | `npx vitest run tests/security/opportunity-tasks-isolation.test.ts` |
| 2 | TASK-02 — 2 níveis garantidos pelo banco (INSERT **e** UPDATE) | 16-03-T1 | `npx vitest run tests/schema/task-depth-guard.test.ts` |
| 3 | TASK-03 — coerência de tenant do responsável no banco | 16-03-T1 | `npx vitest run tests/schema/task-tenant-coherence.test.ts` |
| 4 | TASK-11 — rollup derivado, nunca persistido | 16-04-T1 (+ 16-01-T1 para a ausência de coluna) | `npx vitest run tests/schema/task-rollup.test.ts` |
| 5 | D-11 — autorização de escrita (viewer bloqueado, member liberado) | 16-03-T3 | `npx vitest run tests/security/opportunity-tasks-viewer-write.test.ts` |
| 6 | Regra condicional do motivo de bloqueio (Zod) | 16-02-T1 (+ 16-05-T1 para a normalização na action) | `npx vitest run tests/schema/task-schema.test.ts` |

These are required regardless of how the planner slices the work:

1. **TASK-04 — cross-tenant isolation.** A test proving tenant A cannot read,
   update or delete tenant B's `opportunity_tasks` rows. Must follow the
   existing `skipIf` credential-guard pattern in `tests/security/` so it degrades
   to *skipped*, never *failed*, when live Supabase credentials are absent.
2. **TASK-02 — 2-level hierarchy enforced by the database.** A test proving the
   DB itself (not the UI) rejects (a) inserting a child under a row that already
   has a `parent_task_id`, and (b) re-parenting via UPDATE to create a 3rd level.
3. **TASK-03 — assignee tenant coherence enforced by the database.** A test
   proving the DB rejects an `assignee_id` whose profile belongs to another
   tenant, mirroring the trigger already shipped in migration `0032`.
4. **TASK-11 — rollup is derived, never persisted.** A pure unit test of the
   rollup function covering: parent with zero subtasks, parent with subtasks
   missing dates, all-complete, none-complete, and partial. Plus an assertion
   that no persisted column carries span or progress.
5. **D-11 — write authorization.** A test that a `viewer` cannot write to
   `opportunity_tasks` while a `member` can.
6. **`blocked_reason` conditional rule** — a Zod-level test that
   `status = 'bloqueio'` without a reason is rejected, and that the reason is
   not required for the other three statuses.

---

## Wave 0 Requirements

*Confirmado pelo `gsd-planner` (2026-08-04):* **não existe Wave 0 nesta fase.**

A leitura preliminar se confirmou e vai um passo além:

- **Nenhuma instalação de framework.** Vitest 3.2.x já está configurado
  (`vitest.config.ts`, pool de forks serializado), e `tests/schema/`,
  `tests/security/` e `tests/opportunities/` já existem.
- **Nenhum fixture compartilhado novo.** `tests/setup/seed-test-tenants.ts`,
  `tests/setup/supabase-test-client.ts` e `tests/helpers/auth-as.ts` cobrem
  tudo o que os testes desta fase precisam; a semeadura de uma árvore de
  tarefas é local ao `beforeAll` de cada arquivo, exatamente como
  `opportunity-risks-isolation.test.ts` faz hoje. Nenhum helper novo é criado.
- **Nenhuma referência `MISSING` nos `<verify>`.** Cada um dos 6 arquivos de
  teste novos é criado pela **mesma task** cujo `<verify>` o executa, ou por
  uma task anterior do mesmo plano — nunca por uma wave posterior. Por isso
  nenhum `<automated>` desta fase precisou ser marcado como pendente de Wave 0.

**Arquivos de teste criados durante a fase (e por quem):**

| Arquivo | Criado em | Cobre |
|---------|-----------|-------|
| `tests/schema/task-schema.test.ts` | 16-02-T1 | TASK-01/05, D-03 (motivo condicional), mass assignment |
| `tests/schema/task-depth-guard.test.ts` | 16-03-T1 | TASK-02, D-01, Pitfall 1 |
| `tests/schema/task-tenant-coherence.test.ts` | 16-03-T1 | TASK-03, D-04 |
| `tests/security/opportunity-tasks-isolation.test.ts` | 16-03-T2 | TASK-04 |
| `tests/security/opportunity-tasks-viewer-write.test.ts` | 16-03-T3 | D-11 |
| `tests/schema/task-rollup.test.ts` | 16-04-T1 | TASK-11, D-02 |
| `tests/opportunities/task-actions.test.ts` | 16-05-T1 | Pitfall 4 (limpeza do motivo) |
| `tests/opportunities/task-kanban-drop.test.ts` | 16-06-T1 | TASK-09 (interceptação do bloqueio) |
| `tests/opportunities/task-gantt-domain.test.ts` | 16-07-T1 | TASK-10, Pitfall 3 (eixo estável) |

**Não criar** `tests/schema/task-rollup-parity.test.ts`: o rollup não tem função
SQL espelho (RESEARCH Pattern 3 / D-02), então não há paridade a testar.

---

## Manual-Only Verifications

| Behavior | Requirement | Task | Why Manual | Test Instructions | Resultado |
|----------|-------------|------|------------|-------------------|-----------|
| Applying migration `0037` to Supabase Cloud | TASK-01…TASK-04 | **16-01-T3** | Project runs **write-only mode** — migrations are committed as files and applied by hand in the Supabase SQL Editor; no CI applies them | Open Supabase SQL Editor, run `supabase/migrations/0037_opportunity_tasks.sql`, confirm idempotency by running twice, then run the 8 checks in `16-01-MIGRATION-HANDOFF.md` | ⬜ pending |
| Kanban drag-and-drop, incl. the Bloqueio reason prompt and its cancel/rollback | TASK-08, TASK-09 | **16-07-T3** (passos 3 e 4) | Pointer-driven dnd-kit interaction | Drag a card to Bloqueio → prompt appears **before** the card moves → cancel → card returns to its original column with no persisted change; then confirm with a reason and check the reason box on the card; move it out of Bloqueio and back, confirming the old reason does not reappear; repeat the transition via the keyboard status control | ⬜ pending |
| Gantt visual layout at 2 levels (parent span + fill, expand/collapse) | TASK-10, TASK-11 | **16-07-T3** (passo 5) | Visual/proportional correctness | Open `/opportunities/[id]/tarefas?view=gantt`, expand a parent, confirm the parent bar spans min-start→max-due of its children with a proportional progress fill, that **no other bar shifts** when expanding, and that an undated task still renders as a row | ⬜ pending |
| Narrow-viewport containment of Gantt/Kanban | UI-SPEC | **16-07-T3** (passo 6) | Responsive/visual | Resize below the breakpoint; the wide view scrolls inside its own container and the page body never scrolls horizontally | ⬜ pending |

---

## Validation Sign-Off

*Marcado pelo `gsd-planner` no fechamento do planejamento (2026-08-04). Os itens
de execução — resultado real dos comandos — são preenchidos durante
`/gsd-execute-phase` e confirmados por `/gsd-validate-phase`.*

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — as 20 tasks têm `<automated>`; nenhuma referência pendente de Wave 0 (ver "Wave 0 Requirements")
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — todas têm ao menos `npm run typecheck`
- [x] Wave 0 covers all MISSING references — não há Wave 0 nem referências `MISSING`; cada arquivo de teste é criado pela task que o executa
- [x] No watch-mode flags (`vitest` bare / `test:watch` must NOT appear in any task verify) — apenas `npm test`, `npm run typecheck` e `npx vitest run <arquivo>`
- [x] Feedback latency < 45s — os comandos por task são `npm run typecheck` (~10s) e um `npx vitest run` de arquivo único; `npm test` completo só no fecho de cada plano
- [x] The 6 non-negotiable verifications above each map to at least one task — ver a tabela de mapeamento na seção "Non-negotiable verifications"
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** contrato de validação fechado pelo planner; aprovação de execução pendente.
