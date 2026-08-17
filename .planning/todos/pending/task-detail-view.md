---
id: task-detail-view
created: 2026-08-05
source: verificação humana do checkpoint da Phase 16 (plan 16-07)
status: pending
---

# Ler tarefa/subtarefa sem entrar em edição

## O que o PO pediu

> "Seria legal conseguir clicar na tarefa ou na subtarefa para ler o conteúdo
> sem ter que clicar em editar. Além disso, quando clicar para ver uma tarefa
> seria legal ver as subtarefas associadas."

## Por que ficou de fora da Phase 16

Não corresponde a nenhum requisito TASK-01..TASK-11. A fase entregou CRUD
(TASK-05/06) e expandir/comprimir (TASK-07), mas nunca uma view de leitura.
É escopo novo, adiado por decisão do PO em 2026-08-05.

## Forma sugerida

Painel de leitura expansível na própria linha da Lista (não um modal novo):
descrição, datas, responsável, status, motivo de bloqueio quando houver, e a
lista de subtarefas associadas com seus status. Clicar em qualquer lugar da
linha abre; o botão de expandir atual vira o mesmo gesto.

Aproveita `computeTaskRollup` e `groupTasksByParent` (`lib/opportunities/task-rollup.ts`)
— os dados já estão todos em memória na página, nenhuma query nova é necessária.

## Contexto relevante

- `components/opportunities/tasks/TaskList.tsx` — onde o painel entraria
- `app/(app)/opportunities/[id]/tarefas/page.tsx` — já carrega o array plano
  de tarefas (raízes + subtarefas) numa única busca
- A view Lista é `'use client'`; o estado de expansão já existe (`expandedIds`)
