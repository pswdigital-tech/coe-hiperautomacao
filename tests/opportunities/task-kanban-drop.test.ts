// =============================================================================
// task-kanban-drop.test.ts — specs puras da máquina de decisão do drop do
// Kanban de tarefas (Phase 16, Plan 16-06, TASK-09, D-03). Sem React, sem
// DOM, sem banco — só as duas funções puras de
// components/opportunities/tasks/kanban/decide-drop.ts. Trava a regra mais
// delicada da fase: mover um card para Bloqueio exige o motivo ANTES de
// concluir a movimentação, e cancelar o pedido de motivo não produz nenhum
// efeito colateral (RESEARCH Pattern 5 — anti-padrão explícito: atualização
// otimista prematura no destino Bloqueio).
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  decideStatusChange,
  decideBlockReason,
} from '@/components/opportunities/tasks/kanban/decide-drop';

describe('decideStatusChange — decisão pura do drop/troca de status (TASK-08/09, D-03)', () => {
  it('soltar fora de qualquer coluna (destino ausente): nada a fazer', () => {
    expect(decideStatusChange('backlog', undefined)).toEqual({ kind: 'noop' });
  });

  it('soltar na coluna do próprio status atual: nada a fazer', () => {
    expect(decideStatusChange('em_andamento', 'em_andamento')).toEqual({ kind: 'noop' });
  });

  it('soltar numa coluna diferente que não é bloqueio: aplica imediatamente com motivo nulo', () => {
    expect(decideStatusChange('backlog', 'em_andamento')).toEqual({
      kind: 'apply',
      status: 'em_andamento',
      blockedReason: null,
    });
  });

  it('soltar na coluna de bloqueio: pede o motivo, sem aplicar nada ainda', () => {
    expect(decideStatusChange('em_andamento', 'bloqueio')).toEqual({ kind: 'ask-reason' });
  });
});

describe('decideBlockReason — decisão pura do diálogo de motivo do bloqueio (TASK-09)', () => {
  it('confirmar com motivo preenchido: aplica a mudança para bloqueio com aquele motivo', () => {
    expect(decideBlockReason('Aguardando aprovação do cliente')).toEqual({
      kind: 'apply',
      blockedReason: 'Aguardando aprovação do cliente',
    });
  });

  it('cancelar o pedido de motivo (reason null): nada a fazer', () => {
    expect(decideBlockReason(null)).toEqual({ kind: 'noop' });
  });

  it('confirmar com motivo só de espaços em branco: tratado como ausente, nada a fazer', () => {
    expect(decideBlockReason('   ')).toEqual({ kind: 'noop' });
  });
});
