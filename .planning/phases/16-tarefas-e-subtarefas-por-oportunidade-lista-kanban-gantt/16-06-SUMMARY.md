---
phase: 16-tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt
plan: 06
subsystem: ui
tags: [nextjs, react, dnd-kit, tailwind, vitest, kanban, drag-and-drop]

# Dependency graph
requires:
  - phase: 16-05
    provides: "updateTaskStatus(taskId, status, blockedReason) — contrato exato consumido pelo drop; normalizeTaskStatusUpdate como fonte única da regra de limpeza do motivo"
  - phase: 16-04
    provides: "groupTasksByParent (agrupamento raízes/filhas), TASK_STATUS_ORDER/TASK_STATUS_META (16-02)"
provides:
  - "decide-drop.ts — decideStatusChange/decideBlockReason, funções puras (sem React/dnd-kit/Supabase) que são o ÚNICO caminho de decisão do drop E do controle de status por teclado"
  - "TaskKanbanBoard/Column/Card.tsx — Kanban de 4 colunas fixas (D-03), interceptação do destino Bloqueio (TASK-09) sem atualização otimista prematura"
  - "BlockedReasonDialog.tsx — prompt obrigatório e cancelável do motivo do bloqueio"
  - "TaskViewSwitcher.tsx — controle de views Lista/Kanban (Gantt entra em 16-07 na mesma lista)"
  - "app/(app)/opportunities/[id]/tarefas/page.tsx ramificando por ?view= sobre a mesma busca única"
affects: [16-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "decide-drop.ts extrai a decisão de mudança de status para fora de qualquer componente 'use client' — o mesmo caminho puro atende onDragEnd (dnd-kit) e o <select> de status por teclado do card, sem duplicar a regra de interceptação do bloqueio"
    - "TaskKanbanBoard NÃO aplica atualização otimista quando o destino é bloqueio — guarda só {taskId} em pendingBlock e espera BlockedReasonDialog confirmar/cancelar (RESEARCH Pattern 5); cancelar não precisa de rollback porque o estado local nunca foi mutado"
    - "IDs (T001/T001.1) e legendas de hierarquia (🧩 N subtarefa(s) / ↳ subtarefa de {título}) calculados uma vez sobre o array COMPLETO em TaskKanbanBoard via groupTasksByParent — mesma numeração estável da Lista, independente de em qual coluna cada card está"

key-files:
  created:
    - components/opportunities/tasks/kanban/decide-drop.ts
    - components/opportunities/tasks/kanban/TaskKanbanBoard.tsx
    - components/opportunities/tasks/kanban/TaskKanbanColumn.tsx
    - components/opportunities/tasks/kanban/TaskKanbanCard.tsx
    - components/opportunities/tasks/kanban/BlockedReasonDialog.tsx
    - components/opportunities/tasks/TaskViewSwitcher.tsx
    - tests/opportunities/task-kanban-drop.test.ts
  modified:
    - app/(app)/opportunities/[id]/tarefas/page.tsx

key-decisions:
  - "decideBlockReason(reason: string | null) usa null para representar CANCELAMENTO (ESC/clique fora/botão Cancelar) e string vazia/só-espaços para 'confirmado mas sem texto útil' — os dois caminhos convergem no mesmo `{ kind: 'noop' }`, mas por entradas distintas e testáveis separadamente, unificando o cancelamento e a rejeição por motivo ausente no MESMO caminho de decisão em vez de dois códigos diferentes."
  - "TaskKanbanColumn.tsx/TaskKanbanCard.tsx foram escritos no disco durante a Task 1 (para que TaskKanbanBoard.tsx typecheckasse de ponta a ponta) mas só entraram no `git add`/commit da Task 2 — nenhum arquivo committado antes da hora, cada commit permanece exatamente com os arquivos que o plano atribui a cada task."
  - "Controle de status por teclado do card é um <select> nativo (não um dnd-kit KeyboardSensor) — decisão já travada pela UI-SPEC (Accessibility) para evitar a colisão/anúncio customizados que o dnd-kit exigiria; chama a MESMA `onStatusChangeRequest`/`decideStatusChange` do drop."

patterns-established:
  - "Kanban de tarefas é PLANO — toda tarefa/subtarefa (raiz ou filha) recebe seu próprio card na coluna do próprio status; a hierarquia aparece só como legenda informativa (🧩 N subtarefa(s) / ↳ subtarefa de {título}), nunca como expand/collapse (diferente da Lista/Gantt, que SÃO hierárquicos)."

requirements-completed: [TASK-08, TASK-09]

coverage:
  - id: D1
    description: "decideStatusChange/decideBlockReason — máquina de decisão pura do drop (fora de coluna, mesmo status, apply direto para não-bloqueio, pedir motivo para bloqueio, confirmar com motivo, cancelar, motivo só de espaços) — 7 comportamentos, sem React/dnd-kit/Supabase no módulo"
    requirement: "TASK-09"
    verification:
      - kind: unit
        ref: "tests/opportunities/task-kanban-drop.test.ts (7 specs, todas pass)"
        status: pass
      - kind: unit
        ref: "npm run typecheck (0 erros novos) + grep estrutural (ausência de react/@dnd-kit/core/@/lib/supabase/ como import em decide-drop.ts)"
        status: pass
    human_judgment: false
  - id: D2
    description: "TaskKanbanBoard.tsx — 4 colunas fixas via TASK_STATUS_ORDER (nunca parametrizadas por prop, D-03), drop não-bloqueio aplica otimista+persiste com rollback em erro, drop bloqueio NÃO muda estado local até confirmação, cancelamento sem rollback"
    requirement: "TASK-08"
    verification:
      - kind: unit
        ref: "npm run typecheck (0 erros novos) + inspeção estrutural do plano (Task 1 <verify>) — DndContext, PointerSensor, TASK_STATUS_ORDER, ausência de props que redefinam colunas"
        status: pass
    human_judgment: true
    rationale: "O fluxo visual completo de arrastar um card, ver a interceptação do prompt de motivo abrir/fechar, e o rollback em caso de erro de rede não foi exercitado em navegador real nesta execução — apenas typecheck, a suíte de 7 specs puras sobre a máquina de decisão, e greps estruturais. UAT conversacional (/gsd-verify-work) deve confirmar visualmente antes do checkpoint humano da fase, junto com as pendências já registradas em 16-04/16-05."
  - id: D3
    description: "TaskKanbanColumn.tsx/TaskKanbanCard.tsx — coluna droppable com contador (inclusive zero) e sem métrica agregada secundária; card com caixa do motivo do bloqueio (só quando status=bloqueio, truncada+tooltip), legenda de hierarquia, ficha de responsável, pastilha de data (omitida se nula), controle de status por teclado, aria-busy durante a transição"
    requirement: "TASK-08"
    verification:
      - kind: unit
        ref: "npm run typecheck + grep estrutural do plano (Task 2 <verify>) — use client, TASK_STATUS_META, useDroppable, useDraggable, blocked_reason, aria-busy, onStatusChangeRequest, ausência de @/components/ui/ — todas OK"
        status: pass
    human_judgment: true
    rationale: "Mesma razão de D2 — a densidade visual do card (truncamento em 2 linhas, tooltip do motivo, avatar de iniciais, pastilha de data) não foi exercitada em navegador real. UAT conversacional deve confirmar."
  - id: D4
    description: "TaskViewSwitcher.tsx + page.tsx — controle segmentado Lista/Kanban preservando os demais parâmetros da URL, página ramifica por ?view= com fallback seguro para Lista, estado vazio (0 tarefas) mostra o mesmo bloco independente da view pedida, switcher sempre visível"
    requirement: "TASK-08"
    verification:
      - kind: unit
        ref: "npm run typecheck + npm test (268 passing / 7 falhas pré-existentes / 80 skipped, sem regressão) + grep estrutural do plano (Task 3 <verify>) — todas OK exceto uma nota abaixo"
        status: pass
      - kind: other
        ref: "grep -c fetchTasksForOpportunity conta 2 (import + chamada) — falso positivo pré-existente do script (mesma contagem já em HEAD~3, antes deste plano); a chamada real acontece exatamente 1 vez (linha 54)"
        status: pass
    human_judgment: true
    rationale: "A alternância visual entre Lista e Kanban preservando ?tarefa=/?parent= abertos, e o comportamento do switcher em viewport estreito (rótulos ocultos), não foram exercitados em navegador real. UAT conversacional deve confirmar."

duration: ~30min
completed: 2026-08-05
status: complete
---

# Phase 16 Plan 06: Kanban de Tarefas — 4 Colunas Fixas + Interceptação de Bloqueio Summary

**Kanban de tarefas com dnd-kit (4 colunas fixas na ordem travada D-03), interceptação do destino Bloqueio que exige o motivo antes de qualquer mudança visual de coluna (sem atualização otimista prematura), e o controle de views Lista/Kanban sobre a mesma busca única.**

## Performance

- **Duration:** ~30min
- **Completed:** 2026-08-05
- **Tasks:** 3/3
- **Files modified:** 8 (7 novos, 1 modificado)

## Accomplishments
- `components/opportunities/tasks/kanban/decide-drop.ts`: `decideStatusChange`/`decideBlockReason` — as DUAS funções puras (sem React, `@dnd-kit/core` ou Supabase) que decidem o resultado de QUALQUER troca de status, seja por drop do dnd-kit ou pelo controle de teclado do card. `decideStatusChange` cobre "fora de coluna" (destino ausente), "mesmo status" (nada a fazer), "destino não-bloqueio" (aplicar direto com motivo nulo) e "destino bloqueio" (pedir o motivo, SEM mudar nada ainda). `decideBlockReason` cobre "motivo preenchido" (aplicar), "cancelamento" (`reason === null`, nada a fazer) e "motivo só de espaços" (tratado como ausente, nada a fazer) — os dois últimos convergem no mesmo `noop`, unificando cancelamento e rejeição de motivo vazio no mesmo caminho.
- `components/opportunities/tasks/kanban/TaskKanbanBoard.tsx`: clona `kanban/Board.tsx` (sensor de ponteiro 5px, ressincronização quando a prop `tasks` muda, banner de erro) mas ramifica o `onDragEnd` pela decisão pura — no destino Bloqueio, **nenhuma** chamada de `setLocalTasks` acontece antes da confirmação do diálogo (RESEARCH Pattern 5: o anti-padrão explícito era mover o card otimisticamente antes do motivo, exigindo rollback no cancelamento — este código nunca cai nessa armadilha, porque cancelar só limpa `pendingBlock`, e não há nada a desfazer). IDs (T001/T001.1) e legendas de hierarquia (🧩/↳) calculados uma vez sobre o array completo via `groupTasksByParent` (mesmo helper de 16-04), estáveis independente de coluna.
- `components/opportunities/tasks/kanban/TaskKanbanColumn.tsx` + `TaskKanbanCard.tsx`: clonam `kanban/Column.tsx`/`Card.tsx` na mecânica (droppable/draggable, realce ao arrastar sobre, transform manual). Card: caixa do motivo do bloqueio (só quando `status === 'bloqueio'`, `line-clamp-2` + `title=` completo), ficha do responsável (iniciais + nome ou "Sem responsável"), pastilha de data de fim (omitida por completo se nula), e um `<select>` de status alcançável por Tab que chama a MESMA `onStatusChangeRequest`/`decideStatusChange` do drop — escolher Bloqueio por teclado também abre `BlockedReasonDialog`. `aria-busy` no card durante a transição (sem indicador visual de loading, por decisão da UI-SPEC).
- `components/opportunities/tasks/kanban/BlockedReasonDialog.tsx`: overlay controlado pelo pai (`open`/`onConfirm`/`onCancel`), ESC e clique-fora contam como cancelamento (nunca confirmação), botão "Confirmar bloqueio" desabilitado enquanto o textarea está vazio/só espaços.
- `components/opportunities/tasks/TaskViewSwitcher.tsx`: segmented control com a forma exata de `toolbar.tsx` (mesmas classes ativo/inativo, rótulos ocultos abaixo de `lg`); troca só `?view=`, preservando `?tarefa=`/`?parent=`/qualquer parâmetro futuro. Registra Lista e Kanban agora; 16-07 acrescenta Gantt à mesma lista `VIEWS`.
- `app/(app)/opportunities/[id]/tarefas/page.tsx`: lê `?view=` com `parseTaskView` (fallback seguro para Lista, mesmo padrão de `toolbar.tsx`), monta o switcher entre o título e "+ Nova Tarefa", ramifica `TaskList`/`TaskKanbanBoard` sobre o MESMO array já buscado (`fetchTasksForOpportunity` continua chamado uma única vez). Estado vazio (0 tarefas) sempre mostra o bloco embutido de `TaskList`, mesmo se `?view=kanban` — o switcher continua visível (UI-SPEC "zero-one-many").
- `tests/opportunities/task-kanban-drop.test.ts`: 7 specs puras (sem React/DOM/banco) cobrindo os 7 comportamentos declarados no plano.

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Máquina de decisão do drop e o quadro com interceptação de bloqueio** - `c47ea07` (feat)
2. **Task 2: Coluna e card do Kanban de tarefas** - `b5c8172` (feat)
3. **Task 3: Controle de views e roteamento da página entre Lista e Kanban** - `bddf570` (feat)

**Plan metadata:** (a seguir — commit deste SUMMARY.md + STATE.md + ROADMAP.md)

## Files Created/Modified
- `components/opportunities/tasks/kanban/decide-drop.ts` - `decideStatusChange`, `decideBlockReason`
- `components/opportunities/tasks/kanban/TaskKanbanBoard.tsx` - quadro com dnd-kit, estado otimista, interceptação de bloqueio
- `components/opportunities/tasks/kanban/TaskKanbanColumn.tsx` - coluna droppable com contador
- `components/opportunities/tasks/kanban/TaskKanbanCard.tsx` - card arrastável com motivo do bloqueio, hierarquia informativa, controle de status por teclado
- `components/opportunities/tasks/kanban/BlockedReasonDialog.tsx` - prompt obrigatório e cancelável do motivo
- `components/opportunities/tasks/TaskViewSwitcher.tsx` - controle segmentado Lista/Kanban
- `tests/opportunities/task-kanban-drop.test.ts` - 7 specs puras (sem banco) sobre a máquina de decisão
- `app/(app)/opportunities/[id]/tarefas/page.tsx` - leitura de `?view=`, montagem do switcher, ramificação para o Kanban

## Decisions Made
- **`decideBlockReason(reason: string | null)` unifica cancelamento e motivo-vazio no mesmo `noop`:** `null` representa "cancelou o diálogo" (ESC/clique fora/botão Cancelar) e string vazia/só-espaços representa "confirmou sem texto útil" — os dois produzem `{ kind: 'noop' }`, mas por entradas distintas, permitindo testar cada comportamento separadamente sem duplicar a lógica de rejeição.
- **`TaskKanbanColumn.tsx`/`TaskKanbanCard.tsx` escritos no disco durante a Task 1, commitados só na Task 2:** `TaskKanbanBoard.tsx` (Task 1) precisa importar essas duas colunas/cards para typecheckar e para o Kanban funcionar de ponta a ponta — como o plano atribui esses dois arquivos à Task 2, eu os escrevi no disco durante a Task 1 (para que `npm run typecheck` da Task 1 passasse) mas só os adicionei ao `git add`/commit na Task 2. Nenhum arquivo foi committado fora do task ao qual o plano o atribui.
- **Controle de status por teclado é um `<select>` nativo, não o `KeyboardSensor` do dnd-kit** — decisão já travada pela UI-SPEC (evita a colisão/anúncio customizados que o dnd-kit exigiria e este repositório nunca construiu); chama a mesma `onStatusChangeRequest`/`decideStatusChange` do drop, garantindo que escolher Bloqueio por teclado também abra o diálogo de motivo.

## Deviations from Plan

None - plano executado exatamente como escrito. A criação de `decide-drop.ts` como módulo irmão (não listado no `<files>` da Task 1, mas explicitamente autorizado pelo próprio texto do plano: "Exportar de TaskKanbanBoard.tsx (ou de um módulo irmão importado por ele)") foi necessária para satisfazer o acceptance criteria "o módulo que as define não importa react, @dnd-kit/core nem @/lib/supabase/" — `TaskKanbanBoard.tsx` em si é `'use client'` e importa `@dnd-kit/core`, então as funções puras não poderiam viver nele.

## Issues Encountered
- O grep `test "$(grep -c "fetchTasksForOpportunity" "$p")" -eq 1` do `<verify>` da Task 3 conta 2 ocorrências (a linha do `import` e a chamada real) — confirmado via `git show HEAD~3` que essa contagem já era 2 antes deste plano (característica pré-existente do arquivo, não uma regressão introduzida aqui). A chamada de fato acontece exatamente uma vez (linha 54); o requisito substantivo ("página faz exatamente uma busca de tarefas") está satisfeito — nenhuma query nova foi adicionada.

## User Setup Required

None - nenhuma configuração externa necessária.

## Next Phase Readiness
- `npm run typecheck` limpo (só a falha pré-existente já registrada em `deferred-items.md`/`WINDOWS.md`, fora de escopo desta fase).
- `npm test`: 268 passing / 7 falhas pré-existentes / 80 skipped (261 baseline pós-16-05 + 7 specs novas de `task-kanban-drop.test.ts`) — **sem nenhuma regressão nova**.
- TASK-08 e TASK-09 entregues: 4 colunas fixas na ordem travada, arraste que persiste o status via `updateTaskStatus` (contrato exato de 16-05), motivo obrigatório e cancelável no destino Bloqueio sem rollback (nunca houve mutação a desfazer), motivo visível no card.
- `TaskViewSwitcher.tsx`'s array `VIEWS` está pronto para 16-07 acrescentar a entrada de Gantt sem mudar a mecânica de troca de parâmetro.
- **Recomendado antes do checkpoint humano da fase:** `/gsd-verify-work` deve confirmar visualmente o fluxo completo do Kanban (arrastar um card entre colunas não-bloqueio, arrastar para Bloqueio e ver o diálogo abrir, confirmar com motivo e ver a caixa vermelha no card, cancelar e ver o card voltar sem nenhuma escrita, usar o `<select>` de status por teclado) — acumula-se à pendência já registrada em 16-02/16-04/16-05.
- Nenhum bloqueio conhecido para 16-07 (Gantt), que reusa `groupTasksByParent`/`computeTaskRollup` (16-04) e acrescenta a entrada de Gantt ao `TaskViewSwitcher` existente.

---
*Phase: 16-tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt*
*Completed: 2026-08-05*

## Self-Check: PASSED

All created/modified files and referenced commits (`c47ea07`, `b5c8172`, `bddf570`) verified to exist on disk / in git history.
