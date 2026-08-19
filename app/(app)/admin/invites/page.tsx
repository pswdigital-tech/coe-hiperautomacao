import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/security/role';
import { cargoLabel } from '@/lib/security/cargo';
import {
  fetchRestrictedCountsForProfiles,
  fetchInviteVisibilitySummary,
} from '@/lib/security/visibility';
import { ScopeBadge } from '@/components/admin/ScopeBadge';
import { InviteForm } from './InviteForm';
import { ResendButton } from './ResendButton';
import { RoleSelect, type EditableRole } from './RoleSelect';
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

/** Papéis de CLIENTE — o mesmo conjunto fechado da RPC `set_profile_role`
 *  (0064). Fora deles a célula continua sendo texto: `psw_staff` é lotação e
 *  `platform_admin` é o topo da cadeia; nenhum dos dois se troca por tela. */
const EDITABLE_ROLES: readonly AnyRole[] = ['member', 'viewer', 'tenant_admin'];

function isEditableRole(r: AnyRole): r is EditableRole {
  return EDITABLE_ROLES.includes(r);
}

function tenantName(t: TenantRef): string {
  const obj = Array.isArray(t) ? t[0] : t;
  return obj?.name ?? '—';
}

// Larguras de coluna. `w-px` + `nowrap` faz a coluna encolher para o seu
// min-content, então TODA a folga da tela sobra para a coluna sem largura —
// o e-mail (TH_GROW/TD_GROW). Sem isso o navegador distribui a folga entre as
// 7 colunas e, em tela larga, os campos ficam distantes demais para ler a
// linha inteira; em tela estreita a soma dos nowrap estourava o container e a
// última coluna ("Ação") era cortada.
/** Cabeçalho de coluna — mesmo tratamento nas duas tabelas da tela. */
const TH = 'px-4 py-2.5 font-bold whitespace-nowrap w-px';
/** Célula padrão: sem quebra de linha, para a linha não virar 2 ou 3 alturas. */
const TD = 'px-4 py-3 whitespace-nowrap w-px';
/** Coluna elástica (e-mail): absorve toda a folga horizontal. */
const TH_GROW = 'px-4 py-2.5 font-bold whitespace-nowrap w-full';
const TD_GROW = 'px-4 py-3 w-full max-w-0 truncate';

/** Contador ao lado do título da seção — dá noção de volume sem contar linhas. */
function SectionCount({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-bg border border-bdr text-[11px] font-bold text-mut">
      {n}
    </span>
  );
}

/** Status do convite. Bolinha em vez de emoji — o emoji renderizava colorido
 *  e desalinhado, brigando com a paleta em ambos os temas. */
function StatusPill({ used }: { used: boolean }) {
  return used ? (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-900">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
      Usado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-900">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
      Pendente
    </span>
  );
}

function visibilityLabel(count: number | undefined): string {
  if (count === undefined) return 'Tudo da empresa';
  return `${count} oportunidade${count === 1 ? '' : 's'}`;
}

export default async function InvitesPage() {
  const supabase = await createClient();
  // Só para não oferecer o seletor na PRÓPRIA linha — a 0064 recusaria de
  // qualquer forma ("Você não pode alterar o seu próprio papel"), mas mostrar
  // um controle que só sabe dar erro é pior que não mostrar.
  const currentProfile = await getCurrentProfile();

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

  const pendingCount = invites.filter((i) => !i.used_at).length;

  return (
    <div className="px-6 lg:px-8 py-6 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-txt">Convites de acesso</h1>
          <p className="text-xs text-mut mt-0.5">
            Libere e-mails para que empresas criem suas contas.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
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

      <section className="flex flex-col gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-txt">E-mails liberados</h2>
            <SectionCount n={invites.length} />
            {pendingCount > 0 && (
              <span className="text-xs text-mut">
                · {pendingCount} aguardando cadastro
              </span>
            )}
          </div>
          <p className="text-xs text-mut mt-0.5">
            Enquanto o convite está pendente o papel ainda pode ser trocado aqui.
            Depois do cadastro, a troca é na lista de baixo.
          </p>
        </div>

        <div className="bg-wh rounded-xl border border-bdr overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg text-left text-[11px] uppercase tracking-wide text-mut border-b border-bdr">
                  <th className={TH_GROW}>E-mail</th>
                  <th className={TH}>Empresa</th>
                  <th className={TH}>Papel</th>
                  <th className={TH}>Cargo</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Vai enxergar</th>
                  <th className={`${TH} text-right`}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {invites.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-mut">
                      Nenhum convite ainda.
                    </td>
                  </tr>
                ) : (
                  invites.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-t border-slate-100 dark:border-slate-800 hover:bg-bg/60 transition-colors"
                    >
                      <td className={`${TD_GROW} text-txt font-medium`} title={inv.email}>
                        {inv.email}
                      </td>
                      <td className={`${TD} text-mut`}>{tenantName(inv.tenants)}</td>
                      {/* Mesma regra da coluna "Vai enxergar" ao lado: só
                          convite PENDENTE é editável. Depois do primeiro login
                          quem manda é `profiles.role`, e a edição certa é na
                          linha da pessoa, na lista de baixo. Convite de Staff
                          PSW também não: o tenant dele já foi derivado como o
                          da PSW (D-02/D-08). */}
                      <td className={TD}>
                        {!inv.used_at && isEditableRole(inv.role) ? (
                          <RoleSelect
                            target="invite"
                            id={inv.id}
                            email={inv.email}
                            role={inv.role}
                          />
                        ) : (
                          <span className="text-mut">{ROLE_LABEL[inv.role] ?? inv.role}</span>
                        )}
                      </td>
                      <td className={`${TD} text-mut`}>{cargoLabel(inv.cargo)}</td>
                      <td className={TD}>
                        <StatusPill used={Boolean(inv.used_at)} />
                      </td>
                      {/* Só convite PENDENTE aceita recorte (0054): depois do
                          primeiro login quem manda é `profile_visibility`, e a
                          edição correta é pela linha da pessoa, na lista abaixo. */}
                      <td className={TD}>
                        {inv.used_at || inv.role === 'psw_staff' ? (
                          <span className="text-mut">—</span>
                        ) : (
                          <Link
                            href={`/team/visibilidade/convite/${inv.id}`}
                            className="text-xs font-semibold text-pri hover:underline dark:text-pril"
                          >
                            {visibilityLabel(inviteCounts.get(inv.id))}
                          </Link>
                        )}
                      </td>
                      <td className={`${TD} text-right`}>
                        {!inv.used_at ? (
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
                        ) : (
                          <span className="text-mut">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pessoas com conta — o caminho do super-admin da PSW para o recorte de
          visibilidade (0053). `tenant_admin`/`psw_staff` com concessão chegam
          na MESMA tela por `/team`; esta lista existe porque `/team` resolve o
          tenant pelo seletor de empresa e o `platform_admin` não usa aquela
          tela (D-N). Nenhuma linha de convite acima muda. */}
      <section className="flex flex-col gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-txt">Pessoas com conta</h2>
            <SectionCount n={people.length} />
          </div>
          <p className="text-xs text-mut mt-0.5">
            O papel troca aqui mesmo e vale na hora. Staff PSW e administradores
            da plataforma não se alteram por esta tela.
          </p>
        </div>

        <div className="bg-wh rounded-xl border border-bdr overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg text-left text-[11px] uppercase tracking-wide text-mut border-b border-bdr">
                  <th className={TH_GROW}>E-mail</th>
                  <th className={TH}>Empresa</th>
                  <th className={TH}>Papel</th>
                  <th className={TH}>Enxerga</th>
                </tr>
              </thead>
              <tbody>
                {people.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-mut">
                      Ninguém com conta ainda.
                    </td>
                  </tr>
                ) : (
                  people.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t border-slate-100 dark:border-slate-800 hover:bg-bg/60 transition-colors"
                    >
                      <td className={`${TD_GROW} text-txt font-medium`} title={p.email}>
                        {p.email}
                      </td>
                      <td className={`${TD} text-mut`}>{tenantName(p.tenants)}</td>
                      <td className={TD}>
                        {isEditableRole(p.role) && p.id !== currentProfile?.id ? (
                          <RoleSelect target="profile" id={p.id} email={p.email} role={p.role} />
                        ) : (
                          <span className="text-mut">{ROLE_LABEL[p.role] ?? p.role}</span>
                        )}
                      </td>
                      <td className={TD}>
                        {p.role === 'psw_staff' || p.role === 'platform_admin' ? (
                          <span className="text-mut">—</span>
                        ) : (
                          <Link
                            href={`/team/visibilidade/${p.id}`}
                            className="text-xs font-semibold text-pri hover:underline dark:text-pril"
                          >
                            {visibilityLabel(restrictedCounts.get(p.id))}
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
      </section>
    </div>
  );
}
