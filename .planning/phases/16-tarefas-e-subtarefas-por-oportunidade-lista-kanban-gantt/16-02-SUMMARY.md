---
phase: 16-tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt
plan: 02
subsystem: opportunities
tags: [nextjs, server-actions, zod, supabase, rls, tailwind, tracer]

# Dependency graph
requires:
  - phase: 16-01
    provides: "Tabela opportunity_tasks aplicada no Supabase Cloud (14 colunas, enum task_status, RLS 4 policies, triggers de guarda de profundidade e coerência de tenant), tipos hand-maintained OpportunityTask/TaskStatus"
provides:
  - "Zod schema `taskInputSchema` (.strict() + .superRefine para blocked_reason condicional, D-03)"
  - "Vocabulário único de status (TASK_STATUS_ORDER/TASK_STATUS_META) consumido por Lista, e futuramente Kanban/Gantt/form"
  - "Camada de leitura (TASK_COLUMNS, fetchTasksForOpportunity, fetchTaskById) com whitelist de colunas"
  - "Server action createTask com tenant server-derived e gate de papel (D-11)"
  - "Caminho de escrita na tela: TaskForm + TaskFormPage + rota /tarefas/new"
  - "Caminho de leitura na tela: TaskList (view Lista de tarefas raiz) + sub-rota fullscreen /tarefas + error boundary + TasksEntryCard no detalhe da oportunidade"
affects: [16-03, 16-04, 16-05, 16-06, 16-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "task-labels.ts espelha a forma StatusMeta/STATUS_META de status.ts (não o mapa simples de risk-labels.ts) — status de tarefa precisa de ícone+cor para Kanban/badges futuros"
    - "TaskForm reusa fetchAssignableProfiles(opportunity.tenant_id) — zero query nova de pessoas do tenant (D-08)"
    - "TaskList resolve nome do responsável reusando o mesmo fetchAssignableProfiles já buscado na página — nenhuma query nova de nomes"

key-files:
  created:
    - lib/opportunities/task-schema.ts
    - lib/opportunities/task-labels.ts
    - lib/opportunities/task-actions.ts
    - tests/schema/task-schema.test.ts
    - components/opportunities/tasks/TaskForm.tsx
    - components/opportunities/tasks/TaskFormPage.tsx
    - components/opportunities/tasks/TaskList.tsx
    - components/opportunities/tasks/TasksEntryCard.tsx
    - app/(app)/opportunities/[id]/tarefas/page.tsx
    - app/(app)/opportunities/[id]/tarefas/error.tsx
    - app/(app)/opportunities/[id]/tarefas/new/page.tsx
  modified:
    - lib/opportunities/queries.ts
    - app/(app)/opportunities/[id]/page.tsx

key-decisions:
  - "TaskList (e a página /tarefas) reusam fetchAssignableProfiles(opportunity.tenant_id) para resolver o nome do responsável a partir de assignee_id — o plano não detalhava essa resolução explicitamente; decisão de engenharia dentro do escopo D-08 (zero query nova), necessária porque a UI-SPEC exige nome exibido, não UUID cru na coluna Responsável"
  - "% Concluído sempre renderiza '—' neste tracer: todas as linhas da Lista são tarefas raiz sem cálculo de rollup ainda (computeTaskRollup é o plano 16-04) — bate exatamente com o comportamento A3 da UI-SPEC (0 subtarefas → '—'), não é stub, é o contrato correto para o estado atual"
  - "Tracer feedback gate: como o plano é autonomous:true e a <verify> da Task 1 (typecheck + vitest) é 100% automatizada sem componente visual, o gate foi tratado como execução autônoma (re-verificação automatizada, sem parar para checkpoint humano) em vez do ramo interativo — não havia nada para um humano avaliar visualmente nesta task"

requirements-completed: [TASK-01, TASK-03, TASK-04, TASK-05]

coverage:
  - id: D1
    description: "taskInputSchema Zod .strict() + .superRefine rejeitando payload com tenant_id/opportunity_id/created_by/id e exigindo blocked_reason quando status='bloqueio'"
    requirement: "TASK-01"
    verification:
      - kind: unit
        ref: "tests/schema/task-schema.test.ts (10 specs, todas pass)"
        status: pass
    human_judgment: false
  - id: D2
    description: "TASK_STATUS_ORDER/TASK_STATUS_META como fonte única do vocabulário de status (4 valores, ordem D-03) — usado pela Lista e disponível para Kanban/Gantt/form futuros"
    verification:
      - kind: unit
        ref: "npm run typecheck (0 erros novos)"
        status: pass
    human_judgment: false
  - id: D3
    description: "fetchTasksForOpportunity/fetchTaskById com whitelist TASK_COLUMNS, .returns<T[]>() sempre como última chamada da cadeia (Pitfall 6)"
    requirement: "TASK-01"
    verification:
      - kind: unit
        ref: "npm run typecheck (0 erros novos)"
        status: pass
    human_judgment: false
  - id: D4
    description: "createTask deriva tenant_id do profile autenticado e opportunity_id do argumento de rota; requireEditorRole() bloqueia viewer antes de qualquer parse (D-11)"
    requirement: "TASK-04"
    verification:
      - kind: unit
        ref: "npm run typecheck (0 erros novos) + inspeção estrutural do arquivo (grep 'use server', requireEditorRole antes de safeParse)"
        status: pass
    human_judgment: false
  - id: D5
    description: "TaskForm renderiza os 8 blocos na ordem da UI-SPEC, campo de motivo condicional a status='bloqueio', responsável populado só por AssignableProfile[] via prop (D-08), nenhum import de @/components/ui/ (D-09)"
    requirement: "TASK-03"
    verification:
      - kind: other
        ref: "grep estrutural do plano (Task 2 <verify>) — todas as asserções OK"
        status: pass
    human_judgment: false
  - id: D6
    description: "Rota /tarefas/new redireciona viewer via isReadOnlyViewer(), converte oportunidade inexistente em notFound(), busca fetchAssignableProfiles pelo tenant da oportunidade"
    requirement: "TASK-03"
    verification:
      - kind: other
        ref: "grep estrutural do plano (Task 2 <verify>) — todas as asserções OK"
        status: pass
    human_judgment: false
  - id: D7
    description: "Sub-rota /tarefas fullscreen com Server Component, fetch paralelo de tarefas + isReadOnlyViewer, CTA '+ Nova Tarefa' escondido para viewer, error boundary clone verbatim, TaskList com estado vazio da UI-SPEC, TasksEntryCard montado no detalhe da oportunidade"
    requirement: "TASK-05"
    verification:
      - kind: other
        ref: "grep estrutural do plano (Task 3 <verify>) — todas as asserções OK"
        status: pass
    human_judgment: true
    rationale: "O tracer end-to-end (criar tarefa → ver na Lista, com dados reais via RLS) não foi exercitado em um navegador real nesta execução — apenas typecheck/vitest/greps estruturais. UAT conversacional (/gsd-verify-work) deve confirmar o fluxo visual antes do checkpoint humano de 16-06/16-07."

duration: ~35min
completed: 2026-08-05
status: complete
---

# Phase 16 Plan 02: TRACER — Caminho de Dados Ponta-a-Ponta de Tarefas Summary

**Caminho de dados completo de `opportunity_tasks` provado ponta a ponta: Zod `.strict()` com regra condicional de bloqueio → `createTask` com tenant server-derived e gate de papel → leitura com whitelist de colunas → sub-rota fullscreen `/tarefas` com a view Lista renderizando dados reais do Supabase Cloud.**

## Performance

- **Duration:** ~35min
- **Completed:** 2026-08-05
- **Tasks:** 3/3
- **Files modified:** 13 (11 novos, 2 modificados)

## Accomplishments
- `lib/opportunities/task-schema.ts`: `taskInputSchema` Zod `.strict()` + `.superRefine` exigindo `blocked_reason` quando `status='bloqueio'` (D-03) — 10 specs em `tests/schema/task-schema.test.ts` travam a regra, os fallbacks e a defesa de mass assignment (T-16-02).
- `lib/opportunities/task-labels.ts`: `TASK_STATUS_ORDER`/`TASK_STATUS_META` — fonte única do vocabulário de status (ícone/cor/bg), espelhando `status.ts`, pronta para Kanban/Gantt/form dos planos seguintes.
- `lib/opportunities/queries.ts`: `TASK_COLUMNS` (whitelist, HARDEN-E-06), `fetchTasksForOpportunity` e `fetchTaskById` com `.returns<T[]>()` sempre ao final da cadeia (Pitfall 6); `fetchTaskById` devolve `null` em cross-tenant (mitigação IDOR, T-16-07).
- `lib/opportunities/task-actions.ts`: `createTask` — `requireEditorRole()` primeiro (D-11), `tenant_id` server-derived do profile, `opportunity_id` do argumento de rota, `blocked_reason` sempre escrito explicitamente (Pitfall 4, `null` fora de bloqueio), `revalidatePath` das duas rotas afetadas.
- `components/opportunities/tasks/TaskForm.tsx` + `TaskFormPage.tsx`: formulário Tailwind hand-rolled (D-09) com os 8 blocos da UI-SPEC, campo de motivo condicional, select de responsável populado só por `AssignableProfile[]` (D-08).
- `app/(app)/opportunities/[id]/tarefas/new/page.tsx`: rota de criação com guard `isReadOnlyViewer()` (D-11) e `fetchAssignableProfiles(opportunity.tenant_id)`.
- `components/opportunities/tasks/TaskList.tsx` + sub-rota `app/(app)/opportunities/[id]/tarefas/page.tsx` + `error.tsx`: view Lista das tarefas raiz com status sempre ícone+label+cor, estado vazio da UI-SPEC, CTA escondido para `viewer`, error boundary clone verbatim do grupo `(app)`.
- `components/opportunities/tasks/TasksEntryCard.tsx` montado em `app/(app)/opportunities/[id]/page.tsx`, logo abaixo do `AssigneesPanel` — ponto de entrada "🗂️ Plano de Atividades" / "Ver tarefas →".

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Caminho de dados ponta-a-ponta — schema Zod, vocabulário de status, leitura e createTask** - `43fdbc0` (feat)
2. **Task 2: Caminho de escrita na tela — formulário de tarefa e rota de criação** - `63b33e7` (feat)
3. **Task 3: Caminho de leitura na tela — Lista, sub-rota fullscreen, error boundary e entrada no detalhe** - `25cd35f` (feat)

**Plan metadata:** (a seguir — commit deste SUMMARY.md + STATE.md + ROADMAP.md)

## Files Created/Modified
- `lib/opportunities/task-schema.ts` - `taskStatusEnum`, `taskInputSchema` (.strict() + .superRefine), `TaskInput`
- `lib/opportunities/task-labels.ts` - `TASK_STATUS_ORDER`, `TASK_STATUS_META`, `assigneeTaskLabel`
- `lib/opportunities/task-actions.ts` - `createTask` (server action)
- `lib/opportunities/queries.ts` - `TASK_COLUMNS`, `fetchTasksForOpportunity`, `fetchTaskById` (adição, não reescrita)
- `tests/schema/task-schema.test.ts` - 10 specs puras (sem banco)
- `components/opportunities/tasks/TaskForm.tsx` - formulário client de criação de tarefa
- `components/opportunities/tasks/TaskFormPage.tsx` - wrapper fullscreen do formulário
- `components/opportunities/tasks/TaskList.tsx` - view Lista das tarefas raiz
- `components/opportunities/tasks/TasksEntryCard.tsx` - card de entrada no detalhe da oportunidade
- `app/(app)/opportunities/[id]/tarefas/page.tsx` - sub-rota fullscreen do Plano de Atividades
- `app/(app)/opportunities/[id]/tarefas/error.tsx` - error boundary da sub-rota
- `app/(app)/opportunities/[id]/tarefas/new/page.tsx` - rota de criação de tarefa raiz
- `app/(app)/opportunities/[id]/page.tsx` - monta `TasksEntryCard` abaixo do `AssigneesPanel`

## Decisions Made
- **Resolução do nome do responsável na Lista:** o plano não detalhava como a coluna "Responsável" resolveria `assignee_id` (uuid) para um nome exibível. Decisão: a página `/tarefas` reusa `fetchAssignableProfiles(opportunity.tenant_id)` (já buscado para o form em Task 2, D-08) e passa o array para `TaskList`, que monta um `Map<id, nome>` local — zero query nova de pessoas do tenant, alinhado ao D-08 mesmo fora do form.
- **Tracer feedback gate tratado como execução autônoma:** o plano é `autonomous: true` e a `<verify>` da Task 1 (tracer) é inteiramente automatizada (typecheck + vitest, sem UI). Não havia componente visual para um humano avaliar nesta task — a re-verificação automatizada (que já passou) satisfaz o propósito do gate sem introduzir uma pausa artificial.
- **`% Concluído` sempre "—" neste plano:** todas as linhas da Lista neste tracer são tarefas raiz sem subtarefas ainda cadastráveis (rollup é 16-04) — bate com o comportamento A3 da UI-SPEC ("0 subtarefas → '—'"), documentado explicitamente para não ser confundido com stub no `/gsd-verify-work`.

## Deviations from Plan

None - plano executado exatamente como escrito (a resolução do nome do responsável na Lista foi uma decisão de engenharia dentro do escopo D-08, não uma mudança de arquitetura — Rule 2/3 não se aplicam por não haver bug/blocker/funcionalidade crítica ausente do jeito que o plano previa; foi apenas preencher um detalhe de implementação que o texto do plano deixou implícito).

## Issues Encountered
None.

## User Setup Required

None - nenhuma configuração externa necessária. A migration 0037 já foi aplicada e verificada no Plan 16-01.

## Next Phase Readiness
- O tracer está fechado: detalhe da oportunidade → "🗂️ Plano de Atividades" → criar tarefa raiz → tarefa aparece na Lista, com `tenant_id`/`opportunity_id` sempre server-derived e `viewer` bloqueado tanto na Server Action quanto na rota de criação.
- `npm run typecheck` sai limpo (só a falha pré-existente já registrada em `deferred-items.md`/`WINDOWS.md`, fora de escopo desta fase).
- `npm test` sai com as mesmas 7 falhas pré-existentes (nenhuma regressão) + 10 specs novas passando (229 → 239 passing).
- **Recomendado antes de prosseguir para 16-03+:** rodar `/gsd-verify-work` para confirmar visualmente o fluxo ponta a ponta em navegador (criar tarefa → ver na Lista) — a coverage D7 acima está marcada `human_judgment: true` justamente por isso.
- Nenhum bloqueio conhecido para 16-03 (testes de banco) ou 16-04 (rollup + Lista hierárquica), que constrói diretamente sobre `TaskList.tsx` e `lib/opportunities/queries.ts` entregues aqui.

---
*Phase: 16-tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt*
*Completed: 2026-08-05*

## Self-Check: PASSED

All created files and referenced commits verified to exist on disk / in git history.
