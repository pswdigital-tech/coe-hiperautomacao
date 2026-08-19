// =============================================================================
// overview.test.ts — specs PURAS (sem banco) das derivações da Visão Geral
// (lib/opportunities/overview.ts). Mesma disciplina de
// `tests/schema/task-rollup.test.ts`: describe/it sem mocks de Supabase.
//
// O que estas specs travam, em ordem de risco:
//   1. O pipeline usa `STATUS_META` como fonte única de rótulo (em_analise
//      precisa sair como "Refinamento", nunca como "Em análise").
//   2. O prazo compara DUAS fontes distintas (fases × tarefas) e o sinal do
//      desvio não pode inverter — positivo é ATRASO.
//   3. Nada aqui chama `new Date()`: passar o mesmo `today` devolve sempre o
//      mesmo resultado.
//   4. `groupRecentChanges` agrupa — um dia com 3 tarefas concluídas vira UMA
//      frase, não três linhas iguais.
// =============================================================================
import { describe, it, expect } from 'vitest';
import type {
  OpportunityPhase,
  OpportunityRisk,
  OpportunityTask,
} from '@/lib/opportunities/types';
import type { TimelineEntry } from '@/lib/audit/timeline';
import {
  buildPipeline,
  nextMilestone,
  phaseDates,
  buildDeadline,
  summarizeRisks,
  blockedTasks,
  overdueTasks,
  topBenefits,
  recentActivity,
  dayLabel,
  daysBetween,
  planIdleDays,
  PLAN_IDLE_ALERT_DAYS,
} from '@/lib/opportunities/overview';

const TODAY = '2026-08-19';

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
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
    ...overrides,
  } as OpportunityTask;
}

function mkPhase(overrides: Partial<OpportunityPhase> = {}): OpportunityPhase {
  seq += 1;
  return {
    id: `phase-${seq}`,
    opportunity_id: 'opp-1',
    tenant_id: 'tenant-1',
    phase_key: 'em_analise',
    started_at: null,
    finished_at: null,
    planned_start_at: null,
    planned_end_at: null,
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
    ...overrides,
  } as OpportunityPhase;
}

function mkRisk(overrides: Partial<OpportunityRisk> = {}): OpportunityRisk {
  seq += 1;
  return {
    id: `risk-${seq}`,
    opportunity_id: 'opp-1',
    tenant_id: 'tenant-1',
    descricao: `Risco ${seq}`,
    tipo: 'risco',
    responsavel: null,
    impacto: 'moderado',
    probabilidade: 'possivel',
    status: 'novo',
    resposta: null,
    descricao_impacto: null,
    priority: 'media',
    created_by: null,
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
    ...overrides,
  } as OpportunityRisk;
}

function mkEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  seq += 1;
  return {
    key: `e-${seq}`,
    created_at: '2026-08-19T10:00:00Z',
    actor: 'ana@psw.com',
    action: 'update',
    table: 'opportunity_tasks',
    alvo: null,
    changes: null,
    resumo: null,
    contexto: null,
    ...overrides,
  };
}

describe('daysBetween', () => {
  it('conta dias inteiros e devolve negativo quando o alvo está no passado', () => {
    expect(daysBetween('2026-08-19', '2026-08-22')).toBe(3);
    expect(daysBetween('2026-08-22', '2026-08-19')).toBe(-3);
    expect(daysBetween('2026-08-19', '2026-08-19')).toBe(0);
  });

  it('atravessa virada de mês e de ano sem erro de fuso', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1); // 2026 não é bissexto
  });
});

describe('buildPipeline', () => {
  it('devolve as 7 fases do pipeline, sempre na mesma ordem', () => {
    const p = buildPipeline([], TODAY);
    expect(p.map((s) => s.key)).toEqual([
      'em_analise',
      'planejamento',
      'backlog',
      'desenvolvimento',
      'homologacao',
      'producao',
      'concluido',
    ]);
  });

  it('usa STATUS_META como fonte única do rótulo — em_analise é "Refinamento"', () => {
    const p = buildPipeline([], TODAY);
    expect(p[0].label).toBe('Refinamento');
    // "Produção" — o nome que a etapa tem em toda a plataforma. Nunca "Implantação".
    expect(p.find((s) => s.key === 'producao')?.label).toBe('Produção');
  });

  it('classifica concluída / atual / futura pelo realizado, não pelo estimado', () => {
    const p = buildPipeline(
      [
        mkPhase({
          phase_key: 'em_analise',
          started_at: '2026-08-01T00:00:00Z',
          finished_at: '2026-08-10T00:00:00Z',
        }),
        mkPhase({ phase_key: 'planejamento', started_at: '2026-08-10T00:00:00Z' }),
        // Estimativa preenchida NÃO torna a fase "atual".
        mkPhase({ phase_key: 'backlog', planned_start_at: '2026-08-20' }),
      ],
      TODAY
    );
    expect(p[0].state).toBe('concluida');
    expect(p[1].state).toBe('atual');
    expect(p[2].state).toBe('futura');
  });

  it('marca atraso quando o fim estimado passou e não há fim realizado', () => {
    const p = buildPipeline(
      [
        mkPhase({ phase_key: 'desenvolvimento', planned_end_at: '2026-08-01' }),
        mkPhase({
          phase_key: 'homologacao',
          planned_end_at: '2026-08-01',
          finished_at: '2026-08-05T00:00:00Z',
        }),
      ],
      TODAY
    );
    expect(p.find((s) => s.key === 'desenvolvimento')?.atrasada).toBe(true);
    // Terminou: atrasou na vida real, mas não é pendência aberta.
    expect(p.find((s) => s.key === 'homologacao')?.atrasada).toBe(false);
  });
});

describe('nextMilestone', () => {
  it('é a próxima fase NÃO iniciada com início estimado', () => {
    const pipeline = buildPipeline(
      [
        mkPhase({ phase_key: 'em_analise', started_at: '2026-08-01T00:00:00Z', finished_at: '2026-08-10T00:00:00Z' }),
        mkPhase({ phase_key: 'planejamento', started_at: '2026-08-10T00:00:00Z' }),
        mkPhase({ phase_key: 'backlog', planned_start_at: '2026-09-01' }),
        mkPhase({ phase_key: 'desenvolvimento', planned_start_at: '2026-10-01' }),
      ],
      TODAY
    );
    const m = nextMilestone(pipeline, TODAY);
    expect(m?.label).toBe('Backlog');
    expect(m?.date).toBe('2026-09-01');
    expect(m?.diasRestantes).toBe(13);
  });

  it('é null quando nenhuma fase futura tem estimativa', () => {
    expect(nextMilestone(buildPipeline([], TODAY), TODAY)).toBeNull();
  });

  it('devolve dias negativos quando a data estimada passou e a fase não começou', () => {
    const pipeline = buildPipeline(
      [mkPhase({ phase_key: 'em_analise', planned_start_at: '2026-08-01' })],
      TODAY
    );
    expect(nextMilestone(pipeline, TODAY)?.diasRestantes).toBe(-18);
  });
});

describe('phaseDates — realizado manda onde existe, e a data vem rotulada', () => {
  function step(overrides: Partial<OpportunityPhase>) {
    return buildPipeline([mkPhase({ phase_key: 'desenvolvimento', ...overrides })], TODAY)
      .find((p) => p.key === 'desenvolvimento')!;
  }

  it('fase CONCLUÍDA mostra o realizado — o fato, não a estimativa', () => {
    const d = phaseDates(
      step({
        started_at: '2026-07-01T00:00:00Z',
        finished_at: '2026-07-20T00:00:00Z',
        // Estimativa DIFERENTE de propósito: se aparecer, o teste pega.
        planned_start_at: '2026-06-01',
        planned_end_at: '2026-06-30',
      })
    );
    expect(d.principal?.label).toBe('real.');
    expect(d.principal?.inicio).toBe('2026-07-01T00:00:00Z');
    expect(d.principal?.fim).toBe('2026-07-20T00:00:00Z');
    expect(d.secundaria).toBeNull();
  });

  it('fase EM ANDAMENTO mostra início realizado e fim ainda estimado', () => {
    const d = phaseDates(
      step({ started_at: '2026-08-10T00:00:00Z', planned_end_at: '2026-09-15' })
    );
    expect(d.principal?.label).toBe('real.');
    expect(d.principal?.inicio).toBe('2026-08-10T00:00:00Z');
    expect(d.principal?.fim).toBeNull(); // ainda não terminou
    expect(d.secundaria).toEqual({ label: 'prev.', inicio: null, fim: '2026-09-15' });
  });

  it('fase FUTURA só tem estimativa, rotulada como tal', () => {
    const d = phaseDates(
      step({ planned_start_at: '2026-09-01', planned_end_at: '2026-09-30' })
    );
    expect(d.principal?.label).toBe('prev.');
    expect(d.principal?.inicio).toBe('2026-09-01');
  });

  it('fase concluída SEM realizado gravado cai no estimado — mas nunca disfarçado de real', () => {
    const d = phaseDates(
      step({
        // `finished_at` ausente e `started_at` ausente: dado legado.
        // Sem started_at a fase nem é "concluida", então cai no ramo futuro —
        // o que importa é o rótulo NUNCA dizer "real." sem realizado.
        planned_start_at: '2026-06-01',
        planned_end_at: '2026-06-30',
      })
    );
    expect(d.principal?.label).toBe('prev.');
  });

  it('fase sem data nenhuma não inventa linha', () => {
    expect(phaseDates(step({})).principal).toBeNull();
  });
});

describe('buildDeadline — as DUAS fontes de prazo', () => {
  it('estimado vem do maior fim de FASE; projetado vem da maior entrega de TAREFA', () => {
    const d = buildDeadline(
      [
        mkPhase({ phase_key: 'desenvolvimento', planned_end_at: '2026-10-15' }),
        mkPhase({ phase_key: 'producao', planned_end_at: '2026-10-30' }),
      ],
      [mkTask({ due_date: '2026-11-05' }), mkTask({ due_date: '2026-09-01' })]
    );
    expect(d.estimado).toBe('2026-10-30');
    expect(d.projetado).toBe('2026-11-05');
  });

  it('desvio POSITIVO é atraso (tarefas projetam depois das fases)', () => {
    const d = buildDeadline(
      [mkPhase({ phase_key: 'producao', planned_end_at: '2026-10-30' })],
      [mkTask({ due_date: '2026-11-12' })]
    );
    expect(d.desvioDias).toBe(13);
  });

  it('desvio NEGATIVO é folga', () => {
    const d = buildDeadline(
      [mkPhase({ phase_key: 'producao', planned_end_at: '2026-10-30' })],
      [mkTask({ due_date: '2026-10-20' })]
    );
    expect(d.desvioDias).toBe(-10);
  });

  it('sem uma das duas fontes não inventa comparação', () => {
    expect(buildDeadline([], [mkTask({ due_date: '2026-11-05' })]).desvioDias).toBeNull();
    expect(
      buildDeadline([mkPhase({ planned_end_at: '2026-10-30' })], []).desvioDias
    ).toBeNull();
  });
});

describe('summarizeRisks', () => {
  it('aberto é novo/gerenciado — mitigado e ocorrido saem da conta', () => {
    const s = summarizeRisks([
      mkRisk({ status: 'novo' }),
      mkRisk({ status: 'gerenciado' }),
      mkRisk({ status: 'mitigado' }),
      mkRisk({ status: 'ocorrido' }),
    ]);
    expect(s.total).toBe(2);
  });

  it('ordena por prioridade — crítica primeiro', () => {
    const s = summarizeRisks([
      mkRisk({ priority: 'baixa', descricao: 'B' }),
      mkRisk({ priority: 'critica', descricao: 'C' }),
      mkRisk({ priority: 'media', descricao: 'M' }),
    ]);
    expect(s.abertos.map((r) => r.descricao)).toEqual(['C', 'M', 'B']);
    expect(s.byPriority.critica).toBe(1);
  });
});

describe('overdueTasks', () => {
  it('vencida é entrega no passado com tarefa não finalizada', () => {
    const out = overdueTasks(
      [
        mkTask({ due_date: '2026-08-01', status: 'em_andamento' }),
        // Finalizada não conta, mesmo com entrega vencida.
        mkTask({ due_date: '2026-08-01', status: 'finalizado' }),
        // Sem data nunca vence.
        mkTask({ due_date: null, status: 'em_andamento' }),
        // Futura não venceu.
        mkTask({ due_date: '2026-09-01', status: 'em_andamento' }),
      ],
      TODAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].due_date).toBe('2026-08-01');
  });

  it('ordena da mais atrasada para a menos', () => {
    const out = overdueTasks(
      [
        mkTask({ due_date: '2026-08-10', status: 'backlog' }),
        mkTask({ due_date: '2026-07-01', status: 'backlog' }),
        mkTask({ due_date: '2026-08-18', status: 'backlog' }),
      ],
      TODAY
    );
    expect(out.map((t) => t.due_date)).toEqual([
      '2026-07-01',
      '2026-08-10',
      '2026-08-18',
    ]);
  });

  it('entrega HOJE ainda não está atrasada', () => {
    expect(overdueTasks([mkTask({ due_date: TODAY, status: 'backlog' })], TODAY)).toEqual(
      []
    );
  });
});

describe('planIdleDays — plano parado', () => {
  it('conta a partir da tarefa alterada mais recentemente', () => {
    const dias = planIdleDays(
      [
        mkTask({ updated_at: '2026-08-01T10:00:00Z' }),
        mkTask({ updated_at: '2026-08-05T10:00:00Z' }),
      ],
      TODAY
    );
    expect(dias).toBe(14);
    expect(dias).toBeGreaterThanOrEqual(PLAN_IDLE_ALERT_DAYS);
  });

  it('plano vazio não tem "parado" para reportar', () => {
    expect(planIdleDays([], TODAY)).toBeNull();
  });

  it('movimentação recente fica abaixo do limiar', () => {
    expect(planIdleDays([mkTask({ updated_at: '2026-08-18T10:00:00Z' })], TODAY)).toBe(1);
  });
});

describe('blockedTasks', () => {
  it('pega só o status bloqueio', () => {
    const b = blockedTasks([
      mkTask({ status: 'bloqueio' }),
      mkTask({ status: 'em_andamento' }),
      mkTask({ status: 'backlog' }),
    ]);
    expect(b).toHaveLength(1);
  });
});

describe('topBenefits', () => {
  it('devolve os 3 maiores com rótulo pt-BR', () => {
    const top = topBenefits({
      reducaoTempo: 5,
      eliminacaoErros: 4,
      produtividade: 5,
      compliance: 1,
    });
    expect(top).toHaveLength(3);
    expect(top[0].value).toBe(5);
    expect(top.map((b) => b.label)).toContain('Redução de Tempo');
    expect(top.map((b) => b.label)).not.toContain('Compliance & Regulatório');
  });

  it('tolera null / objeto vazio sem quebrar', () => {
    expect(topBenefits(null)).toEqual([]);
    expect(topBenefits({})).toEqual([]);
  });
});

describe('recentActivity — ocorrências NOMEADAS, não contagens', () => {
  it('mostra o nome do registro, não um total', () => {
    const out = recentActivity([
      mkEntry({
        table: 'opportunity_tasks',
        action: 'update',
        alvo: 'Tarefa: Motor RAG e extração via IA',
        changes: { status: { de: 'em_andamento', para: 'finalizado' } },
      }),
    ]);
    expect(out[0].text).toBe('Tarefa “Motor RAG e extração via IA” concluída');
    expect(out[0].icon).toBe('✅');
  });

  it('concorda em gênero — tarefa é feminina, risco é masculino', () => {
    const out = recentActivity([
      mkEntry({ table: 'opportunity_tasks', action: 'insert', alvo: null, actor: 'a@x.com' }),
      mkEntry({ table: 'opportunity_risks', action: 'update', alvo: null, actor: 'b@x.com' }),
      mkEntry({ table: 'opportunity_notes', action: 'delete', alvo: null, actor: 'c@x.com' }),
    ]);
    const textos = out.map((o) => o.text);
    expect(textos).toContain('Tarefa criada');
    expect(textos).toContain('Risco editado');
    expect(textos).toContain('Anotação excluída');
    // A regressão que motivou isto: "criados(as)" / "excluído(a)".
    expect(textos.join(' ')).not.toMatch(/\(as\)|\(a\)|\(o\)/);
  });

  it('ícone vem da AÇÃO, não da tabela — criar, editar e excluir se distinguem', () => {
    const out = recentActivity([
      mkEntry({ table: 'opportunity_tasks', action: 'insert', actor: 'a@x.com' }),
      mkEntry({ table: 'opportunity_tasks', action: 'update', actor: 'b@x.com' }),
      mkEntry({ table: 'opportunity_tasks', action: 'delete', actor: 'c@x.com' }),
    ]);
    expect(new Set(out.map((o) => o.icon)).size).toBe(3);
  });

  it('eventos com significado próprio ganham verbo próprio', () => {
    const bloqueio = recentActivity([
      mkEntry({
        table: 'opportunity_tasks',
        action: 'update',
        alvo: 'Tarefa: Integração Teams',
        changes: { status: { de: 'em_andamento', para: 'bloqueio' } },
      }),
    ]);
    expect(bloqueio[0].text).toBe('Tarefa “Integração Teams” bloqueada');
    expect(bloqueio[0].icon).toBe('🚫');

    const risco = recentActivity([
      mkEntry({ table: 'opportunity_risks', action: 'insert', alvo: 'Risco: dependência do Jurídico' }),
    ]);
    expect(risco[0].text).toBe('Risco registrado “dependência do Jurídico”');
  });

  it('mudança de status do projeto usa o rótulo de STATUS_META', () => {
    const out = recentActivity([
      mkEntry({
        table: 'opportunities',
        action: 'update',
        changes: { status: { de: 'planejamento', para: 'desenvolvimento' } },
      }),
    ]);
    expect(out[0].text).toBe('Projeto entrou em Desenvolvimento');
  });

  it('cauda de 1 NÃO vira resumo — "+1 tarefa criada" ocupa a linha da própria tarefa', () => {
    const tres = [0, 1, 2].map((i) =>
      mkEntry({
        key: `t-${i}`,
        table: 'opportunity_tasks',
        action: 'insert',
        alvo: `Tarefa: item ${i}`,
      })
    );
    const out = recentActivity(tres);
    expect(out).toHaveLength(3);
    expect(out.some((o) => o.isTail)).toBe(false);
    expect(out[2].text).toBe('Tarefa “item 2” criada');
  });

  it('lote grande: mostra 2 nomeadas e resume a CAUDA — nunca some com o que mudou', () => {
    const lote = Array.from({ length: 59 }, (_, i) =>
      mkEntry({
        key: `lote-${i}`,
        table: 'opportunity_tasks',
        action: 'update',
        alvo: `Tarefa: item ${i}`,
      })
    );
    const out = recentActivity(lote);
    expect(out).toHaveLength(3);
    expect(out[0].text).toBe('Tarefa “item 0” editada');
    expect(out[1].text).toBe('Tarefa “item 1” editada');
    expect(out[2].isTail).toBe(true);
    expect(out[2].text).toBe('+57 tarefas editadas');
  });

  it('lotes de autores diferentes não se misturam', () => {
    const out = recentActivity([
      mkEntry({ action: 'insert', actor: 'ana@psw.com', alvo: 'Tarefa: A' }),
      mkEntry({ action: 'insert', actor: 'bruno@psw.com', alvo: 'Tarefa: B' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((o) => o.actor)).toEqual(['ana@psw.com', 'bruno@psw.com']);
  });

  it('linha legada usa o resumo em texto que já existia', () => {
    const out = recentActivity([
      mkEntry({ action: 'legado', table: null, resumo: 'Status alterado', actor: null }),
    ]);
    expect(out[0].text).toBe('Status alterado');
    expect(out[0].icon).toBe('🕘');
  });

  it('respeita o limite e mostra o mais recente primeiro', () => {
    const out = recentActivity(
      [
        mkEntry({ created_at: '2026-08-10T10:00:00Z', action: 'insert', table: 'opportunity_notes' }),
        mkEntry({ created_at: '2026-08-19T10:00:00Z', action: 'insert', table: 'opportunity_documents' }),
        mkEntry({ created_at: '2026-08-15T10:00:00Z', action: 'insert', table: 'opportunity_risks' }),
      ],
      2
    );
    expect(out).toHaveLength(2);
    expect(out[0].day).toBe('2026-08-19');
  });
});

describe('dayLabel', () => {
  it('traduz hoje e ontem, e cai em dd/mm no resto', () => {
    expect(dayLabel('2026-08-19', TODAY)).toBe('Hoje');
    expect(dayLabel('2026-08-18', TODAY)).toBe('Ontem');
    expect(dayLabel('2026-08-01', TODAY)).toBe('01/08');
  });
});

describe('determinismo — nenhuma função lê o relógio', () => {
  it('duas chamadas com o mesmo `today` devolvem o mesmo resultado', () => {
    const tasks = [mkTask({ due_date: '2026-08-01', status: 'em_andamento' })];
    const phases = [mkPhase({ phase_key: 'desenvolvimento', planned_end_at: '2026-08-01' })];
    expect(overdueTasks(tasks, TODAY)).toEqual(overdueTasks(tasks, TODAY));
    expect(buildPipeline(phases, TODAY)).toEqual(buildPipeline(phases, TODAY));
    expect(planIdleDays(tasks, TODAY)).toBe(planIdleDays(tasks, TODAY));
  });
});
