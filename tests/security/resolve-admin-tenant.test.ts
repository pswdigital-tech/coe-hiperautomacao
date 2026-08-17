// =============================================================================
// isTenantAdminOf / resolveAdminTenantId — escopo de escrita de admin
// (Phase 18, Plan 06, GRANT-05)
// =============================================================================
// Os RAMOS QUE NÃO TOCAM O BANCO (profile nulo, `tenant_admin`, `member`/
// `viewer`/`platform_admin`, `resolveAdminTenantId` de papel de cliente e o
// caso "sem empresa selecionada" para `psw_staff`) rodam SEMPRE, sem depender
// de `.env.test` — são exatamente os casos que provam D-J (byte-equivalência
// com `isTenantAdmin()` de hoje, zero regressão de latência) e D-K (nunca
// adivinhar o tenant-alvo).
//
// Os RAMOS QUE CONSULTAM `psw_tenant_admins` (psw_staff com/sem concessão)
// seguem o mesmo padrão `describe.skipIf(!HAS_DB)` já usado em
// `tests/security/psw-staff-admin-grant.test.ts`: `.env.test` NÃO existe
// neste ambiente (decisão vinculante da fase, modo `prova-por-sql-no-handoff`
// — Plan 18-01), então esta suíte sai em SKIP para esses casos. Isso NÃO é
// lido como "verde" — fica registrado como SKIP até um ambiente de teste
// dedicado existir.
//
// NUANCE TÉCNICA: `isTenantAdminOf`/`resolveAdminTenantId` chamam
// `createClient()` de `@/lib/supabase/server`, que por sua vez chama
// `cookies()` de `next/headers` — indisponível fora de uma requisição Next
// real (lança fora de um Server Component/Action). Para os ramos que
// consultam o banco, este arquivo troca esse `createClient()` por um client
// REAL autenticado como o `psw_staff` de teste, via o mesmo mecanismo de
// `authedClient()` usado em todo `tests/security/` (sign-in direto com anon
// key, em vez de cookie de Server Component) — ainda é prova de RLS real
// (o JWT da sessão é o que os predicados de RLS enxergam), só a via de
// obtenção da sessão muda.
//
// REGRA INEGOCIÁVEL herdada de `psw-staff-isolation.test.ts:26-29`: nenhuma
// suíte pode concluir sucesso de escrita só por `error === null` — aqui não
// há escrita própria (são leituras), mas a concessão usada como fixture é
// sempre revogada num `afterAll` incondicional, para não vazar estado para
// `psw-staff-isolation.test.ts` (que afirma no nível de topo que o staff de
// teste enxerga exatamente `[X, Z]`).
// =============================================================================
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { serviceRoleClient } from '../setup/supabase-test-client';
import {
  PSW_STAFF_TEST_EMAIL,
  FGCOOP_TEST_ID,
  seedTestTenants,
} from '../setup/seed-test-tenants';

const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

// Troca `createClient()` por um client autenticado real como o psw_staff de
// teste — só é efetivamente chamado pelos ramos que consultam o banco
// (`isTenantAdminOf`/`resolveAdminTenantId` para role='psw_staff'); os ramos
// sem banco nunca invocam `createClient()`, então o mock é inerte para eles.
// Import dinâmico dentro do factory evita o problema de hoisting do
// `vi.mock` referenciar bindings de módulo declaradas fora dele.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const { authedClient } = await import('../setup/supabase-test-client');
    const { PSW_STAFF_TEST_EMAIL: email, TEST_PASSWORD: password } = await import(
      '../setup/seed-test-tenants'
    );
    return (await authedClient(email, password)).client;
  },
}));

import {
  isTenantAdminOf,
  resolveAdminTenantId,
  ADMIN_SCOPE_DENIED_MESSAGE,
  type CurrentProfile,
} from '@/lib/security/role';

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

const OUTRO_TENANT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// -----------------------------------------------------------------------------
// Ramos SEM ida ao banco — rodam sempre
// -----------------------------------------------------------------------------
describe('isTenantAdminOf — ramos SEM ida ao banco (D-J)', () => {
  it('profile nulo → false, sem consulta', async () => {
    expect(await isTenantAdminOf(null, FGCOOP_TEST_ID)).toBe(false);
  });

  it('tenant_admin do próprio tenant → true, sem ida ao banco', async () => {
    const profile = profileFixture('tenant_admin', FGCOOP_TEST_ID);
    expect(await isTenantAdminOf(profile, FGCOOP_TEST_ID)).toBe(true);
  });

  it('tenant_admin de OUTRO tenant → false, sem ida ao banco', async () => {
    const profile = profileFixture('tenant_admin', FGCOOP_TEST_ID);
    expect(await isTenantAdminOf(profile, OUTRO_TENANT_ID)).toBe(false);
  });

  it.each(['member', 'viewer', 'platform_admin'] as const)(
    'role=%s → false (a concessão não existe para este papel; platform_admin tem o próprio caminho)',
    async (role) => {
      const profile = profileFixture(role, FGCOOP_TEST_ID);
      expect(await isTenantAdminOf(profile, FGCOOP_TEST_ID)).toBe(false);
    }
  );
});

describe('resolveAdminTenantId — ramos SEM ida ao banco', () => {
  it.each(['member', 'viewer', 'tenant_admin', 'platform_admin'] as const)(
    'role=%s devolve profile.tenantId sem consulta, IGNORANDO o tenant pedido',
    async (role) => {
      const profile = profileFixture(role, FGCOOP_TEST_ID);
      expect(await resolveAdminTenantId(profile, OUTRO_TENANT_ID)).toBe(FGCOOP_TEST_ID);
    }
  );

  it('psw_staff SEM requestedTenantId → null, sem consulta (sem empresa selecionada não existe alvo)', async () => {
    const profile = profileFixture('psw_staff', 'tenant-da-psw-fixture');
    expect(await resolveAdminTenantId(profile, undefined)).toBeNull();
  });
});

describe('ADMIN_SCOPE_DENIED_MESSAGE', () => {
  it('é uma string única em toda a superfície de admin — não distingue empresa inexistente de fora de escopo', () => {
    expect(ADMIN_SCOPE_DENIED_MESSAGE).toBe(
      'Empresa não encontrada ou fora do seu escopo de administração.'
    );
  });
});

// -----------------------------------------------------------------------------
// Ramos que CONSULTAM psw_tenant_admins — describe.skipIf(!HAS_DB)
// -----------------------------------------------------------------------------
describe.skipIf(!HAS_DB)(
  'isTenantAdminOf / resolveAdminTenantId — ramos que consultam psw_tenant_admins',
  () => {
    let sb: ReturnType<typeof serviceRoleClient>;
    let pswStaffUserId: string;
    let pswTenantId: string;
    let staffProfile: CurrentProfile;

    beforeAll(async () => {
      sb = serviceRoleClient();
      const seed = await seedTestTenants();
      pswStaffUserId = seed.pswStaffUserId;
      pswTenantId = seed.pswTenantId;
      staffProfile = {
        id: pswStaffUserId,
        email: PSW_STAFF_TEST_EMAIL,
        fullName: null,
        role: 'psw_staff',
        tenantId: pswTenantId,
        tenantName: null,
        tenantSlug: null,
      };
      // Garante baseline sem concessão antes do caso "sem concessão".
      await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);
    });

    afterAll(async () => {
      // Incondicional — não deixa concessão vazar para
      // psw-staff-isolation.test.ts (mesma disciplina de
      // psw-staff-admin-grant.test.ts).
      await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);
    });

    it('psw_staff SEM concessão em FGCoop → isTenantAdminOf false, resolveAdminTenantId null', async () => {
      expect(await isTenantAdminOf(staffProfile, FGCOOP_TEST_ID)).toBe(false);
      expect(await resolveAdminTenantId(staffProfile, FGCOOP_TEST_ID)).toBeNull();
    });

    it('psw_staff COM concessão em FGCoop → isTenantAdminOf true, resolveAdminTenantId devolve o id; revogar volta ao baseline', async () => {
      const { error: insertError } = await sb.from('psw_tenant_admins').insert({
        profile_id: pswStaffUserId,
        tenant_id: FGCOOP_TEST_ID,
        granted_by: pswStaffUserId,
      });
      expect(insertError).toBeNull();

      expect(await isTenantAdminOf(staffProfile, FGCOOP_TEST_ID)).toBe(true);
      expect(await resolveAdminTenantId(staffProfile, FGCOOP_TEST_ID)).toBe(FGCOOP_TEST_ID);

      await sb
        .from('psw_tenant_admins')
        .delete()
        .eq('profile_id', pswStaffUserId)
        .eq('tenant_id', FGCOOP_TEST_ID);

      expect(await isTenantAdminOf(staffProfile, FGCOOP_TEST_ID)).toBe(false);
      expect(await resolveAdminTenantId(staffProfile, FGCOOP_TEST_ID)).toBeNull();
    });
  }
);
