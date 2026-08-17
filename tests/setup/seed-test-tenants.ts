import { serviceRoleClient } from './supabase-test-client';

// UUIDs determinísticos para teste — facilita debug e cleanup
export const FGCOOP_TEST_ID = '11111111-1111-1111-1111-111111111111';
export const ACME_TEST_ID   = '22222222-2222-2222-2222-222222222222';
// Tenant DA PSW (a prestadora), não mais um cliente — Phase 17. O profile
// deste tenant é o único do projeto cujo acesso a oportunidades não vem do
// próprio tenant, e sim de `opportunity_assignees` (multi-tenant por
// atribuição). Ver docs/PROJETO.md §1 — esta é a exceção autorizada à regra.
export const PSW_TEST_ID     = '33333333-3333-3333-3333-333333333333';

export const FGCOOP_TEST_EMAIL = 'fgcoop-user@test.local';
export const ACME_TEST_EMAIL   = 'acme-user@test.local';
// Usuário de teste do staff PSW, promovido a `psw_staff` logo após o seed.
export const PSW_STAFF_TEST_EMAIL = 'psw-staff@test.local';
export const TEST_PASSWORD     = 'test-password-123';

type SeedResult = {
  fgcoopTenantId: string;
  acmeTenantId: string;
  fgcoopUserId: string;
  acmeUserId: string;
  pswTenantId: string;
  pswStaffUserId: string;
};

/** Idempotente — seguro para chamar antes de cada suite. */
export async function seedTestTenants(): Promise<SeedResult> {
  const sb = serviceRoleClient();

  // 1. Tenants (upsert por id — 0002 já cria fgcoop, mas usamos slugs '-test' separados)
  const { error: tenantsErr } = await sb.from('tenants').upsert(
    [
      { id: FGCOOP_TEST_ID, slug: 'fgcoop-test', name: 'FGCoop Test', status: 'active' },
      { id: ACME_TEST_ID,   slug: 'acme-test',   name: 'Acme Test',   status: 'active' },
      { id: PSW_TEST_ID,    slug: 'psw-test',    name: 'PSW Test',    status: 'active' },
    ],
    { onConflict: 'id' },
  );
  if (tenantsErr) throw new Error(`upsert tenants falhou: ${tenantsErr.message}`);

  // 2. Users via Admin API — handle_new_user trigger lê app_metadata.tenant_id
  //    e cria o profile automaticamente.
  async function ensureUser(email: string, tenantId: string): Promise<string> {
    // Procura primeiro (idempotência)
    const { data: list } = await sb.auth.admin.listUsers();
    const existing = list?.users.find((u) => u.email === email);
    if (existing) return existing.id;

    const { data, error } = await sb.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      app_metadata: { tenant_id: tenantId },
      user_metadata: { full_name: `Test ${email}`, tenant_id: tenantId },
    });
    if (error || !data.user) {
      throw new Error(`createUser falhou para ${email}: ${error?.message}`);
    }
    return data.user.id;
  }

  const fgcoopUserId = await ensureUser(FGCOOP_TEST_EMAIL, FGCOOP_TEST_ID);
  const acmeUserId   = await ensureUser(ACME_TEST_EMAIL,   ACME_TEST_ID);
  const pswStaffUserId = await ensureUser(PSW_STAFF_TEST_EMAIL, PSW_TEST_ID);

  // 3. Promove o usuário da PSW ao papel novo. `ensureUser` só cria o profile
  //    (via trigger `handle_new_user`) com o role default — a promoção é um
  //    passo à parte, sempre por service-role, nunca via client autenticado.
  //    Requer a migration 0039 aplicada (valor `psw_staff` no enum
  //    `tenant_role`); se ainda não estiver, o Postgres rejeita o UPDATE com
  //    um erro de enum inválido que não deixa isso óbvio — daí a mensagem
  //    explícita abaixo.
  const { error: promoteErr } = await sb
    .from('profiles')
    .update({ role: 'psw_staff' })
    .eq('id', pswStaffUserId);
  if (promoteErr) {
    throw new Error(
      `promote psw_staff falhou (migration 0039 aplicada?): ${promoteErr.message}`,
    );
  }

  return {
    fgcoopTenantId: FGCOOP_TEST_ID,
    acmeTenantId: ACME_TEST_ID,
    fgcoopUserId,
    acmeUserId,
    pswTenantId: PSW_TEST_ID,
    pswStaffUserId,
  };
}

/** Para uso opcional em afterAll global — não obrigatório em CI. */
export async function cleanupTestTenants(): Promise<void> {
  const sb = serviceRoleClient();
  // Deleta oportunidades dos tenants de teste (cascade lida com phases)
  await sb.from('opportunities').delete().in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID, PSW_TEST_ID]);
  // NÃO deletar auth.users automaticamente; deixar persistir para idempotência da próxima run.
}
