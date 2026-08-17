// =============================================================================
// enrichOpportunity — unit tests com mock OpenAI + Supabase service-role
// =============================================================================
// CI NUNCA chama OpenAI real (vi.mock('openai') intercepta o SDK inteiro).
// Cobre 8 cenários:
//   1. AI-MODEL-01 happy path → UPDATE com 9 campos + status='enriched'
//   2. AI-RLS-01 — UPDATE.eq tenant_id + .eq pending (defesa cross-tenant
//      + idempotência)
//   3. refusal → markFailed prefix 'refusal:'
//   4. LengthFinishReasonError → markFailed prefix 'length_finish:'
//   5. network error → markFailed prefix 'unknown:' c/ msg ECONNREFUSED
//   6. AI-IDEMP-01 — row não-pending → sai sem parse nem update
//   7. AI-TEST-02 — messages NÃO contém ID-do-tenant raw
//   8. openai-init failure (constructor throw) → markFailed /openai-init/i
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks setup ---
const mockParse = vi.fn();

// Estado mutável dos chains — recriado por teste em beforeEach.
const mockSelectChain = {
  eq: vi.fn().mockReturnThis() as ReturnType<typeof vi.fn>,
  maybeSingle: vi.fn() as ReturnType<typeof vi.fn>,
};
const mockUpdateChain = {
  eq: vi.fn().mockReturnThis() as ReturnType<typeof vi.fn>,
};
const mockFrom = vi.fn();

// Flag módulo-level para Test 8 — quando true, MockOpenAI throw no construtor.
// Resetada em beforeEach para isolamento.
const constructorState = {
  shouldThrow: false,
  errorMessage: 'OPENAI_API_KEY missing',
};

// Shared error classes — referenciadas tanto em vi.mock('openai') (estáticos
// p/ acesso via OpenAI.LengthFinishReasonError) quanto em vi.mock('openai/error')
// (named exports para `import { LengthFinishReasonError } from 'openai/error'`).
class MockAPIError extends Error {
  status?: number;
}
class MockLengthFinishReasonError extends Error {}

vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { parse: mockParse } };
    constructor() {
      if (constructorState.shouldThrow) {
        throw new Error(constructorState.errorMessage);
      }
    }
    // Estáticos: mantidos para que tests que acessem OpenAI.LengthFinishReasonError
    // como property continuem funcionando (defesa em camadas).
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
  zodResponseFormat: vi.fn((schema, name) => ({ _zod: true, _name: name })),
}));

vi.mock('@/lib/supabase/server', () => ({
  serviceRoleClient: vi.fn(() => ({ from: mockFrom })),
}));

// --- Fixtures ---
const ROW = {
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
  formulario_extras: { tipo_processo: 'Backoffice' },
};

const ENRICHED = {
  ferramenta: 'rpa' as const,
  escopo_automacao: ['Ler extrato', 'Conciliar com ERP'],
  beneficios_esperados: ['Reduzir tempo em 80%'],
  observacao: '',
  risco: '',
  esforco: 'medio' as const,
  complexidade: 'medio' as const,
  tempo: 'pequeno' as const,
  objetivo: 4,
};

const TENANT_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OPP_ID = '11111111-2222-3333-4444-555555555555';

describe('enrichOpportunity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset constructor state — importante para isolamento entre testes.
    constructorState.shouldThrow = false;
    constructorState.errorMessage = 'OPENAI_API_KEY missing';
    process.env.OPENAI_API_KEY = 'sk-test-xxx';

    // Default supabase chain — cada from() retorna novo objeto com select/update mocks.
    mockFrom.mockReturnValue({
      select: vi.fn(() => mockSelectChain),
      update: vi.fn(() => mockUpdateChain),
    });
    mockSelectChain.eq.mockReturnThis();
    mockSelectChain.maybeSingle.mockResolvedValue({ data: ROW, error: null });
    mockUpdateChain.eq.mockReturnThis();
    // resolved value padrão — o último .eq do update resolve a chain.
    // Cada teste pode sobrescrever via mockResolvedValueOnce na CHAIN final.
    // Mas como .eq retornaThis, o await na cadeia .eq.eq.eq() retorna o último valor.
    // Para garantir, fazemos cada .eq retornar um thenable que resolve {data:null,error:null}.
    mockUpdateChain.eq.mockImplementation(function (this: typeof mockUpdateChain) {
      // Após o terceiro .eq, supabase await resolve com data/error.
      // Como retornaThis, precisamos que o objeto seja thenable.
      const thenable = {
        eq: mockUpdateChain.eq,
        then: (resolve: (v: { data: null; error: null }) => void) =>
          resolve({ data: null, error: null }),
      };
      return thenable as unknown as typeof mockUpdateChain;
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('AI-MODEL-01: happy path — parse retorna parsed → UPDATE com 8 campos (tempo deferido REALIGN-7.6)', async () => {
    mockParse.mockResolvedValueOnce({
      choices: [{ message: { parsed: ENRICHED, refusal: null }, finish_reason: 'stop' }],
    });
    const { enrichOpportunity } = await import('@/lib/ai/enrichment');
    await enrichOpportunity(OPP_ID, TENANT_UUID);
    expect(mockParse).toHaveBeenCalledTimes(1);
    // mockFrom é chamado 2x: 1º select (read row), 2º update (write enriched)
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockFrom.mock.calls[0][0]).toBe('opportunities');
    expect(mockFrom.mock.calls[1][0]).toBe('opportunities');
    const updateCall = mockFrom.mock.results[1].value.update.mock.calls[0][0];
    expect(updateCall.ferramenta).toBe('rpa');
    expect(updateCall.escopo_automacao).toEqual(['Ler extrato', 'Conciliar com ERP']);
    expect(updateCall.beneficios_esperados).toEqual(['Reduzir tempo em 80%']);
    expect(updateCall.observacao).toBe('');
    expect(updateCall.risco).toBe('');
    expect(updateCall.esforco).toBe('medio');
    expect(updateCall.complexidade).toBe('medio');
    // REALIGN-7.6: enrichOpportunity NÃO sobrescreve `tempo` — a IA ainda produz o
    // domínio antigo (duração) e a coluna virou frequency_bucket (0011). Sem map 1:1.
    expect(updateCall.tempo).toBeUndefined();
    expect(updateCall.objetivo).toBe(4);
    expect(updateCall.ai_enrichment_status).toBe('enriched');
    expect(updateCall.ai_enriched_at).toBeTypeOf('string');
    expect(updateCall.ai_enrichment_error).toBeNull();
  });

  it('AI-RLS-01: UPDATE inclui .eq tenant_id e .eq pending (defesa cross-tenant + idempotency)', async () => {
    mockParse.mockResolvedValueOnce({
      choices: [{ message: { parsed: ENRICHED, refusal: null }, finish_reason: 'stop' }],
    });
    const { enrichOpportunity } = await import('@/lib/ai/enrichment');
    await enrichOpportunity(OPP_ID, TENANT_UUID);
    // mockUpdateChain.eq foi chamado 3x: (id, X), (tenant_id, Y), (status, pending)
    const calls = mockUpdateChain.eq.mock.calls;
    expect(calls).toContainEqual(['tenant_id', TENANT_UUID]);
    expect(calls).toContainEqual(['ai_enrichment_status', 'pending']);
    expect(calls).toContainEqual(['id', OPP_ID]);
  });

  it('Pitfall 1 — refusal detected → markFailed com prefix "refusal:"', async () => {
    mockParse.mockResolvedValueOnce({
      choices: [
        {
          message: { parsed: null, refusal: 'I cannot help with that request.' },
          finish_reason: 'stop',
        },
      ],
    });
    const { enrichOpportunity } = await import('@/lib/ai/enrichment');
    await enrichOpportunity(OPP_ID, TENANT_UUID);
    const updateCalls = mockFrom.mock.results[1].value.update.mock.calls;
    expect(updateCalls[0][0].ai_enrichment_status).toBe('failed');
    expect(updateCalls[0][0].ai_enrichment_error).toMatch(/^refusal:/);
  });

  it('Pitfall 2 — LengthFinishReasonError → markFailed com prefix "length_finish:"', async () => {
    // Carrega a classe via subpath 'openai/error' (mesmo path que enrichment.ts
    // usa via named import). Cast para `any` evita o type real do SDK ser
    // consultado — o mock em vi.mock('openai/error') substitui a impl.
    // Defesa explícita via cast tipado em vez de suppressão TS (W-2 do revisor).
    const errorMod = (await import('openai/error')) as unknown as {
      LengthFinishReasonError: new (msg?: string) => Error;
    };
    // Sanity check: confirma que a mock class está disponível.
    expect(errorMod.LengthFinishReasonError).toBeDefined();
    const err = new errorMod.LengthFinishReasonError('output truncated');
    // Sanity check: instanceof bate (caminho que enrichment.ts usa para classificar)
    expect(err).toBeInstanceOf(errorMod.LengthFinishReasonError);
    mockParse.mockRejectedValueOnce(err);
    const { enrichOpportunity } = await import('@/lib/ai/enrichment');
    await enrichOpportunity(OPP_ID, TENANT_UUID);
    const updateCalls = mockFrom.mock.results[1].value.update.mock.calls;
    expect(updateCalls[0][0].ai_enrichment_status).toBe('failed');
    expect(updateCalls[0][0].ai_enrichment_error).toMatch(/^length_finish:/);
  });

  it('network error → markFailed com prefix "unknown:" e mensagem ECONNREFUSED', async () => {
    mockParse.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const { enrichOpportunity } = await import('@/lib/ai/enrichment');
    await enrichOpportunity(OPP_ID, TENANT_UUID);
    const updateCalls = mockFrom.mock.results[1].value.update.mock.calls;
    expect(updateCalls[0][0].ai_enrichment_status).toBe('failed');
    expect(updateCalls[0][0].ai_enrichment_error).toMatch(/^unknown:/);
    expect(updateCalls[0][0].ai_enrichment_error).toMatch(/ECONNREFUSED/);
  });

  it('AI-IDEMP-01: row já não é pending → função sai sem chamar parse nem update', async () => {
    mockSelectChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const { enrichOpportunity } = await import('@/lib/ai/enrichment');
    await enrichOpportunity(OPP_ID, TENANT_UUID);
    expect(mockParse).not.toHaveBeenCalled();
    // from foi chamado 1x (só o select), update nunca
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('AI-TEST-02: messages NÃO contém ID-do-tenant raw no prompt', async () => {
    mockParse.mockResolvedValueOnce({
      choices: [{ message: { parsed: ENRICHED, refusal: null }, finish_reason: 'stop' }],
    });
    const { enrichOpportunity } = await import('@/lib/ai/enrichment');
    await enrichOpportunity(OPP_ID, TENANT_UUID);
    const args = mockParse.mock.calls[0][0];
    const concatenated = args.messages
      .map((m: { content: string }) => m.content)
      .join('\n');
    expect(concatenated).not.toContain(TENANT_UUID);
    // Defesa adicional: regex UUID v4-ish
    expect(concatenated).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it('openai-init failure: constructor throw → markFailed com error matching /openai-init/i', async () => {
    // Configura o mock OpenAI constructor para throw em `new OpenAI()` —
    // simula o caminho real onde SDK detecta OPENAI_API_KEY missing.
    // Cobertura simétrica ao caminho SUPABASE_SERVICE_ROLE_KEY ausente
    // (que retorna early sem update, porque sem `sb` para escrever).
    constructorState.shouldThrow = true;
    constructorState.errorMessage =
      'The OPENAI_API_KEY environment variable is missing or empty';

    const { enrichOpportunity } = await import('@/lib/ai/enrichment');
    await enrichOpportunity(OPP_ID, TENANT_UUID);

    // Esperado: parse NÃO foi chamado (constructor falhou antes)
    expect(mockParse).not.toHaveBeenCalled();

    // markFailed foi chamado — segundo from() é o update path
    const updateCalls = mockFrom.mock.results[1].value.update.mock.calls;
    expect(updateCalls.length).toBeGreaterThan(0);
    expect(updateCalls[0][0].ai_enrichment_status).toBe('failed');
    expect(updateCalls[0][0].ai_enrichment_error).toMatch(/openai-init/i);
    // Sanidade adicional: matching com o pattern de error key missing
    expect(updateCalls[0][0].ai_enrichment_error).toMatch(
      /missing|api[_-]?key|OPENAI_API_KEY/i,
    );
  });
});
