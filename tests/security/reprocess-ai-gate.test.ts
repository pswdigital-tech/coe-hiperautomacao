// =============================================================================
// reprocess-ai-gate.test.ts — quem pode reprocessar a análise da IA
// =============================================================================
// `reprocessOpportunityEnrichment()` (lib/ai/reprocess-actions.ts) chama o
// enriquecimento com SERVICE ROLE — ou seja, a RLS não é a última linha de
// defesa dentro dela: o gate desta action É parte do bloqueio. Por isso ele é
// testado isoladamente, sem banco.
//
// Contrato — `canReprocessAiEnrichment()`, MAIS ESTREITO que o gate de
// atribuição de assignee-actions.ts (e usado também pelo gate visual em
// app/(app)/opportunities/[id]/page.tsx):
//   PODE   → platform_admin (qualquer empresa)
//          → psw_staff com concessão de admin naquela empresa (0045)
//   NÃO PODE → tenant_admin da empresa DONA (reprocessar queima crédito de IA
//              da PSW e pode reescrever campos derivados em massa — quem
//              dispara é a PSW), member, viewer, e qualquer um sem sessão
//
// Suíte de unidade: Supabase é mock. Duas metades aqui — o CONTRATO POR PAPEL
// do predicado (ramos que não tocam o banco rodam de verdade; o ramo do
// psw_staff roda contra o mock de `psw_tenant_admins`) e o WIRING da action
// (que ela consulta o predicado contra o tenant DA OPORTUNIDADE e não escreve
// nada quando a resposta é não). A prova de que `isTenantAdminOf` casa com o
// SQL `is_tenant_admin_of()` vive em tests/schema/tenant-admin-parity.test.ts.
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
// A action consulta UM predicado — é ele que o wiring precisa observar. O
// contrato por papel dele é provado na segunda metade do arquivo, contra a
// implementação REAL (importActual), para o mock daqui não poder mentir.
const mockCanReprocess = vi.fn();
vi.mock('@/lib/security/role', async () => {
  const actual = await vi.importActual<typeof import('@/lib/security/role')>(
    '@/lib/security/role',
  );
  return {
    ...actual,
    getCurrentProfile: mockGetCurrentProfile,
    canReprocessAiEnrichment: mockCanReprocess,
  };
});

// Chain do Supabase: `select(...).eq(...)[.eq(...)].maybeSingle()` (leitura da
// oportunidade, com um `eq`; leitura de `psw_tenant_admins` pelo par pessoa ×
// empresa, com dois) e `update(...).eq(...).eq(...).select(...)` (marcação de
// pending). O `eq` é auto-encadeável para servir aos dois formatos de leitura.
const mockMaybeSingle = vi.fn();
const mockUpdateSelect = vi.fn();
const mockUpdate = vi.fn();
vi.mock('@/lib/supabase/server', () => {
  const read: { eq: () => typeof read; maybeSingle: typeof mockMaybeSingle } = {
    eq: () => read,
    maybeSingle: mockMaybeSingle,
  };
  return {
    createClient: async () => ({
      from: () => ({
        select: () => read,
        update: (payload: unknown) => {
          mockUpdate(payload);
          return {
            eq: () => ({ eq: () => ({ select: mockUpdateSelect }) }),
          };
        },
      }),
    }),
  };
});

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

// =============================================================================
// Metade 1 — CONTRATO POR PAPEL do predicado (implementação real)
// =============================================================================
describe('canReprocessAiEnrichment — quem a PSW autoriza', () => {
  beforeEach(() => vi.clearAllMocks());

  /** O predicado REAL, não o mock que a action enxerga. */
  async function can(role: string, tenantId = OPP_TENANT, profileTenant = OPP_TENANT) {
    const actual = await vi.importActual<typeof import('@/lib/security/role')>(
      '@/lib/security/role',
    );
    return actual.canReprocessAiEnrichment(
      role === 'none' ? null : (profile(role, profileTenant) as never),
      tenantId,
    );
  }

  it('platform_admin: pode, em qualquer empresa, sem consultar o banco', async () => {
    expect(await can('platform_admin', OPP_TENANT, PSW_TENANT)).toBe(true);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it('psw_staff COM concessão de admin naquela empresa (0045): pode', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'grant-1' } });
    expect(await can('psw_staff', OPP_TENANT, PSW_TENANT)).toBe(true);
  });

  it('psw_staff SEM concessão naquela empresa: não pode', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null });
    expect(await can('psw_staff', OPP_TENANT, PSW_TENANT)).toBe(false);
  });

  // A MUDANÇA desta regra: o admin do cliente atribui (canAssign) mas NÃO
  // reprocessa. Sem consulta ao banco — o papel já basta para negar.
  it('tenant_admin da empresa DONA: NÃO pode (gate é da PSW, não da empresa)', async () => {
    expect(await can('tenant_admin')).toBe(false);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it('member, viewer e sem sessão: não podem, sem consultar o banco', async () => {
    expect(await can('member')).toBe(false);
    expect(await can('viewer')).toBe(false);
    expect(await can('none')).toBe(false);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Metade 2 — WIRING da action: consulta o predicado certo, contra o tenant
// certo, e não escreve nada quando a resposta é não
// =============================================================================
describe('reprocessOpportunityEnrichment — gate de papel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanReprocess.mockResolvedValue(false);
  });

  it('autorizado: reprocessa, e o predicado é consultado contra o tenant DA OPORTUNIDADE', async () => {
    mockGetCurrentProfile.mockResolvedValue(profile('psw_staff', PSW_TENANT));
    mockCanReprocess.mockResolvedValue(true);
    readsOk();

    expect(await run()).toEqual({ ok: true });
    // O tenant do PROFILE (PSW) nunca entra na decisão — só o da oportunidade.
    expect(mockCanReprocess).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'psw_staff' }),
      OPP_TENANT,
    );
    expect(mockEnrich).toHaveBeenCalledWith(OPP_ID, OPP_TENANT, {
      preserveFilled: true,
    });
  });

  it('negado pelo predicado: bloqueado, nada é escrito', async () => {
    mockGetCurrentProfile.mockResolvedValue(profile('tenant_admin'));
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: OPP_ID, tenant_id: OPP_TENANT },
    });

    const result = await run();

    expect(result).toEqual({
      ok: false,
      error: 'Reprocessar a análise da IA é uma ação restrita à equipe da PSW.',
    });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockEnrich).not.toHaveBeenCalled();
  });

  it('sem sessão: bloqueado antes de qualquer query', async () => {
    mockGetCurrentProfile.mockResolvedValue(null);

    expect(await run()).toEqual({
      ok: false,
      error: 'Sessão expirada. Entre novamente.',
    });
    expect(mockMaybeSingle).not.toHaveBeenCalled();
    expect(mockCanReprocess).not.toHaveBeenCalled();
    expect(mockEnrich).not.toHaveBeenCalled();
  });

  it('oportunidade fora do escopo de leitura (RLS): colapsa em "não encontrada"', async () => {
    mockGetCurrentProfile.mockResolvedValue(profile('platform_admin', PSW_TENANT));
    mockMaybeSingle.mockResolvedValueOnce({ data: null });

    expect(await run()).toEqual({
      ok: false,
      error: 'Oportunidade não encontrada ou fora do seu escopo de acesso.',
    });
    // Nem chega a perguntar quem pode — não há tenant-alvo para perguntar.
    expect(mockCanReprocess).not.toHaveBeenCalled();
    expect(mockEnrich).not.toHaveBeenCalled();
  });
});

describe('reprocessOpportunityEnrichment — comportamento da execução', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanReprocess.mockResolvedValue(true);
    mockGetCurrentProfile.mockResolvedValue(profile('platform_admin', PSW_TENANT));
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
