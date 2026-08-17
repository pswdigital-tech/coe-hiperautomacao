import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  getCurrentProfile,
  isPlatformAdmin,
  isTenantAdminOf,
  isPswStaff,
  resolveAdminTenantId,
} from '@/lib/security/role';
import { resolveEmpresaSlug } from '@/lib/tenants/scope';
import { fetchTenantIdBySlug, fetchTenantsByIds } from '@/lib/tenants/queries';
import { fetchTenantBranding, EMPTY_BRANDING } from '@/lib/branding/queries';
import { ScopeBadge } from '@/components/admin/ScopeBadge';
import { NoScopeBanner } from '@/components/admin/NoScopeBanner';
import { BrandingForm } from './BrandingForm';

// =============================================================================
// /configuracoes — identidade visual da empresa ADMINISTRADA (v0.4 → Phase 18)
// -----------------------------------------------------------------------------
// Entram: `tenant_admin` (dono da própria empresa), `platform_admin` (que
// também tem um tenant próprio — comportamento inalterado, SC-12) e `psw_staff`
// com concessão de admin em ao menos uma empresa (`psw_tenant_admins`).
// member/viewer continuam redirecionados — eles VEEM o tema, não o configuram.
//
// Mesma composição de tenant-alvo de `/team` (D-K/D-R): NUNCA o tenant de
// lotação da pessoa logada. Sem tenant-alvo (nenhuma empresa selecionada, ou a
// selecionada não é administrada), o branding não é buscado de tenant nenhum
// e os 3 controles de escrita (cor, envio de logo, remoção) ficam desabilitados
// com o `NoScopeBanner`.
// =============================================================================

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/opportunities');

  const supabase = await createClient();

  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') sp.set(k, v);
  }

  const empresaSlug = await resolveEmpresaSlug(sp);
  const requestedTenantId = empresaSlug ? await fetchTenantIdBySlug(empresaSlug) : null;
  const tenantAlvo = await resolveAdminTenantId(profile, requestedTenantId ?? undefined);

  let grantCount = 0;
  if (isPswStaff(profile)) {
    const { count } = await supabase
      .from('psw_tenant_admins')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profile.id);
    grantCount = count ?? 0;
  }

  const authorized = isPlatformAdmin(profile)
    ? true
    : tenantAlvo
      ? await isTenantAdminOf(profile, tenantAlvo)
      : isPswStaff(profile) && grantCount > 0;
  if (!authorized) redirect('/opportunities');

  const multipleCompanies = isPswStaff(profile) && grantCount > 1;

  let tenantAlvoName: string | null = null;
  if (tenantAlvo) {
    tenantAlvoName = isPswStaff(profile)
      ? ((await fetchTenantsByIds([tenantAlvo]))[0]?.name ?? null)
      : profile.tenantName;
  }

  const branding = tenantAlvo ? await fetchTenantBranding(tenantAlvo) : EMPTY_BRANDING;

  return (
    <div className="px-6 py-6 max-w-3xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-txt">Configurações</h1>
          <p className="text-xs text-mut">
            Identidade visual{tenantAlvoName ? ` de ${tenantAlvoName}` : ''} — cor
            principal e logo. Vale para todas as pessoas da empresa.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ScopeBadge tenantName={tenantAlvoName} multiple={multipleCompanies} />
          <Link href="/opportunities" className="text-xs font-semibold text-pri hover:underline">
            ← Voltar
          </Link>
        </div>
      </div>

      {!tenantAlvo && <NoScopeBanner />}

      {/* `fieldset disabled` cascata nativamente para os 3 controles de escrita
          de `BrandingForm` (cor, upload de logo, remoção) sem tocar o arquivo
          dele — ver `NoScopeBanner` para o porquê de desabilitado e não
          escondido, e por que isto não é autorização. */}
      <fieldset disabled={!tenantAlvo} className="contents">
        <BrandingForm
          brandColor={branding.brandColor}
          logoUrl={branding.logoUrl}
          tenantName={tenantAlvoName}
        />
      </fieldset>
    </div>
  );
}
