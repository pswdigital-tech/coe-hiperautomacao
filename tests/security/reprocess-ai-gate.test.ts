// =============================================================================
// reprocess-ai-gate.test.ts — quem pode reprocessar a análise da IA
// =============================================================================
// `reprocessOpportunityEnrichment()` (lib/ai/reprocess-actions.ts) chama o
// enriquecimento com SERVICE ROLE — ou seja, a RLS não é a última linha de
// defesa dentro dela: o gate desta action É parte do bloqueio. Por isso ele é
// testado isoladamente, sem banco.
//
// Contrato (mesmo predicado do gate de atribuição em assignee-actions.ts e do
// gate visual em app/(app)/opportunities/[id]/page.tsx):
//   PODE   → platform_admin (qualquer empresa)
//          → tenant_admin da empresa DONA da oportunidade
//          → psw_staff com concessão de admin naquela empresa (0045)
//   NÃO PODE → member, viewer, e qualquer papel sem sessão
//
// Suíte de unidade: Supabase e `isTenantAdminOf` são mocks. A prova de que o
// predicado `isTenantAdminOf` casa com o SQL `is_tenant_admin_of()` vive em
// tests/schema/tenant-admin-parity.test.ts — aqui provamos o WIRING: que a
// action consulta o predicado certo contra o tenant DA OPORTUNIDADE, e que
// nada é escrito quando a resposta é não.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const OPP_ID = '11111111-2222-3333-4444-555555555555';
const OPP_TENANT = 'aaaaaaaa-0000-0000-0000-000000000001';
const PSW_TENANT = 'bbbbbbbb-0000-0000-0000-000000000002';

// --- Mocks ---
const mockEnrich = vi.fn(async () => {});
vi.mock('@/lib/ai/enrichment', () => ({ enrichOpportunity: mockEnrich }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const mockGetCurrentProfile = vi.fn();
const mockIsTenantAdminOf = vi.fn();
vi.mock('@/lib/security/role', async () => {
  const actual = await vi.importActual<typeof import('@/lib/security/role')>(
    '@/lib/security/role',
  );
  return {
    ...actual,
    getCurrentProfile: mockGetCurrentProfile,
    isTenantAdminOf: mockIsTenantAdminOf,
  };
});

// Chain do Supabase: `select(...).eq(...).maybeSingle()` (leitura) e
// `update(...).eq(...).eq(...).select(...)` (marcação de pending).
const mockMaybeSingle = vi.fn();
const mockUpdateSelect = vi.fn();
const mockUpdate = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mockMaybeSingle }),
      }),
      update: (payload: unknown) => {
        mockUpdate(payload);
        return {
          eq: () => ({ eq: () => ({ select: mockUpdateSelect }) }),
        };
      },
    }),
  }),
}));

function profile(role: string, tenantId = OPP_TENANT) {
  return {
    id: 'profile-1',
    email: 'quem@empresa.com',
    fullName: null,
    role,
    tenantId,
    tenantName: null,
    tenantSlug: null,
  };
}

/** Leituras na ordem em que a action as faz: a oportunidade, depois o estado final. */
function readsOk(finalStatus = 'enriched') {
  mockMaybeSingle
    .mockResolvedValueOnce({ data: { id: OPP_ID, tenant_id: OPP_TENANT } })
    .mockResolvedValueOnce({
      data: { ai_enrichment_status: finalStatus, ai_enrichment_error: null },
    });
  mockUpdateSelect.mockResolvedValue({ data: [{ id: OPP_ID }], error: null });
}

async function run(mode?: 'fill-empty' | 'overwrite') {
  const { reprocessOpportunityEnrichment } = await import(
    '@/lib/ai/reprocess-actions'
  );
  return reprocessOpportunityEnrichment(OPP_ID, mode);
}

describe('reprocessOpportunityEnrichment — gate de papel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTenantAdminOf.mockResolvedValue(false);
  });

  it('platform_admin: reprocessa em qualquer empresa', async () => {
    mockGetCurrentProfile.mockResolvedValue(profile('platform_admin', PSW_TENANT));
    readsOk();

    const result = await run();

    expect(result).toEqual({ ok: true });
    // Super-admin nem consulta a concessão por empresa — o papel já basta.
    expect(mockIsTenantAdminOf).not.toHaveBeenCalled();
    expect(mockEnrich).toHaveBeenCalledWith(OPP_ID, OPP_TENANT, {
      preserveFilled: true,
    });
  });

  it('tenant_admin da empresa dona: reprocessa', async () => {
    mockGetCurrentProfile.mockResolvedValue(profile('tenant_admin'));
    mockIsTenantAdminOf.mockResolvedValue(true);
    readsOk();

    expect(await run()).toEqual({ ok: true });
    // O predicado é consultado contra o tenant DA OPORTUNIDADE, não do profile.
    expect(mockIsTenantAdminOf).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'tenant_admin' }),
      OPP_TENANT,
    );
  });

  it('psw_staff COM concessão de admin naquela empresa (0045): reprocessa', async () => {
    mockGetCurrentProfile.mockResolvedValue(profile('psw_staff', PSW_TENANT));
    mockIsTenantAdminOf.mockResolvedValue(true);
    readsOk();

    expect(await run()).toEqual({ ok: true });
    expect(mockEnrich).toHaveBeenCalledWith(OPP_ID, OPP_TENANT, expect.anything());
  });

  it('psw_staff SEM concessão naquela empresa: bloqueado, nada é escrito', async () => {
    mockGetCurrentProfile.mockResolvedValue(profile('psw_staff', PSW_TENANT));
    mockIsTenantAdminOf.mockResolvedValue(false);
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: OPP_ID, tenant_id: OPP_TENANT },
    });

    const result = await run();

    expect(result.ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockEnrich).not.toHaveBeenCalled();
  });

  it('member: bloqueado, nada é escrito', async () => {
    mockGetCurrentProfile.mockResolvedValue(profile('member'));
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: OPP_ID, tenant_id: OPP_TENANT },
    });

    const result = await run();

    expect(result).toEqual({
      ok: false,
      error: 'Apenas administradores da empresa podem reprocessar a análise da IA.',
    });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockEnrich).not.toHaveBeenCalled();
  });

  it('viewer: bloqueado, nada é escrito', async () => {
    mockGetCurrentProfile.mockResolvedValue(profile('viewer'));
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: OPP_ID, tenant_id: OPP_TENANT },
    });

    expect((await run()).ok).toBe(false);
    expect(mockEnrich).not.toHaveBeenCalled();
  });

  it('sem sessão: bloqueado antes de qualquer query', async () => {
    mockGetCurrentProfile.mockResolvedValue(null);

    expect(await run()).toEqual({
      ok: false,
      error: 'Sessão expirada. Entre novamente.',
    });
    expect(mockMaybeSingle).not.toHaveBeenCalled();
    expect(mockEnrich).not.toHaveBeenCalled();
  });

  it('oportunidade fora do escopo de leitura (RLS): colapsa em "não encontrada"', async () => {
    mockGetCurrentProfile.mockResolvedValue(profile('platform_admin', PSW_TENANT));
    mockMaybeSingle.mockResolvedValueOnce({ data: null });

    expect(await run()).toEqual({
      ok: false,
      error: 'Oportunidade não encontrada ou fora do seu escopo de acesso.',
    });
    expect(mockEnrich).not.toHaveBeenCalled();
  });
});

describe('reprocessOpportunityEnrichment — comportamento da execução', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTenantAdminOf.mockResolvedValue(true);
    mockGetCurrentProfile.mockResolvedValue(profile('tenant_admin'));
  });

  it('modo "overwrite" chega ao enriquecimento como preserveFilled:false', async () => {
    readsOk();
    await run('overwrite');
    expect(mockEnrich).toHaveBeenCalledWith(OPP_ID, OPP_TENANT, {
      preserveFilled: false,
    });
  });

  it('volta o estado para pending SEM limpar campo de conteúdo', async () => {
    readsOk();
    await run();
    // A idempotência da Phase 7.6 filtra por `pending` no read e no UPDATE —
    // sem esta marcação o reprocesso seria no-op. O payload não pode conter
    // mais nada: limpar conteúdo aqui apagaria dado do usuário.
    expect(mockUpdate).toHaveBeenCalledWith({
      ai_enrichment_status: 'pending',
      ai_enrichment_error: null,
    });
  });

  it('UPDATE que casa zero linhas (RLS) não vira sucesso silencioso', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: OPP_ID, tenant_id: OPP_TENANT },
    });
    mockUpdateSelect.mockResolvedValue({ data: [], error: null });

    const result = await run();

    expect(result.ok).toBe(false);
    expect(mockEnrich).not.toHaveBeenCalled();
  });

  it('IA falhou: devolve erro legível com o detalhe técnico', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { id: OPP_ID, tenant_id: OPP_TENANT } })
      .mockResolvedValueOnce({
        data: {
          ai_enrichment_status: 'failed',
          ai_enrichment_error: 'api_429: rate limit',
        },
      });
    mockUpdateSelect.mockResolvedValue({ data: [{ id: OPP_ID }], error: null });

    const result = await run();

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('api_429: rate limit');
  });

  it('estado continua pending (serviço de IA indisponível): não mente sucesso', async () => {
    readsOk('pending');
    expect((await run()).ok).toBe(false);
  });
});
