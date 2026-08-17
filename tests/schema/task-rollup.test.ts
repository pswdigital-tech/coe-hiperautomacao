// =============================================================================
// task-rollup.test.ts — specs PURAS (sem banco) de `computeTaskRollup`
// (Phase 16, TASK-11, D-02). Trava os dez comportamentos declarados no plano
// 16-04 mais imutabilidade da entrada e a garantia de "não persistido" —
// espelha a estrutura de `tests/schema/score-rule.test.ts` (describe/it sem
// banco, sem mocks de Supabase).
// =============================================================================
import { describe, it, expect } from 'vitest';
import { computeTaskRollup, groupTasksByParent, type TaskRollup } from '@/lib/opportunities/task-rollup';
import type { OpportunityTask } from '@/lib/opportunities/types';

let seq = 0;

function mkTask(overrides: Partial<OpportunityTask> = {}): OpportunityTask {
  seq += 1;
  return {
    id: `task-${seq}`,
    opportunity_id: 'opp-1',
    tenant_id: 'tenant-1',
    parent_task_id: null,
    title: `Tarefa ${seq}`,
    description: null,
    status: 'backlog',
    priority: 'media',
    priority_order: null,
    start_date: null,
    due_date: null,
    assignee_id: null,
    blocked_reason: null,
    created_by: null,
    created_at: new Date(2026, 0, seq).toISOString(),
    updated_at: new Date(2026, 0, seq).toISOString(),
    ...overrides,
  };
}

describe('computeTaskRollup — comportamentos declarados no plano 16-04', () => {
  it('nenhuma filha → span nulo nos dois extremos, percentual nulo, total zero, concluídas zero', () => {
    const result = computeTaskRollup([]);
    expect(result).toEqual<TaskRollup>({
      spanStart: null,
      spanDue: null,
      percentComplete: null,
      totalChildren: 0,
      completedChildren: 0,
    });
  });

  it('uma filha concluída → percentual 100, total 1, concluídas 1', () => {
    const result = computeTaskRollup([mkTask({ status: 'finalizado' })]);
    expect(result.percentComplete).toBe(100);
    expect(result.totalChildren).toBe(1);
    expect(result.completedChildren).toBe(1);
  });

  it('uma filha não concluída → percentual 0, total 1, concluídas 0', () => {
    const result = computeTaskRollup([mkTask({ status: 'em_andamento' })]);
    expect(result.percentComplete).toBe(0);
    expect(result.totalChildren).toBe(1);
    expect(result.completedChildren).toBe(0);
  });

  it('duas filhas, uma concluída → percentual 50', () => {
    const result = computeTaskRollup([
      mkTask({ status: 'finalizado' }),
      mkTask({ status: 'backlog' }),
    ]);
    expect(result.percentComplete).toBe(50);
  });

  it('três filhas, uma concluída → percentual 33 (arredondamento para o inteiro mais próximo)', () => {
    const result = computeTaskRollup([
      mkTask({ status: 'finalizado' }),
      mkTask({ status: 'backlog' }),
      mkTask({ status: 'em_andamento' }),
    ]);
    expect(result.percentComplete).toBe(33);
  });

  it('filhas com datas → início do span é a menor start_date, fim do span é a maior due_date', () => {
    const result = computeTaskRollup([
      mkTask({ start_date: '2026-02-10', due_date: '2026-02-20' }),
      mkTask({ start_date: '2026-02-01', due_date: '2026-02-15' }),
      mkTask({ start_date: '2026-02-05', due_date: '2026-02-28' }),
    ]);
    expect(result.spanStart).toBe('2026-02-01');
    expect(result.spanDue).toBe('2026-02-28');
  });

  it('filhas em que só algumas têm data → o span usa apenas as que têm, sem zerar nem distorcer', () => {
    const result = computeTaskRollup([
      mkTask({ start_date: '2026-03-01', due_date: '2026-03-10' }),
      mkTask({ start_date: null, due_date: null }),
      mkTask({ start_date: '2026-02-20', due_date: null }),
    ]);
    expect(result.spanStart).toBe('2026-02-20');
    expect(result.spanDue).toBe('2026-03-10');
  });

  it('nenhuma filha com data, mas filhas existindo → span nulo nos dois extremos, percentual calculado normalmente', () => {
    const result = computeTaskRollup([
      mkTask({ status: 'finalizado', start_date: null, due_date: null }),
      mkTask({ status: 'backlog', start_date: null, due_date: null }),
    ]);
    expect(result.spanStart).toBeNull();
    expect(result.spanDue).toBeNull();
    expect(result.percentComplete).toBe(50);
  });

  it('só finalizado conta como concluída; backlog, em_andamento e bloqueio não contam', () => {
    const result = computeTaskRollup([
      mkTask({ status: 'finalizado' }),
      mkTask({ status: 'backlog' }),
      mkTask({ status: 'em_andamento' }),
      mkTask({ status: 'bloqueio' }),
    ]);
    expect(result.completedChildren).toBe(1);
    expect(result.percentComplete).toBe(25);
  });

  it('a função não lê nem escreve nada: mesma entrada devolve sempre a mesma saída', () => {
    const children = [
      mkTask({ status: 'finalizado', start_date: '2026-04-01', due_date: '2026-04-10' }),
      mkTask({ status: 'backlog', start_date: '2026-04-05', due_date: '2026-04-20' }),
    ];
    const first = computeTaskRollup(children);
    const second = computeTaskRollup(children);
    expect(first).toEqual(second);
  });

  it('não muda o array recebido — a mesma entrada continua íntegra depois da chamada', () => {
    const children = [
      mkTask({ status: 'finalizado', start_date: '2026-05-01', due_date: '2026-05-10' }),
      mkTask({ status: 'backlog', start_date: '2026-05-05', due_date: '2026-05-20' }),
    ];
    const snapshot = children.map((c) => ({ ...c }));
    computeTaskRollup(children);
    expect(children).toEqual(snapshot);
  });

  it('não é persistido — nenhuma chave do TaskRollup existe entre as chaves de uma linha de OpportunityTask', () => {
    // Intenção: `TaskRollup` é um valor derivado que nasce e morre na
    // renderização (D-02, docs/PROJETO.md §3) — não existe coluna correspondente em
    // `opportunity_tasks` (migration 0037). Verificação estrutural: nenhuma
    // chave de um TaskRollup de exemplo aparece nas chaves de uma linha
    // tipada de OpportunityTask.
    const rollup: TaskRollup = computeTaskRollup([mkTask({ status: 'finalizado' })]);
    const exampleRow: OpportunityTask = mkTask();
    const rowKeys = new Set(Object.keys(exampleRow));
    for (const key of Object.keys(rollup)) {
      expect(rowKeys.has(key)).toBe(false);
    }
  });
});

describe('groupTasksByParent — helper de agrupamento compartilhado por Lista e Gantt', () => {
  it('separa raízes e filhas preservando a ordem de created_at', () => {
    const parent = mkTask({ id: 'parent-1' });
    const child1 = mkTask({ id: 'child-1', parent_task_id: 'parent-1' });
    const child2 = mkTask({ id: 'child-2', parent_task_id: 'parent-1' });
    const otherRoot = mkTask({ id: 'root-2' });

    const { roots, childrenByParent } = groupTasksByParent([parent, child1, otherRoot, child2]);

    expect(roots.map((t) => t.id)).toEqual(['parent-1', 'root-2']);
    expect(childrenByParent.get('parent-1')?.map((t) => t.id)).toEqual(['child-1', 'child-2']);
  });

  it('tarefa raiz sem filhas não aparece no mapa de filhas', () => {
    const root = mkTask({ id: 'lonely-root' });
    const { roots, childrenByParent } = groupTasksByParent([root]);
    expect(roots).toHaveLength(1);
    expect(childrenByParent.has('lonely-root')).toBe(false);
  });
});
