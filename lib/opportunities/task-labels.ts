import type { TaskStatus, TaskPriority } from './types';
import {
  PRIORITY_ORDER,
  PRIORITY_META,
  PRIORITY_OPTIONS,
  PRIORITY_RANK,
  type PriorityMeta,
} from './priority-labels';

// =============================================================================
// task-labels.ts — fonte única de metadados dos status de `opportunity_tasks`
// (Phase 16, D-03; 5º status em 0060) — espelha a forma de `StatusMeta`/`STATUS_META` de
// `lib/opportunities/status.ts`, NÃO o mapa simples de `risk-labels.ts`, porque
// o status de tarefa precisa de ícone + cor para o Kanban (16-06) e para os
// badges da Lista (16-02+) — os dois consumidores importam TASK_STATUS_ORDER/
// TASK_STATUS_META daqui; ninguém redeclara rótulo ou cor (mesma motivação do
// header de status.ts: evitar cópias divergentes).
//
// Valores fixados na UI-SPEC §"Task status palette" — sem coluna configurável
// por tenant (D-03).
// =============================================================================

export type TaskStatusMeta = {
  status: TaskStatus;
  label: string;
  icon: string;
  /** cor de destaque (texto do badge / borda da coluna kanban) */
  color: string;
  /** fundo do badge (par de cor legível com `color`) */
  bg: string;
};

// Ordem canônica — as colunas do Kanban de tarefas, nesta ordem exata (D-03).
// `homologacao` (0060) entra entre "Em Andamento" e "Finalizado": é a espera
// entre "feito" e "aceito". `bloqueio` fica por ÚLTIMO de propósito — não é
// etapa do fluxo, é desvio dele; no meio da esteira ele quebrava a leitura da
// esquerda para a direita.
//
// Esta constante é a ÚNICA fonte da ordem: Kanban, seletor de status do
// formulário/card, rosca de progresso do resumo e o mapa de contagem de
// `summarizeTasks` iteram todos por ela — nenhum deles redeclara a lista.
export const TASK_STATUS_ORDER: TaskStatus[] = [
  'backlog',
  'em_andamento',
  'homologacao',
  'finalizado',
  'bloqueio',
];

export const TASK_STATUS_META: Record<TaskStatus, TaskStatusMeta> = {
  backlog: { status: 'backlog', label: 'Backlog', icon: '⏳', color: '#f59e0b', bg: '#fef3c7' },
  em_andamento: { status: 'em_andamento', label: 'Em Andamento', icon: '🔄', color: '#3b82f6', bg: '#dbeafe' },
  // Mesma paleta da fase "Homologação" da OPORTUNIDADE (`status.ts`): é a
  // mesma ideia de etapa nas duas telas, e duas cores diferentes para o mesmo
  // nome confundiriam quem lê o detalhe inteiro de cima a baixo.
  homologacao: { status: 'homologacao', label: 'Homologação', icon: '🧪', color: '#06b6d4', bg: '#cffafe' },
  finalizado: { status: 'finalizado', label: 'Finalizado', icon: '✅', color: '#10b981', bg: '#d1fae5' },
  bloqueio: { status: 'bloqueio', label: 'Bloqueio', icon: '🚫', color: '#ef4444', bg: '#fee2e2' },
};

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string; icon: string }[] =
  TASK_STATUS_ORDER.map((s) => ({
    value: s,
    label: TASK_STATUS_META[s].label,
    icon: TASK_STATUS_META[s].icon,
  }));

// =============================================================================
// Tag de prioridade da tarefa (0049) — a APARÊNCIA (rótulo, ícone, cores) vem
// de `priority-labels.ts`, compartilhada com a tag da oportunidade (0050):
// "Alta" tem que ser o mesmo vermelho nas duas telas, e duas paletas
// divergiriam no primeiro ajuste. O que continua daqui são os NOMES do domínio
// de tarefa — os consumidores da Lista/Kanban/formulário não precisam saber
// que o módulo compartilhado existe.
// =============================================================================
export type TaskPriorityMeta = PriorityMeta;

export const TASK_PRIORITY_ORDER = PRIORITY_ORDER as TaskPriority[];
export const TASK_PRIORITY_META = PRIORITY_META as Record<TaskPriority, PriorityMeta>;
export const TASK_PRIORITY_OPTIONS = PRIORITY_OPTIONS;
/** alta(0) < media(1) < baixa(2) — `sort` crescente põe as altas no topo. */
export const TASK_PRIORITY_RANK = PRIORITY_RANK as Record<TaskPriority, number>;

/**
 * Rótulo resiliente do responsável — mesma ideia de `priorityLabel` em
 * `risk-labels.ts`: em vez de propagar o branch por toda a UI, centralizamos o
 * fallback aqui. `nome` chega já resolvido (via `assigneeName`) quando há
 * responsável; `null`/vazio devolve o travessão padrão do projeto.
 */
export function assigneeTaskLabel(nome: string | null | undefined): string {
  return nome && nome.trim() ? nome : '—';
}
