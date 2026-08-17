// =============================================================================
// assignee-actions-tenant-scope.test.ts — gate de atribuição alinhado com a
// RLS (Phase 18, Plan 08, GRANT-04/GRANT-09)
// =============================================================================
// Cobre os 6 casos de <behavior> da Task 2: `setOpportunityAssignees()` passa
// a aceitar super-admin OU o par pessoa × empresa (`isTenantAdminOf`) contra o
// tenant da OPORTUNIDADE-ALVO, em vez do antigo gate por papel isolado
// (`tenant_admin` | `platform_admin`). As policies de atribuição (0047) já
// usam `is_tenant_admin_of()` como fonte única — o banco JÁ permitia que um
// staff-admin de A atribuísse dentro de A; esta suíte prova que a Server
// Action concorda (T-18-72).
//
// REGRA INEGOCIÁVEL herdada de `psw-staff-isolation.test.ts:26-29`: nenhuma
// afirmação de sucesso de escrita conclui por `error === null`. Toda
// persistência é confirmada por RELEITURA via `serviceRoleClient()`.
//
// Skip behavior: `describe.skipIf(!HAS_DB)` — `.env.test` NÃO existe neste
// ambiente (`prova-por-sql-no-handoff`, decisão vinculante da fase, Plan
// 18-01). Nenhum resultado aqui é lido como "verde" até um ambiente de teste
// dedicado existir.
//
// NUANCE TÉCNICA: `setOpportunityAssignees()` chama `createClient()` (cookies
// via `next/headers`, indisponível fora de uma requisição Next real) —
// mockado para delegar a um client REAL autenticado (`authedClient`), mesma
// técnica de `tests/security/admin-actions-tenant-scope.test.ts`. Não precisa
// mockar `next/headers`/`resolveEmpresaSlug`: o tenant-alvo desta ação vem da
// OPORTUNIDADE, nunca de um seletor de empresa.
//
// Arquivo NOVO — não editar `tests/security/psw-staff-isolation.test.ts`.
// Prefixo de UUID PRÓPRIO (`dddd0000-…`) para as oportunidades desta suíte —
// não colide com `bbbb0000-…` (psw-staff-admin-grant) nem `cccc0000-…`
// (tenant de controle daquela suíte).
// =============================================================================
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { serviceRoleClient } from '../setup/supabase-test-client';
import {
  FGCOOP_TEST_ID,
  ACME_TEST_ID,
  FGCOOP_TEST_EMAIL,
  PSW_STAFF_TEST_EMAIL,
  TEST_PASSWORD,
  seedTestTenants,
} from '../setup/seed-test-tenants';

const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

// Mesmo e-mail de platform_admin de teste usado em outras suítes da fase
// (admin-actions-tenant-scope, psw-staff-admin-grant) — cria (idempotente) se
// ainda não existir. Papel diferente do staff PSW, só pra cobrir "super-admin
// em qualquer empresa" do <behavior>.
const PLATFORM_ADMIN_TEST_EMAIL = 'platform-admin@test.local';

const OPP_A = 'dddd0000-0000-0000-0000-000000000001'; // FGCoop (A)
const OPP_B = 'dddd0000-0000-0000-0000-000000000002'; // Acme (B)

const WRITE_SCOPE_DENIED_MESSAGE =
  'Oportunidade não encontrada ou fora do seu escopo de acesso.';

// Estado mutável de "quem está logado" — o mock de `@/lib/supabase/server`
// lê estas variáveis no MOMENTO da chamada (nunca capturadas antes).
let currentEmail = '';

function loginAs(email: string) {
  currentEmail = email;
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const { authedClient } = await import('../setup/supabase-test-client');
    return (await authedClient(currentEmail, TEST_PASSWORD)).client;
  },
}));

describe.skipIf(!HAS_DB)(
  'assignee-actions.ts — gate de atribuição concorda com a RLS (0047)',
  () => {
    let sb: ReturnType<typeof serviceRoleClient>;
    let fgcoopUserId: string;
    let pswStaffUserId: string;
    let platformAdminUserId: string;
    // Import dinâmico (mesmo padrão das outras suítes desta fase) — os
    // `vi.mock(...)` acima já estão em vigor quando este `beforeAll` roda.
    let setOpportunityAssignees: typeof import('@/lib/opportunities/assignee-actions').setOpportunityAssignees;

    beforeAll(async () => {
      sb = serviceRoleClient();
      const seed = await seedTestTenants();
      fgcoopUserId = seed.fgcoopUserId;
      pswStaffUserId = seed.pswStaffUserId;

      await sb.from('opportunity_assignees').delete().in('opportunity_id', [OPP_A, OPP_B]);
      await sb.from('opportunities').delete().in('id', [OPP_A, OPP_B]);

      const { error: errA } = await sb.from('opportunities').insert({
        id: OPP_A,
        tenant_id: FGCOOP_TEST_ID,
        source: 'persona',
        solicitante: 'assignee-scope-test-A',
        area: 'TI',
        processo: 'assignee scope A',
        esforco: 'medio',
        complexidade: 'medio',
        tempo: 'mensal',
        objetivo: 3,
      });
      if (errA) throw new Error(`setup falhou (opp A): ${errA.message}`);

      const { error: errB } = await sb.from('opportunities').insert({
        id: OPP_B,
        tenant_id: ACME_TEST_ID,
        source: 'persona',
        solicitante: 'assignee-scope-test-B',
        area: 'TI',
        processo: 'assignee scope B',
        esforco: 'medio',
        complexidade: 'medio',
        tempo: 'mensal',
        objetivo: 3,
      });
      if (errB) throw new Error(`setup falhou (opp B): ${errB.message}`);

      // tenant_admin de A — promoção LOCAL desta suíte (não depende de nenhum
      // outro arquivo deixar o profile promovido); revertida no afterAll.
      const { error: promoteErr } = await sb
        .from('profiles')
        .update({ role: 'tenant_admin' })
        .eq('id', fgcoopUserId);
      if (promoteErr) throw new Error(`promote tenant_admin falhou: ${promoteErr.message}`);

      const { data: list } = await sb.auth.admin.listUsers();
      const existing = list?.users.find((u) => u.email === PLATFORM_ADMIN_TEST_EMAIL);
      if (existing) {
        platformAdminUserId = existing.id;
      } else {
        const { data, error } = await sb.auth.admin.createUser({
          email: PLATFORM_ADMIN_TEST_EMAIL,
          password: TEST_PASSWORD,
          email_confirm: true,
          app_metadata: { tenant_id: seed.pswTenantId },
          user_metadata: { full_name: 'Platform Admin Test', tenant_id: seed.pswTenantId },
        });
        if (error || !data.user) {
          throw new Error(`createUser falhou (platform admin): ${error?.message}`);
        }
        platformAdminUserId = data.user.id;
      }
      await sb.from('profiles').update({ role: 'platform_admin' }).eq('id', platformAdminUserId);

      await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);

      const actions = await import('@/lib/opportunities/assignee-actions');
      setOpportunityAssignees = actions.setOpportunityAssignees;
    });

    afterEach(async () => {
      await sb.from('opportunity_assignees').delete().in('opportunity_id', [OPP_A, OPP_B]);
      await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);
    });

    afterAll(async () => {
      await sb.from('profiles').update({ role: 'member' }).eq('id', fgcoopUserId);
      await sb.from('opportunity_assignees').delete().in('opportunity_id', [OPP_A, OPP_B]);
      await sb.from('opportunities').delete().in('id', [OPP_A, OPP_B]);
      await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);
    });

    it('super-admin atribui em qualquer empresa, exatamente como antes', async () => {
      loginAs(PLATFORM_ADMIN_TEST_EMAIL);
      const result = await setOpportunityAssignees(OPP_A, [fgcoopUserId]);
      expect(result).toEqual({ ok: true });

      const { data } = await sb
        .from('opportunity_assignees')
        .select('profile_id')
        .eq('opportunity_id', OPP_A);
      expect((data ?? []).map((r) => r.profile_id)).toContain(fgcoopUserId);
    });

    it('tenant_admin de cliente atribui dentro da própria empresa, exatamente como antes', async () => {
      loginAs(FGCOOP_TEST_EMAIL);
      const result = await setOpportunityAssignees(OPP_A, [fgcoopUserId]);
      expect(result).toEqual({ ok: true });

      const { data } = await sb
        .from('opportunity_assignees')
        .select('profile_id')
        .eq('opportunity_id', OPP_A);
      expect((data ?? []).map((r) => r.profile_id)).toContain(fgcoopUserId);
    });

    it('staff-admin de A atribui numa oportunidade de A — persistência confirmada por releitura via service-role', async () => {
      await sb.from('psw_tenant_admins').insert({
        profile_id: pswStaffUserId,
        tenant_id: FGCOOP_TEST_ID,
        granted_by: pswStaffUserId,
      });
      loginAs(PSW_STAFF_TEST_EMAIL);

      const result = await setOpportunityAssignees(OPP_A, [pswStaffUserId]);
      expect(result).toEqual({ ok: true });

      const { data } = await sb
        .from('opportunity_assignees')
        .select('profile_id')
        .eq('opportunity_id', OPP_A);
      expect((data ?? []).map((r) => r.profile_id)).toContain(pswStaffUserId);
    });

    it('staff-admin de A NÃO atribui numa oportunidade de B — mensagem única de escopo, zero linhas criadas', async () => {
      await sb.from('psw_tenant_admins').insert({
        profile_id: pswStaffUserId,
        tenant_id: FGCOOP_TEST_ID,
        granted_by: pswStaffUserId,
      });
      loginAs(PSW_STAFF_TEST_EMAIL);

      const result = await setOpportunityAssignees(OPP_B, [pswStaffUserId]);
      expect(result).toEqual({ ok: false, error: WRITE_SCOPE_DENIED_MESSAGE });

      const { data } = await sb
        .from('opportunity_assignees')
        .select('profile_id')
        .eq('opportunity_id', OPP_B);
      expect(data ?? []).toHaveLength(0);
    });

    it('psw_staff SEM concessão continua sem atribuir em lugar nenhum, inclusive nas oportunidades atribuídas a ele', async () => {
      // Atribuído nominalmente a A (Phase 17) mas SEM nenhuma concessão de
      // admin — atribuição individual dá acesso de LEITURA, nunca de escrita
      // de atribuição (D-F: as duas origens de acesso são independentes).
      await sb.from('opportunity_assignees').insert({
        opportunity_id: OPP_A,
        profile_id: pswStaffUserId,
        tenant_id: FGCOOP_TEST_ID,
        created_by: fgcoopUserId,
      });
      loginAs(PSW_STAFF_TEST_EMAIL);

      const result = await setOpportunityAssignees(OPP_A, [pswStaffUserId, fgcoopUserId]);
      expect(result).toEqual({ ok: false, error: WRITE_SCOPE_DENIED_MESSAGE });

      const { data } = await sb
        .from('opportunity_assignees')
        .select('profile_id')
        .eq('opportunity_id', OPP_A);
      expect((data ?? []).map((r) => r.profile_id)).toEqual([pswStaffUserId]);
    });

    it('member e viewer continuam sem atribuir', async () => {
      loginAs(FGCOOP_TEST_EMAIL);

      await sb.from('profiles').update({ role: 'member' }).eq('id', fgcoopUserId);
      let result = await setOpportunityAssignees(OPP_A, [fgcoopUserId]);
      expect(result).toEqual({ ok: false, error: WRITE_SCOPE_DENIED_MESSAGE });

      await sb.from('profiles').update({ role: 'viewer' }).eq('id', fgcoopUserId);
      result = await setOpportunityAssignees(OPP_A, [fgcoopUserId]);
      expect(result).toEqual({ ok: false, error: WRITE_SCOPE_DENIED_MESSAGE });

      const { data } = await sb
        .from('opportunity_assignees')
        .select('profile_id')
        .eq('opportunity_id', OPP_A);
      expect(data ?? []).toHaveLength(0);

      // Restaura tenant_admin — não vazar estado pro próximo teste do arquivo.
      await sb.from('profiles').update({ role: 'tenant_admin' }).eq('id', fgcoopUserId);
    });
  }
);
