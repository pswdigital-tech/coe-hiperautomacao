// =============================================================================
// enrichment-preserve.test.ts — a IA não apaga o que a pessoa escreveu
// =============================================================================
// O botão "Reprocessar IA" (lib/ai/reprocess-actions.ts) roda o enriquecimento
// em cima de uma linha MADURA — com edições manuais, ferramentas escolhidas a
// dedo e texto escrito por gente. O contrato inegociável do reprocesso é: nada
// disso pode virar output de modelo sem a pessoa ter pedido.
//
// Quem decide campo a campo é `buildEnrichmentPatch()`. Esta suíte fixa as três
// regras dele (lib/ai/enrichment.ts) e prova que elas chegam intactas ao UPDATE
// real, via `enrichOpportunity(..., { preserveFilled })`.
//
// Nenhuma chamada real à OpenAI ou ao Supabase — mesmos mocks de
// `tests/ai/enrichment.test.ts`, arquivo que segue cobrindo o caminho
// pós-INSERT e os modos de falha.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks (espelham tests/ai/enrichment.test.ts) ---
const mockParse = vi.fn();

const mockSelectChain = {
  eq: vi.fn().mockReturnThis() as ReturnType<typeof vi.fn>,
  maybeSingle: vi.fn() as ReturnType<typeof vi.fn>,
};
const mockUpdateChain = {
  eq: vi.fn().mockReturnThis() as ReturnType<typeof vi.fn>,
};
const mockFrom = vi.fn();

class MockAPIError extends Error {
  status?: number;
}
class MockLengthFinishReasonError extends Error {}

vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { parse: mockParse } };
    static APIError = MockAPIError;
    static LengthFinishReasonError = MockLengthFinishReasonError;
  }
  return { default: MockOpenAI };
});
vi.mock('openai/error', () => ({
  APIError: MockAPIError,
  LengthFinishReasonError: MockLengthFinishReasonError,
}));
vi.mock('openai/helpers/zod', () => ({
  zodResponseFormat: vi.fn((_schema, name) => ({ _zod: true, _name: name })),
}));
vi.mock('@/lib/supabase/server', () => ({
  serviceRoleClient: vi.fn(() => ({ from: mockFrom })),
}));

const TENANT_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OPP_ID = '11111111-2222-3333-4444-555555555555';

/** Linha de INPUT (o que vai ao prompt) — sem nenhum campo derivado. */
const INPUT_ROW = {
  source: 'formulario' as const,
  request_type: 'nova_oportunidade',
  solicitante: 'Alice Silva',
  area: 'TI',
  subarea: null,
  processo: 'Conciliação bancária manual',
  frequencia: 'diario',
  volume_medio: '100',
  tempo_execucao: '2h',
  num_pessoas: '3',
  persona_extras: null,
  formulario_extras: null,
};

/** Resposta da IA — sempre a mesma; o que muda entre os testes é a linha. */
const AI = {
  ferramenta: 'rpa' as const,
  escopo_automacao: ['Ler extrato', 'Conciliar com ERP'],
  beneficios_esperados: ['Reduzir tempo em 80%'],
  observacao: 'Observação gerada pela IA',
  risco: 'Risco gerado pela IA',
  esforco: 'medio' as const,
  complexidade: 'medio' as const,
  tempo: 'pequeno' as const,
  objetivo: 4,
};

/** Estado de uma oportunidade madura: tudo preenchido por gente. */
const HUMAN_VALUES = {
  ferramentas: ['sap', 'databricks'],
  escopo_automacao: ['Escopo escrito pelo analista'],
  beneficios_esperados: ['Benefício escrito pelo analista'],
  observacao: 'Anotação do analista que não pode sumir',
  risco: 'Risco levantado em reunião',
  esforco: 'alto',
  complexidade: 'baixo',
  objetivo: 2,
};

/** Linha nova: nada derivado ainda (defaults do banco). */
const EMPTY_VALUES = {
  ferramentas: [],
  escopo_automacao: [],
  beneficios_esperados: [],
  observacao: null,
  risco: null,
  esforco: null,
  complexidade: null,
  objetivo: null,
};

/** Roda o enriquecimento com uma linha dada e devolve o payload do UPDATE. */
async function runEnrichment(
  row: Record<string, unknown>,
  options?: { preserveFilled?: boolean },
): Promise<Record<string, unknown>> {
  mockSelectChain.maybeSingle.mockResolvedValueOnce({ data: row, error: null });
  mockParse.mockResolvedValueOnce({
    choices: [{ message: { parsed: AI, refusal: null }, finish_reason: 'stop' }],
  });
  const { enrichOpportunity } = await import('@/lib/ai/enrichment');
  await enrichOpportunity(OPP_ID, TENANT_UUID, options);
  return mockFrom.mock.results[1].value.update.mock.calls[0][0];
}

describe('enriquecimento não destrói input do usuário', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'sk-test-xxx';

    mockFrom.mockReturnValue({
      select: vi.fn(() => mockSelectChain),
      update: vi.fn(() => mockUpdateChain),
    });
    mockSelectChain.eq.mockReturnThis();
    mockUpdateChain.eq.mockImplementation(() => {
      const thenable = {
        eq: mockUpdateChain.eq,
        then: (resolve: (v: { data: null; error: null }) => void) =>
          resolve({ data: null, error: null }),
      };
      return thenable as unknown as typeof mockUpdateChain;
    });
  });

  // --- Regra 3: modo "completar" (default do botão de reprocessar) ---------

  it('preserveFilled: linha preenchida por gente sai ILESA do reprocesso', async () => {
    const patch = await runEnrichment(
      { ...INPUT_ROW, ...HUMAN_VALUES },
      { preserveFilled: true },
    );

    // Nenhum campo derivado entra no UPDATE — só o carimbo de estado.
    for (const field of [
      'ferramenta',
      'escopo_automacao',
      'beneficios_esperados',
      'observacao',
      'risco',
      'esforco',
      'complexidade',
      'objetivo',
    ]) {
      expect(patch[field]).toBeUndefined();
    }
    expect(patch.ai_enrichment_status).toBe('enriched');
  });

  it('preserveFilled: preenche SÓ os buracos, sem tocar no resto', async () => {
    const patch = await runEnrichment(
      {
        ...INPUT_ROW,
        ...HUMAN_VALUES,
        // Dois buracos: o analista nunca preencheu escopo nem esforço.
        escopo_automacao: [],
        esforco: null,
      },
      { preserveFilled: true },
    );

    expect(patch.escopo_automacao).toEqual(AI.escopo_automacao);
    expect(patch.esforco).toBe('medio');
    // Vizinhos preenchidos continuam de fora.
    expect(patch.observacao).toBeUndefined();
    expect(patch.risco).toBeUndefined();
    expect(patch.complexidade).toBeUndefined();
    expect(patch.objetivo).toBeUndefined();
    expect(patch.beneficios_esperados).toBeUndefined();
  });

  // --- Modo "refazer" ------------------------------------------------------

  it('sem preserveFilled: refaz os campos derivados (o modo "refazer análise")', async () => {
    const patch = await runEnrichment({ ...INPUT_ROW, ...HUMAN_VALUES });

    expect(patch.escopo_automacao).toEqual(AI.escopo_automacao);
    expect(patch.beneficios_esperados).toEqual(AI.beneficios_esperados);
    expect(patch.observacao).toBe(AI.observacao);
    expect(patch.risco).toBe(AI.risco);
    expect(patch.esforco).toBe('medio');
    expect(patch.complexidade).toBe('medio');
    expect(patch.objetivo).toBe(4);
  });

  // --- Regra 1: a seleção de ferramentas é intocável -----------------------

  it('regra 1: `ferramenta` NÃO é escrita quando a pessoa já escolheu ferramentas', async () => {
    // Por que importa: a trigger `sync_opportunity_ferramentas()` (0055) é
    // bidirecional — escrever o enum legado com valor novo faz ela REESCREVER
    // o array. ['sap','databricks'] viraria ['rpa'] sem ninguém pedir.
    const patch = await runEnrichment({ ...INPUT_ROW, ...HUMAN_VALUES });
    expect(patch.ferramenta).toBeUndefined();
  });

  it('regra 1: `ferramenta` É escrita quando nenhuma ferramenta foi escolhida', async () => {
    const patch = await runEnrichment({ ...INPUT_ROW, ...EMPTY_VALUES });
    expect(patch.ferramenta).toBe('rpa');
  });

  // --- Regra 2: resposta vazia da IA não apaga texto -----------------------

  it('regra 2: resposta vazia da IA não apaga texto já escrito (nem em "refazer")', async () => {
    mockSelectChain.maybeSingle.mockResolvedValueOnce({
      data: { ...INPUT_ROW, ...HUMAN_VALUES },
      error: null,
    });
    mockParse.mockResolvedValueOnce({
      choices: [
        {
          message: {
            parsed: {
              ...AI,
              observacao: '',
              risco: '   ',
              escopo_automacao: [],
              beneficios_esperados: [],
            },
            refusal: null,
          },
          finish_reason: 'stop',
        },
      ],
    });
    const { enrichOpportunity } = await import('@/lib/ai/enrichment');
    await enrichOpportunity(OPP_ID, TENANT_UUID); // modo "refazer"
    const patch = mockFrom.mock.results[1].value.update.mock.calls[0][0];

    expect(patch.observacao).toBeUndefined();
    expect(patch.risco).toBeUndefined();
    expect(patch.escopo_automacao).toBeUndefined();
    expect(patch.beneficios_esperados).toBeUndefined();
    // O que a IA de fato respondeu continua entrando.
    expect(patch.esforco).toBe('medio');
  });

  // --- Não-regressão do caminho pós-INSERT --------------------------------

  it('linha nova (todos os campos vazios): payload idêntico ao de sempre', async () => {
    const patch = await runEnrichment({ ...INPUT_ROW, ...EMPTY_VALUES });

    expect(patch.ferramenta).toBe('rpa');
    expect(patch.escopo_automacao).toEqual(AI.escopo_automacao);
    expect(patch.beneficios_esperados).toEqual(AI.beneficios_esperados);
    expect(patch.observacao).toBe(AI.observacao);
    expect(patch.risco).toBe(AI.risco);
    expect(patch.esforco).toBe('medio');
    expect(patch.complexidade).toBe('medio');
    expect(patch.objetivo).toBe(4);
    // REALIGN-7.6 segue de fora — a IA ainda fala o domínio antigo de duração.
    expect(patch.tempo).toBeUndefined();
  });
});
