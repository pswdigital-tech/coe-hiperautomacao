// =============================================================================
// state.ts — unit tests (Phase 11 wizard fluxo único — 5 steps)
// =============================================================================
// Trava o novo contrato de criação (D-04/D-08/D-11):
//   - mode='create' = fluxo ÚNICO de 5 steps, independe de source.
//   - defaultFormData() fixa source='formulario'.
//   - validateStep: Identificação(nome+área+email) / Processo(processo) pt-BR.
//
// O contrato de mode='edit' permanece intocado nesta fase (escopo Phase 13) —
// não é re-testado aqui; só garantimos que create não tem mais tipo/classificacao.
//
// Funções puras — sem mocks, sem React, sem jsdom.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  stepsFor,
  validateStep,
  defaultFormData,
  opportunityToFormData,
} from '@/components/opportunities/wizard/state';
import { opportunityInputSchema } from '@/lib/opportunities/schema';
import { deriveFteBucket } from '@/lib/opportunities/fte';
import type { Opportunity } from '@/lib/opportunities/types';

const CREATE_STEPS = [
  'identificacao',
  'processo',
  'criterios',
  'beneficios',
  'priorizacao',
];

describe('stepsFor — Phase 11 fluxo único de criação', () => {
  it('WIZARD-01: formulario create → 5 steps na ordem canônica', () => {
    expect(stepsFor('formulario', 'create').map((s) => s.id)).toEqual(
      CREATE_STEPS
    );
  });

  it('WIZARD-01: persona create → MESMO array (fluxo único independe de source)', () => {
    expect(stepsFor('persona', 'create').map((s) => s.id)).toEqual(CREATE_STEPS);
  });

  it('WIZARD-01: undefined source + create → os 5 steps (não mais [TIPO])', () => {
    expect(stepsFor(undefined, 'create').map((s) => s.id)).toEqual(CREATE_STEPS);
  });

  it('cross-check: nenhum step do create tem id "tipo" nem "classificacao"', () => {
    const ids = [
      ...stepsFor('formulario', 'create'),
      ...stepsFor('persona', 'create'),
      ...stepsFor(undefined, 'create'),
    ].map((s) => s.id);
    expect(ids).not.toContain('tipo');
    expect(ids).not.toContain('classificacao');
  });
});

describe('validateStep — Phase 11 (Identificação + Processo, pt-BR)', () => {
  it('identificacao vazio → ok:false com errors.solicitante e errors.area', () => {
    const result = validateStep('identificacao', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.solicitante).toBe('Nome obrigatório');
      expect(result.errors.area).toBe('Área obrigatória');
      // processo NÃO é validado em identificacao (migrou p/ step processo)
      expect(result.errors).not.toHaveProperty('processo');
    }
  });

  it('identificacao com email inválido → ok:false com errors.email', () => {
    const result = validateStep('identificacao', {
      solicitante: 'Alice',
      area: 'TI',
      email: 'not-an-email',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.email).toBe('E-mail inválido');
    }
  });

  it('identificacao válido (nome+área, sem processo) → ok:true', () => {
    const result = validateStep('identificacao', {
      solicitante: 'Alice',
      area: 'TI',
    });
    expect(result.ok).toBe(true);
  });

  it('processo vazio → ok:false com errors.processo === "Processo obrigatório"', () => {
    const result = validateStep('processo', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.processo).toBe('Processo obrigatório');
    }
  });

  it('processo preenchido → ok:true', () => {
    const result = validateStep('processo', { processo: 'Conciliação bancária' });
    expect(result.ok).toBe(true);
  });
});

describe('validateStep — criterios (exigir os 8; espelha CHECK do banco)', () => {
  const ALL8 = {
    causaReclamacoes: 'sim',
    totalmenteManual: 'sim',
    regrasClaras: 'sim',
    decisaoHumana: 'nao',
    padronizacaoDocs: 'sim',
    validacaoDados: 'sim',
    schedulable: 'sim',
    temDocumentacao: 'sim',
  } as const;

  it('criterios ausente → ok:false (0 de 8 respondidos)', () => {
    const result = validateStep('criterios', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.criterios).toContain('8 faltando');
    }
  });

  it('criterios parcial → ok:false com contagem de faltantes', () => {
    const result = validateStep('criterios', {
      criterios: { causaReclamacoes: 'sim', regrasClaras: 'nao' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.criterios).toContain('6 faltando');
    }
  });

  it('criterios com os 8 respondidos → ok:true', () => {
    const result = validateStep('criterios', { criterios: { ...ALL8 } });
    expect(result.ok).toBe(true);
  });
});

// =============================================================================
// 13-EDIT-01 (Phase 13 Plan 05): round-trip da edição global do modal.
// -----------------------------------------------------------------------------
// Prova que editar uma PERSONA LEGADA (FGCoop) pelo modal grava no modelo
// first-class v0.2 SEM mass-assignment: opportunityToFormData(row) → derivar
// prioridade_fte de fte_horas → opportunityInputSchema.safeParse aceita.
// O payload NÃO pode carregar tenant_id/id/seq_id/score/rpa_score/priority_level.
// =============================================================================
describe('13-EDIT-01: opportunityToFormData → opportunityInputSchema (round-trip da edição do modal)', () => {
  // Linha shaped como uma persona legada FGCoop (campos v0.2 first-class null).
  const legacyPersonaRow = {
    id: '00000000-0000-0000-0000-000000000abc',
    tenant_id: '11111111-1111-1111-1111-111111111111',
    seq_id: 42,
    source: 'persona',
    request_type: 'nova_oportunidade',
    solicitante: 'Maria da Silva',
    email: 'maria@fgcoop.coop.br',
    area: 'Financeiro',
    subarea: 'Contas a Pagar',
    processo: 'Conciliação bancária manual',
    frequencia: 'Diário',
    volume_medio: '50 lançamentos',
    tempo_execucao: '2 horas',
    num_pessoas: '3',
    ferramenta: null,
    escopo_automacao: null,
    beneficios_esperados: null,
    esforco: 'medio',
    complexidade: 'medio',
    tempo: 'diario',
    objetivo: 4,
    status: 'novo',
    responsavel: null,
    notas: null,
    observacao: null,
    risco: null,
    fte_horas: 50,
    criterios: null,
    beneficios: null,
    persona_extras: { cargo: 'Analista' },
    formulario_extras: null,
    // Campos server-derived / calculados presentes na view (NÃO podem vazar no payload):
    score: 88,
    priority_level: 'alta',
    rpa_score: null,
  } as unknown as Opportunity;

  it('persona legada edita p/ first-class: opportunityToFormData + prioridade_fte derivado → safeParse success', () => {
    const form = opportunityToFormData(legacyPersonaRow);
    const payload = {
      ...form,
      prioridade_fte:
        form.fte_horas != null ? deriveFteBucket(Number(form.fte_horas)) : undefined,
    };

    const result = opportunityInputSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('prioridade_fte do payload === deriveFteBucket(fte_horas) (fonte única display=persistência)', () => {
    const form = opportunityToFormData(legacyPersonaRow);
    const payload = {
      ...form,
      prioridade_fte:
        form.fte_horas != null ? deriveFteBucket(Number(form.fte_horas)) : undefined,
    };
    // 50 h/mês → bucket 'medio' (40 <= h < 100)
    expect(payload.prioridade_fte).toBe(deriveFteBucket(50));
    expect(payload.prioridade_fte).toBe('medio');
  });

  it('mass-assignment guard: payload NÃO contém tenant_id/id/seq_id/score/rpa_score/priority_level', () => {
    const form = opportunityToFormData(legacyPersonaRow);
    const payload = {
      ...form,
      prioridade_fte:
        form.fte_horas != null ? deriveFteBucket(Number(form.fte_horas)) : undefined,
    };
    expect('tenant_id' in payload).toBe(false);
    expect('id' in payload).toBe(false);
    expect('seq_id' in payload).toBe(false);
    expect('score' in payload).toBe(false);
    expect('rpa_score' in payload).toBe(false);
    expect('priority_level' in payload).toBe(false);
  });
});

describe('defaultFormData — Phase 11 (source fixo formulário)', () => {
  it('fixa source="formulario" (D-04)', () => {
    expect(defaultFormData().source).toBe('formulario');
  });

  it('mantém defaults de score/status do create', () => {
    const d = defaultFormData();
    expect(d.esforco).toBe('medio');
    expect(d.complexidade).toBe('medio');
    expect(d.objetivo).toBe(3);
    expect(d.status).toBe('novo');
    expect(d.request_type).toBe('nova_oportunidade');
    // tempo (frequência) não tem default — Priorização define da frequência do Processo.
    expect(d.tempo).toBeUndefined();
  });
});
