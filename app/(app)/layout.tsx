import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  getCurrentProfile,
  isPlatformAdmin,
  isTenantAdmin,
  isPswStaff,
} from '@/lib/security/role';
import { fetchTenantBranding } from '@/lib/branding/queries';
import { brandingCss } from '@/lib/branding/theme';
import { fetchTenantsByIds } from '@/lib/tenants/queries';
import { Sidebar } from '@/components/shell/Sidebar';
import { EMPRESA_COOKIE } from '@/lib/tenants/scope';
import { cookies } from 'next/headers';

export default async function AppLayout({
  children,
  modal,
}: LayoutProps<'/'>) {
  const profile = await getCurrentProfile();

  if (!profile) {
    // Sem sessão ou profile inconsistente (trigger handle_new_user falhou) → login
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login');
  }

  const isAdmin = isPlatformAdmin(profile);
  const staffAdmin = isPswStaff(profile);

  // Identidade visual do shell (Phase 18, Plan 08 — decisão registrada no
  // SUMMARY, revisável se o PO pedir o contrário): SEMPRE a do tenant de
  // LOTAÇÃO da pessoa, nunca a da empresa selecionada no seletor. Um
  // staff-admin atuando na empresa A continua vendo o tema da PSW — trocar o
  // tema do app inteiro em função do seletor seria mudança visível para um
  // papel existente (`platform_admin` já usa este mesmo layout) e não foi
  // pedida; a empresa de atuação já é comunicada pelo `ScopeBadge` no
  // cabeçalho das telas de admin, que é onde a ambiguidade de fato importa.
  // Ponto de mudança, se a decisão for revista: trocar `profile.tenantId`
  // abaixo pela origem do tenant-alvo (`resolveAdminTenantIdFromSelector`).
  const branding = await fetchTenantBranding(profile.tenantId);
  const themeCss = brandingCss(branding.brandColor);

  // Empresas ADMINISTRADAS por um staff-admin (nunca a carteira completa de
  // clientes, T-18-70) — consultada só para `psw_staff`, e reusada tanto para
  // o gate dos itens de menu (Equipe/Configurações/Logs) quanto para compor a
  // lista do seletor abaixo.
  let staffAdministeredIds: string[] = [];
  if (staffAdmin) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('psw_tenant_admins')
      .select('tenant_id')
      .eq('profile_id', profile.id);
    staffAdministeredIds = (data ?? []).map((r) => r.tenant_id);
  }
  // "Administra ao menos uma empresa" — o único sinalizador que a Sidebar
  // (client component) recebe para gatear Equipe/Configurações/Logs; ela não
  // consulta concessão por conta própria, o cálculo já é feito aqui, uma
  // camada acima. `tenant_admin` de cliente sempre administra a própria
  // empresa (sem ida ao banco); `psw_staff` só quando tem ao menos 1 concessão.
  const canAdminister = isTenantAdmin(profile) || staffAdministeredIds.length > 0;

  // Lista do seletor de empresa. `platform_admin` continua vendo TODAS as
  // empresas (é o dono da carteira, comportamento inalterado). Um staff-admin
  // NUNCA vê a carteira inteira: a lista é a união das empresas que ele
  // administra com as que ele já alcança por atribuição — a mesma união que a
  // listagem de oportunidades já usa para a coluna/filtro "Empresa" (D-03,
  // Phase 17) — montada por ids via `fetchTenantsByIds`, nunca por varredura.
  // Usa SLUG (não id) — é o que vai pra URL (?empresa=<slug>), sem expor UUID.
  let tenants: { slug: string; name: string }[] = [];
  if (isAdmin) {
    const supabase = await createClient();
    const { data } = await supabase.from('tenants').select('slug, name').order('name');
    tenants = data ?? [];
  } else if (staffAdmin && staffAdministeredIds.length > 0) {
    const supabase = await createClient();
    const { data: assignedRows } = await supabase
      .from('opportunity_assignees')
      .select('tenant_id')
      .eq('profile_id', profile.id);
    const assignedIds = (assignedRows ?? []).map((r) => r.tenant_id);
    const unionIds = Array.from(new Set([...staffAdministeredIds, ...assignedIds]));
    tenants = (await fetchTenantsByIds(unionIds)).map((t) => ({
      slug: t.slug,
      name: t.name,
    }));
  }

  // Empresa lembrada: o `?empresa=` da URL some em qualquer navegação que não
  // carregue a query (redirect após mutação, refresh de rota). O cookie
  // devolve o recorte para o seletor e para os links do menu.
  const selectedEmpresa = (await cookies()).get(EMPRESA_COOKIE)?.value ?? '';

  return (
    <div className="min-h-screen flex bg-bg">
      {/* Override dos tokens de marca (:root + .dark). Inline porque a cor vem
          do banco — não existe em build time. CSP permite style inline
          ('unsafe-inline' em style-src, ver proxy.ts). */}
      {themeCss && <style dangerouslySetInnerHTML={{ __html: themeCss }} />}
      <Suspense fallback={<div className="w-16 shrink-0 bg-nav" />}>
        <Sidebar
          profile={{
            fullName: profile.fullName,
            email: profile.email,
            role: profile.role,
            tenantName: profile.tenantName,
          }}
          tenants={tenants}
          canAdminister={canAdminister}
          // Registrar em nome de um cliente é privilégio de quem é da PSW
          // (0051). Papel basta como gate de MENU; o conjunto de empresas — e
          // a autorização de escrita de fato — é resolvido pela própria tela e
          // pela RPC, contra `staff_writable_tenant_ids()`.
          canRegisterForTenant={isAdmin || staffAdmin}
          selectedEmpresa={selectedEmpresa}
          logoUrl={branding.logoUrl}
        />
      </Suspense>
      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 min-w-0">{children}</main>
      </div>
      {modal}
    </div>
  );
}
