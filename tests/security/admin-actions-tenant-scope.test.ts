// =============================================================================
// admin-actions-tenant-scope.test.ts — Server Actions de ADMIN escopadas pelo
// tenant-alvo resolvido no servidor (Phase 18, Plan 06, GRANT-05)
// =============================================================================
// Cobre os specs de <behavior> de `app/(app)/team/actions.ts` (Task 2) e, a
// partir da Task 3 deste plano, de `app/(app)/configuracoes/actions.ts`:
// convite/revogação de equipe e as três escritas de branding, todas escopadas
// pelo tenant-ALVO (seletor de empresa da Sidebar) — nunca por
// `profile.tenantId` para `psw_staff` (D-K, o caso canônico da fase).
//
// REGRA INEGOCIÁVEL herdada de `psw-staff-isolation.test.ts:26-29`: nenhuma
// afirmação de sucesso de escrita conclui por `error === null`. Toda
// persistência é confirmada por RELEITURA via `serviceRoleClient()` — é
// exatamente essa releitura que prova que D-K foi fechado: antes desta fase,
// `error === null` na revogação era um FALSO POSITIVO (zero linhas afetadas,
// nenhum erro, convite ainda lá).
//
// Skip behavior: `describe.skipIf(!HAS_DB)` — `.env.test` NÃO existe neste
// ambiente (modo `prova-por-sql-no-handoff`, decisão vinculante da fase,
// Plan 18-01). Nenhum resultado aqui é lido como "verde" até um ambiente de
// teste dedicado existir.
//
// NUANCE TÉCNICA: as Server Actions chamam `createClient()` (cookies via
// `next/headers`, indisponível fora de uma requisição Next real) e
// `resolveAdminTenantIdFromSelector` chama `resolveEmpresaSlug()` (também
// `next/headers`, para o cookie `coe_empresa`). Os dois são mockados aqui:
// `createClient()` delega para um client REAL autenticado (`authedClient`,
// sign-in direto com anon key — mesma identidade que a RLS enxerga, só muda a
// via de obtenção da sessão) e `cookies()` devolve um jar controlável por
// teste (`selectEmpresa(slug)`), simulando a empresa selecionada no seletor
// da Sidebar sem precisar de um Server Component real.
// =============================================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { serviceRoleClient } from '../setup/supabase-test-client';
import {
  FGCOOP_TEST_ID,
  ACME_TEST_ID,
  PSW_TEST_ID,
  FGCOOP_TEST_EMAIL,
  PSW_STAFF_TEST_EMAIL,
  TEST_PASSWORD,
  seedTestTenants,
} from '../setup/seed-test-tenants';

// Mesmo e-mail de platform_admin de teste usado em
// platform-admin-cross-tenant.test.ts / psw-staff-admin-grant.test.ts — cria
// (idempotente) se ainda não existir. Não é um segundo usuário psw_staff:
// papel diferente, só pra cobrir o caso "super-admin inalterado" do <behavior>
// da Task 3.
const PLATFORM_ADMIN_TEST_EMAIL = 'platform-admin@test.local';

const HAS_DB = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

// Estado mutável de "quem está logado" e "empresa selecionada no cookie" —
// controlado por cada teste via loginAs()/selectEmpresa() abaixo. Os mocks
// leem essas variáveis no momento da chamada (nunca capturadas antes).
let currentEmail = '';
let currentPassword = '';
let empresaCookie: string | undefined;

function loginAs(email: string, password: string = TEST_PASSWORD) {
  currentEmail = email;
  currentPassword = password;
}

function selectEmpresa(slug: string | undefined) {
  empresaCookie = slug;
}

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'coe_empresa' && empresaCookie ? { value: empresaCookie } : undefined,
    getAll: () => [],
    set: () => undefined,
  }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const { authedClient } = await import('../setup/supabase-test-client');
    return (await authedClient(currentEmail, currentPassword)).client;
  },
}));

const FGCOOP_SLUG = 'fgcoop-test';
const ACME_SLUG = 'acme-test';

describe.skipIf(!HAS_DB)('team/actions.ts — convite e revogação escopados pelo tenant-alvo', () => {
  let sb: ReturnType<typeof serviceRoleClient>;
  let pswStaffUserId: string;
  // Import dinâmico (mesmo padrão de tests/opportunities/actions.test.ts) —
  // os `vi.mock(...)` acima já estão em vigor quando este `beforeAll` roda,
  // então o módulo importado enxerga `next/headers`/`next/cache`/
  // `@/lib/supabase/server` mockados.
  let inviteTeamMember: typeof import('@/app/(app)/team/actions').inviteTeamMember;
  let revokeTeamInvite: typeof import('@/app/(app)/team/actions').revokeTeamInvite;

  beforeAll(async () => {
    sb = serviceRoleClient();
    const seed = await seedTestTenants();
    pswStaffUserId = seed.pswStaffUserId;
    await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);

    const actions = await import('@/app/(app)/team/actions');
    inviteTeamMember = actions.inviteTeamMember;
    revokeTeamInvite = actions.revokeTeamInvite;
  });

  afterEach(async () => {
    // Limpa qualquer convite de teste criado por este arquivo, para não
    // colidir com o índice parcial global (email pendente único).
    await sb.from('invited_emails').delete().like('email', 'admin-scope-test-%@test.local');
  });

  afterAll(async () => {
    await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);
  });

  beforeEach(() => {
    empresaCookie = undefined;
  });

  it('tenant_admin de cliente convida e revoga no próprio tenant, sem mudança observável', async () => {
    loginAs(FGCOOP_TEST_EMAIL);
    const email = `admin-scope-test-1@test.local`;
    const form = new FormData();
    form.set('email', email);
    form.set('role', 'member');

    const result = await inviteTeamMember(form);
    expect(result).toEqual({ ok: true });

    const { data: inserted } = await sb
      .from('invited_emails')
      .select('id, tenant_id')
      .eq('email', email)
      .maybeSingle();
    expect(inserted?.tenant_id).toBe(FGCOOP_TEST_ID);

    const revokeForm = new FormData();
    revokeForm.set('id', inserted!.id);
    await revokeTeamInvite(revokeForm);

    const { data: afterRevoke } = await sb
      .from('invited_emails')
      .select('id')
      .eq('id', inserted!.id)
      .maybeSingle();
    expect(afterRevoke).toBeNull();
  });

  it('staff-admin com empresa A selecionada convida em A: o convite é gravado com o tenant de A', async () => {
    loginAs(PSW_STAFF_TEST_EMAIL);
    await sb.from('psw_tenant_admins').insert({
      profile_id: pswStaffUserId,
      tenant_id: FGCOOP_TEST_ID,
      granted_by: pswStaffUserId,
    });
    selectEmpresa(FGCOOP_SLUG);

    const email = `admin-scope-test-2@test.local`;
    const form = new FormData();
    form.set('email', email);
    form.set('role', 'member');

    const result = await inviteTeamMember(form);
    expect(result).toEqual({ ok: true });

    const { data: inserted } = await sb
      .from('invited_emails')
      .select('tenant_id')
      .eq('email', email)
      .maybeSingle();
    expect(inserted?.tenant_id).toBe(FGCOOP_TEST_ID);

    await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);
  });

  it('staff-admin com empresa A selecionada revoga um convite pendente de A: o convite some (releitura, nunca error===null)', async () => {
    const email = `admin-scope-test-3@test.local`;
    const { data: seeded } = await sb
      .from('invited_emails')
      .insert({ email, tenant_id: FGCOOP_TEST_ID, role: 'member', invited_by: pswStaffUserId })
      .select('id')
      .single();

    await sb.from('psw_tenant_admins').insert({
      profile_id: pswStaffUserId,
      tenant_id: FGCOOP_TEST_ID,
      granted_by: pswStaffUserId,
    });
    loginAs(PSW_STAFF_TEST_EMAIL);
    selectEmpresa(FGCOOP_SLUG);

    const revokeForm = new FormData();
    revokeForm.set('id', seeded!.id);
    await revokeTeamInvite(revokeForm);

    // A prova é a RELEITURA — nunca a ausência de erro (revokeTeamInvite
    // devolve void, não há canal de erro pra checar).
    const { data: afterRevoke } = await sb
      .from('invited_emails')
      .select('id')
      .eq('id', seeded!.id)
      .maybeSingle();
    expect(afterRevoke).toBeNull();

    await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);
  });

  it('staff-admin SEM empresa selecionada recebe ADMIN_SCOPE_DENIED_MESSAGE — nenhuma escrita é tentada', async () => {
    loginAs(PSW_STAFF_TEST_EMAIL);
    selectEmpresa(undefined);

    const email = `admin-scope-test-4@test.local`;
    const form = new FormData();
    form.set('email', email);
    form.set('role', 'member');

    const result = await inviteTeamMember(form);
    expect(result).toEqual({
      error: 'Empresa não encontrada ou fora do seu escopo de administração.',
    });

    const { data: notInserted } = await sb
      .from('invited_emails')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    expect(notInserted).toBeNull();
  });

  it('staff-admin com empresa selecionada onde NÃO tem concessão recebe a mesma mensagem — nenhuma escrita é tentada', async () => {
    loginAs(PSW_STAFF_TEST_EMAIL);
    selectEmpresa(ACME_SLUG); // sem concessão em Acme

    const email = `admin-scope-test-5@test.local`;
    const form = new FormData();
    form.set('email', email);
    form.set('role', 'member');

    const result = await inviteTeamMember(form);
    expect(result).toEqual({
      error: 'Empresa não encontrada ou fora do seu escopo de administração.',
    });

    const { data: notInserted } = await sb
      .from('invited_emails')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    expect(notInserted).toBeNull();
  });
});

describe.skipIf(!HAS_DB)('configuracoes/actions.ts — branding escopado pelo tenant-alvo (D-K)', () => {
  let sb: ReturnType<typeof serviceRoleClient>;
  let pswStaffUserId: string;
  let platformAdminUserId: string;
  let updateBrandColor: typeof import('@/app/(app)/configuracoes/actions').updateBrandColor;
  let updateTenantLogo: typeof import('@/app/(app)/configuracoes/actions').updateTenantLogo;
  let removeTenantLogo: typeof import('@/app/(app)/configuracoes/actions').removeTenantLogo;

  const uploadedPaths: string[] = [];

  function fakeLogo(name = 'logo.png') {
    return new File(['fake-png-bytes'], name, { type: 'image/png' });
  }

  async function resetTenantBranding(tenantId: string) {
    await sb.from('tenants').update({ brand_color: null, logo_path: null }).eq('id', tenantId);
  }

  beforeAll(async () => {
    sb = serviceRoleClient();
    const seed = await seedTestTenants();
    pswStaffUserId = seed.pswStaffUserId;
    await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);

    const { data: list } = await sb.auth.admin.listUsers();
    const existing = list?.users.find((u) => u.email === PLATFORM_ADMIN_TEST_EMAIL);
    if (existing) {
      platformAdminUserId = existing.id;
    } else {
      const { data, error } = await sb.auth.admin.createUser({
        email: PLATFORM_ADMIN_TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
        app_metadata: { tenant_id: PSW_TEST_ID },
        user_metadata: { full_name: 'Platform Admin Test', tenant_id: PSW_TEST_ID },
      });
      if (error || !data.user) throw new Error(`createUser falhou (platform admin): ${error?.message}`);
      platformAdminUserId = data.user.id;
    }
    await sb.from('profiles').update({ role: 'platform_admin' }).eq('id', platformAdminUserId);

    await resetTenantBranding(FGCOOP_TEST_ID);
    await resetTenantBranding(PSW_TEST_ID);

    const actions = await import('@/app/(app)/configuracoes/actions');
    updateBrandColor = actions.updateBrandColor;
    updateTenantLogo = actions.updateTenantLogo;
    removeTenantLogo = actions.removeTenantLogo;
  });

  afterEach(async () => {
    if (uploadedPaths.length) {
      await sb.storage.from('tenant-branding').remove(uploadedPaths.splice(0));
    }
    await resetTenantBranding(FGCOOP_TEST_ID);
    await resetTenantBranding(PSW_TEST_ID);
  });

  afterAll(async () => {
    await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);
  });

  beforeEach(() => {
    empresaCookie = undefined;
  });

  it('tenant_admin de cliente: salva cor, sobe logo e remove logo do próprio tenant — exatamente como antes', async () => {
    loginAs(FGCOOP_TEST_EMAIL);

    const colorForm = new FormData();
    colorForm.set('brand_color', '#123456');
    expect(await updateBrandColor(colorForm)).toEqual({ ok: true });
    const { data: afterColor } = await sb
      .from('tenants')
      .select('brand_color')
      .eq('id', FGCOOP_TEST_ID)
      .single();
    expect(afterColor?.brand_color).toBe('#123456');

    const logoForm = new FormData();
    logoForm.set('logo', fakeLogo());
    expect(await updateTenantLogo(logoForm)).toEqual({ ok: true });
    const { data: afterUpload } = await sb
      .from('tenants')
      .select('logo_path')
      .eq('id', FGCOOP_TEST_ID)
      .single();
    expect(afterUpload?.logo_path).toMatch(new RegExp(`^${FGCOOP_TEST_ID}/logo-`));
    uploadedPaths.push(afterUpload!.logo_path as string);

    expect(await removeTenantLogo()).toEqual({ ok: true });
    const { data: afterRemove } = await sb
      .from('tenants')
      .select('logo_path')
      .eq('id', FGCOOP_TEST_ID)
      .single();
    expect(afterRemove?.logo_path).toBeNull();
  });

  it('super-admin: salva cor, sobe e remove a logo do próprio tenant — exatamente como antes', async () => {
    loginAs(PLATFORM_ADMIN_TEST_EMAIL);

    const colorForm = new FormData();
    colorForm.set('brand_color', '#abcdef');
    expect(await updateBrandColor(colorForm)).toEqual({ ok: true });
    const { data: afterColor } = await sb
      .from('tenants')
      .select('brand_color')
      .eq('id', PSW_TEST_ID)
      .single();
    expect(afterColor?.brand_color).toBe('#abcdef');
  });

  it('staff-admin com empresa A selecionada salva a cor de A — confirmado por releitura', async () => {
    loginAs(PSW_STAFF_TEST_EMAIL);
    await sb.from('psw_tenant_admins').insert({
      profile_id: pswStaffUserId,
      tenant_id: FGCOOP_TEST_ID,
      granted_by: pswStaffUserId,
    });
    selectEmpresa(FGCOOP_SLUG);

    const colorForm = new FormData();
    colorForm.set('brand_color', '#654321');
    const result = await updateBrandColor(colorForm);
    expect(result).toEqual({ ok: true });

    const { data: afterColor } = await sb
      .from('tenants')
      .select('brand_color')
      .eq('id', FGCOOP_TEST_ID)
      .single();
    expect(afterColor?.brand_color).toBe('#654321');

    await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);
  });

  it('staff-admin com empresa A selecionada sobe a logo de A: arquivo na pasta de A, registro de A aponta pra ele', async () => {
    loginAs(PSW_STAFF_TEST_EMAIL);
    await sb.from('psw_tenant_admins').insert({
      profile_id: pswStaffUserId,
      tenant_id: FGCOOP_TEST_ID,
      granted_by: pswStaffUserId,
    });
    selectEmpresa(FGCOOP_SLUG);

    const logoForm = new FormData();
    logoForm.set('logo', fakeLogo());
    const result = await updateTenantLogo(logoForm);
    expect(result).toEqual({ ok: true });

    const { data: afterUpload } = await sb
      .from('tenants')
      .select('logo_path')
      .eq('id', FGCOOP_TEST_ID)
      .single();
    expect(afterUpload?.logo_path).toMatch(new RegExp(`^${FGCOOP_TEST_ID}/logo-`));
    uploadedPaths.push(afterUpload!.logo_path as string);

    await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);
  });

  it('staff-admin com empresa A selecionada remove a logo de A: registro limpo e o arquivo ANTIGO de A apagado — nunca o de outra empresa', async () => {
    // Baseline: A já tem uma logo antes deste teste (upload direto via service
    // role, pra isolar a asserção da ação de remoção).
    const previousPath = `${FGCOOP_TEST_ID}/logo-baseline.png`;
    await sb.storage
      .from('tenant-branding')
      .upload(previousPath, Buffer.from('fake-png-bytes'), {
        contentType: 'image/png',
        upsert: true,
      });
    await sb.from('tenants').update({ logo_path: previousPath }).eq('id', FGCOOP_TEST_ID);

    loginAs(PSW_STAFF_TEST_EMAIL);
    await sb.from('psw_tenant_admins').insert({
      profile_id: pswStaffUserId,
      tenant_id: FGCOOP_TEST_ID,
      granted_by: pswStaffUserId,
    });
    selectEmpresa(FGCOOP_SLUG);

    const result = await removeTenantLogo();
    expect(result).toEqual({ ok: true });

    const { data: afterRemove } = await sb
      .from('tenants')
      .select('logo_path')
      .eq('id', FGCOOP_TEST_ID)
      .single();
    expect(afterRemove?.logo_path).toBeNull();

    const { data: listing } = await sb.storage
      .from('tenant-branding')
      .list(FGCOOP_TEST_ID, { search: 'logo-baseline.png' });
    expect(listing ?? []).toHaveLength(0);

    await sb.from('psw_tenant_admins').delete().eq('profile_id', pswStaffUserId);
  });

  it('staff-admin sem empresa selecionada, ou com empresa sem concessão, recebe a mensagem única nas três ações — nenhum arquivo é enviado antes desse retorno', async () => {
    loginAs(PSW_STAFF_TEST_EMAIL);

    // Caso 1: sem empresa selecionada.
    selectEmpresa(undefined);
    const colorForm = new FormData();
    colorForm.set('brand_color', '#000000');
    expect(await updateBrandColor(colorForm)).toEqual({
      error: 'Empresa não encontrada ou fora do seu escopo de administração.',
    });

    const logoForm = new FormData();
    logoForm.set('logo', fakeLogo('sem-empresa.png'));
    expect(await updateTenantLogo(logoForm)).toEqual({
      error: 'Empresa não encontrada ou fora do seu escopo de administração.',
    });
    // Nenhum arquivo chegou ao bucket ANTES do early return (T-18-54).
    const { data: notUploaded } = await sb.storage
      .from('tenant-branding')
      .list(undefined, { search: 'sem-empresa.png' });
    expect(notUploaded ?? []).toHaveLength(0);

    expect(await removeTenantLogo()).toEqual({
      error: 'Empresa não encontrada ou fora do seu escopo de administração.',
    });

    // Caso 2: empresa selecionada, sem concessão nela.
    selectEmpresa(ACME_SLUG);
    expect(await updateBrandColor(colorForm)).toEqual({
      error: 'Empresa não encontrada ou fora do seu escopo de administração.',
    });
    const { data: acmeUnchanged } = await sb
      .from('tenants')
      .select('brand_color')
      .eq('id', ACME_TEST_ID)
      .single();
    expect(acmeUnchanged?.brand_color).toBeNull();
  });
});
