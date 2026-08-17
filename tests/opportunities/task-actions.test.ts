// =============================================================================
// task-actions.test.ts — specs puras de `normalizeTaskStatusUpdate` (Phase 16,
// Plan 16-05, TASK-06) — trava a regra de limpeza do motivo de bloqueio (D-03,
// Pitfall 4): `blocked_reason` é SEMPRE escrito explicitamente no payload de
// atualização, nunca omitido — nulo fora de `bloqueio`, validado (e
// obrigatório, não em branco) quando o status é `bloqueio`. Sem banco — mesma
// convenção de `tests/opportunities/v03-pure-logic.test.ts` (lógica pura
// extraída de um módulo de actions, testada sem mocks de Supabase).
// =============================================================================
import { describe, it, expect } from 'vitest';
import { normalizeTaskStatusUpdate } from '@/lib/opportunities/task-status';

describe('normalizeTaskStatusUpdate — regra de limpeza do motivo de bloqueio (D-03/Pitfall 4)', () => {
  it('bloqueio com motivo preenchido: payload carrega esse motivo', () => {
    const result = normalizeTaskStatusUpdate(
      'bloqueio',
      'Aguardando aprovação do cliente'
    );
    expect(result).toEqual({
      ok: true,
      status: 'bloqueio',
      blocked_reason: 'Aguardando aprovação do cliente',
    });
  });

  it('bloqueio sem motivo (null): recusado antes de chegar ao banco', () => {
    const result = normalizeTaskStatusUpdate('bloqueio', null);
    expect(result.ok).toBe(false);
  });

  it('bloqueio com motivo undefined: recusado antes de chegar ao banco', () => {
    const result = normalizeTaskStatusUpdate('bloqueio', undefined);
    expect(result.ok).toBe(false);
  });

  it('bloqueio com motivo só de espaços em branco: equivale a motivo ausente, recusado', () => {
    const result = normalizeTaskStatusUpdate('bloqueio', '   ');
    expect(result.ok).toBe(false);
  });

  it('em_andamento com motivo preenchido: payload carrega motivo nulo (coluna nunca omitida)', () => {
    const result = normalizeTaskStatusUpdate('em_andamento', 'Um texto qualquer');
    expect(result).toEqual({
      ok: true,
      status: 'em_andamento',
      blocked_reason: null,
    });
  });

  it('backlog com motivo preenchido: payload carrega motivo nulo (coluna nunca omitida)', () => {
    const result = normalizeTaskStatusUpdate('backlog', 'Um texto qualquer');
    expect(result).toEqual({
      ok: true,
      status: 'backlog',
      blocked_reason: null,
    });
  });

  it('finalizado com motivo preenchido: payload carrega motivo nulo (coluna nunca omitida)', () => {
    const result = normalizeTaskStatusUpdate('finalizado', 'Um texto qualquer');
    expect(result).toEqual({
      ok: true,
      status: 'finalizado',
      blocked_reason: null,
    });
  });

  it('finalizado sem motivo: aceito sem recusa — motivo só é obrigatório em bloqueio', () => {
    const result = normalizeTaskStatusUpdate('finalizado', null);
    expect(result).toEqual({
      ok: true,
      status: 'finalizado',
      blocked_reason: null,
    });
  });
});
