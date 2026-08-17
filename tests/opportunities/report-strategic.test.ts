// =============================================================================
// Agregações puras da view Relatório estratégica (v0.4) — report.ts.
// Trava o contrato de valor, matriz Esforço×Impacto, funil, cycle time, riscos
// e mix de ferramenta. Todas READ-ONLY: leem colunas computadas (score/
// priority_level/rpa_score) e NUNCA recalculam nem persistem (docs/PROJETO.md §3).
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  buildValueSummary,
  buildPriorityMatrix,
  buildFunnel,
  buildCycleTime,
  buildRiskSummary,
  buildToolMix,
  HOURS_PER_FTE,
} from '@/lib/opportunities/report';
import type { Opportunity, OpportunityPhase, OpportunityRisk } from '@/lib/opportunities/types';

// Fábrica mínima de Opportunity — só os campos consumidos pelas agregações.
// `over` admite `null` em qualquer campo: a view devolve null nas colunas
// computadas quando os insumos faltam (report.ts:266 já defende `score` não
// numérico) e os specs exercitam exatamente esse caso.
function opp(over: Partial<{ [K in keyof Opportunity]: Opportunity[K] | null }> = {}): Opportunity {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    seq_id: 1,
    area: 'Financeiro',
    processo: 'Processo X',
    solicitante: 'Fulano',
    status: 'novo',
    esforco: 'medio',
    complexidade: 'medio',
    score: 50,
    priority_level: 'media',
    fte_horas: 10,
    rpa_score: 3,
    ferramenta: 'rpa',
    ...over,
  } as Opportunity;
}

describe('buildValueSummary — valor realizado × potencial', () => {
  it('separa realizado (producao/concluido/gestao/manutencao) de potencial (esteira)', () => {
    const v = buildValueSummary([
      opp({ status: 'producao', fte_horas: 100 }),
      opp({ status: 'concluido', fte_horas: 50 }),
      opp({ status: 'em_analise', fte_horas: 30 }),
      opp({ status: 'backlog', fte_horas: 20 }),
    ]);
    expect(v.fteRealizado).toBe(150);
    expect(v.ftePotencial).toBe(50);
    expect(v.fteTotal).toBe(200);
    expect(v.emOperacao).toBe(2);
    expect(v.emPipeline).toBe(2);
    expect(v.pctRealizado).toBe(75); // 150 / 200
  });

  it('descontinuado fica de fora de realizado E potencial', () => {
    const v = buildValueSummary([
      opp({ status: 'producao', fte_horas: 100 }),
      opp({ status: 'descontinuado', fte_horas: 999 }),
    ]);
    expect(v.fteRealizado).toBe(100);
    expect(v.ftePotencial).toBe(0);
    expect(v.fteTotal).toBe(100);
  });

  it('FTE-equivalente = total / 168h (1 casa)', () => {
    const v = buildValueSummary([opp({ status: 'producao', fte_horas: HOURS_PER_FTE * 2 })]);
    expect(v.fteEquivalente).toBe(2);
  });

  it('fte_horas null conta como 0; portfólio vazio → pct 0 sem divisão por zero', () => {
    const v = buildValueSummary([opp({ status: 'novo', fte_horas: null })]);
    expect(v.ftePotencial).toBe(0);
    expect(v.pctRealizado).toBe(0);
    expect(buildValueSummary([]).pctRealizado).toBe(0);
  });
});

describe('buildPriorityMatrix — quadrantes Esforço×Impacto', () => {
  it('classifica os 4 quadrantes pelo par (esforço, score)', () => {
    const m = buildPriorityMatrix([
      opp({ esforco: 'baixo', complexidade: 'baixo', score: 80 }), // quick_win
      opp({ esforco: 'alto', complexidade: 'alto', score: 80 }), //   strategic
      opp({ esforco: 'baixo', complexidade: 'baixo', score: 20 }), // fill_in
      opp({ esforco: 'alto', complexidade: 'alto', score: 20 }), //   reconsider
    ]);
    expect(m.counts).toEqual({ quick_win: 1, strategic: 1, fill_in: 1, reconsider: 1 });
  });

  it('esforço combinado é a média de esforco+complexidade', () => {
    // baixo(1)+alto(3) → 2 = borda (<=2 é baixo esforço); score 90 → quick_win
    const m = buildPriorityMatrix([opp({ esforco: 'baixo', complexidade: 'alto', score: 90 })]);
    expect(m.points[0].effort).toBe(2);
    expect(m.points[0].quadrant).toBe('quick_win');
  });

  it('quickWins ordena por impacto desc e traz label/area', () => {
    const m = buildPriorityMatrix([
      opp({ esforco: 'baixo', complexidade: 'baixo', score: 70, processo: 'A', area: 'RH' }),
      opp({ esforco: 'baixo', complexidade: 'baixo', score: 95, processo: 'B', area: 'TI' }),
    ]);
    expect(m.quickWins.map((q) => q.impact)).toEqual([95, 70]);
    expect(m.quickWins[0].label).toBe('B');
    expect(m.quickWins[0].area).toBe('TI');
  });

  it('esforço/complexidade null → neutro (2); score null → 0', () => {
    const m = buildPriorityMatrix([opp({ esforco: null, complexidade: null, score: null })]);
    expect(m.points[0].effort).toBe(2);
    expect(m.points[0].impact).toBe(0);
    expect(m.points[0].quadrant).toBe('fill_in'); // baixo esforço (<=2) + baixo impacto
  });
});

describe('buildFunnel — esteira linear', () => {
  it('conta por estágio e calcula conversão (entregues/total)', () => {
    const f = buildFunnel([
      opp({ status: 'novo' }),
      opp({ status: 'em_analise' }),
      opp({ status: 'producao' }),
      opp({ status: 'concluido' }),
      opp({ status: 'backlog' }), // fora da esteira linear → não entra nos stages
    ]);
    expect(f.total).toBe(5);
    expect(f.entregues).toBe(2); // producao + concluido
    expect(f.conversao).toBe(40); // 2/5
    const novo = f.stages.find((s) => s.status === 'novo');
    expect(novo?.count).toBe(1);
    expect(f.stages.some((s) => s.status === 'backlog')).toBe(false);
  });
});

describe('buildCycleTime — dias por fase a partir de opportunity_phases', () => {
  function phase(over: Partial<OpportunityPhase>): OpportunityPhase {
    return {
      id: Math.random().toString(36).slice(2),
      opportunity_id: 'o1',
      tenant_id: 't1',
      phase_key: 'em_analise',
      started_at: null,
      finished_at: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      ...over,
    } as OpportunityPhase;
  }

  it('média de dias por fase; ignora fases sem fim', () => {
    const c = buildCycleTime([
      phase({ phase_key: 'em_analise', started_at: '2026-01-01T00:00:00Z', finished_at: '2026-01-05T00:00:00Z' }), // 4d
      phase({ phase_key: 'em_analise', started_at: '2026-01-01T00:00:00Z', finished_at: '2026-01-03T00:00:00Z' }), // 2d
      phase({ phase_key: 'planejamento', started_at: '2026-01-01T00:00:00Z', finished_at: null }), // aberta → ignora
    ]);
    const analise = c.perPhase.find((p) => p.phase === 'em_analise');
    expect(analise?.avgDays).toBe(3); // (4+2)/2
    expect(analise?.count).toBe(2);
    expect(c.perPhase.some((p) => p.phase === 'planejamento')).toBe(false);
  });

  it('ciclo médio por oportunidade soma durações das fases fechadas', () => {
    const c = buildCycleTime([
      phase({ opportunity_id: 'o1', phase_key: 'em_analise', started_at: '2026-01-01T00:00:00Z', finished_at: '2026-01-03T00:00:00Z' }), // 2d
      phase({ opportunity_id: 'o1', phase_key: 'planejamento', started_at: '2026-01-03T00:00:00Z', finished_at: '2026-01-06T00:00:00Z' }), // 3d
    ]);
    expect(c.cicloMedioDias).toBe(5); // uma op, 2+3 dias
  });

  it('sem fases fechadas → perPhase vazio e ciclo null', () => {
    const c = buildCycleTime([]);
    expect(c.perPhase).toEqual([]);
    expect(c.cicloMedioDias).toBeNull();
  });
});

describe('buildRiskSummary — agregação de riscos', () => {
  function risk(over: Partial<OpportunityRisk>): OpportunityRisk {
    return {
      id: Math.random().toString(36).slice(2),
      opportunity_id: 'o1',
      tenant_id: 't1',
      tipo: 'risco',
      priority: 'media',
      status: 'novo',
      impacto: 'moderado',
      probabilidade: 'possivel',
      ...over,
    } as OpportunityRisk;
  }

  it('conta críticos/altos abertos e impedimentos abertos; ops bloqueadas distintas', () => {
    const s = buildRiskSummary([
      risk({ opportunity_id: 'o1', tipo: 'impedimento', priority: 'critica', status: 'novo' }),
      risk({ opportunity_id: 'o1', tipo: 'impedimento', priority: 'alta', status: 'gerenciado' }),
      risk({ opportunity_id: 'o2', tipo: 'risco', priority: 'alta', status: 'mitigado' }), // fechado → não conta crítico aberto
      risk({ tipo: 'oportunidade', priority: 'baixa', status: 'novo' }),
    ]);
    expect(s.total).toBe(4);
    expect(s.criticosAbertos).toBe(2); // os 2 impedimentos abertos crítico/alto
    expect(s.impedimentosAbertos).toBe(2);
    expect(s.opsBloqueadas).toBe(1); // ambos impedimentos são da o1
    expect(s.oportunidades).toBe(1);
    expect(s.byPriority.critica).toBe(1);
    expect(s.byPriority.alta).toBe(2);
  });

  it('portfólio sem riscos → tudo zero', () => {
    const s = buildRiskSummary([]);
    expect(s.total).toBe(0);
    expect(s.criticosAbertos).toBe(0);
    expect(s.opsBloqueadas).toBe(0);
  });
});

// 0055: o mix passou a ler `ferramentas` (array) em vez do enum legado
// `ferramenta` — o par {rpa,n8n} é que significa "ambos", e ferramenta fora do
// par (SAP, UiPath, registrada pelo tenant) conta em `outras` em vez de ser
// confundida com "ninguém definiu".
describe('buildToolMix — split por ferramenta', () => {
  it('conta rpa/n8n/ambos, outras e sem ferramenta (array vazio)', () => {
    const mix = buildToolMix([
      opp({ ferramentas: ['rpa'] }),
      opp({ ferramentas: ['rpa'] }),
      opp({ ferramentas: ['n8n'] }),
      opp({ ferramentas: ['n8n', 'rpa'] }),
      opp({ ferramentas: ['sap'] }),
      opp({ ferramentas: [] }),
    ]);
    expect(mix).toEqual({ rpa: 2, n8n: 1, ambos: 1, outras: 1, semFerramenta: 1 });
  });

  it('cada oportunidade conta uma vez só — as fatias somam o total', () => {
    const opps = [
      opp({ ferramentas: ['rpa', 'sap'] }),
      opp({ ferramentas: ['n8n', 'uipath', 'databricks'] }),
      opp({ ferramentas: ['n8n', 'rpa', 'sap'] }),
    ];
    const mix = buildToolMix(opps);
    const soma =
      mix.rpa + mix.n8n + mix.ambos + mix.outras + mix.semFerramenta;
    expect(soma).toBe(opps.length);
    expect(mix).toEqual({ rpa: 1, n8n: 1, ambos: 1, outras: 0, semFerramenta: 0 });
  });
});
