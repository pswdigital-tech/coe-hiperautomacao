// =============================================================================
// task-status.ts — regra pura de normalização do motivo de bloqueio (Phase 16)
// -----------------------------------------------------------------------------
// Extraído de `task-actions.ts`: aquele módulo é `'use server'`, e um arquivo
// `'use server'` só pode exportar funções ASYNC. Uma função pura síncrona
// exportada de lá quebra o build do Next ("Server Actions must be async
// functions") — erro que `tsc` e `vitest` não pegam, só o compilador do Next.
//
// Mesma forma de `kanban/decide-drop.ts`: lógica de decisão pura, sem React,
// sem Supabase, sem I/O — testável isoladamente.
// =============================================================================

import type { TaskStatus } from './types';

export type NormalizedTaskStatusUpdate =
  | { ok: true; status: TaskStatus; blocked_reason: string | null }
  | { ok: false; error: string };

// =============================================================================
// normalizeTaskStatusUpdate — fonte ÚNICA da regra de limpeza do motivo de
// bloqueio (D-03, Pitfall 4). Pura, sem I/O: recebe o status alvo e o motivo
// (possivelmente ausente/em branco) e devolve o par normalizado a gravar, ou
// a recusa quando o motivo é obrigatório e está faltando.
//
// - status === 'bloqueio' e motivo preenchido (não só espaços) → devolve o
//   motivo TRIMADO.
// - status === 'bloqueio' e motivo ausente/só espaços → recusa (ok: false)
//   ANTES de qualquer mutação chegar ao banco.
// - qualquer outro status → motivo SEMPRE nulo no payload, mesmo que um
//   texto tenha sido passado (a coluna nunca é omitida do objeto de update).
// =============================================================================
export function normalizeTaskStatusUpdate(
  status: TaskStatus,
  blockedReason: string | null | undefined
): NormalizedTaskStatusUpdate {
  if (status !== 'bloqueio') {
    return { ok: true, status, blocked_reason: null };
  }

  const trimmed = (blockedReason ?? '').trim();
  if (!trimmed) {
    return {
      ok: false,
      error: 'Motivo do bloqueio obrigatório quando o status é Bloqueio.',
    };
  }

  return { ok: true, status, blocked_reason: trimmed };
}
