---
phase: 16-tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt
plan: 04
subsystem: ui
tags: [nextjs, react, tailwind, vitest, task-hierarchy, rollup]

# Dependency graph
requires:
  - phase: 16-02
    provides: "OpportunityTask/TaskStatus types, TASK_STATUS_META, fetchTasksForOpportunity (array plano, ordenado por created_at), TaskList.tsx (tracer, só raízes), sub-rota /tarefas"
provides:
  - "computeTaskRollup — fonte única, pura, do span agregado e % de conclusão da tarefa-pai (TASK-11/D-02), sem espelho SQL e sem teste de paridade"
  - "groupTasksByParent — helper de agrupamento (raízes + mapa parent_task_id→filhas) compartilhado por Lista e Gantt, preservando a ordem de created_at"
  - "TaskList.tsx com hierarquia real de 2 níveis: expandir/comprimir por tarefa (estado local, D-13), colunas de rollup na pai, linhas de subtarefa indentadas"
affects: [16-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "task-rollup.ts espelha score.ts no papel (módulo de valor derivado, fonte única, nunca persistido) mas DIFERE deliberadamente ao não ter espelho SQL nem teste de paridade — justificado no próprio cabeçalho do arquivo (único consumidor, array já em memória)"
    - "groupTasksByParent é o único ponto de agrupamento por parent_task_id — Lista (aqui) e Gantt (16-07) importam a mesma função, garantindo numeração T001/T001.1 e ordem de linhas idênticas nas duas views"

key-files:
  created:
    - lib/opportunities/task-rollup.ts
    - tests/schema/task-rollup.test.ts
  modified:
    - components/opportunities/tasks/TaskList.tsx
    - app/(app)/opportunities/[id]/tarefas/page.tsx

key-decisions:
  - "Badge de rollup usa classes neutras (bg-slate-100/dark:bg-slate-800, texto text-txt) em vez de uma cor semântica nova — a UI-SPEC define a cópia exata ('{completed}/{total} concluídas') mas não uma paleta de cor específica para esse badge; neutro evita competir visualmente com o pill de status (o âncora visual primário da linha, per UI-SPEC Visual Hierarchy)"
  - "Coluna de chevron ganhou um <th> vazio com aria-hidden no cabeçalho (em vez de omitir a coluna) para manter o alinhamento das 7 colunas entre linhas de tarefa-pai e de subtarefa"

requirements-completed: [TASK-07, TASK-11]

coverage:
  - id: D1
    description: "computeTaskRollup — span agregado (menor start_date/maior due_date das filhas) e % de conclusão (finalizado/total, arredondado), puro, sem I/O, nunca persistido"
    requirement: "TASK-11"
    verification:
      - kind: unit
        ref: "tests/schema/task-rollup.test.ts (14 specs, todas pass — 10 comportamentos do plano + imutabilidade + checagem 'não persistido' + 2 specs do grouping helper)"
        status: pass
    human_judgment: false
  - id: D2
    description: "groupTasksByParent — helper de agrupamento (raízes + mapa parent_task_id→filhas) reutilizável por Lista e Gantt, preservando ordem de created_at"
    verification:
      - kind: unit
        ref: "tests/schema/task-rollup.test.ts — describe('groupTasksByParent — helper de agrupamento compartilhado por Lista e Gantt') (2 specs, pass)"
        status: pass
    human_judgment: false
  - id: D3
    description: "TaskList hierárquica de 2 níveis: expandir/comprimir por tarefa (estado local Set<string>, D-13), controle só renderizado quando há subtarefas, colunas de rollup (span + badge) na pai, linhas de subtarefa indentadas com próprias datas/status e travessão em % Concluído"
    requirement: "TASK-07"
    verification:
      - kind: unit
        ref: "npm run typecheck (0 erros novos) + npm test (253 passing / 7 falhas pré-existentes / 80 skipped, sem regressão)"
        status: pass
      - kind: other
        ref: "grep estrutural do plano (Task 2 <verify>) — use client, computeTaskRollup, aria-expanded, aria-label, useState, badge 'concluídas', TASK_STATUS_META, ausência de @/components/ui/, fetchTasksForOpportunity na página — todas OK"
        status: pass
    human_judgment: true
    rationale: "A hierarquia visual (chevron, indentação, span agregado com o glifo Σ, badge de rollup) não foi exercitada em um navegador real nesta execução — apenas typecheck/vitest/greps estruturais. Como este plano precisa de ao menos uma tarefa com subtarefa cadastrada para exibir o caminho 'pai com filhas' (o tracer 16-02 só criou tarefas raiz), a confirmação visual completa (expandir, ver span Σ, ver badge N/M) depende de dados reais criados via UI — que só existe a partir do 16-05 (form de subtarefa). UAT conversacional (/gsd-verify-work) deve confirmar visualmente antes do checkpoint humano de 16-06/16-07, junto com a recomendação já registrada em 16-02-SUMMARY.md."

duration: ~25min
completed: 2026-08-05
status: complete
---

# Phase 16 Plan 04: Rollup de Tarefas + Lista Hierárquica Summary

**`computeTaskRollup` como fonte única (span agregado + % de conclusão, puro, nunca persistido) e `TaskList` expandida para hierarquia real de 2 níveis, com expandir/comprimir por tarefa e colunas de rollup na pai.**

## Performance

- **Duration:** ~25min
- **Completed:** 2026-08-05
- **Tasks:** 2/2
- **Files modified:** 4 (2 novos, 2 modificados)

## Accomplishments
- `lib/opportunities/task-rollup.ts`: `computeTaskRollup` — span agregado (menor `start_date`/maior `due_date` das filhas) e % de conclusão (`finalizado`/total, arredondado), pura, sem I/O, com cabeçalho pt-BR explicando por que NÃO existe espelho SQL nem teste de paridade (único consumidor, array já em memória — diferente de `score.ts`).
- `groupTasksByParent` — helper de agrupamento (raízes + mapa `parent_task_id`→filhas) exportado do mesmo módulo, ponto único de agrupamento reusado pela Lista aqui e pelo Gantt no plano 16-07.
- `tests/schema/task-rollup.test.ts`: 14 specs puras (sem banco) — os 10 comportamentos declarados no plano (zero/uma/duas/três filhas, arredondamento, span com/sem data mista, só `finalizado` conta, determinismo) + imutabilidade da entrada + checagem estrutural de "não persistido" + 2 specs do grouping helper.
- `components/opportunities/tasks/TaskList.tsx`: agora `'use client'`, hierarquia de 2 níveis via `groupTasksByParent`; controle de expandir/comprimir (`<button aria-expanded aria-label>`) só quando a tarefa tem subtarefas, alvo de 28px (`w-7 h-7`), foco reusando `focus:ring-1 focus:ring-pri`; pai com subtarefas mostra span agregado (glifo "Σ" + `title="Datas agregadas das subtarefas"`) e badge "{concluídas}/{total} concluídas"; pai sem subtarefas mostra as próprias datas e travessão; linhas de subtarefa indentadas (`pl-8`, `font-medium`), com próprias datas/status e travessão em % Concluído.
- `app/(app)/opportunities/[id]/tarefas/page.tsx`: docstring atualizada — continua uma única busca do array plano; nenhuma query nova.

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: computeTaskRollup — span agregado e percentual de conclusão, puros e não persistidos** - `56a2c4a` (feat)
2. **Task 2: Lista hierárquica — expandir/comprimir por tarefa e colunas de rollup** - `92456fb` (feat)

**Plan metadata:** (a seguir — commit deste SUMMARY.md + STATE.md + ROADMAP.md)

## Files Created/Modified
- `lib/opportunities/task-rollup.ts` - `TaskRollup` (tipo), `computeTaskRollup`, `groupTasksByParent`
- `tests/schema/task-rollup.test.ts` - 14 specs puras (sem banco)
- `components/opportunities/tasks/TaskList.tsx` - Lista hierárquica de 2 níveis, expandir/comprimir, colunas de rollup
- `app/(app)/opportunities/[id]/tarefas/page.tsx` - docstring atualizada (sem mudança funcional)

## Decisions Made
- **Cor do badge de rollup:** neutra (`bg-slate-100`/`dark:bg-slate-800`, `text-txt`) em vez de uma cor semântica nova — a UI-SPEC fixa a cópia exata mas não uma paleta específica; neutro respeita a hierarquia visual da UI-SPEC (o pill de status é o âncora visual primário da linha, não o badge de rollup).
- **`<th>` vazio com `aria-hidden` para a coluna de chevron:** mantém as 7 colunas alinhadas entre linhas de tarefa-pai (com botão) e de subtarefa (sem botão, célula vazia) — decisão de engenharia dentro do escopo da UI-SPEC (chevron "só renderizado se houver subtarefa"), não uma mudança de contrato.

## Deviations from Plan

None - plano executado exatamente como escrito. A atualização de docstring em `page.tsx` (arquivo listado em `files_modified` do plano) não alterou nenhum comportamento — a página já buscava o array plano corretamente desde o tracer (16-02); a mudança foi puramente de comentário para refletir que a Lista agora consome a hierarquia completa.

## Issues Encountered
None.

## User Setup Required

None - nenhuma configuração externa necessária.

## Next Phase Readiness
- `computeTaskRollup` e `groupTasksByParent` estão prontos para o Gantt (16-07) reusar sem reimplementar agrupamento.
- `npm run typecheck` sai limpo (só a falha pré-existente já registrada em `deferred-items.md`/`WINDOWS.md`, fora de escopo desta fase).
- `npm test` sai com as mesmas 7 falhas pré-existentes (nenhuma regressão) + 14 specs novas passando (239 → 253 passing).
- A hierarquia completa (pai com subtarefas expandindo, span Σ, badge de rollup) só pode ser exercitada visualmente em navegador depois que existir um caminho de criação de subtarefa — isso é o plano 16-05, que também adiciona a coluna Ações (editar/+subtarefa/excluir) à mesma `TaskList.tsx`. Nenhum bloqueio para 16-05 — ele estende exatamente os arquivos que este plano deixou prontos.
- **Recomendado antes do checkpoint humano de 16-06/16-07:** `/gsd-verify-work` deve confirmar visualmente o fluxo completo (criar subtarefa → expandir a pai na Lista → ver span agregado e badge de conclusão), junto com a pendência já registrada em 16-02-SUMMARY.md.

---
*Phase: 16-tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt*
*Completed: 2026-08-05*

## Self-Check: PASSED

All created files and referenced commits verified to exist on disk / in git history.
