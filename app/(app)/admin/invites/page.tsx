import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { cargoLabel } from '@/lib/security/cargo';
import {
  fetchRestrictedCountsForProfiles,
  fetchInviteVisibilitySummary,
} from '@/lib/security/visibility';
import { ScopeBadge } from '@/components/admin/ScopeBadge';
import { InviteForm } from './InviteForm';
import { ResendButton } from './ResendButton';
import { revokeInvite } from './actions';

// =============================================================================
// /admin/invites — a única das 4 telas de admin que já lia cross-tenant
// corretamente (Phase 18, Plan 07) — NENHUMA consulta muda aqui.
// -----------------------------------------------------------------------------
// Herda o guard platform_admin-only de `app/(app)/admin/layout.tsx` (D-N): só
// o super-admin da PSW visita esta tela, e ele escolhe a empresa DENTRO do
// próprio formulário (`InviteForm`), não pelo seletor da Sidebar — o contexto
// de escrita do seletor não governa esta tela. Por isso `ScopeBadge` recebe
// `multiple={false}` sempre: não existe ambiguidade "em qual empresa estou
// agindo" a resolver aqui (SC-12) — o componente só é adicionado para
// consistência visual entre as 4 abas de admin, e não renderiza nada.
// =============================================================================

type AnyRole = 'member' | 'tenant_admin' | 'viewer' | 'psw_staff' | 'platform_admin';

type TenantRef = { name: string } | { name: string }[] | null;

type InviteRow = {
  id: string;
  email: string;
  role: Exclude<AnyRole, 'platform_admin'>;
  cargo: string | null;
  used_at: string | null;
  created_at: string;
  tenants: TenantRef;
};

// Perfis já existentes podem ser `platform_admin` (um convite nunca cria esse
// papel — daí o `Exclude` acima e a chave a mais aqui).
type PersonRow = {
  id: string;
  email: string;
  role: AnyRole;
  tenants: TenantRef;
};

const ROLE_LABEL: Record<AnyRole, string> = {
  member: 'Membro',
  tenant_admin: 'Admin da empresa',
  viewer: 'Leitor (somente leitura)',
  psw_staff: 'Staff PSW',
  platform_admin: 'Administrador da plataforma',
};

function tenantName(t: TenantRef): string {
  const obj = Array.isArray(t) ? t[0] : t;
  return obj?.name ?? '—';
}

export default async function InvitesPage() {
  const supabase = await createClient();

  const [invitesRes, tenantsRes, peopleRes] = await Promise.all([
    supabase
      .from('invited_emails')
      .select('id, email, role, cargo, used_at, created_at, tenants(name)')
      .order('created_at', { ascending: false }),
    supabase.from('tenants').select('id, name').order('name'),
    supabase.from('profiles').select('id, email, role, tenants(name)').order('email'),
  ]);

  const invites = (invitesRes.data ?? []) as InviteRow[];
  const tenants = (tenantsRes.data ?? []) as { id: string; name: string }[];
  const people = (peopleRes.data ?? []) as unknown as PersonRow[];

  const [restrictedCounts, inviteCounts] = await Promise.all([
    fetchRestrictedCountsForProfiles(people.map((p) => p.id)),
    fetchInviteVisibilitySummary(invites.filter((i) => !i.used_at).map((i) => i.id)),
  ]);

  return (
    <div className="px-6 py-6 max-w-4xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-txt">Convites de acesso</h1>
          <p className="text-xs text-mut">
            Libere e-mails para que empresas criem suas contas.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ScopeBadge tenantName={null} multiple={false} />
          <Link
            href="/opportunities"
            className="text-xs font-semibold text-pri hover:underline"
          >
            ← Voltar
          </Link>
        </div>
      </div>

      <InviteForm tenants={tenants} />

      <div className="bg-wh rounded-xl border border-bdr overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg text-left text-[11px] uppercase tracking-wide text-mut">
              <th className="px-4 py-2.5 font-bold">E-mail</th>
              <th className="px-4 py-2.5 font-bold">Empresa</th>
              <th className="px-4 py-2.5 font-bold">Papel</th>
              <th className="px-4 py-2.5 font-bold">Cargo</th>
              <th className="px-4 py-2.5 font-bold">Status</th>
              <th className="px-4 py-2.5 font-bold">Vai enxergar</th>
              <th className="px-4 py-2.5 font-bold text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {invites.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-mut">
                  Nenhum convite ainda.
                </td>
              </tr>
            ) : (
              invites.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2.5">{inv.email}</td>
                  <td className="px-4 py-2.5">{tenantName(inv.tenants)}</td>
                  <td className="px-4 py-2.5">
                    {ROLE_LABEL[inv.role] ?? inv.role}
                  </td>
                  <td className="px-4 py-2.5">{cargoLabel(inv.cargo)}</td>
                  <td className="px-4 py-2.5">
                    {inv.used_at ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full dark:text-emerald-300 dark:bg-emerald-950/40">
                        ✓ Usado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full dark:text-amber-300 dark:bg-amber-950/40">
                        ⏳ Pendente
                      </span>
                    )}
                  </td>
                  {/* Só convite PENDENTE aceita recorte (0054): depois do
                      primeiro login quem manda é `profile_visibility`, e a
                      edição correta é pela linha da pessoa, na lista abaixo. */}
                  <td className="px-4 py-2.5">
                    {inv.used_at || inv.role === 'psw_staff' ? (
                      <span className="text-mut">—</span>
                    ) : (
                      <Link
                        href={`/team/visibilidade/convite/${inv.id}`}
                        className="text-xs font-semibold text-pri hover:underline"
                      >
                        {inviteCounts.has(inv.id)
                          ? `${inviteCounts.get(inv.id)} oportunidade${
                              inviteCounts.get(inv.id) === 1 ? '' : 's'
                            }`
                          : 'Tudo da empresa'}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!inv.used_at && (
                      <span className="inline-flex items-center gap-3">
                        <ResendButton id={inv.id} />
                        <form action={revokeInvite} className="inline">
                          <input type="hidden" name="id" value={inv.id} />
                          <button
                            type="submit"
                            className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline"
                          >
                            Revogar
                          </button>
                        </form>
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pessoas com conta — o caminho do super-admin da PSW para o recorte de
          visibilidade (0053). `tenant_admin`/`psw_staff` com concessão chegam
          na MESMA tela por `/team`; esta lista existe porque `/team` resolve o
          tenant pelo seletor de empresa e o `platform_admin` não usa aquela
          tela (D-N). Nenhuma linha de convite acima muda. */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-bold text-txt">Pessoas com conta</h2>
        <div className="bg-wh rounded-xl border border-bdr overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg text-left text-[11px] uppercase tracking-wide text-mut">
                <th className="px-4 py-2.5 font-bold">E-mail</th>
                <th className="px-4 py-2.5 font-bold">Empresa</th>
                <th className="px-4 py-2.5 font-bold">Papel</th>
                <th className="px-4 py-2.5 font-bold">Enxerga</th>
              </tr>
            </thead>
            <tbody>
              {people.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-mut">
                    Ninguém com conta ainda.
                  </td>
                </tr>
              ) : (
                people.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2.5">{p.email}</td>
                    <td className="px-4 py-2.5">{tenantName(p.tenants)}</td>
                    <td className="px-4 py-2.5">{ROLE_LABEL[p.role] ?? p.role}</td>
                    <td className="px-4 py-2.5">
                      {p.role === 'psw_staff' || p.role === 'platform_admin' ? (
                        <span className="text-mut">—</span>
                      ) : (
                        <Link
                          href={`/team/visibilidade/${p.id}`}
                          className="text-xs font-semibold text-pri hover:underline"
                        >
                          {restrictedCounts.has(p.id)
                            ? `${restrictedCounts.get(p.id)} oportunidade${
                                restrictedCounts.get(p.id) === 1 ? '' : 's'
                              }`
                            : 'Tudo da empresa'}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
