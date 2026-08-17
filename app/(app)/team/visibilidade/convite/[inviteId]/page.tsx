import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile, isPlatformAdmin, isTenantAdminOf } from '@/lib/security/role';
import { fetchInviteVisibility } from '@/lib/security/visibility';
import {
  VisibilityForm,
  type OpportunityOption,
} from '../../[profileId]/VisibilityForm';

// =============================================================================
// /team/visibilidade/convite/[inviteId] — recorte de quem AINDA NÃO tem conta
// -----------------------------------------------------------------------------
// Gêmea da tela de perfil (`../../[profileId]`), com a mesma autorização e o
// MESMO componente de formulário — o que muda é só onde grava: aqui em
// `invite_visibility` (0054), que `handle_new_user()` copia para as tabelas da
// 0053 no primeiro login. É isso que faz a pessoa já entrar vendo só o que deve.
//
// O segmento estático `convite` tem precedência sobre `[profileId]` no App
// Router, então as duas rotas convivem sem ambiguidade.
// =============================================================================

const ROLE_LABEL: Record<string, string> = {
  tenant_admin: 'Admin da empresa',
  member: 'Membro',
  viewer: 'Leitor (somente leitura)',
  psw_staff: 'Staff PSW (externo)',
};

export default async function InviteVisibilityPage({
  params,
}: {
  params: Promise<{ inviteId: string }>;
}) {
  const { inviteId } = await params;

  const actor = await getCurrentProfile();
  if (!actor) redirect('/opportunities');

  const supabase = await createClient();

  const { data: invite } = await supabase
    .from('invited_emails')
    .select('id, email, role, tenant_id, used_at')
    .eq('id', inviteId)
    .maybeSingle();

  if (!invite) redirect('/team');

  const authorized = isPlatformAdmin(actor) || (await isTenantAdminOf(actor, invite.tenant_id));
  if (!authorized) redirect('/opportunities');

  // Convite já usado: o recorte agora vive no perfil. Mandar o admin para lá
  // em vez de deixá-lo editar algo inerte — `handle_new_user()` já rodou e não
  // roda de novo.
  if (invite.used_at) {
    const { data: person } = await supabase
      .from('profiles')
      .select('id')
      .eq('tenant_id', invite.tenant_id)
      .ilike('email', invite.email)
      .maybeSingle();
    redirect(person ? `/team/visibilidade/${person.id}` : '/team');
  }

  // `psw_staff` é recortado por atribuição (0044), não por esta lista.
  if (invite.role === 'psw_staff') redirect('/team');

  const [{ data: opps }, visibility] = await Promise.all([
    supabase
      .from('opportunities')
      .select('id, seq_id, processo, area')
      .eq('tenant_id', invite.tenant_id)
      .order('seq_id', { ascending: false }),
    fetchInviteVisibility(inviteId),
  ]);

  const opportunities: OpportunityOption[] = (opps ?? []).map((o) => ({
    id: o.id,
    seqId: o.seq_id,
    processo: o.processo,
    area: o.area,
  }));

  return (
    <div className="px-6 py-6 max-w-3xl mx-auto flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-txt">Acesso de {invite.email}</h1>
          <p className="text-xs text-mut">
            Convite pendente · {ROLE_LABEL[invite.role] ?? invite.role} — o que
            for definido aqui já vale no primeiro login.
          </p>
        </div>
        <Link href="/team" className="text-xs font-semibold text-pri hover:underline shrink-0">
          ← Equipe
        </Link>
      </div>

      <VisibilityForm
        target={{ kind: 'invite', id: invite.id }}
        personLabel={invite.email}
        initialScope={visibility.scope}
        initialIds={visibility.opportunityIds}
        opportunities={opportunities}
      />
    </div>
  );
}
