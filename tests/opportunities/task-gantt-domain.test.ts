// =============================================================================
// task-gantt-domain.test.ts — specs PURAS (sem banco, sem React) do domínio
// temporal e do posicionamento percentual do Gantt de tarefas (Phase 16,
// TASK-10). Trava os oito comportamentos declarados no plano 16-07, com
// ênfase no Pitfall 3 (RESEARCH §Pattern 4): "expandir uma tarefa nunca pode
// deslocar as barras das outras" — a spec de invariância abaixo prova que a
// função de domínio não tem NENHUM parâmetro de expansão/visibilidade,
// tornando esse defeito impossível por assinatura, não só por disciplina.
// Espelha a estrutura de `tests/schema/task-rollup.test.ts` (describe/it sem
// mocks, mkTask com overrides).
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  computeGanttDomain,
  ganttBarPosition,
  type GanttDomain,
} from '@/components/opportunities/tasks/gantt/TaskGanttChart';
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

describe('computeGanttDomain — domínio temporal do Gantt de tarefas (TASK-10)', () => {
  it('nenhuma tarefa com as duas datas → domínio nulo, sem divisão por zero', () => {
    const result = computeGanttDomain([
      mkTask({ start_date: null, due_date: null }),
      mkTask({ start_date: '2026-01-01', due_date: null }),
      mkTask({ start_date: null, due_date: '2026-01-10' }),
    ]);
    expect(result).toBeNull();
  });

  it('uma única tarefa com início e fim → domínio a contém, com folga de 1 dia em cada ponta', () => {
    const result = computeGanttDomain([
      mkTask({ start_date: '2026-06-10', due_date: '2026-06-15' }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.t0).toBe(Date.parse('2026-06-09'));
    expect(result!.t1).toBe(Date.parse('2026-06-16'));
  });

  it('várias tarefas → domínio vai do menor início ao maior fim entre todas, com a mesma folga', () => {
    const result = computeGanttDomain([
      mkTask({ start_date: '2026-07-05', due_date: '2026-07-10' }),
      mkTask({ start_date: '2026-07-01', due_date: '2026-07-20' }),
      mkTask({ start_date: '2026-07-03', due_date: '2026-07-15' }),
    ]);
    expect(result!.t0).toBe(Date.parse('2026-06-30'));
    expect(result!.t1).toBe(Date.parse('2026-07-21'));
  });

  it('tarefas com apenas uma das datas não entram no cálculo do domínio', () => {
    const withBoth = computeGanttDomain([
      mkTask({ start_date: '2026-08-05', due_date: '2026-08-10' }),
    ]);
    const withNoise = computeGanttDomain([
      mkTask({ start_date: '2026-08-05', due_date: '2026-08-10' }),
      mkTask({ start_date: '2026-01-01', due_date: null }),
      mkTask({ start_date: null, due_date: '2026-12-31' }),
    ]);
    expect(withNoise).toEqual(withBoth);
  });

  it('o domínio calculado sobre o conjunto completo não muda em função de quais tarefas estariam visíveis (Pitfall 3)', () => {
    const parent1 = mkTask({ id: 'parent-1', start_date: '2026-01-01', due_date: '2026-01-05' });
    const child1 = mkTask({
      id: 'child-1',
      parent_task_id: 'parent-1',
      start_date: '2026-01-10',
      due_date: '2026-02-01',
    });
    const parent2 = mkTask({ id: 'parent-2', start_date: '2026-01-15', due_date: '2026-01-25' });
    const allTasks = [parent1, child1, parent2];

    // A função de domínio não tem parâmetro de expansão — chamá-la com o
    // MESMO array completo, seja "no momento em que tudo está comprimido" ou
    // "no momento em que uma tarefa está expandida" na UI, sempre devolve o
    // mesmo resultado, porque a UI nunca deveria filtrar por visibilidade
    // antes de chamar esta função.
    const domainWhenCollapsedInUi = computeGanttDomain(allTasks);
    const domainWhenExpandedInUi = computeGanttDomain(allTasks);
    expect(domainWhenExpandedInUi).toEqual(domainWhenCollapsedInUi);

    // Prova por contraste: é exatamente essa filtragem por visibilidade — que
    // a assinatura da função torna impossível — que produziria o defeito do
    // Pitfall 3. Se alguém (erradamente) passasse só o subconjunto "visível"
    // (a subtarefa comprimida, "escondida"), o domínio mudaria.
    const wronglyFilteredToVisibleOnly = [parent1, parent2];
    const domainIfBuggilyFiltered = computeGanttDomain(wronglyFilteredToVisibleOnly);
    expect(domainIfBuggilyFiltered).not.toEqual(domainWhenCollapsedInUi);
  });

  it('um intervalo degenerado (início igual ao fim, de uma tarefa) recebe um piso mínimo — a barra tem largura positiva', () => {
    const domain = computeGanttDomain([
      mkTask({ start_date: '2026-09-01', due_date: '2026-09-10' }),
    ])!;
    const pos = ganttBarPosition(domain, '2026-09-05', '2026-09-05');
    expect(pos.widthPct).toBeGreaterThan(0);
  });

  it('a posição percentual do início do domínio é zero e a do fim é cem', () => {
    const domain = computeGanttDomain([
      mkTask({ start_date: '2026-10-10', due_date: '2026-10-20' }),
    ])!;
    const startIso = new Date(domain.t0).toISOString().slice(0, 10);
    const dueIso = new Date(domain.t1).toISOString().slice(0, 10);
    const pos = ganttBarPosition(domain, startIso, dueIso);
    expect(pos.leftPct).toBeCloseTo(0, 5);
    expect(pos.leftPct + pos.widthPct).toBeCloseTo(100, 5);
  });

  it('uma tarefa que ocupa a metade final do domínio produz posição inicial e largura em torno de 50%', () => {
    const domain: GanttDomain = {
      t0: Date.parse('2026-01-01'),
      t1: Date.parse('2026-01-11'), // 10 dias de span
    };
    const pos = ganttBarPosition(domain, '2026-01-06', '2026-01-11');
    expect(pos.leftPct).toBeCloseTo(50, 5);
    expect(pos.widthPct).toBeCloseTo(50, 5);
  });
});
