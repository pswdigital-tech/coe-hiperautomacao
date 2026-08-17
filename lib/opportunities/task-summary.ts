import type { OpportunityTask, TaskStatus } from './types';
import { TASK_STATUS_ORDER } from './task-labels';

// =============================================================================
// task-summary.ts — agregados de leitura do Plano de Atividades exibidos na
// coluna lateral do detalhe (Resumo do progresso + Próximas entregas).
//
// Mesma disciplina de `task-rollup.ts`: funções PURAS sobre o array plano que
// a página já buscou, NUNCA persistidas e sem função SQL espelho — não existe
// consumidor server-side que ordene/filtre oportunidades por estes números.
//
// `today` entra por parâmetro (nunca `new Date()` aqui dentro) por dois
// motivos: a função continua determinística/testável, e o cálculo de
// "atrasadas" fica idêntico no SSR e na hidratação — a página passa a data do
// servidor, evitando o mismatch clássico de renderizar relógio no cliente.
// Datas são ISO `YYYY-MM-DD`, que ordena lexicograficamente igual a
// cronologicamente (mesma técnica de `computeTaskRollup`).
// =============================================================================

export type TaskSummary = {
  /** Contagem por status, cobrindo TODOS os status (0 quando ausente). */
  byStatus: Record<TaskStatus, number>;
  /** Total de tarefas + subtarefas (o plano inteiro). */
  total: number;
  concluidas: number;
  /** 0–100 arredondado; 0 quando o plano está vazio. */
  percentComplete: number;
  /** Vencidas: `due_date` anterior a hoje e status diferente de finalizado. */
  atrasadas: number;
  /** Menor `start_date` e maior `due_date` do plano inteiro (null se ausente). */
  planStart: string | null;
  planDue: string | null;
};

export function summarizeTasks(tasks: OpportunityTask[], today: string): TaskSummary {
  const byStatus = Object.fromEntries(
    TASK_STATUS_ORDER.map((s) => [s, 0])
  ) as Record<TaskStatus, number>;

  let atrasadas = 0;
  let planStart: string | null = null;
  let planDue: string | null = null;

  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;

    if (t.due_date && t.status !== 'finalizado' && t.due_date < today) atrasadas++;
    if (t.start_date && (planStart === null || t.start_date < planStart)) {
      planStart = t.start_date;
    }
    if (t.due_date && (planDue === null || t.due_date > planDue)) {
      planDue = t.due_date;
    }
  }

  const total = tasks.length;
  const concluidas = byStatus.finalizado;

  return {
    byStatus,
    total,
    concluidas,
    percentComplete: total === 0 ? 0 : Math.round((concluidas / total) * 100),
    atrasadas,
    planStart,
    planDue,
  };
}

/**
 * Próximas entregas: tarefas ainda não finalizadas COM data de fim, da mais
 * próxima para a mais distante. Empate resolvido pelo título, para que a ordem
 * não dependa da ordem de chegada do banco.
 */
export function nextDeliveries(
  tasks: OpportunityTask[],
  limit = 3
): OpportunityTask[] {
  return tasks
    .filter((t) => t.status !== 'finalizado' && t.due_date != null)
    .sort((a, b) => {
      const byDue = (a.due_date ?? '').localeCompare(b.due_date ?? '');
      return byDue !== 0 ? byDue : a.title.localeCompare(b.title);
    })
    .slice(0, limit);
}
