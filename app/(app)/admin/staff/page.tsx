import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import {
  buildStaffAccessOrigins,
  isOrphanGrant,
  type StaffTenantGrant,
  type StaffAssignmentInput,
} from '@/lib/staff-admin/origins';
import { Icon } from '@/components/shell/icons';
import { GrantForm } from './GrantForm';
import { RevokeGrantButton } from './RevokeGrantButton';

// =============================================================================
// admin/staff/page.tsx — a tela diagnóstica "por que fulano vê isto?"
// (Phase 18, Plan 04, GRANT-07/08/09)
// -----------------------------------------------------------------------------
// Server Component. Nenhum check de papel próprio — o guard de `/admin`
// (app/(app)/admin/layout.tsx) já redireciona quem não é platform_admin (D-N).
// Lista os `psw_staff` filtrando SÓ por papel, nunca por tenant (RESEARCH
// §Open Questions item 5) — o pressuposto da fase é que todo staff PSW está
// lotado no tenant da PSW, então filtrar por tenant seria redundante e frágil
// se essa premissa mudar.
// =============================================================================

type StaffProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
};

type GrantRow = {
  id: string;
  profile_id: string;
  tenant_id: string;
  granted_at: string;
  tenants: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

type AssignmentRow = {
  opportunity_id: string;
  profile_id: string;
  tenant_id: string;
  opportunities: { processo: string | null; seq_id: number | null } | { processo: string | null; seq_id: number | null }[] | null;
};

type TenantOption = { id: string; name: string };

type PersonRow = {
  id: string;
  fullName: string | null;
  email: string;
  isOrphan: boolean;
  grants: Array<StaffTenantGrant & { grantId: string }>;
  assignments: ReturnType<typeof buildStaffAccessOrigins>['assignments'];
  redundantCount: number;
};

/** Supabase aninha o FK como objeto (single) ou array — normaliza. */
function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function personLabel(p: Pick<PersonRow, 'fullName' | 'email'>): string {
  return p.fullName ?? p.email;
}

function opportunityLabel(o: { processo: string | null; seq_id: number | null } | null): string {
  if (!o) return 'Oportunidade';
  return (o.processo || '').trim() || (o.seq_id != null ? `#${o.seq_id}` : 'Oportunidade');
}

function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${plural}`;
}

export default async function StaffAdminPage() {
  const supabase = await createClient();

  // (1)+(2)+(4) em paralelo — nenhuma depende das outras. (3) depende dos ids
  // resolvidos em (1)+possíveis órfãos de (2), então vem depois.
  const [staffRes, grantsRes, tenantsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('role', 'psw_staff')
      .order('full_name', { ascending: true }),
    supabase
      .from('psw_tenant_admins')
      .select('id, profile_id, tenant_id, granted_at, tenants(name, slug)')
      .order('granted_at', { ascending: true }),
    supabase.from('tenants').select('id, name').order('name', { ascending: true }),
  ]);

  const hasReadError = Boolean(staffRes.error || grantsRes.error || tenantsRes.error);

  const staffProfiles = (staffRes.data ?? []) as StaffProfileRow[];
  const grants = (grantsRes.data ?? []) as GrantRow[];
  const tenantOptions = (tenantsRes.data ?? []) as TenantOption[];

  const staffIds = new Set(staffProfiles.map((p) => p.id));

  // Concessão órfã (D-S/T-18-36): a pessoa já não é `psw_staff`, então a busca
  // por papel (1) não a traz — sem este passo extra ela some da tela em vez de
  // aparecer sinalizada.
  const orphanProfileIds = Array.from(
    new Set(grants.map((g) => g.profile_id).filter((id) => !staffIds.has(id)))
  );

  let orphanProfiles: StaffProfileRow[] = [];
  let hasOrphanReadError = false;
  if (orphanProfileIds.length > 0 && !hasReadError) {
    const orphanRes = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .in('id', orphanProfileIds);
    hasOrphanReadError = Boolean(orphanRes.error);
    orphanProfiles = (orphanRes.data ?? []) as StaffProfileRow[];
  }

  const allProfiles = [...staffProfiles, ...orphanProfiles];
  const allProfileIds = allProfiles.map((p) => p.id);

  let assignments: AssignmentRow[] = [];
  let hasAssignmentReadError = false;
  if (allProfileIds.length > 0 && !hasReadError && !hasOrphanReadError) {
    const assignmentsRes = await supabase
      .from('opportunity_assignees')
      .select('opportunity_id, profile_id, tenant_id, opportunities(processo, seq_id)')
      .in('profile_id', allProfileIds);
    hasAssignmentReadError = Boolean(assignmentsRes.error);
    assignments = (assignmentsRes.data ?? []) as AssignmentRow[];
  }

  const readFailed = hasReadError || hasOrphanReadError || hasAssignmentReadError;

  // Agregado por pessoa — a marcação de redundância vem do módulo puro, nunca
  // de lógica inline no JSX.
  const people: PersonRow[] = readFailed
    ? []
    : allProfiles
        .map((p) => {
          const personGrants: Array<StaffTenantGrant & { grantId: string }> = grants
            .filter((g) => g.profile_id === p.id)
            .map((g) => {
              const tenant = one(g.tenants);
              return {
                id: g.id,
                grantId: g.id,
                tenantId: g.tenant_id,
                tenantName: tenant?.name ?? '—',
                tenantSlug: tenant?.slug ?? '',
                grantedAt: g.granted_at,
              };
            });

          const personAssignmentsInput: StaffAssignmentInput[] = assignments
            .filter((a) => a.profile_id === p.id)
            .map((a) => ({
              opportunityId: a.opportunity_id,
              tenantId: a.tenant_id,
              label: opportunityLabel(one(a.opportunities)),
            }));

          const origins = buildStaffAccessOrigins(personGrants, personAssignmentsInput);

          return {
            id: p.id,
            fullName: p.full_name,
            email: p.email,
            isOrphan: isOrphanGrant(p.role),
            grants: personGrants,
            assignments: origins.assignments,
            redundantCount: origins.redundantCount,
          };
        })
        .sort((a, b) => personLabel(a).localeCompare(personLabel(b), 'pt-BR'));

  return (
    <div className="px-6 py-6 max-w-4xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-txt">Staff PSW como admin de tenant</h1>
          <p className="text-xs text-mut">
            Conceda e revogue admin de empresa para pessoas da PSW.
          </p>
        </div>
        <Link href="/opportunities" className="text-xs font-bold text-pri hover:underline">
          ← Voltar
        </Link>
      </div>

      {readFailed && (
        <div
          role="alert"
          className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800"
        >
          Não foi possível carregar a lista de staff PSW. Recarregue a página.
        </div>
      )}

      {/* Só pessoas ATIVAS como psw_staff são grant-áveis (nunca uma órfã —
          o trigger de coerência do banco rejeitaria, mas a UI nem oferece a
          opção). Sem nenhuma pessoa ativa, o formulário inteiro some — vale
          o estado vazio da lista, mesmo que só concessões órfãs existam. */}
      {!readFailed && people.some((p) => !p.isOrphan) && (
        <GrantForm
          people={people
            .filter((p) => !p.isOrphan)
            .map((p) => ({ id: p.id, fullName: p.fullName, email: p.email }))}
          tenants={tenantOptions}
          grantedTenantIdsByPerson={Object.fromEntries(
            people.map((p) => [p.id, p.grants.map((g) => g.tenantId)])
          )}
        />
      )}

      {!readFailed && (
        <div className="bg-wh rounded-xl border border-bdr overflow-hidden">
          <div className="bg-bg text-left text-[11px] uppercase tracking-wide text-mut flex items-center">
            <span className="px-4 py-2.5 font-bold flex-1">Pessoa</span>
            <span className="px-4 py-2.5 font-bold w-56">Admin nas empresas</span>
            <span className="px-4 py-2.5 font-bold w-40">Atribuições individuais</span>
            <span className="px-4 py-2.5 font-bold w-10 text-right">Ação</span>
          </div>

          {people.length === 0 ? (
            <div className="px-4 py-8 text-center text-mut text-sm">
              Nenhum staff PSW cadastrado ainda.
              <br />
              <span className="text-xs">
                Convide uma pessoa em{' '}
                <Link href="/admin/invites" className="text-pri hover:underline">
                  Convites de acesso
                </Link>{' '}
                primeiro — depois volte aqui para conceder admin de empresa.
              </span>
            </div>
          ) : (
            people.map((person) => {
              const isEmpty = person.grants.length === 0 && person.assignments.length === 0;
              return (
                <details
                  key={person.id}
                  className={`group border-t border-slate-100 dark:border-slate-800 ${
                    person.isOrphan ? 'opacity-60' : ''
                  }`}
                >
                  <summary className="flex items-center cursor-pointer list-none select-none">
                    <span
                      className="px-4 py-2.5 flex-1 text-sm text-txt truncate"
                      title={`${personLabel(person)} · ${person.email}`}
                    >
                      {personLabel(person)}
                      {person.isOrphan && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold text-mut bg-bg border border-bdr rounded-full px-2 py-0.5 align-middle">
                          ⏸ Órfã — pessoa não é mais Staff PSW
                        </span>
                      )}
                    </span>
                    <span className="px-4 py-2.5 w-56 text-sm text-mut">
                      {isEmpty
                        ? 'Sem admin em nenhuma empresa e sem atribuições individuais.'
                        : pluralize(person.grants.length, 'empresa', 'empresas')}
                    </span>
                    <span className="px-4 py-2.5 w-40 text-sm text-mut">
                      {!isEmpty && pluralize(person.assignments.length, 'atrib.', 'atrib.')}
                    </span>
                    <span className="px-4 py-2.5 w-10 flex justify-end">
                      <Icon.Chevron className="w-4 h-4 text-mut transition-transform group-open:rotate-180" />
                    </span>
                  </summary>

                  <div className="px-4 pb-4 flex flex-col gap-3 bg-bg/40">
                    {isEmpty && (
                      <p className="text-xs text-mut pt-1">
                        Sem admin em nenhuma empresa e sem atribuições individuais.
                      </p>
                    )}

                    <div className="bg-wh border border-bdr rounded-lg p-3 flex flex-col gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-mut">
                        Admin nas empresas
                      </span>
                      {person.grants.length === 0 ? (
                        <p className="text-xs text-mut">Não é admin de nenhuma empresa.</p>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {person.grants.map((g) => (
                            <span
                              key={g.grantId}
                              title={g.tenantName}
                              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-bg border border-bdr text-[12px] text-txt max-w-[220px]"
                            >
                              <span className="truncate">{g.tenantName}</span>
                              <RevokeGrantButton
                                grantId={g.grantId}
                                tenantName={g.tenantName}
                                personName={personLabel(person)}
                              />
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-wh border border-bdr rounded-lg p-3 flex flex-col gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-mut">
                        Atribuições individuais
                        {person.assignments.length > 0 && (
                          <>
                            {' '}
                            {person.assignments.length}
                            {person.redundantCount > 0 && (
                              <>
                                {' '}
                                (
                                {pluralize(person.redundantCount, 'redundante', 'redundantes')}
                                )
                              </>
                            )}
                          </>
                        )}
                      </span>
                      {person.assignments.length === 0 ? (
                        <p className="text-xs text-mut">Nenhuma atribuição individual.</p>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {person.assignments.map((a) => (
                            <li
                              key={a.opportunityId}
                              className="flex items-center justify-between gap-2 text-sm text-txt"
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="truncate max-w-[280px]" title={a.label}>
                                  {a.label}
                                </span>
                                {a.redundant && (
                                  <span className="text-[11px] text-mut shrink-0">
                                    já coberta pelo admin
                                  </span>
                                )}
                              </span>
                              <Link
                                href={`/opportunities/${a.opportunityId}`}
                                className="text-xs font-bold text-pri hover:underline shrink-0"
                              >
                                Ver oportunidade →
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </details>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
