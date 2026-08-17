// =============================================================================
// opportunity_risks — isolamento RLS cross-tenant — Phase 9 / Plan 09-03 (RISK-04 SC4)
// =============================================================================
// Prova que `opportunity_risks` (migration 0011) está isolada por tenant: tenant A
// NÃO enxerga nem altera riscos de tenant B. Espelha o padrão de
// `tenant-isolation.test.ts` (RLS exercitada via JWT do usuário, NUNCA service-role;
// service-role só em setup/teardown e nas assertions de "registro persiste").
//
// Specs:
//   1. SELECT cross-tenant → data === [] (RLS USING filtra).
//   2. UPDATE cross-tenant → 0 rows; original intacto (via service-role).
//   3. DELETE cross-tenant → 0 rows; registro persiste (via service-role).
//   4. INSERT com tenant_id forjado → error não-nulo (RLS WITH CHECK, 42501).
//   5. (sanity) SELECT do próprio risco → 1 linha (priority GENERATED = critica).
//
// `priority` é coluna GENERATED — NUNCA inserir (Postgres rejeita).
//
// Skip behavior: toda a suite é pulada quando `NEXT_PUBLIC_SUPABASE_URL` está
// vazio (modo unit-only). Para rodar: popular `.env.test` com um projeto Supabase
// Cloud DE TESTE com migrations 0001..0011 aplicadas — NUNCA produção.
//
// Pré-requisito: migrations 0001..0011 aplicadas + seed dos dois tenants
// (FGCOOP_TEST_ID, ACME_TEST_ID) via seedTestTenants.
//
// NOTA DE TIPOS: os tipos de `lib/database.types.ts` foram regenerados na Phase 10
// (Plan 10-01) e agora conhecem `opportunity_risks` + `tempo` (frequency_bucket), então
// os `any`-casts que existiam aqui (write-only mode pós-0011) foram REMOVIDOS — os
// clientes voltam a ser tipados (`SupabaseClient<Database>`), recuperando a checagem
// de tipos completa nas queries de risco.
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceRoleClient } from '../setup/supabase-test-client';
import { asFgcoop, asService } from '../helpers/auth-as';
import { FGCOOP_TEST_ID, ACME_TEST_ID, seedTestTenants } from '../setup/seed-test-tenants';

const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

const svc = () => asService();
const fgcoopClient = async () => (await asFgcoop()).client;

describe.skipIf(!HAS_DB)('opportunity_risks — RLS cross-tenant (RISK-04 SC4)', () => {
  let sb: ReturnType<typeof serviceRoleClient>;

  let fgcoopOppId: string;
  let acmeOppId: string;
  let fgcoopRiskId: string;
  let acmeRiskId: string;

  beforeAll(async () => {
    sb = serviceRoleClient();
    await seedTestTenants();

    // Baseline limpo — cascade remove opportunity_risks via FK on delete cascade.
    await sb.from('opportunities').delete().in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID]);

    // 1 oportunidade em cada tenant. tempo='mensal' (frequency_bucket válido pós-0011).
    const mkOpp = async (tenantId: string, who: string) => {
      const { data, error } = await sb
        .from('opportunities')
        .insert({
          tenant_id: tenantId,
          source: 'persona',
          solicitante: who,
          area: 'TI',
          processo: `${who} process`,
          esforco: 'medio',
          complexidade: 'medio',
          tempo: 'mensal',
          objetivo: 3,
        })
        .select('id')
        .single();
      if (error || !data) throw new Error(`setup falhou (opp ${who}): ${error?.message}`);
      return data.id as string;
    };
    fgcoopOppId = await mkOpp(FGCOOP_TEST_ID, 'FGCoop');
    acmeOppId = await mkOpp(ACME_TEST_ID, 'Acme');

    // 1 risco em cada tenant. priority é GENERATED — NÃO inserir.
    const mkRisk = async (tenantId: string, oppId: string, desc: string) => {
      const { data, error } = await sb
        .from('opportunity_risks')
        .insert({
          opportunity_id: oppId,
          tenant_id: tenantId,
          descricao: desc,
          tipo: 'risco',
          impacto: 'alto',
          probabilidade: 'provavel',
        })
        .select('id')
        .single();
      if (error || !data) throw new Error(`setup falhou (risk ${desc}): ${error?.message}`);
      return data.id as string;
    };
    fgcoopRiskId = await mkRisk(FGCOOP_TEST_ID, fgcoopOppId, 'risco do FGCoop');
    acmeRiskId = await mkRisk(ACME_TEST_ID, acmeOppId, 'risco do Acme');
  });

  afterAll(async () => {
    if (sb) {
      await sb.from('opportunities').delete().in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID]);
    }
  });

  it('1. SELECT cross-tenant: FGCoop NÃO vê risco do Acme (data === [])', async () => {
    const client = await fgcoopClient();
    const { data, error } = await client.from('opportunity_risks').select('id, descricao').eq('id', acmeRiskId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('2. UPDATE cross-tenant: FGCoop tentando alterar risco do Acme afeta 0 linhas', async () => {
    const client = await fgcoopClient();
    const { data, error } = await client
      .from('opportunity_risks')
      .update({ descricao: 'HIJACKED' })
      .eq('id', acmeRiskId)
      .select('id, descricao');
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: original, error: readErr } = await svc()
      .from('opportunity_risks')
      .select('descricao')
      .eq('id', acmeRiskId)
      .single();
    expect(readErr).toBeNull();
    expect(original?.descricao).toBe('risco do Acme');
  });

  it('3. DELETE cross-tenant: FGCoop tentando deletar risco do Acme afeta 0 linhas', async () => {
    const client = await fgcoopClient();
    const { data, error } = await client.from('opportunity_risks').delete().eq('id', acmeRiskId).select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: still, error: readErr } = await svc()
      .from('opportunity_risks')
      .select('id')
      .eq('id', acmeRiskId)
      .single();
    expect(readErr).toBeNull();
    expect(still?.id).toBe(acmeRiskId);
  });

  it('4. INSERT com tenant_id forjado: FGCoop não cria risco como Acme (RLS WITH CHECK rejeita)', async () => {
    const client = await fgcoopClient();
    const { error } = await client
      .from('opportunity_risks')
      .insert({
        opportunity_id: acmeOppId,
        tenant_id: ACME_TEST_ID, // ← forjado
        descricao: 'attacker risk',
        tipo: 'risco',
        impacto: 'alto',
        probabilidade: 'provavel',
      })
      .select('id');
    // RLS WITH CHECK em INSERT levanta erro (42501 / "row-level security").
    // Não asserir texto específico — versões do Postgres mudam a mensagem.
    expect(error).not.toBeNull();

    const { count, error: countErr } = await svc()
      .from('opportunity_risks')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ACME_TEST_ID)
      .eq('descricao', 'attacker risk');
    expect(countErr).toBeNull();
    expect(count).toBe(0);
  });

  it('5. sanity: FGCoop FAZ SELECT no seu próprio risco (1 linha)', async () => {
    const client = await fgcoopClient();
    const { data, error } = await client
      .from('opportunity_risks')
      .select('id, descricao, priority')
      .eq('id', fgcoopRiskId)
      .single();
    expect(error).toBeNull();
    expect(data?.descricao).toBe('risco do FGCoop');
    // priority GENERATED da matriz: impacto=alto × probabilidade=provavel → critica.
    expect(data?.priority).toBe('critica');
  });
});
