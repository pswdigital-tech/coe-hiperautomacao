// =============================================================================
// platform_admin — RLS cross-tenant aditiva (migrations 0020/0021/0022)
// =============================================================================
// Ported de origin/feat/v0.3-produtizacao (df6a97e/10f3ede), que nunca teve
// testes próprios — estes specs são novos, escritos ao portar a feature pro
// main. Espelham a forma condensada de v03-tables-isolation.test.ts: RLS
// exercitada via JWT do usuário (nunca service-role, exceto setup/teardown).
//
// Cobre exatamente as garantias documentadas nas migrations:
//   - platform_admin lê opportunities/tenants cross-tenant (SELECT aditivo).
//   - platform_admin NÃO escreve cross-tenant (escopo deliberadamente
//     limitado a SELECT — policies de insert/update seguem exigindo
//     tenant_id = current_tenant_id()).
//   - Membro comum não vê nem gerencia `invited_emails` (só platform_admin).
//   - Membro comum continua isolado (sanity — não deve ter regressão).
//
// Skip behavior: pulado inteiro sem NEXT_PUBLIC_SUPABASE_URL (modo unit-only).
// Pré-requisito: migrations 0001..0022 aplicadas + seed dos dois tenants.
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceRoleClient, authedClient } from '../setup/supabase-test-client';
import { asFgcoop, asService } from '../helpers/auth-as';
import { FGCOOP_TEST_ID, ACME_TEST_ID, seedTestTenants } from '../setup/seed-test-tenants';

const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

const PLATFORM_ADMIN_TEST_EMAIL = 'platform-admin@test.local';
const TEST_PASSWORD = 'test-password-123';

const svc = () => asService();
const fgcoopClient = async () => (await asFgcoop()).client;

describe.skipIf(!HAS_DB)('platform_admin — RLS cross-tenant (0020/0021/0022)', () => {
  let sb: ReturnType<typeof serviceRoleClient>;
  let fgcoopOppId: string;
  let acmeOppId: string;
  let adminUserId: string;
  let createdInviteId: string | undefined;

  beforeAll(async () => {
    sb = serviceRoleClient();
    await seedTestTenants();
    await sb.from('opportunities').delete().in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID]);

    const mkOpp = async (tenantId: string, who: string) => {
      const { data, error } = await sb
        .from('opportunities')
        .insert({
          tenant_id: tenantId,
          source: 'persona',
          solicitante: who,
          area: 'TI',
          processo: `${who} process platform-admin-test`,
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

    // Cria (idempotente) e promove o usuário de teste a platform_admin.
    // tenant_id "de casa" é irrelevante pra um platform_admin (ele lê tudo via
    // RLS aditiva), mas handle_new_user exige um valor não-nulo.
    const { data: list } = await sb.auth.admin.listUsers();
    const existing = list?.users.find((u) => u.email === PLATFORM_ADMIN_TEST_EMAIL);
    if (existing) {
      adminUserId = existing.id;
    } else {
      const { data, error } = await sb.auth.admin.createUser({
        email: PLATFORM_ADMIN_TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
        app_metadata: { tenant_id: FGCOOP_TEST_ID },
        user_metadata: { full_name: 'Platform Admin Test', tenant_id: FGCOOP_TEST_ID },
      });
      if (error || !data.user) {
        throw new Error(`createUser falhou (platform admin): ${error?.message}`);
      }
      adminUserId = data.user.id;
    }
    const { error: promoteErr } = await sb
      .from('profiles')
      .update({ role: 'platform_admin' })
      .eq('id', adminUserId);
    if (promoteErr) throw new Error(`promote platform_admin falhou: ${promoteErr.message}`);
  });

  afterAll(async () => {
    if (!sb) return;
    await sb.from('opportunities').delete().in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID]);
    if (createdInviteId) {
      await sb.from('invited_emails').delete().eq('id', createdInviteId);
    }
  });

  const asPlatformAdmin = () => authedClient(PLATFORM_ADMIN_TEST_EMAIL, TEST_PASSWORD);

  describe('SELECT cross-tenant (aditivo)', () => {
    it('platform_admin vê opportunities de AMBOS os tenants', async () => {
      const { client } = await asPlatformAdmin();
      const { data, error } = await client
        .from('opportunities')
        .select('id')
        .in('id', [fgcoopOppId, acmeOppId]);
      expect(error).toBeNull();
      const ids = (data ?? []).map((r) => r.id);
      expect(ids).toContain(fgcoopOppId);
      expect(ids).toContain(acmeOppId);
    });

    it('platform_admin vê AMBOS os tenants de teste em `tenants`', async () => {
      const { client } = await asPlatformAdmin();
      const { data, error } = await client
        .from('tenants')
        .select('id')
        .in('id', [FGCOOP_TEST_ID, ACME_TEST_ID]);
      expect(error).toBeNull();
      const ids = (data ?? []).map((r) => r.id);
      expect(ids).toContain(FGCOOP_TEST_ID);
      expect(ids).toContain(ACME_TEST_ID);
    });

    it('sanity — membro comum (FGCoop) NÃO vê opportunity do Acme (sem regressão)', async () => {
      const client = await fgcoopClient();
      const { data, error } = await client.from('opportunities').select('id').eq('id', acmeOppId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('escrita permanece escopada por tenant (nunca cross-tenant)', () => {
    it('platform_admin NÃO consegue UPDATE em opportunity de tenant alheio', async () => {
      const { client } = await asPlatformAdmin();
      const { data, error } = await client
        .from('opportunities')
        .update({ observacao: 'tentativa de escrita cross-tenant' })
        .eq('id', acmeOppId)
        .select('id');
      // A policy de update (0001) exige tenant_id = current_tenant_id() do
      // próprio usuário — is_platform_admin() não entra nessa policy (0021 é
      // só SELECT). Sem erro explícito (RLS silencia via WHERE), mas 0 linhas.
      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: still } = await svc().from('opportunities').select('observacao').eq('id', acmeOppId).single();
      expect(still?.observacao).not.toBe('tentativa de escrita cross-tenant');
    });
  });

  describe('invited_emails — só platform_admin gerencia', () => {
    it('membro comum (FGCoop) NÃO vê nem insere convites', async () => {
      const client = await fgcoopClient();
      const { data: selectData, error: selectErr } = await client
        .from('invited_emails')
        .select('id');
      expect(selectErr).toBeNull();
      expect(selectData).toEqual([]);

      const { error: insertErr } = await client.from('invited_emails').insert({
        email: 'attacker@example.com',
        tenant_id: FGCOOP_TEST_ID,
        role: 'member',
      });
      expect(insertErr).not.toBeNull();
    });

    it('platform_admin consegue criar um convite', async () => {
      const { client } = await asPlatformAdmin();
      const { data, error } = await client
        .from('invited_emails')
        .insert({
          email: 'novo-convidado@example.com',
          tenant_id: FGCOOP_TEST_ID,
          role: 'member',
          invited_by: adminUserId,
        })
        .select('id')
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBeTruthy();
      createdInviteId = data?.id;
    });

    it('convite nunca aceita role=platform_admin (CHECK constraint, 0022)', async () => {
      const { client } = await asPlatformAdmin();
      const { error } = await client.from('invited_emails').insert({
        email: 'quero-ser-admin@example.com',
        tenant_id: FGCOOP_TEST_ID,
        // @ts-expect-error — CHECK do DB só aceita member|tenant_admin; testamos
        // exatamente a rejeição desse valor fora do union type.
        role: 'platform_admin',
      });
      expect(error).not.toBeNull();
    });
  });
});
