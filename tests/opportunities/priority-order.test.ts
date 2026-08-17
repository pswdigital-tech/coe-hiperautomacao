// =============================================================================
// Ordem manual de prioridade + tag de prioridade de tarefa (0049)
// =============================================================================
// Specs PUROS (sem DB) das três peças que a UI e a action assumem verdadeiras:
//   1. as chaves de ordenação manual existem e passam por `parseFilters`;
//   2. `isManualSort` é a fonte única do "dá para arrastar" (Lista, Cards e
//      Kanban perguntam a ela — se ela mentir, as três views quebram juntas);
//   3. `sortSiblings` ordena por TAG sem embaralhar empates (a estabilidade é
//      o que faz duas tarefas "alta" não trocarem de lugar a cada render).
// A renumeração propriamente dita mora na função SQL `set_*_priority_order`
// (0049) e é verificada no smoke da migration — não há espelho em TS para
// divergir dela.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  SORT_VALUES,
  SORT_LABELS,
  parseFilters,
  buildQuery,
  isManualSort,
} from '@/lib/opportunities/filters';
import { sortSiblings } from '@/lib/opportunities/task-order';
import {
  TASK_PRIORITY_ORDER,
  TASK_PRIORITY_RANK,
  TASK_PRIORITY_META,
} from '@/lib/opportunities/task-labels';
import { taskInputSchema } from '@/lib/opportunities/task-schema';
import type { OpportunityTask, TaskPriority } from '@/lib/opportunities/types';

function mkTask(id: string, priority: TaskPriority): OpportunityTask {
  return {
    id,
    opportunity_id: 'opp-1',
    tenant_id: 'tenant-1',
    parent_task_id: null,
    title: id,
    description: null,
    status: 'backlog',
    priority,
    priority_order: null,
    start_date: null,
    due_date: null,
    assignee_id: null,
    blocked_reason: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('filters — ordenação manual (0049)', () => {
  it('SORT_VALUES inclui manual_asc e manual_desc', () => {
    expect(SORT_VALUES as readonly string[]).toContain('manual_asc');
    expect(SORT_VALUES as readonly string[]).toContain('manual_desc');
  });

  it('toda SortKey tem rótulo — inclusive as manuais', () => {
    for (const key of SORT_VALUES) {
      expect(typeof SORT_LABELS[key]).toBe('string');
      expect(SORT_LABELS[key].length).toBeGreaterThan(0);
    }
  });

  it('parseFilters valida ?sort=manual_asc', () => {
    expect(parseFilters(new URLSearchParams('sort=manual_asc')).sort).toBe(
      'manual_asc'
    );
  });

  it('isManualSort só é verdadeiro na ordem manual CRESCENTE', () => {
    // A decrescente é espelho de leitura: arrastar nela gravaria o inverso do
    // que a pessoa vê.
    expect(isManualSort('manual_asc')).toBe(true);
    expect(isManualSort('manual_desc')).toBe(false);
    expect(isManualSort('score_desc')).toBe(false);
    expect(isManualSort(undefined)).toBe(false);
  });
});

describe('filters — tag manual da oportunidade (0050)', () => {
  it('as chaves de ordenação por tag existem e têm rótulo', () => {
    expect(SORT_VALUES as readonly string[]).toContain('tag_asc');
    expect(SORT_VALUES as readonly string[]).toContain('tag_desc');
    expect(SORT_LABELS.tag_asc.length).toBeGreaterThan(0);
  });

  it('ordenar por tag NÃO é modo de arrasto — só `manual_asc` é', () => {
    // Se isto virar true, a Lista deixa arrastar numa ordenação que o próximo
    // render desfaz.
    expect(isManualSort('tag_asc')).toBe(false);
  });

  it('parseFilters aceita as 3 tags e o recorte "sem"', () => {
    for (const v of ['alta', 'media', 'baixa', 'sem']) {
      expect(parseFilters(new URLSearchParams(`priorityTag=${v}`)).priorityTag).toBe(v);
    }
  });

  it('parseFilters descarta tag inválida em vez de derrubar a página', () => {
    expect(
      parseFilters(new URLSearchParams('priorityTag=critica')).priorityTag
    ).toBeUndefined();
  });

  it('o filtro da tag é INDEPENDENTE do filtro por faixa de score', () => {
    const f = parseFilters(new URLSearchParams('priority=baixa&priorityTag=alta'));
    expect(f.priority).toBe('baixa');
    expect(f.priorityTag).toBe('alta');
    // E sobrevive à ida e volta pela query string (os dois params coexistem).
    const qs = new URLSearchParams(buildQuery(f));
    expect(qs.get('priority')).toBe('baixa');
    expect(qs.get('priorityTag')).toBe('alta');
  });
});

describe('task-labels — tag de prioridade (0049)', () => {
  it('as 3 prioridades têm metadados e rank derivado da ordem', () => {
    expect(TASK_PRIORITY_ORDER).toEqual(['alta', 'media', 'baixa']);
    for (const p of TASK_PRIORITY_ORDER) {
      expect(TASK_PRIORITY_META[p].label.length).toBeGreaterThan(0);
    }
    // Rank crescente = mais prioritário primeiro num `sort` ascendente.
    expect(TASK_PRIORITY_RANK.alta).toBeLessThan(TASK_PRIORITY_RANK.media);
    expect(TASK_PRIORITY_RANK.media).toBeLessThan(TASK_PRIORITY_RANK.baixa);
  });
});

describe('task-order — sortSiblings (0049)', () => {
  const siblings = [
    mkTask('a', 'baixa'),
    mkTask('b', 'alta'),
    mkTask('c', 'media'),
    mkTask('d', 'alta'),
  ];

  it('modo manual devolve a entrada INTACTA (a query já ordenou)', () => {
    expect(sortSiblings(siblings, 'manual')).toBe(siblings);
  });

  it('modo prioridade ordena alta → média → baixa', () => {
    const out = sortSiblings(siblings, 'prioridade').map((t) => t.priority);
    expect(out).toEqual(['alta', 'alta', 'media', 'baixa']);
  });

  it('empate preserva a ordem manual (sort estável) e não muta a entrada', () => {
    const out = sortSiblings(siblings, 'prioridade');
    // 'b' vinha antes de 'd' na ordem manual; as duas são 'alta'.
    expect(out.slice(0, 2).map((t) => t.id)).toEqual(['b', 'd']);
    expect(siblings.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('task-schema — priority (0049)', () => {
  it('payload sem priority cai no default media (mesmo default da coluna)', () => {
    const parsed = taskInputSchema.safeParse({ title: 'T' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.priority).toBe('media');
  });

  it('valor fora do enum é rejeitado', () => {
    expect(
      taskInputSchema.safeParse({ title: 'T', priority: 'critica' }).success
    ).toBe(false);
  });

  it('priority_order NÃO é aceito no input — quem escreve a ordem é a RPC', () => {
    expect(
      taskInputSchema.safeParse({ title: 'T', priority_order: 1 }).success
    ).toBe(false);
  });
});
