---
phase: 16-tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt
plan: 05
subsystem: opportunities
tags: [nextjs, server-actions, zod, supabase, rls, tailwind, crud, cascade-delete]

# Dependency graph
requires:
  - phase: 16-02
    provides: "createTask, taskInputSchema, TaskForm/TaskFormPage tracer, sub-rota /tarefas, fetchTaskById/fetchTasksForOpportunity"
  - phase: 16-04
    provides: "TaskList.tsx com hierarquia de 2 níveis, computeTaskRollup/groupTasksByParent"
provides:
  - "updateTask, deleteTask, updateTaskStatus (task-actions.ts) — CRUD completo de opportunity_tasks"
  - "normalizeTaskStatusUpdate — fonte única testada da regra de limpeza do motivo de bloqueio (Pitfall 4), consumida por createTask/updateTask/updateTaskStatus"
  - "TaskFormDialog.tsx (soft-path ?tarefa=) e DeleteTaskButton.tsx (confirmação em cascata) — CRUD completo na UI"
  - "TaskList.tsx com coluna de Ações (editar/+subtarefa/excluir) por linha"
  - "Deep-links fullscreen /tarefas/[taskId]/edit e /tarefas/[taskId]/new (subtarefa)"
  - "Contrato exato de updateTaskStatus(taskId, status, blockedReason) que o Kanban (16-06) vai chamar"
affects: [16-06, 16-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MutationResult (ok:true sem id | ok:false) como tipo de retorno de updateTask/deleteTask/updateTaskStatus, separado de TaskActionResult (ok:true com id, só createTask) — espelha o split RiskActionResult/MutationResult de risk-actions.ts"
    - "normalizeTaskStatusUpdate: função pura exportada, única fonte da regra 'blocked_reason sempre explícito, nulo fora de bloqueio' (Pitfall 4) — as 3 mutações que tocam status a consomem em vez de reimplementar a limpeza cada uma à sua maneira"
    - "TaskFormDialog.close()/TaskList.hrefFor() reconstroem a query via URLSearchParams removendo só tarefa/parent — preservam qualquer outro parâmetro corrente (view) automaticamente, ao contrário do router.replace(pathname) do analog RiskFormDialog"

key-files:
  created:
    - components/opportunities/tasks/TaskFormDialog.tsx
    - components/opportunities/tasks/DeleteTaskButton.tsx
    - app/(app)/opportunities/[id]/tarefas/[taskId]/edit/page.tsx
    - app/(app)/opportunities/[id]/tarefas/[taskId]/new/page.tsx
    - tests/opportunities/task-actions.test.ts
  modified:
    - lib/opportunities/task-actions.ts
    - components/opportunities/tasks/TaskForm.tsx
    - components/opportunities/tasks/TaskFormPage.tsx
    - components/opportunities/tasks/TaskList.tsx
    - app/(app)/opportunities/[id]/tarefas/page.tsx

key-decisions:
  - "Mensagens de erro das 4 mutações (incl. createTask, retroativo) nunca interpolam error.message do driver do banco — só pt-BR genérico ('Erro ao atualizar tarefa.' etc). O plano exigia isso explicitamente (T-16-13/acceptance criteria) mesmo indo contra o padrão literal de risk-actions.ts, que interpola error.message; a plan text/threat model desta fase tomam precedência sobre o analog nesse ponto específico."
  - "MutationResult (novo tipo, sem id) para updateTask/deleteTask/updateTaskStatus em vez de reusar TaskActionResult (que exige id:string em ok:true) — decisão de engenharia dentro do padrão já estabelecido por risk-actions.ts (RiskActionResult vs MutationResult), não uma mudança de arquitetura."
  - "TaskFormDialog.close()/TaskList row-action hrefs reconstroem a URLSearchParams em vez de hardcodear apenas o parâmetro view — generaliza para 'qualquer parâmetro futuro', que é literalmente o texto do UI-SPEC ('view, e qualquer outro que exista no futuro')."

patterns-established:
  - "Botão de cabeçalho '+ Nova Tarefa' e o CTA do empty-state da Lista abrem o diálogo (?tarefa=new) preservando os parâmetros correntes, em vez de navegar para a rota de deep-link — a rota /tarefas/new continua servindo como fallback de acesso direto/recarregamento (UI-SPEC §Routes)."

requirements-completed: [TASK-01, TASK-03, TASK-05, TASK-06]

coverage:
  - id: D1
    description: "normalizeTaskStatusUpdate — fonte única da regra de limpeza do motivo de bloqueio (blocked_reason sempre explícito, nulo fora de bloqueio, motivo só de espaços equivale a ausente, recusa antes do banco quando bloqueio sem motivo); consumida por createTask/updateTask/updateTaskStatus"
    requirement: "TASK-06"
    verification:
      - kind: unit
        ref: "tests/opportunities/task-actions.test.ts (8 specs, todas pass)"
        status: pass
      - kind: unit
        ref: "npm run typecheck (0 erros novos)"
        status: pass
    human_judgment: false
  - id: D2
    description: "updateTask/deleteTask/updateTaskStatus escopados por id + tenant_id (defesa em profundidade sobre RLS), requireEditorRole() primeiro, sem parent_task_id em updateTask (D-01), mensagens de erro pt-BR genéricas sem vazar error.message do banco (T-16-13)"
    requirement: "TASK-06"
    verification:
      - kind: unit
        ref: "npm run typecheck (0 erros novos) + inspeção estrutural (grep requireEditorRole primeiro, .eq('tenant_id',...) encadeado, ausência de parent_task_id no update, ausência de error.message interpolado)"
        status: pass
    human_judgment: false
  - id: D3
    description: "TaskForm em modo de edição (campos pré-preenchidos incl. blocked_reason quando status=bloqueio, envia updateTask); TaskFormDialog dirigido por ?tarefa=/?parent= preservando view ao fechar; DeleteTaskButton com confirmação nomeando quantidade de subtarefas (singular/plural)"
    requirement: "TASK-05"
    verification:
      - kind: unit
        ref: "npm run typecheck (0 erros novos) + grep estrutural do plano (Task 2 <verify>) — use client, useSearchParams, Escape, URLSearchParams, view, childCount, subtarefa, deleteTask, updateTask, ausência de @/components/ui/ — todas OK"
        status: pass
    human_judgment: true
    rationale: "O fluxo visual completo (abrir diálogo de edição pré-preenchido, criar subtarefa a partir de uma linha, confirmar exclusão em cascata vendo a contagem correta) não foi exercitado em navegador real nesta execução — apenas typecheck e greps estruturais. UAT conversacional (/gsd-verify-work) deve confirmar visualmente antes do checkpoint humano de 16-06/16-07."
  - id: D4
    description: "TaskList com coluna de Ações (editar/+subtarefa/excluir na raiz; editar/excluir na subtarefa, nunca +subtarefa — D-01) que some inteira quando readOnly; deep-links /tarefas/[taskId]/edit e /tarefas/[taskId]/new com guard de viewer, fetchTaskById RLS-scoped→notFound, e a rota de subtarefa recusando alvo que já é subtarefa (D-01)"
    requirement: "TASK-05"
    verification:
      - kind: unit
        ref: "npm run typecheck + npm test (261 passing / 7 falhas pré-existentes / 80 skipped, sem regressão) + grep estrutural do plano (Task 3 <verify>) — todas OK"
        status: pass
    human_judgment: true
    rationale: "Mesma razão de D3 — a hierarquia de ações por linha e os dois deep-links novos não foram clicados em navegador real nesta execução. UAT conversacional deve confirmar antes do checkpoint humano de 16-06/16-07."

duration: ~20min
completed: 2026-08-05
status: complete
---

# Phase 16 Plan 05: CRUD Completo de Tarefas e Subtarefas Summary

**`updateTask`/`deleteTask`/`updateTaskStatus` fecham o CRUD de `opportunity_tasks` sobre o tracer de 16-02, com `normalizeTaskStatusUpdate` como fonte única testada da regra de limpeza do motivo de bloqueio, diálogo de edição/exclusão com confirmação em cascata, e os dois deep-links que faltavam (`[taskId]/edit`, `[taskId]/new`).**

## Performance

- **Duration:** ~20min
- **Completed:** 2026-08-05
- **Tasks:** 3/3
- **Files modified:** 10 (5 novos, 5 modificados)

## Accomplishments
- `lib/opportunities/task-actions.ts`: `normalizeTaskStatusUpdate` extraída como função pura exportada — única autoridade sobre a regra "blocked_reason sempre explícito no payload, nulo fora de `bloqueio`, motivo só de espaços equivale a ausente, recusa antes do banco quando `bloqueio` sem motivo" (Pitfall 4). `createTask`, `updateTask` e `updateTaskStatus` consomem a mesma função em vez de reimplementar a limpeza cada uma à sua maneira.
- `updateTask(taskId, opportunityId, input)`: atualiza título/descrição/status/datas/responsável/motivo, **nunca** `parent_task_id` (D-01 — a UI não re-parenta; o trigger de profundidade da 0037 recusaria de qualquer forma). Escopo por `id` **e** `tenant_id` (defesa em profundidade sobre a RLS).
- `deleteTask(taskId, opportunityId)`: remove por `id`+`tenant_id`; sem lógica de cascata própria — `parent_task_id on delete cascade` (0037) cuida das subtarefas no banco.
- `updateTaskStatus(taskId, status, blockedReason)`: o contrato exato que o Kanban (16-06) vai chamar — sem `opportunityId` como parâmetro; lê `opportunity_id` de volta do próprio `UPDATE` (`.select('opportunity_id').single()`) para revalidar as rotas certas sem query extra.
- `tests/opportunities/task-actions.test.ts`: 8 specs puras (sem banco) sobre `normalizeTaskStatusUpdate` — os 4 comportamentos declarados no plano + 3 status não-bloqueantes confirmando motivo nulo mesmo com texto passado + 1 caso "finalizado sem motivo aceito".
- `components/opportunities/tasks/TaskForm.tsx`: acrescenta modo de edição (`mode`/`taskId`/`initial`) — campos pré-preenchidos, `blocked_reason` só quando o status atual é `bloqueio`, envio chama `updateTask` em edição. Legenda "Subtarefa de: ..." continua somente leitura nos dois modos.
- `components/opportunities/tasks/TaskFormDialog.tsx` (novo): overlay dirigido por `?tarefa=` (`new`=criar, `<id>`=editar), `?parent=<id>` abre criação de subtarefa, ESC/click-outside fecham, resolve `initial`/pai a partir do array `tasks` já em memória (zero query nova), fecha sozinho se o alvo de edição sumiu. **Desvio obrigatório do analog `RiskFormDialog`**: `close()` reconstrói a query via `URLSearchParams` removendo só `tarefa`/`parent` — preserva `?view=` (e qualquer parâmetro futuro) em vez de descartar tudo.
- `components/opportunities/tasks/DeleteTaskButton.tsx` (novo): clona `DeleteRiskButton.tsx`; única diferença de conteúdo é `childCount` — a confirmação nomeia a quantidade de subtarefas que serão removidas junto, com singular/plural (T-16-12).
- `components/opportunities/tasks/TaskList.tsx`: coluna de Ações por linha (editar/+subtarefa/excluir na raiz; editar/excluir na subtarefa — nunca +subtarefa, D-01), some inteira quando `readOnly`. Links de editar/+subtarefa navegam por `?tarefa=`/`?parent=` preservando os parâmetros correntes.
- `app/(app)/opportunities/[id]/tarefas/page.tsx`: monta `TaskFormDialog` reusando o mesmo array de tarefas e a mesma lista de profiles atribuíveis já buscados (zero query nova); CTA "+ Nova Tarefa" do cabeçalho passa a abrir o diálogo via query param preservando os parâmetros correntes; `readOnly` repassado à `TaskList`.
- `app/(app)/opportunities/[id]/tarefas/[taskId]/edit/page.tsx` (novo) e `.../[taskId]/new/page.tsx` (novo): deep-links fullscreen — guard de `viewer`, `fetchTaskById` RLS-scoped→`notFound()`, e a rota de subtarefa recusando (`notFound()`) um alvo que já é subtarefa (D-01, hierarquia de exatamente 2 níveis).

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Server actions de atualização, exclusão e troca de status** - `cd4be8e` (feat)
2. **Task 2: Diálogo de criar/editar e exclusão com confirmação em cascata** - `c46cc12` (feat)
3. **Task 3: Ações por linha na Lista e rotas de deep-link de edição e de subtarefa** - `2119779` (feat)

**Plan metadata:** (a seguir — commit deste SUMMARY.md + STATE.md + ROADMAP.md)

## Files Created/Modified
- `lib/opportunities/task-actions.ts` - `normalizeTaskStatusUpdate`, `updateTask`, `deleteTask`, `updateTaskStatus`, `MutationResult`
- `tests/opportunities/task-actions.test.ts` - 8 specs puras (sem banco) sobre `normalizeTaskStatusUpdate`
- `components/opportunities/tasks/TaskForm.tsx` - modo de edição (`mode`/`taskId`/`initial`)
- `components/opportunities/tasks/TaskFormDialog.tsx` - diálogo soft-path (`?tarefa=`/`?parent=`)
- `components/opportunities/tasks/DeleteTaskButton.tsx` - exclusão com confirmação em cascata
- `components/opportunities/tasks/TaskFormPage.tsx` - `mode`/`taskId`/`initial` acrescentados (deviation, ver abaixo)
- `components/opportunities/tasks/TaskList.tsx` - coluna de Ações por linha
- `app/(app)/opportunities/[id]/tarefas/page.tsx` - monta `TaskFormDialog`, `readOnly` repassado
- `app/(app)/opportunities/[id]/tarefas/[taskId]/edit/page.tsx` - deep-link fullscreen de edição
- `app/(app)/opportunities/[id]/tarefas/[taskId]/new/page.tsx` - deep-link fullscreen de criação de subtarefa

## Decisions Made
- **Mensagens de erro sem `error.message` cru do banco (retroativo em `createTask`):** o plano/threat model desta fase (T-16-13) exige mensagens pt-BR genéricas nas 4 mutações; `createTask` (16-02) ainda interpolava `error?.message`. Ajustado para fechar o mesmo threat nas quatro funções — desvio do padrão literal de `risk-actions.ts` (que interpola), mas exigido pelo texto/acceptance criteria explícitos deste plano.
- **`MutationResult` como tipo novo** (sem `id`) para `updateTask`/`deleteTask`/`updateTaskStatus`, distinto de `TaskActionResult` (que exige `id: string` em sucesso, usado só por `createTask`) — espelha o split já estabelecido em `risk-actions.ts` (`RiskActionResult`/`MutationResult`).
- **Preservação genérica de parâmetros de busca:** tanto `TaskFormDialog.close()` quanto os hrefs de ação da `TaskList` reconstroem a query via `URLSearchParams`, removendo só `tarefa`/`parent` — preservam `view` (ainda inexistente nesta wave, chega em 16-06) e qualquer parâmetro futuro automaticamente, em vez de hardcodear apenas `view`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Mensagens de erro das 4 mutações não interpolam mais `error.message` do banco**
- **Found during:** Task 1
- **Issue:** O analog `risk-actions.ts` interpola `error.message` do driver Postgres nas mensagens devolvidas ao cliente; o threat model desta fase (T-16-13) e as próprias acceptance criteria do plano proíbem isso explicitamente para as mutações de tarefa.
- **Fix:** As 4 funções (incl. `createTask`, retroativo) agora devolvem só mensagens pt-BR genéricas ("Erro ao criar/atualizar/excluir tarefa.", "Erro ao atualizar status da tarefa.").
- **Files modified:** `lib/opportunities/task-actions.ts`
- **Verification:** grep confirma ausência de `error?.message`/`error.message` interpolado em qualquer `return { ok: false, ... }` de mutação.
- **Committed in:** `cd4be8e` (Task 1 commit)

**2. [Rule 3 - Blocking] `TaskFormPage.tsx` estendido com `mode`/`taskId`/`initial`**
- **Found during:** Task 3
- **Issue:** `TaskFormPage.tsx` não estava em `files_modified` do plano, mas a rota `[taskId]/edit/page.tsx` precisa "renderizar o `TaskFormPage` em modo de edição com os valores atuais" (texto da própria Task 3) — sem essas props o wrapper não tinha como repassar `mode`/`initial` ao `TaskForm`.
- **Fix:** `TaskFormPage` ganhou `mode`/`taskId`/`initial` (default `mode='create'`, compatível com os callers existentes de 16-02) e o heading passa a considerar `mode === 'edit'`.
- **Files modified:** `components/opportunities/tasks/TaskFormPage.tsx`
- **Verification:** `npm run typecheck` limpo; a rota `[taskId]/edit/page.tsx` compila passando `mode="edit"` `initial={task}`.
- **Committed in:** `2119779` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 2 - segurança, 1 Rule 3 - bloqueio)
**Impact on plan:** Ambos necessários para correção/segurança conforme o próprio texto do plano; nenhum scope creep — nenhuma arquitetura nova, nenhuma tabela nova, nenhuma dependência nova.

## Issues Encountered
None.

## User Setup Required

None - nenhuma configuração externa necessária.

## Next Phase Readiness
- `updateTaskStatus(taskId, status, blockedReason)` está pronta com o contrato exato que `TaskKanbanBoard`/`BlockedReasonDialog` (16-06) vão chamar no drag-and-drop — sem `opportunityId` como parâmetro, motivo sempre explícito no payload.
- `npm run typecheck` limpo (só a falha pré-existente já registrada em `deferred-items.md`/`WINDOWS.md`, fora de escopo desta fase).
- `npm test`: 261 passing / 7 falhas pré-existentes / 80 skipped — mesma baseline pós-16-04 (253) + 8 specs novas, **sem nenhuma regressão**.
- CRUD de tarefas e subtarefas está completo nos dois níveis (criar, editar, excluir com cascata) e sem nenhum caminho de escrita acessível a `viewer` (UI e URL direta).
- **Recomendado antes do checkpoint humano de 16-06/16-07:** `/gsd-verify-work` deve confirmar visualmente o fluxo completo (editar tarefa pré-preenchida, criar subtarefa a partir de uma linha, excluir uma tarefa-pai vendo a contagem de subtarefas na confirmação) — pendência acumulada desde 16-02/16-04, cobre também D3/D4 deste plano.
- Nenhum bloqueio conhecido para 16-06 (Kanban), que consome `updateTaskStatus` diretamente e reusa `TASK_STATUS_ORDER`/`TASK_STATUS_META` de 16-02.

---
*Phase: 16-tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt*
*Completed: 2026-08-05*

## Self-Check: PASSED

All created/modified files and referenced commits (`cd4be8e`, `c46cc12`, `2119779`) verified to exist on disk / in git history.
