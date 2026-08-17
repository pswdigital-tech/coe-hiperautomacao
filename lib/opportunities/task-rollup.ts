import type { OpportunityTask } from './types';

// =============================================================================
// task-rollup.ts — fonte única do span agregado e do % de conclusão da
// tarefa-pai (Phase 16, TASK-11, D-02) — espelha `score.ts` no papel (módulo
// de valor derivado, cabeçalho declarando "fonte única", funções puras sem
// I/O, disciplina de arredondamento explícita), mas com uma diferença
// deliberada: AO CONTRÁRIO de `score.ts`, este módulo NÃO TEM função SQL
// espelho e NÃO PRECISA de teste de paridade.
//
// Por quê: `score` é lido em `ORDER BY`/filtro server-side sobre TODAS as
// oportunidades do tenant (centenas de linhas) — por isso existe a view SQL
// `opportunities_with_score` além do preview client, e a divergência entre
// as duas é um risco real que o teste de paridade (score-rule.test.ts)
// existe para travar. O rollup de tarefas não tem esse segundo consumidor:
// nenhum requisito desta fase pede ordenar/filtrar oportunidades por "% de
// conclusão das tarefas" — o ÚNICO consumidor é o mesmo processo que já
// buscou `opportunity_tasks` via `fetchTasksForOpportunity` e já tem o array
// em memória (Lista e, no plano 16-07, o Gantt). Calcular em TS puro sobre
// esse array é estritamente mais simples que criar view + migration + teste
// de paridade para o mesmo resultado, e satisfaz D-02 trivialmente: não há
// "duas fórmulas" para divergir porque só existe uma.
//
// NUNCA PERSISTIDO (D-02, mesma regra do score e do `rpa_score` — docs/PROJETO.md
// §3): não existe coluna `progress`/`computed_start`/similar em
// `opportunity_tasks` (migration 0037, verificado no handoff de 16-01) e
// este módulo nunca escreve — ele só lê o array já buscado pela RLS e
// devolve um objeto que nasce e morre na renderização.
// =============================================================================

export type TaskRollup = {
  /** Menor start_date entre as filhas que têm data; null se nenhuma tiver (ou tarefa sem filhas). */
  spanStart: string | null;
  /** Maior due_date entre as filhas que têm data; null se nenhuma tiver (ou tarefa sem filhas). */
  spanDue: string | null;
  /** 0–100, arredondado para o inteiro mais próximo. null se a tarefa não tem filhas (A3 — nenhum rollup tentado). */
  percentComplete: number | null;
  totalChildren: number;
  completedChildren: number;
};

/**
 * Rollup de UMA tarefa-pai a partir das SUAS subtarefas diretas (2 níveis —
 * nunca recursivo, D-01 garante que uma subtarefa nunca tem filhas). Pura,
 * sem I/O, sem dependência de Supabase/Next — mesma entrada devolve sempre a
 * mesma saída, e a entrada nunca é mutada.
 *
 * "Concluída" = status === 'finalizado' (único status que conta; D-03 não
 * define estado parcial — suposição A2 do RESEARCH).
 *
 * Tarefa sem filhas → devolve o objeto neutro (spans null, percentual null,
 * contagens zero). A UI trata isso como "tarefa simples": mostra as próprias
 * datas e um travessão no percentual — nunca "0%" (A3).
 */
export function computeTaskRollup(children: OpportunityTask[]): TaskRollup {
  if (children.length === 0) {
    return {
      spanStart: null,
      spanDue: null,
      percentComplete: null,
      totalChildren: 0,
      completedChildren: 0,
    };
  }

  const starts = children.map((c) => c.start_date).filter((d): d is string => d != null);
  const dues = children.map((c) => c.due_date).filter((d): d is string => d != null);

  // Formato ISO de data (ano-mês-dia) ordena lexicograficamente igual a
  // cronologicamente — comparação de string direta, sem `new Date()`.
  const spanStart = starts.length > 0 ? starts.reduce((a, b) => (a < b ? a : b)) : null;
  const spanDue = dues.length > 0 ? dues.reduce((a, b) => (a > b ? a : b)) : null;

  const completedChildren = children.filter((c) => c.status === 'finalizado').length;
  const percentComplete = Math.round((completedChildren / children.length) * 100);

  return {
    spanStart,
    spanDue,
    percentComplete,
    totalChildren: children.length,
    completedChildren,
  };
}

/**
 * Helper de agrupamento reutilizável — recebe o array PLANO de tarefas (como
 * `fetchTasksForOpportunity` devolve, ordenado por `created_at` ascendente) e
 * devolve as raízes e um mapa `parent_task_id → filhas`, ambos preservando a
 * ordem de entrada. Lista (16-04) e Gantt (16-07) importam este MESMO helper,
 * para que a numeração T001/T001.1 e a ordem das linhas sejam idênticas nas
 * duas views — nenhuma das duas reimplementa o agrupamento por conta própria.
 */
export function groupTasksByParent(tasks: OpportunityTask[]): {
  roots: OpportunityTask[];
  childrenByParent: Map<string, OpportunityTask[]>;
} {
  const roots: OpportunityTask[] = [];
  const childrenByParent = new Map<string, OpportunityTask[]>();

  for (const t of tasks) {
    if (t.parent_task_id) {
      const arr = childrenByParent.get(t.parent_task_id) ?? [];
      arr.push(t);
      childrenByParent.set(t.parent_task_id, arr);
    } else {
      roots.push(t);
    }
  }

  return { roots, childrenByParent };
}
