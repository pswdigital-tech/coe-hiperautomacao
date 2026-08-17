// =============================================================================
// Public form RPC hardening — integration tests (Bloco D)
// =============================================================================
// Cobre HARD-D-03 (array > 20 items rejeitado), HARD-D-04 (jsonb > 8KB rejeitado
// + length caps), HARD-D-06 (log row criada com status/ip_hash/user_agent), e
// HARD-D-07 (ip_hash sempre SHA-256, nunca raw IP).
//
// INTEGRATION test: bate em Postgres via service role. Exige `.env.test`
// apontando para projeto Supabase Cloud de teste + migration 0007 aplicada.
// Sem `.env.test`, suite entra em skip mode (Vitest reporta skipped, não fail).
//
// Padrão `describe.skipIf` + lazy-init `serviceRoleClient` em beforeAll —
// idêntico ao usado em atomicity.test.ts (Plan 02) e tenant-isolation.test.ts
// (Plan 04).
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceRoleClient } from '../setup/supabase-test-client';
import { seedTestTenants } from '../setup/seed-test-tenants';

const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

// `public_form_submissions` foi criada em 0007. `lib/database.types.ts` ainda
// não conhece a tabela (gen:types depende do schema do Cloud ser atualizado).
// Escape hatch idêntico ao usado para `tenant_sequences` em atomicity.test.ts.
type UntypedTable = {
  delete: () => {
    eq: (col: string, val: unknown) => Promise<{ error: unknown }>;
    like: (col: string, pattern: string) => Promise<{ error: unknown }>;
  };
  select: (cols: string) => {
    eq: (col: string, val: unknown) => {
      single: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
    };
  };
};
function publicSubmissionsTable(
  client: ReturnType<typeof serviceRoleClient>,
): UntypedTable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).from('public_form_submissions') as UntypedTable;
}

// Mesmo escape hatch para as RPCs novas (log_public_form_attempt + update).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRpc = (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
function rpcUntyped(client: ReturnType<typeof serviceRoleClient>): AnyRpc {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client.rpc as unknown as AnyRpc).bind(client) as AnyRpc;
}

describe.skipIf(!HAS_DB)('Public form RPC hardening (Bloco D)', () => {
  type SbClient = ReturnType<typeof serviceRoleClient>;
  let sb: SbClient;
  const TEST_SLUG = 'fgcoop-test';
  // SHA-256 hex tem 64 chars — usar valor determinístico para cleanup.
  const TEST_IP_HASH = 'a'.repeat(64);

  beforeAll(async () => {
    sb = serviceRoleClient();
    await seedTestTenants();
  });

  afterAll(async () => {
    // Cleanup: remove oportunidades de teste e log rows criadas pelos specs.
    await sb
      .from('opportunities')
      .delete()
      .eq('source', 'formulario')
      .like('solicitante', 'rpc-test-%');
    await publicSubmissionsTable(sb).delete().eq('ip_hash', TEST_IP_HASH);
  });

  it('HARD-D-03: rejeita escopo_automacao com 21+ itens', async () => {
    const rpc = rpcUntyped(sb);
    const { error } = await rpc('create_public_opportunity', {
      p_tenant_slug: TEST_SLUG,
      p_solicitante: 'rpc-test-arr',
      p_email: 'rpc@test.local',
      p_area: 'TI',
      p_subarea: '',
      p_processo: 'attack via array',
      p_frequencia: '',
      p_volume_medio: '',
      p_tempo_execucao: '',
      p_num_pessoas: '',
      p_ferramenta: '',
      p_escopo_automacao: Array(25).fill('x'),
      p_beneficios_esperados: [],
      p_esforco: 'medio',
      p_complexidade: 'medio',
      p_tempo: 'mensal',
      p_objetivo: 3,
      p_formulario_extras: null,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/escopo_automacao excede 20/);
  });

  it('HARD-D-03b: rejeita item de escopo > 200 chars', async () => {
    const rpc = rpcUntyped(sb);
    const { error } = await rpc('create_public_opportunity', {
      p_tenant_slug: TEST_SLUG,
      p_solicitante: 'rpc-test-item',
      p_email: 'rpc@test.local',
      p_area: 'TI',
      p_subarea: '',
      p_processo: 'attack via item',
      p_frequencia: '',
      p_volume_medio: '',
      p_tempo_execucao: '',
      p_num_pessoas: '',
      p_ferramenta: '',
      p_escopo_automacao: ['x'.repeat(201)],
      p_beneficios_esperados: [],
      p_esforco: 'medio',
      p_complexidade: 'medio',
      p_tempo: 'mensal',
      p_objetivo: 3,
      p_formulario_extras: null,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/item de escopo/);
  });

  it('HARD-D-04: rejeita formulario_extras > 8KB', async () => {
    const rpc = rpcUntyped(sb);
    const big = { blob: 'x'.repeat(9000) }; // > 8192 chars serializado
    const { error } = await rpc('create_public_opportunity', {
      p_tenant_slug: TEST_SLUG,
      p_solicitante: 'rpc-test-json',
      p_email: 'rpc@test.local',
      p_area: 'TI',
      p_subarea: '',
      p_processo: 'attack via jsonb',
      p_frequencia: '',
      p_volume_medio: '',
      p_tempo_execucao: '',
      p_num_pessoas: '',
      p_ferramenta: '',
      p_escopo_automacao: [],
      p_beneficios_esperados: [],
      p_esforco: 'medio',
      p_complexidade: 'medio',
      p_tempo: 'mensal',
      p_objetivo: 3,
      p_formulario_extras: big,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/8KB/);
  });

  it('HARD-D-04b: rejeita processo > 2000 chars', async () => {
    const rpc = rpcUntyped(sb);
    const { error } = await rpc('create_public_opportunity', {
      p_tenant_slug: TEST_SLUG,
      p_solicitante: 'rpc-test-procbig',
      p_email: 'rpc@test.local',
      p_area: 'TI',
      p_subarea: '',
      p_processo: 'x'.repeat(2001),
      p_frequencia: '',
      p_volume_medio: '',
      p_tempo_execucao: '',
      p_num_pessoas: '',
      p_ferramenta: '',
      p_escopo_automacao: [],
      p_beneficios_esperados: [],
      p_esforco: 'medio',
      p_complexidade: 'medio',
      p_tempo: 'mensal',
      p_objetivo: 3,
      p_formulario_extras: null,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/processo excede 2000/);
  });

  it('HARD-D-06+07: log_public_form_attempt cria row com ip_hash; update muda status', async () => {
    const rpc = rpcUntyped(sb);

    // 1. log pending — RPC retorna log_id (uuid)
    const { data: logIdRaw, error: logErr } = await rpc('log_public_form_attempt', {
      p_slug: TEST_SLUG,
      p_ip_hash: TEST_IP_HASH,
      p_user_agent: 'rpc-test-ua',
    });
    expect(logErr).toBeNull();
    const logId = logIdRaw as unknown as string;
    expect(typeof logId).toBe('string');
    expect(logId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    // 2. confirma row pendente com ip_hash exato (HARD-D-07 — hash, não IP raw)
    const tbl = publicSubmissionsTable(sb);
    const { data: row } = await tbl
      .select('id, status, ip_hash, slug, user_agent')
      .eq('id', logId)
      .single();
    expect(row?.status).toBe('pending');
    expect(row?.ip_hash).toBe(TEST_IP_HASH);
    expect(row?.slug).toBe(TEST_SLUG);
    expect(row?.user_agent).toBe('rpc-test-ua');

    // 3. update para success
    const { error: updErr } = await rpc('update_public_form_attempt', {
      p_log_id: logId,
      p_status: 'success',
      p_error: null,
    });
    expect(updErr).toBeNull();

    const { data: updated } = await tbl.select('status').eq('id', logId).single();
    expect(updated?.status).toBe('success');
  });

  it('HARD-D-06b: update rejeita status fora do enum', async () => {
    const rpc = rpcUntyped(sb);
    const { data: logIdRaw } = await rpc('log_public_form_attempt', {
      p_slug: TEST_SLUG,
      p_ip_hash: TEST_IP_HASH,
      p_user_agent: 'rpc-test-bad-status',
    });
    const logId = logIdRaw as unknown as string;

    const { error } = await rpc('update_public_form_attempt', {
      p_log_id: logId,
      p_status: 'arbitrary-attacker-value',
      p_error: null,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/status inválido/);
  });

  it('insere via RPC com payload válido e dentro dos limits', async () => {
    const rpc = rpcUntyped(sb);
    const { data, error } = await rpc('create_public_opportunity', {
      p_tenant_slug: TEST_SLUG,
      p_solicitante: 'rpc-test-happy',
      p_email: 'rpc@test.local',
      p_area: 'TI',
      p_subarea: '',
      p_processo: 'happy path',
      p_frequencia: '',
      p_volume_medio: '',
      p_tempo_execucao: '',
      p_num_pessoas: '',
      p_ferramenta: '',
      p_escopo_automacao: ['item1', 'item2'],
      p_beneficios_esperados: ['benefit1'],
      p_esforco: 'medio',
      p_complexidade: 'medio',
      p_tempo: 'mensal',
      p_objetivo: 3,
      p_formulario_extras: { tipo_processo: 'Backoffice' },
    });
    expect(error).toBeNull();
    expect(typeof data).toBe('string');
  });
});
