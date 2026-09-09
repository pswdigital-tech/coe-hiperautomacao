import { redirect } from 'next/navigation';
import { getCurrentProfile, isPlatformAdmin, isPswStaff } from '@/lib/security/role';
import { fetchImportableTenants } from '@/lib/tenants/queries';
import { resolveEmpresaSlug } from '@/lib/tenants/scope';
import { fetchEventsWithCounts } from '@/lib/events/queries';
import { EventsManager } from './EventsManager';

export const metadata = {
  title: 'Eventos',
};

type SearchParams = Promise<Record<string, string | undefined>>;

// =============================================================================
// /eventos — eventos de levantamento (workshops) por empresa (0066)
// -----------------------------------------------------------------------------
// QUEM CHEGA AQUI: `platform_admin` (carteira inteira), `tenant_admin` (a
// própria empresa) e `psw_staff` COM concessão de admin (`psw_tenant_admins`,
// 0045) — o mesmo conjunto da importação em massa, pela mesma razão: criar o
// link de levantamento de uma empresa é ato de administração dela. O gate não
// é um teste de papel escrito aqui: é a lista devolvida por
// `import_writable_tenant_ids()` (0059). Lista vazia ⇒ redirect.
//
// O redirect é UX; a autorização REAL é a RLS de `events` (WITH CHECK com o
// mesmo predicado) mais o guard das Server Actions (lib/events/actions.ts).
//
// Recorte: para quem tem seletor de empresa (super-admin, staff-admin), a
// empresa selecionada (`?empresa=`/cookie) filtra a lista e pré-seleciona o
// formulário; em "Todas as empresas" a lista mostra a coluna Empresa. Para o
// admin de cliente há uma empresa só e nada disso aparece.
// =============================================================================
export default async function EventsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const tenants = await fetchImportableTenants();
  if (tenants.length === 0) redirect('/opportunities');

  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') sp.set(k, v);
  }

  const hasSelector = isPlatformAdmin(profile) || isPswStaff(profile);
  const empresaSlug = hasSelector ? await resolveEmpresaSlug(sp) : undefined;
  // Só vale se estiver entre as empresas administradas — uma empresa
  // selecionada que a pessoa não administra cai em "todas as administradas".
  const scoped = empresaSlug
    ? tenants.find((t) => t.slug === empresaSlug) ?? null
    : null;

  const events = await fetchEventsWithCounts(
    scoped ? [scoped.id] : tenants.map((t) => t.id),
  );

  return (
    <div className="px-6 lg:px-8 py-6 flex flex-col gap-6">
      <header>
        <h1 className="text-[26px] font-bold text-txt tracking-tight">Eventos</h1>
        <p className="text-[13px] text-mut mt-0.5">
          Cada evento (workshop, imersão, levantamento) tem o próprio link de
          formulário. Quem preenche por ele fica vinculado ao evento — e você vê
          só essas oportunidades depois.
        </p>
      </header>

      <EventsManager
        tenants={tenants}
        events={events}
        selectedTenantId={scoped?.id ?? (tenants.length === 1 ? tenants[0].id : null)}
      />
    </div>
  );
}
