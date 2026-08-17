// =============================================================================
// createOpportunity + createPublicOpportunity — after(enrichOpportunity) wiring
// =============================================================================
// Cobre AI-ASYNC-01 + isolation de callback throw + null-tenant fallback.
// Plan 03 (Wave 2). NUNCA chama enrichment real (vi.mock intercepta @/lib/ai/
// enrichment); NUNCA chama OpenAI / Supabase real (mocks completos).
//
// Cenários (5):
//   1. createOpportunity happy: INSERT sucesso → after() chamado 1x →
//      callback dispara enrichOpportunity(oppId, tenantId).
//   2. createOpportunity INSERT fail: supabase mock retorna error →
//      after() NÃO é chamado; response ok:false.
//   3. createOpportunity callback throw isolation: enrichOpportunity rejeita
//      → response ainda ok:true (callback error NÃO propaga).
//   4. createPublicOpportunity happy: RPC sucesso + tenant resolve →
//      after() chamado com (oppId, tenantId).
//   5. createPublicOpportunity tenant_id null fallback: tenant query
//      retorna null → after() NÃO chamado; response continua ok:true.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// === Mocks ===

// after() mock: captura callbacks para execução manual posterior nos asserts.
const afterCalls: Array<() => Promise<void> | void> = [];
vi.mock('next/server', () => ({
  after: vi.fn((cb: () => Promise<void> | void) => {
    afterCalls.push(cb);
  }),
}));

// enrichOpportunity mock: nunca chama real
const mockEnrich = vi.fn();
vi.mock('@/lib/ai/enrichment', () => ({
  enrichOpportunity: mockEnrich,
}));

// Supabase chain mocks — granular: cada `from(table)` retorna chain próprio
const mockGetUser = vi.fn();
const mockProfileSingle = vi.fn();
const mockInsertSingle = vi.fn();
const mockTenantsMaybe = vi.fn();
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockServiceFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
      rpc: mockRpc,
    }),
  ),
  // Phase 7.6 Wave 2: createPublicOpportunity usa serviceRoleClient para
  // resolver tenant_id (anonymous SELECT em public.tenants é bloqueado pela
  // RLS policy tenants_select_own — exige service role).
  serviceRoleClient: vi.fn(() => ({
    from: mockServiceFrom,
  })),
}));

// Public form helpers — mockados para createPublicOpportunity
vi.mock('@/lib/security/turnstile', () => ({
  verifyTurnstileToken: vi.fn(async () => ({
    ok: true,
    hostname: 'x',
    action: null,
  })),
}));
vi.mock('@/lib/security/client-ip', () => ({
  getClientIp: vi.fn(async () => '1.2.3.4'),
}));
vi.mock('@/lib/security/hash-ip', () => ({
  hashIp: vi.fn(() => 'hash-fixture'),
}));
vi.mock('@/lib/security/botid-guard', () => ({
  isBotRequest: vi.fn(async () => false),
}));
vi.mock('@/lib/public-form/log', () => ({
  logPublicFormAttempt: vi.fn(async () => 'log-id-fixture'),
  updatePublicFormAttempt: vi.fn(async () => undefined),
}));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: () => 'test-ua' })),
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: () => undefined,
  })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// === Fixtures ===
const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OPP_ID = '11111111-2222-3333-4444-555555555555';
const USER_ID = 'user-uuid-fixture';

// Payload mínimo válido p/ createOpportunity — 9 campos enriquecidos OMITTED
// (Plan 03 Task 1 tornou esforco/complexidade/tempo/objetivo opcionais;
//  ferramenta/escopo_automacao/beneficios_esperados/observacao/risco já eram).
const VALID_INPUT = {
  source: 'formulario' as const,
  solicitante: 'Alice Tester',
  area: 'TI',
  processo: 'Processo válido aqui para testes',
  request_type: 'nova_oportunidade' as const,
};

// Payload p/ createPublicOpportunity — superset com defaults explícitos
// nos 9 campos enriquecidos (PublicSubmitInput type ainda os aceita p/
// compat com migration 0007).
const PUBLIC_INPUT = {
  solicitante: 'Bob Público',
  email: 'bob@ex.com',
  area: 'Operações',
  subarea: '',
  processo: 'Processo público para testes',
  frequencia: '',
  volume_medio: '',
  tempo_execucao: '',
  num_pessoas: '',
  ferramenta: null,
  escopo_automacao: [],
  beneficios_esperados: [],
  esforco: 'medio' as const,
  complexidade: 'medio' as const,
  tempo: 'mensal' as const,
  objetivo: 3,
  formulario_extras: {},
  request_type: 'nova_oportunidade' as const,
  observacao: '',
  risco: '',
};

// =============================================================================
describe('createOpportunity — after(enrichOpportunity) wiring', () => {
  beforeEach(() => {
    afterCalls.length = 0;
    vi.clearAllMocks();

    // Default supabase chain
    mockGetUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockProfileSingle.mockResolvedValue({
      data: { tenant_id: TENANT_ID },
      error: null,
    });
    mockInsertSingle.mockResolvedValue({
      data: { id: OPP_ID, tenant_id: TENANT_ID },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ single: mockProfileSingle }),
          }),
        };
      }
      if (table === 'opportunities') {
        return {
          insert: () => ({
            select: () => ({ single: mockInsertSingle }),
          }),
        };
      }
      return {};
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('AI-ASYNC-01: INSERT sucesso → after() chamado 1x com callback que dispara enrichOpportunity', async () => {
    const { createOpportunity } = await import('@/lib/opportunities/actions');
    const result = await createOpportunity(VALID_INPUT);
    expect(result).toEqual({ ok: true, id: OPP_ID });
    expect(afterCalls.length).toBe(1);
    // Executa o callback — deve chamar enrichOpportunity(oppId, tenantId)
    await afterCalls[0]();
    expect(mockEnrich).toHaveBeenCalledWith(OPP_ID, TENANT_ID);
  });

  it('INSERT fail → after() NÃO é chamado, response ok:false', async () => {
    mockInsertSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'db connection failed' },
    });
    const { createOpportunity } = await import('@/lib/opportunities/actions');
    const result = await createOpportunity(VALID_INPUT);
    expect(result.ok).toBe(false);
    expect(afterCalls.length).toBe(0);
    expect(mockEnrich).not.toHaveBeenCalled();
  });

  it('callback throw isolation: enrichOpportunity rejeita → response ainda ok:true', async () => {
    mockEnrich.mockRejectedValueOnce(new Error('boom from enrichment'));
    const { createOpportunity } = await import('@/lib/opportunities/actions');
    const result = await createOpportunity(VALID_INPUT);
    expect(result).toEqual({ ok: true, id: OPP_ID });
    expect(afterCalls.length).toBe(1);
    // Executar o callback — try/catch interno deve absorver; resolve sem throw
    await expect(afterCalls[0]()).resolves.toBeUndefined();
  });
});

// =============================================================================
describe('createPublicOpportunity — after(enrichOpportunity) wiring', () => {
  beforeEach(() => {
    afterCalls.length = 0;
    vi.clearAllMocks();

    // RPC retorna oppId (uuid string)
    mockRpc.mockResolvedValue({ data: OPP_ID, error: null });

    // tenant lookup default → resolve com TENANT_ID
    mockTenantsMaybe.mockResolvedValue({
      data: { id: TENANT_ID },
      error: null,
    });

    // Service role client: from('tenants') → chain com maybeSingle
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: mockTenantsMaybe }),
            }),
          }),
        };
      }
      return {};
    });

    // Anon client: from() não usado nesta função (só rpc) — stub vazio
    mockFrom.mockImplementation(() => ({}));
  });

  afterEach(() => vi.restoreAllMocks());

  it('AI-ASYNC-01 (public): RPC sucesso + tenant resolve → after() chamado com (oppId, tenantId)', async () => {
    const { createPublicOpportunity } = await import(
      '@/lib/opportunities/actions'
    );
    const result = await createPublicOpportunity(
      'fgcoop-test',
      PUBLIC_INPUT,
      'fake-turnstile-token',
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.id).toBe(OPP_ID);
    expect(afterCalls.length).toBe(1);
    await afterCalls[0]();
    expect(mockEnrich).toHaveBeenCalledWith(OPP_ID, TENANT_ID);
  });

  it('tenant_id null → after() NÃO chamado mas response continua ok:true', async () => {
    // Tenant lookup retorna null (slug não existe OU service role indisponível)
    mockTenantsMaybe.mockResolvedValueOnce({ data: null, error: null });
    const { createPublicOpportunity } = await import(
      '@/lib/opportunities/actions'
    );
    // RPC ainda mockada como sucesso → response ok:true, mas after() pulado
    // por fallback null-safe (cenário improvável em produção mas defensivo)
    const result = await createPublicOpportunity(
      'invalid-slug',
      PUBLIC_INPUT,
      'fake-turnstile-token',
    );
    expect(result.ok).toBe(true);
    expect(afterCalls.length).toBe(0);
    expect(mockEnrich).not.toHaveBeenCalled();
  });
});
