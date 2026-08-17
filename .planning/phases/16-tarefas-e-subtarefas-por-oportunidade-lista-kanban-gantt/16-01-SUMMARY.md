---
phase: 16-tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt
plan: 01
subsystem: database
tags: [supabase, postgres, rls, migration, typescript, hand-maintained-types]

# Dependency graph
requires:
  - phase: 09-schema-evolution-foundation
    provides: padrão de migration write-only + handoff doc canônico
  - phase: 12-registro-de-riscos
    provides: padrão de tabela filha de opportunity com RLS gate `current_user_role() <> 'viewer'`
provides:
  - "Tabela `opportunity_tasks` no Supabase Cloud (aplicada) — 14 colunas, sem span/percentual persistido"
  - "Enum `task_status` (backlog, em_andamento, bloqueio, finalizado) = as 4 colunas do Kanban"
  - "Trigger `check_task_depth()` — garante exatamente 2 níveis de hierarquia (INSERT e UPDATE de re-parentamento)"
  - "Trigger `check_task_tenant_coherence()` — assignee e parent_task_id restritos ao mesmo tenant/opportunity"
  - "RLS com 4 policies (leitura tenant+platform_admin; escrita tenant+não-viewer)"
  - "Tipos hand-maintained `OpportunityTask`/`TaskStatus` em lib/database.types.ts e lib/opportunities/types.ts"
affects: [16-02, 16-03, 16-04, 16-05, 16-06, 16-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Trigger de guarda de profundidade com dois ramos (INSERT self-parent/pai-já-subtarefa + UPDATE re-parentamento de linha que já tem filhas)"
    - "Trigger de coerência de tenant cobrindo assignee_id E parent_task_id.opportunity_id, security definer + set search_path = public"

key-files:
  created:
    - supabase/migrations/0037_opportunity_tasks.sql
    - .planning/phases/16-tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt/16-01-MIGRATION-HANDOFF.md
  modified:
    - lib/database.types.ts
    - lib/opportunities/types.ts

key-decisions:
  - "Migration aplicada manualmente pelo PO no SQL Editor do Supabase Cloud (write-only mode) — todas as 10 verificações consolidadas passaram"
  - "Verificação 7 (UPDATE de re-parentamento) bateu no ramo 'irmão' do guard (pai já é subtarefa) em vez do ramo 'já tem filhas' — ambos os ramos existem no trigger, D-01 se sustenta de qualquer forma"

patterns-established:
  - "Trigger de guarda de profundidade de hierarquia (2 níveis) reusável para futuras tabelas hierárquicas do projeto"

requirements-completed: [TASK-01, TASK-02, TASK-03, TASK-04]

coverage:
  - id: D1
    description: "Migration 0037 aplicada no Supabase Cloud com tabela opportunity_tasks (14 colunas, sem coluna derivada), enum task_status (4 valores) e os 4 índices"
    requirement: "TASK-01"
    verification:
      - kind: manual_procedural
        ref: "Handoff 16-01-MIGRATION-HANDOFF.md — verificações 1, 2 e 5 (colunas, enum, triggers) coladas pelo PO"
        status: pass
    human_judgment: false
  - id: D2
    description: "Guard de 2 níveis (check_task_depth) rejeita 3º nível via INSERT e via UPDATE de re-parentamento"
    requirement: "TASK-02"
    verification:
      - kind: manual_procedural
        ref: "Handoff 16-01-MIGRATION-HANDOFF.md — smoke tests 6b/6c colados pelo PO, ambos REJEITADOS conforme esperado"
        status: pass
    human_judgment: false
  - id: D3
    description: "Guard de coerência de tenant (check_task_tenant_coherence) rejeita assignee de outro tenant"
    requirement: "TASK-03"
    verification:
      - kind: manual_procedural
        ref: "Handoff 16-01-MIGRATION-HANDOFF.md — smoke test 7 colado pelo PO, REJEITADO conforme esperado"
        status: pass
    human_judgment: false
  - id: D4
    description: "RLS ativa com 4 policies (SELECT tenant+platform_admin; INSERT/UPDATE/DELETE tenant+não-viewer)"
    requirement: "TASK-04"
    verification:
      - kind: manual_procedural
        ref: "Handoff 16-01-MIGRATION-HANDOFF.md — verificações 3 e 4 (rowsecurity=true, 4 policies com os gates D-11/D-12) coladas pelo PO"
        status: pass
    human_judgment: false
  - id: D5
    description: "Tipos hand-maintained (OpportunityTask, TaskStatus) em lib/database.types.ts e lib/opportunities/types.ts, npm run typecheck limpo para o código desta task"
    verification:
      - kind: other
        ref: "npm run typecheck (Task 2, executor anterior) — passou; falha pré-existente não relacionada registrada em deferred-items.md e WINDOWS.md"
        status: pass
    human_judgment: false

duration: ~12min (Tasks 1-2) + checkpoint humano (apply assíncrono)
completed: 2026-08-05
status: complete
---

# Phase 16 Plan 01: Fundação de Dados — Tarefas e Subtarefas Summary

**Migration 0037 aplicada no Supabase Cloud: tabela `opportunity_tasks` (14 colunas, zero derivadas) com hierarquia de 2 níveis e coerência de tenant garantidas por trigger, RLS com 4 policies e tipos hand-maintained sincronizados — todas as 10 verificações pós-apply passaram.**

## Performance

- **Duration:** ~12min de execução automática (Tasks 1-2) + intervalo assíncrono até o PO aplicar a migration e confirmar o checkpoint
- **Completed:** 2026-08-05
- **Tasks:** 3/3 (Task 1 e 2 automáticas; Task 3 checkpoint humano bloqueante — RESOLVIDO)
- **Files modified:** 4 (1 migration nova, 1 handoff doc, 2 arquivos de tipos)

## Accomplishments
- Migration `0037_opportunity_tasks.sql` escrita, commitada, aplicada manualmente pelo PO no SQL Editor do Supabase Cloud e verificada com 10/10 checagens passando (incluindo idempotência via segunda execução).
- Tabela `opportunity_tasks` no banco garante — no schema, não só na UI — exatamente 2 níveis de hierarquia (D-01), coerência de tenant do responsável (D-04), isolamento por tenant via RLS (TASK-04), motivo obrigatório em bloqueio (D-03) e ausência de qualquer coluna derivada de span/percentual (D-02).
- Tipos hand-maintained (`OpportunityTask`, `TaskStatus`) adicionados a `lib/database.types.ts` e re-exportados em `lib/opportunities/types.ts`, com a self-FK `parent_task_id` modelada nas `Relationships`.
- Handoff de apply manual write-only entregue e fechado com o resultado consolidado das 10 verificações, incluindo a nota sobre qual ramo do guard de profundidade a verificação 7 exercitou.

## Task Commits

Executor anterior (Tasks 1-2 + artefato de handoff):

1. **Task 1: Migration 0037 — tabela opportunity_tasks, enum, triggers de guarda e RLS** - `fa18487` (feat)
2. **Task 2: Tipos hand-maintained — opportunity_tasks em database.types.ts e aliases em types.ts** - `a94a9ab` (feat)
3. **(docs) Deferred item — falha de typecheck pré-existente fora de escopo** - `c461de1` (docs)
4. **Task 3 (artefato): Handoff de apply manual write-only da 0037** - `e11912f` (docs)

Este executor (continuação, fechamento do checkpoint):

5. **Registro do resultado do apply (10/10 verificações) no handoff** - `afb77e4` (docs)

**Plan metadata:** (a seguir — commit deste SUMMARY.md + STATE.md + ROADMAP.md)

## Files Created/Modified
- `supabase/migrations/0037_opportunity_tasks.sql` - migration write-only: tabela, enum, 2 triggers de guarda, trigger updated_at, 4 índices, 4 policies RLS. **Aplicada no Supabase Cloud.**
- `.planning/phases/16-.../16-01-MIGRATION-HANDOFF.md` - passo-a-passo do apply + 8 queries de verificação + seção "Resultado do apply" com as 10 checagens confirmadas
- `lib/database.types.ts` - entrada `opportunity_tasks` (Row/Insert/Update/Relationships) + enum `task_status`
- `lib/opportunities/types.ts` - aliases `OpportunityTask`/`TaskStatus` derivados de `Database`

## Decisions Made
- Migration aplicada exatamente como escrita — nenhuma correção foi necessária após o apply; todas as 10 verificações (incluindo os 3 smoke tests de trigger) passaram na primeira tentativa do PO.
- A verificação 7 do handoff (UPDATE de re-parentamento) exercitou o ramo "pai já é subtarefa" do guard `check_task_depth()`, não o ramo "linha já tem filhas ganhando pai" (Pitfall 1 do plano) — ambos os ramos existem no corpo da função (confirmados na Task 1), então D-01 continua garantido nos dois sentidos; a cobertura explícita do segundo ramo específico fica registrada aqui para quem for auditar depois.

## Deviations from Plan

None nas Tasks 1-2 e no fechamento do checkpoint - plano executado exatamente como escrito. (Um item foi deferido por estar fora de escopo — ver abaixo.)

## Issues Encountered
- Nenhum durante a Task 3/fechamento. O checkpoint bloqueante funcionou como desenhado: a execução automática parou na fronteira write-only, o PO aplicou a migration de forma assíncrona, e este executor de continuação fechou o loop sem redo de trabalho já commitado.

## Known Stubs

Nenhum. Esta plan entrega apenas schema + tipos; não há UI nem dado renderizado que possa ficar stub.

## Deferred Items (fora de escopo)

- **`npm run typecheck` falha pré-existente em `tests/opportunities/report-strategic.test.ts:107`** (`TS2322: Type 'null' is not assignable to type 'number | undefined'`). Confirmado no `main` antes de qualquer alteração desta task (via `git stash`) — não tocado por 16-01, fora do scope boundary da execução. Registrado em `.planning/phases/16-.../deferred-items.md` (commit `c461de1`) e no ledger cross-fase `.planning/WINDOWS.md` (kind: deviation, phase 16).

## User Setup Required

None — a única ação humana era o apply da migration, que já foi concluído e verificado (ver "Accomplishments" acima).

## Next Phase Readiness
- Os planos **16-02 em diante estão destravados**: `opportunity_tasks` existe no Supabase Cloud com todas as garantias de banco (2 níveis, coerência de tenant, RLS, CHECK de bloqueio) e os tipos TypeScript já refletem o schema.
- Nenhum bloqueio conhecido para 16-02 (tracer ponta-a-ponta com a Lista).
- O item de typecheck pré-existente (fora de escopo) permanece aberto no ledger — não bloqueia esta fase, mas deve ser resolvido antes do `/gsd-ship` do milestone.

---
*Phase: 16-tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt*
*Completed: 2026-08-05*

## Self-Check: PASSED

All created files and referenced commits verified to exist on disk / in git history.
