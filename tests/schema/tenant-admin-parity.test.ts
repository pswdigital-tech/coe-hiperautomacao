// =============================================================================
// TENANT-ADMIN-PARITY — prova de paridade cliente/servidor de
// is_tenant_admin_of() (Phase 18, Plan 06, D-J/D-O/GRANT-05)
// =============================================================================
// Mesmo espírito de tests/schema/score-parity.test.ts (o precedente do
// projeto para "a função do client e a função SQL não podem divergir"), com
// dois níveis de prova:
//
//   1) PURA (sempre roda): para os papéis cujo predicado NUNCA consulta o
//      banco (`tenant_admin`, `member`, `viewer`, `platform_admin`), o
//      resultado de `isTenantAdminOf()` (TypeScript) é comparado direto contra
//      o predicado ANTIGO hand-written (`role === 'tenant_admin' && tenantId
//      === profile.tenantId`) que `is_tenant_admin_of()` substituiu nas 11
//      policies vivas (migration `0047`) — é a mesma tabela de equivalência
//      papel-a-papel construída em `18-05-SUMMARY.md`, agora travada em teste.
//
//   2) VIVA `describe.skipIf(!HAS_DB)`: compara `isTenantAdminOf()`
//      (TypeScript) linha-a-linha com uma chamada RPC real à função SQL
//      `is_tenant_admin_of()` (migration `0045`), para os MESMOS pares
//      pessoa × empresa — `tenant_admin` do FGCoop (no próprio tenant e em
//      outro) e `psw_staff` de teste (sem e com concessão). `.env.test` NÃO
//      existe neste ambiente (modo `prova-por-sql-no-handoff` da fase), então
//      este bloco sai em SKIP — nunca lido como "verde".
//
// Ver tests/security/resolve-admin-tenant.test.ts para a nota técnica sobre
// por que `isTenantAdminOf()` precisa de `createClient()` mockado para rodar
// fora de uma requisição Next real (o mesmo mock é replicado aqui).
// =============================================================================
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { serviceRoleClient } from '../setup/supabase-test-client';
import { asFgcoop, asPswStaff } from '../helpers/auth-as';
import {
  FGCOOP_TEST_ID,
  ACME_TEST_ID,
  seedTestTenants,
} from '../setup/seed-test-tenants';

const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

// Mesmo mock de tests/security/resolve-admin-tenant.test.ts — só é
// efetivamente invocado pelo ramo `psw_staff` de `isTenantAdminOf` (o ramo
// `tenant_admin` nunca chama `createClient()`, D-J).
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const { authedClient } = await import('../setup/supabase-test-client');
    const { PSW_STAFF_TEST_EMAIL: email, TEST_PASSWORD: password } = await import(
      '../setup/seed-test-tenants'
    );
    return (await authedClient(email, password)).client;
  },
}));

import { isTenantAdminOf, type CurrentProfile } from '@/lib/security/role';

function profileFixture(
  role: CurrentProfile['role'],
  tenantId: string,
  id = 'fixture-profile-id'
): CurrentProfile {
  return {
    id,
    email: 'fixture@test.local',
    fullName: null,
    role,
    tenantId,
    tenantName: null,
    tenantSlug: null,
  };
}

/** O predicado hand-written que `is_tenant_admin_of()` substituiu nas 11 policies (0047). */
function oldTenantAdminPredicate(
  role: CurrentProfile['role'],
  tenantId: string,
  profileTenantId: string
): boolean {
  return role === 'tenant_admin' && tenantId === profileTenantId;
}

// -----------------------------------------------------------------------------
// Nível 1 — paridade PURA (sem banco): isTenantAdminOf vs predicado antigo
// -----------------------------------------------------------------------------
describe('tenant-admin-parity — pura (isTenantAdminOf vs predicado antigo hand-written)', () => {
  it.each([
    ['tenant_admin', true],
    ['member', false],
    ['viewer', false],
    ['platform_admin', false],
  ] as const)(
    'role=%s no próprio tenant: isTenantAdminOf === predicado antigo === %s',
    async (role, expected) => {
      const profile = profileFixture(role, FGCOOP_TEST_ID);
      const ts = await isTenantAdminOf(profile, FGCOOP_TEST_ID);
      expect(ts).toBe(expected);
      expect(ts).toBe(oldTenantAdminPredicate(role, FGCOOP_TEST_ID, FGCOOP_TEST_ID));
    }
  );

  it('tenant_admin de OUTRO tenant: isTenantAdminOf === predicado antigo === false', async () => {
    const profile = profileFixture('tenant_admin', FGCOOP_TEST_ID);
    const ts = await isTenantAdminOf(profile, ACME_TEST_ID);
    expect(ts).toBe(false);
    expect(ts).toBe(oldTenantAdminPredicate('tenant_admin', ACME_TEST_ID, FGCOOP_TEST_ID));
  });
});

// -----------------------------------------------------------------------------
// Nível 2 — paridade VIVA contra is_tenant_admin_of() SQL (Supabase Cloud)
// -----------------------------------------------------------------------------
describe.skipIf(!HAS_DB)(
  'tenant-admin-parity — viva (isTenantAdminOf TS vs is_tenant_admin_of() SQL)',
  () => {
    let sb: ReturnType<typeof serviceRoleClient>;
    let pswStaffUserId: string;
    let pswTenantId: string;

    beforeAll(async () => {
      sb = serviceRoleClient();
      const seed = await seedTestTenants();
      pswStaffUserId = seed.pswStaffUserId;
      pswTenantId = seed.pswTenantId;
      await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);
    });

    afterAll(async () => {
      // Incondicional — mesma disciplina de resolve-admin-tenant.test.ts:
      // não deixa concessão vazar para psw-staff-isolation.test.ts.
      await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);
    });

    it('tenant_admin do FGCoop no próprio tenant: TS === SQL === true', async () => {
      const { client, tenantId } = await asFgcoop();
      const profile = profileFixture('tenant_admin', tenantId);

      const tsResult = await isTenantAdminOf(profile, tenantId);
      const { data: sqlResult, error } = await client.rpc('is_tenant_admin_of', {
        t: tenantId,
      });

      expect(error).toBeNull();
      expect(tsResult).toBe(true);
      expect(sqlResult).toBe(tsResult);
    });

    it('tenant_admin do FGCoop tentando OUTRO tenant: TS === SQL === false', async () => {
      const { client, tenantId } = await asFgcoop();
      const profile = profileFixture('tenant_admin', tenantId);

      const tsResult = await isTenantAdminOf(profile, ACME_TEST_ID);
      const { data: sqlResult, error } = await client.rpc('is_tenant_admin_of', {
        t: ACME_TEST_ID,
      });

      expect(error).toBeNull();
      expect(tsResult).toBe(false);
      expect(sqlResult).toBe(tsResult);
    });

    it('psw_staff SEM concessão em FGCoop: TS === SQL === false', async () => {
      const { client, userId } = await asPswStaff();
      const profile = profileFixture('psw_staff', pswTenantId, userId);

      const tsResult = await isTenantAdminOf(profile, FGCOOP_TEST_ID);
      const { data: sqlResult, error } = await client.rpc('is_tenant_admin_of', {
        t: FGCOOP_TEST_ID,
      });

      expect(error).toBeNull();
      expect(tsResult).toBe(false);
      expect(sqlResult).toBe(tsResult);
    });

    it('psw_staff COM concessão em FGCoop: TS === SQL === true', async () => {
      const { client, userId } = await asPswStaff();
      const { error: insertError } = await sb.from('psw_tenant_admins').insert({
        profile_id: userId,
        tenant_id: FGCOOP_TEST_ID,
        granted_by: userId,
      });
      expect(insertError).toBeNull();

      const profile = profileFixture('psw_staff', pswTenantId, userId);
      const tsResult = await isTenantAdminOf(profile, FGCOOP_TEST_ID);
      const { data: sqlResult, error } = await client.rpc('is_tenant_admin_of', {
        t: FGCOOP_TEST_ID,
      });

      expect(error).toBeNull();
      expect(tsResult).toBe(true);
      expect(sqlResult).toBe(tsResult);
    });
  }
);
