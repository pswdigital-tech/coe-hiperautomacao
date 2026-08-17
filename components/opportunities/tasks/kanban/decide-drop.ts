import type { TaskStatus } from '@/lib/opportunities/types';

// =============================================================================
// decide-drop.ts — máquina de decisão pura do Kanban de tarefas (Phase 16,
// Plan 16-06, TASK-08/TASK-09, D-03). Duas funções, sem I/O, sem React, sem
// dnd-kit, sem Supabase — só o resultado da comparação de status vira a
// decisão que TaskKanbanBoard.tsx executa. Mantidas fora de
// TaskKanbanBoard.tsx (que é `'use client'` e importa `@dnd-kit/core`) para
// que possam ser testadas sem DOM/navegador
// (tests/opportunities/task-kanban-drop.test.ts) e para que o MESMO caminho
// de decisão sirva tanto o drag do dnd-kit quanto o controle de status por
// teclado do card (TaskKanbanCard.tsx) — nenhum dos dois caminhos reimplementa
// a regra.
//
// Anti-padrão explícito do RESEARCH (Pattern 5): NÃO faça atualização
// otimista antes do motivo de bloqueio ser confirmado — por isso
// `decideStatusChange` nunca devolve uma decisão de "aplicar" quando o
// destino é `bloqueio`; ela só devolve "pedir o motivo", e é
// `decideBlockReason` (chamada só depois da confirmação/cancelamento do
// diálogo) que decide se a mudança é de fato aplicada.
// =============================================================================

export type DropDecision =
  | { kind: 'noop' }
  | { kind: 'apply'; status: TaskStatus; blockedReason: null }
  | { kind: 'ask-reason' };

/**
 * Decide o que fazer quando um card é solto (dnd-kit) ou tem o status
 * trocado pelo controle de teclado, indo de `currentStatus` para
 * `targetStatus`.
 *
 * - `targetStatus` ausente (solto fora de qualquer coluna) → nada a fazer.
 * - `targetStatus` igual ao status atual → nada a fazer.
 * - `targetStatus` é `bloqueio` → pedir o motivo, SEM aplicar nada ainda —
 *   o estado local não muda até o diálogo confirmar (Pattern 5).
 * - qualquer outro destino diferente → aplicar imediatamente, motivo nulo.
 */
export function decideStatusChange(
  currentStatus: TaskStatus,
  targetStatus: TaskStatus | null | undefined
): DropDecision {
  if (!targetStatus) return { kind: 'noop' };
  if (targetStatus === currentStatus) return { kind: 'noop' };
  if (targetStatus === 'bloqueio') return { kind: 'ask-reason' };
  return { kind: 'apply', status: targetStatus, blockedReason: null };
}

export type BlockReasonDecision =
  | { kind: 'noop' }
  | { kind: 'apply'; blockedReason: string };

/**
 * Decide o resultado do diálogo de motivo do bloqueio (`BlockedReasonDialog`).
 *
 * - `reason === null` representa o CANCELAMENTO (ESC, clique fora, botão
 *   "Cancelar") → nada a fazer, sem qualquer efeito colateral — não há
 *   rollback porque o estado local nunca foi mutado enquanto o diálogo
 *   estava aberto (Pattern 5).
 * - `reason` vazio ou só espaços em branco (confirmado, mas sem texto útil)
 *   → tratado como motivo ausente, também nada a fazer — espelha a mesma
 *   regra que `normalizeTaskStatusUpdate` (task-actions.ts) aplica no
 *   servidor (Pitfall 4), como defesa em profundidade no client.
 * - `reason` com texto → aplica a mudança para bloqueio com o motivo
 *   TRIMADO.
 */
export function decideBlockReason(reason: string | null): BlockReasonDecision {
  if (reason === null) return { kind: 'noop' };
  const trimmed = reason.trim();
  if (!trimmed) return { kind: 'noop' };
  return { kind: 'apply', blockedReason: trimmed };
}
