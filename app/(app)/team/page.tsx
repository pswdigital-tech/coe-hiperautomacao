import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  getCurrentProfile,
  isTenantAdminOf,
  isPswStaff,
  resolveAdminTenantId,
} from '@/lib/security/role';
import { resolveEmpresaSlug } from '@/lib/tenants/scope';
import { fetchTenantIdBySlug, fetchTenantsByIds } from '@/lib/tenants/queries';
import type { TenantRole } from '@/lib/opportunities/types';
import { cargoLabel } from '@/lib/security/cargo';
import {
  fetchTenantVisibilitySummary,
  fetchInviteVisibilitySummary,
} from '@/lib/security/visibility';
import { ScopeBadge } from '@/components/admin/ScopeBadge';
import { NoScopeBanner } from '@/components/admin/NoScopeBanner';
import { TeamInviteForm } from './TeamInviteForm';
import { revokeTeamInvite } from './actions';

// =============================================================================
// /team — gestão de acesso da empresa ADMINISTRADA (v0.4 → Phase 18, D-K/D-R)
// -----------------------------------------------------------------------------
// Entram: `tenant_admin` (dono da própria empresa — comportamento inalterado,
// D-J) e `psw_staff` com concessão de admin em ao menos uma empresa
// (`psw_tenant_admins`, migration 0045). O `platform_admin` da PSW NÃO usa
// esta tela — ele tem `/admin/invites`, com alcance global; comportamento
// preservado (SC-12), nenhuma mudança aqui.
//
// O tenant-alvo NUNCA vem do tenant de LOTAÇÃO da pessoa logada (era o bug
// D-K) — vem do seletor de empresa da Sidebar (`?empresa=`, com queda para o
// cookie `coe_empresa`), resolvido e validado no servidor, mesma composição
// já usada em `opportunities/page.tsx:62-70` e nas Server Actions do plano
// 18-06 (`resolveEmpresaSlug` → `fetchTenantIdBySlug` → `resolveAdminTenantId`).
//
// Um `psw_staff` com concessão em ALGUMA empresa mas SEM empresa selecionada
// agora (ou com uma selecionada que ele não administra) continua entrando na
// tela — só que sem tenant-alvo: nenhuma lista é buscada, e os controles de
// escrita ficam desabilitados com o `NoScopeBanner` (D-R). Só quem não
// administra NENHUMA empresa é redirecionado, exatamente como hoje.
// =============================================================================

type SearchParams = Promise<Record<string, string | undefined>>;

// O dropdown de convite não oferece mais "Membro" genérico: quem tem acesso de
// membro aparece pelo cargo. Perfis antigos (sem cargo) caem no rótulo do role.
function papelLabel(role: TenantRole, cargo: string | null): string {
  if (role === 'member' && cargo) return cargoLabel(cargo);
  return ROLE_LABEL[role] ?? role;
}

const ROLE_LABEL: Record<TenantRole, string> = {
  platform_admin: 'Administrador da plataforma',
  tenant_admin: 'Admin da empresa',
  member: 'Membro',
  viewer: 'Leitor (somente leitura)',
  psw_staff: 'Staff PSW (externo)',
};

type InviteRow = {
  id: string;
  email: string;
  role: TenantRole;
  cargo: string | null;
  used_at: string | null;
  created_at: string;
};

type MemberRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: TenantRole;
  cargo: string | null;
};

export default async function TeamPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/opportunities');

  const supabase = await createClient();

  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') sp.set(k, v);
  }

  // Composição do tenant-alvo — mesmo padrão de `opportunities/page.tsx` e das
  // Server Actions do plano 18-06, aplicado aqui à LEITURA. Para
  // `tenant_admin` resolve para o próprio tenant sem ida ao banco extra
  // (`resolveAdminTenantId` ignora `requestedTenantId` nesse ramo — D-J, zero
  // regressão). Para `psw_staff`, resolve — e VALIDA contra a concessão — o
  // slug do seletor; sem slug ou sem concessão naquele tenant, devolve `null`.
  const empresaSlug = await resolveEmpresaSlug(sp);
  const requestedTenantId = empresaSlug ? await fetchTenantIdBySlug(empresaSlug) : null;
  const tenantAlvo = await resolveAdminTenantId(profile, requestedTenantId ?? undefined);

  // Só um `psw_staff` pode ter concessão em N empresas ao mesmo tempo — é essa
  // contagem que decide (a) se uma pessoa SEM seleção corrente ainda assim
  // administra alguma empresa (não deve ser redirecionada) e (b) se o
  // `ScopeBadge` faz sentido (ambiguidade real só existe com 2+ concessões).
  // Para `tenant_admin`/`platform_admin` a pergunta não se aplica — só existe
  // UMA empresa possível, sempre.
  let grantCount = 0;
  if (isPswStaff(profile)) {
    const { count } = await supabase
      .from('psw_tenant_admins')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profile.id);
    grantCount = count ?? 0;
  }

  const authorized = tenantAlvo
    ? await isTenantAdminOf(profile, tenantAlvo)
    : isPswStaff(profile) && grantCount > 0;
  if (!authorized) redirect('/opportunities');

  const multipleCompanies = isPswStaff(profile) && grantCount > 1;

  // Nome da empresa-alvo para o cabeçalho e o `ScopeBadge` — para papéis de
  // cliente é sempre o próprio tenant (já carregado no profile, sem consulta);
  // para `psw_staff` administrando OUTRA empresa, `profile.tenantName` seria o
  // nome da PSW (tenant de lotação), errado aqui — precisa da empresa-alvo.
  let tenantAlvoName: string | null = null;
  if (tenantAlvo) {
    tenantAlvoName = isPswStaff(profile)
      ? ((await fetchTenantsByIds([tenantAlvo]))[0]?.name ?? null)
      : profile.tenantName;
  }

  // Sem tenant-alvo: nenhuma lista é buscada — nunca cair no tenant de
  // lotação como padrão silencioso (T-18-61).
  const [invitesRes, membersRes] = tenantAlvo
    ? await Promise.all([
        supabase
          .from('invited_emails')
          .select('id, email, role, cargo, used_at, created_at')
          .eq('tenant_id', tenantAlvo)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, email, full_name, role, cargo')
          .eq('tenant_id', tenantAlvo)
          .order('email'),
      ])
    : [{ data: [] as InviteRow[] }, { data: [] as MemberRow[] }];

  const invites = (invitesRes.data ?? []) as InviteRow[];
  const members = (membersRes.data ?? []) as MemberRow[];

  // Quem está com recorte de visibilidade (0053) e quantas oportunidades vê.
  // Quem NÃO está no Map vê tudo — que é o caso de todo mundo até alguém
  // restringir explicitamente.
  const visibilityCounts = tenantAlvo
    ? await fetchTenantVisibilitySummary(tenantAlvo)
    : new Map<string, number>();

  const pending = invites.filter((i) => !i.used_at);

  // Mesmo resumo para os convites PENDENTES (0054) — o recorte já pode ser
  // definido antes de a pessoa criar a conta.
  const inviteCounts = await fetchInviteVisibilitySummary(pending.map((i) => i.id));

  const thCls = 'px-4 py-2.5 font-bold';

  return (
    <div className="px-6 py-6 max-w-4xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-txt">Equipe</h1>
          <p className="text-xs text-mut">
            Convide pessoas para acessar as oportunidades
            {tenantAlvoName ? ` de ${tenantAlvoName}` : ''} e defina o que cada
            uma pode fazer.
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

      {/* `fieldset disabled` cascata nativamente para todos os controles de
          formulário dentro de `TeamInviteForm` (Client Component) sem precisar
          tocar o arquivo dele — o mesmo aviso acima já explica o motivo. */}
      <fieldset disabled={!tenantAlvo} className="contents">
        <TeamInviteForm tenantName={tenantAlvoName} />
      </fieldset>

      {/* Convites pendentes -------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-bold text-txt">Convites pendentes</h2>
        <div className="bg-wh rounded-xl border border-bdr overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg text-left text-[11px] uppercase tracking-wide text-mut">
                <th className={thCls}>E-mail</th>
                <th className={thCls}>Papel</th>
                <th className={thCls}>Vai enxergar</th>
                <th className={`${thCls} text-right`}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-mut">
                    {tenantAlvo ? 'Nenhum convite pendente.' : 'Selecione uma empresa para ver os convites.'}
                  </td>
                </tr>
              ) : (
                pending.map((inv) => (
                  <tr key={inv.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2.5">{inv.email}</td>
                    <td className="px-4 py-2.5">{papelLabel(inv.role, inv.cargo)}</td>
                    {/* Definir o recorte ANTES do primeiro login (0054): quando
                        a pessoa criar a conta já entra vendo só isto. */}
                    <td className="px-4 py-2.5">
                      {inv.role === 'psw_staff' ? (
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
                      <form action={revokeTeamInvite} className="inline">
                        <input type="hidden" name="id" value={inv.id} />
                        <button
                          type="submit"
                          disabled={!tenantAlvo}
                          className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                        >
                          Revogar
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pessoas com acesso -------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-bold text-txt">Pessoas com acesso</h2>
        <div className="bg-wh rounded-xl border border-bdr overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg text-left text-[11px] uppercase tracking-wide text-mut">
                <th className={thCls}>Nome</th>
                <th className={thCls}>E-mail</th>
                <th className={thCls}>Papel</th>
                <th className={thCls}>Enxerga</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-mut">
                    {tenantAlvo ? 'Ninguém com acesso ainda.' : 'Selecione uma empresa para ver a equipe.'}
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2.5">{m.full_name ?? '—'}</td>
                    <td className="px-4 py-2.5">{m.email}</td>
                    <td className="px-4 py-2.5">{papelLabel(m.role, m.cargo)}</td>
                    {/* `psw_staff` e `platform_admin` não entram no recorte da
                        0053 (o primeiro já é recortado por atribuição, o
                        segundo é global de propósito) — para eles a tela não
                        existiria, então nem o link aparece. */}
                    <td className="px-4 py-2.5">
                      {m.role === 'psw_staff' || m.role === 'platform_admin' ? (
                        <span className="text-mut">—</span>
                      ) : (
                        <Link
                          href={`/team/visibilidade/${m.id}`}
                          className="text-xs font-semibold text-pri hover:underline"
                        >
                          {visibilityCounts.has(m.id)
                            ? `${visibilityCounts.get(m.id)} oportunidade${
                                visibilityCounts.get(m.id) === 1 ? '' : 's'
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
        <p className="text-xs text-mut">
          Para trocar o papel de quem já tem conta, fale com a PSW — por ora só o
          convite define o papel inicial. A coluna <strong>Enxerga</strong> controla
          quais oportunidades a pessoa vê: o padrão é tudo da empresa.
        </p>
      </div>
    </div>
  );
}
