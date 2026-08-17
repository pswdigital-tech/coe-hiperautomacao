import type { OpportunityTask } from './types';
import { TASK_PRIORITY_RANK } from './task-labels';

// =============================================================================
// task-order.ts — os dois modos de ordenação das tarefas (0049)
// -----------------------------------------------------------------------------
// Módulo puro, sem I/O e sem React — mesma disciplina de `task-rollup.ts`, e
// pelo mesmo motivo: a ordenação precisa ser testável sem montar componente, e
// Lista/Kanban/Gantt têm que concordar sobre "qual vem primeiro".
//
// Por que o modo por TAG é resolvido aqui e não num `order()` do Postgres: a
// ordenação só faz sentido DENTRO de um grupo de irmãos (raízes entre raízes,
// filhas entre as filhas da mesma pai) — ordenar a tabela plana por prioridade
// embaralharia as subtarefas para longe das suas pais. O agrupamento pai/filha
// só existe depois de `groupTasksByParent`, no cliente; então é aqui.
//
// `manual` NÃO reordena nada: a query já devolve em `priority_order` (nulls
// last, `created_at` desempatando). Existir como valor explícito no tipo é o
// que faz a UI conseguir dizer "estou no modo em que dá para arrastar".
// =============================================================================

export type TaskOrderMode = 'manual' | 'prioridade';

/**
 * Ordena um grupo de IRMÃOS. Em `manual`, devolve a entrada intacta (a ordem
 * do servidor já é a manual). Em `prioridade`, alta → média → baixa, com a
 * ordem manual como critério de desempate — duas tarefas "alta" continuam
 * entre si na sequência que a pessoa montou, em vez de trocarem de lugar a
 * cada render.
 *
 * Nunca muta a entrada (devolve cópia no modo que ordena).
 */
export function sortSiblings(
  siblings: OpportunityTask[],
  mode: TaskOrderMode
): OpportunityTask[] {
  if (mode === 'manual') return siblings;
  return [...siblings].sort(
    (a, b) => TASK_PRIORITY_RANK[a.priority] - TASK_PRIORITY_RANK[b.priority]
  );
}
