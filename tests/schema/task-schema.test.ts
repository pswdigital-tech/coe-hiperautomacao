// =============================================================================
// task-schema.test.ts — specs puras de Zod para `taskInputSchema` (0037,
// Phase 16 — TASK-01/TASK-05)
// -----------------------------------------------------------------------------
// Sem banco (modelo: score-rule.test.ts). Cobre: (a) payload mínimo válido,
// (b)/(c) bloqueio sem motivo (ausente / só espaços) falha, (d) bloqueio com
// motivo passa, (e) demais status sem motivo passam, (f)/(g) defesa de mass
// assignment (D-03, T-16-02: tenant_id/opportunity_id/created_by/id rejeitados
// por `.strict()`), (h) limites de título, (i) limite de descrição, (j) strings
// vazias aceitas em campos opcionais.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { taskInputSchema } from '@/lib/opportunities/task-schema';

describe('taskInputSchema — payload mínimo e status', () => {
  it('(a) payload mínimo válido (só título) passa', () => {
    const result = taskInputSchema.safeParse({ title: 'Mapear processo atual' });
    expect(result.success).toBe(true);
  });

  it('(b) status bloqueio sem motivo falha, issue no caminho de blocked_reason', () => {
    const result = taskInputSchema.safeParse({ title: 'X', status: 'bloqueio' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'blocked_reason');
      expect(issue).toBeDefined();
    }
  });

  it('(c) status bloqueio com motivo só de espaços em branco também falha', () => {
    const result = taskInputSchema.safeParse({
      title: 'X',
      status: 'bloqueio',
      blocked_reason: '   ',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'blocked_reason');
      expect(issue).toBeDefined();
    }
  });

  it('(d) status bloqueio com motivo preenchido passa', () => {
    const result = taskInputSchema.safeParse({
      title: 'X',
      status: 'bloqueio',
      blocked_reason: 'Aguardando acesso ao sistema legado',
    });
    expect(result.success).toBe(true);
  });

  it('(e) cada um dos outros três status passa sem motivo', () => {
    for (const status of ['backlog', 'em_andamento', 'finalizado'] as const) {
      const result = taskInputSchema.safeParse({ title: 'X', status });
      expect(result.success).toBe(true);
    }
  });
});

describe('taskInputSchema — defesa de mass assignment (T-16-02, D-03)', () => {
  it('(f) payload contendo tenant_id é rejeitado por chave não reconhecida', () => {
    const result = taskInputSchema.safeParse({
      title: 'X',
      tenant_id: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.success).toBe(false);
  });

  it('(g) payload contendo opportunity_id, created_by ou id é rejeitado', () => {
    for (const key of ['opportunity_id', 'created_by', 'id']) {
      const result = taskInputSchema.safeParse({
        title: 'X',
        [key]: '11111111-1111-1111-1111-111111111111',
      });
      expect(result.success).toBe(false);
    }
  });
});

describe('taskInputSchema — limites de tamanho', () => {
  it('(h) título vazio falha, 201 caracteres falha, 200 caracteres passa', () => {
    expect(taskInputSchema.safeParse({ title: '' }).success).toBe(false);
    expect(taskInputSchema.safeParse({ title: 'a'.repeat(201) }).success).toBe(false);
    expect(taskInputSchema.safeParse({ title: 'a'.repeat(200) }).success).toBe(true);
  });

  it('(i) descrição com 2001 caracteres falha', () => {
    const result = taskInputSchema.safeParse({
      title: 'X',
      description: 'a'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

describe('taskInputSchema — campos opcionais aceitam string vazia', () => {
  it('(j) description, start_date, due_date e assignee_id como string vazia são aceitos', () => {
    const result = taskInputSchema.safeParse({
      title: 'X',
      description: '',
      start_date: '',
      due_date: '',
      assignee_id: '',
    });
    expect(result.success).toBe(true);
  });
});
