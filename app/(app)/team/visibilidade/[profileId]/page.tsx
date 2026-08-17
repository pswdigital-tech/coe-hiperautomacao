import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile, isPlatformAdmin, isTenantAdminOf } from '@/lib/security/role';
import { fetchProfileVisibility } from '@/lib/security/visibility';
import { cargoLabel } from '@/lib/security/cargo';
import type { TenantRole } from '@/lib/opportunities/types';
import { VisibilityForm, type OpportunityOption } from './VisibilityForm';

// =============================================================================
// /team/visibilidade/[profileId] — recorte de visibilidade de UMA pessoa (0053)
// -----------------------------------------------------------------------------
// O tenant-alvo vem da PESSOA EDITADA, nunca do seletor de empresa nem do
// tenant de lotação de quem edita — para `psw_staff` esses dois são a PSW, e
// usá-los aqui listaria as oportunidades da empresa errada. Mesma regra da
// Server Action irmã (`visibility-actions.ts`).
//
// Autorização idêntica à da action e à da RLS: `platform_admin` OU
// `isTenantAdminOf(tenant da pessoa)` — que já cobre o `tenant_admin` da
// empresa e o `psw_staff` com concessão nela (0045).
// =============================================================================

const ROLE_LABEL: Record<TenantRole, string> = {
  platform_admin: 'Administrador da plataforma',
  tenant_admin: 'Admin da empresa',
  member: 'Membro',
  viewer: 'Leitor (somente leitura)',
  psw_staff: 'Staff PSW (externo)',
};

export default async function VisibilityPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;

  const actor = await getCurrentProfile();
  if (!actor) redirect('/opportunities');

  const supabase = await createClient();

  const { data: person } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, cargo, tenant_id')
    .eq('id', profileId)
    .maybeSingle();

  if (!person) redirect('/team');

  const authorized = isPlatformAdmin(actor) || (await isTenantAdminOf(actor, person.tenant_id));
  if (!authorized) redirect('/opportunities');

  // `psw_staff` já é recortado por atribuição (0044) e `platform_admin` tem
  // visão global por definição — para os dois esta tela não teria efeito, e o
  // trigger da 0053 rejeitaria o salvamento. Melhor não abrir do que abrir e
  // falhar no submit.
  if (person.role === 'psw_staff' || person.role === 'platform_admin') redirect('/team');

  const [{ data: opps }, visibility] = await Promise.all([
    supabase
      .from('opportunities')
      .select('id, seq_id, processo, area')
      .eq('tenant_id', person.tenant_id)
      .order('seq_id', { ascending: false }),
    fetchProfileVisibility(profileId),
  ]);

  const opportunities: OpportunityOption[] = (opps ?? []).map((o) => ({
    id: o.id,
    seqId: o.seq_id,
    processo: o.processo,
    area: o.area,
  }));

  const personLabel = person.full_name ?? person.email;
  const papel =
    person.role === 'member' && person.cargo
      ? cargoLabel(person.cargo)
      : (ROLE_LABEL[person.role as TenantRole] ?? person.role);

  return (
    <div className="px-6 py-6 max-w-3xl mx-auto flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-txt">Acesso de {personLabel}</h1>
          <p className="text-xs text-mut">
            {person.email} · {papel} — escolha o que esta pessoa enxerga.
          </p>
        </div>
        <Link href="/team" className="text-xs font-semibold text-pri hover:underline shrink-0">
          ← Equipe
        </Link>
      </div>

      <VisibilityForm
        target={{ kind: 'profile', id: person.id }}
        personLabel={personLabel}
        initialScope={visibility.scope}
        initialIds={visibility.opportunityIds}
        opportunities={opportunities}
      />
    </div>
  );
}
