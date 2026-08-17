import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  fetchAuditLog,
  fetchAuditTenants,
  AUDIT_PAGE_SIZE,
  type AuditEntry,
} from '@/lib/audit/queries';
import {
  ACTION_LABEL,
  TABLE_LABEL,
  tableLabel,
  formatDateTime,
  recordName,
} from '@/lib/audit/labels';
import {
  getCurrentProfile,
  isPlatformAdmin,
  isTenantAdminOf,
  isPswStaff,
} from '@/lib/security/role';
import { ChangesList } from '@/components/audit/ChangesList';
import { ScopeBadge } from '@/components/admin/ScopeBadge';
import type { AuditAction } from '@/lib/database.types';

// =============================================================================
// /logs — rastreabilidade (v0.5, migration 0038 → Phase 18, Plan 07)
// -----------------------------------------------------------------------------
// Quem entra: `tenant_admin` (só o próprio tenant) e `platform_admin` (todos,
// com seletor de empresa) — comportamento inalterado (SC-12) — e agora também
// `psw_staff` com concessão de admin em ao menos uma empresa
// (`psw_tenant_admins`, migration 0045/0047: `audit_log_select` já inclui
// `is_tenant_admin_of(tenant_id)`, GRANT-04). O guard aqui é defesa em
// profundidade — o bloqueio REAL é a policy `audit_log_select`.
//
// O recorte por empresa (antes só do `platform_admin`) passa a valer também
// para quem administra MAIS DE UMA empresa — com a lista de opções LIMITADA
// às empresas administradas (T-18-60): nunca a lista completa de clientes,
// que vazaria a carteira. Com concessão em uma única empresa o recorte nem
// aparece — não há ambiguidade a resolver, a RLS já entrega só aquele tenant.
//
// Não fica sob /admin porque aquele layout é platform_admin-only (o
// tenant_admin/staff-admin seria redirecionado antes de chegar aqui).
// =============================================================================

type SearchParams = Promise<Record<string, string | undefined>>;

const PERIODOS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: 'tudo', label: 'Todo o período' },
];

const ACTIONS: { value: AuditAction; label: string }[] = [
  { value: 'insert', label: 'Criação' },
  { value: 'update', label: 'Edição' },
  { value: 'delete', label: 'Exclusão' },
];

const ACTION_STYLE: Record<AuditAction, string> = {
  insert: 'bg-acc/10 text-acc',
  update: 'bg-pri/10 text-pri',
  delete: 'bg-red/10 text-red',
};

const SELECT_CLASS =
  'h-8 rounded-md border border-bdr bg-wh px-2 text-[12px] text-txt';

function buildHref(
  base: Record<string, string | undefined>,
  patch: Record<string, string | undefined>
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) {
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/logs?${qs}` : '/logs';
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Supabase aninha o FK como objeto (single) ou array — normaliza. */
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function EntryRow({ entry, showTenant }: { entry: AuditEntry; showTenant: boolean }) {
  const nome =
    recordName(entry.table_name, asRecord(entry.new_data)) ??
    recordName(entry.table_name, asRecord(entry.old_data));

  return (
    <tr className="border-b border-bdr last:border-b-0 align-top">
      <td className="py-3 pr-3 text-[11px] text-mut whitespace-nowrap">
        {formatDateTime(entry.created_at)}
      </td>
      <td className="py-3 pr-3 text-[12px]">
        {/* actor_email é um snapshot do momento da ação: continua legível mesmo
            se o usuário for removido depois. Sem ator = mutação sem sessão
            (formulário público) ou rotina de sistema. */}
        <div className="text-txt">{entry.actor_email ?? 'Sistema / formulário público'}</div>
        {showTenant && (
          <div className="text-[11px] text-mut">{entry.tenants?.name ?? '—'}</div>
        )}
      </td>
      <td className="py-3 pr-3 whitespace-nowrap">
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            ACTION_STYLE[entry.action]
          }`}
        >
          {ACTION_LABEL[entry.action]}
        </span>
      </td>
      <td className="py-3 pr-3 text-[12px]">
        <div className="font-semibold text-txt">{tableLabel(entry.table_name)}</div>
        {nome && <div className="text-[11px] text-mut">{nome}</div>}
      </td>
      <td className="py-3 text-[12px]">
        {entry.action === 'update' ? (
          <ChangesList changes={entry.changes} />
        ) : (
          <span className="text-mut italic text-[11px]">
            {entry.action === 'insert' ? 'Registro criado.' : 'Registro excluído.'}
          </span>
        )}
        {entry.contexto && (
          <div className="text-[11px] text-mut mt-1">{entry.contexto}</div>
        )}
      </td>
    </tr>
  );
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const profile = await getCurrentProfile();
  const platformAdmin = isPlatformAdmin(profile);
  // Par tenant-aware em vez do antigo teste da pessoa isolada — aqui aplicado
  // ao PRÓPRIO tenant (byte-equivalente, D-J, sem ida ao banco para este
  // papel) só para reusar um único predicado em todo o guard, em vez de duas
  // formas divergentes convivendo no mesmo arquivo.
  const tenantAdmin = profile ? await isTenantAdminOf(profile, profile.tenantId) : false;
  const staffAdmin = isPswStaff(profile);

  // Empresas ADMINISTRADAS pelo staff-admin (nunca a lista completa de
  // clientes, T-18-60) — só consultada para `psw_staff`, e reusada tanto para
  // o guard (administra ao menos uma?) quanto para o recorte (limitado a
  // estas) e o `ScopeBadge`.
  let staffGrantedTenants: { id: string; name: string }[] = [];
  if (staffAdmin && profile) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('psw_tenant_admins')
      .select('tenant_id, tenants(id, name)')
      .eq('profile_id', profile.id);
    staffGrantedTenants = (data ?? [])
      .map((row) => one(row.tenants as { id: string; name: string } | { id: string; name: string }[] | null))
      .filter((t): t is { id: string; name: string } => t !== null);
  }
  const hasStaffScope = staffAdmin && staffGrantedTenants.length > 0;

  if (!platformAdmin && !tenantAdmin && !hasStaffScope) redirect('/opportunities');

  const raw = await searchParams;
  const periodo = raw.periodo ?? '30';
  const tabela = raw.tabela ?? '';
  const acao = (raw.acao ?? '') as AuditAction | '';
  const ator = raw.ator ?? '';
  // O recorte por empresa era só do super-admin; agora vale também para quem
  // administra MAIS DE UMA empresa (staff-admin com 1 concessão não precisa —
  // a RLS já entrega só aquele tenant, sem ambiguidade a resolver).
  const canFilterByEmpresa = platformAdmin || (staffAdmin && staffGrantedTenants.length > 1);
  const empresaRequested = canFilterByEmpresa ? raw.empresa ?? '' : '';
  // Defesa em profundidade sobre a RLS (mesmo par pessoa × empresa do guard
  // acima, T-18-60): um `?empresa=` de fora da carteira administrada — mesmo
  // que a lista de opções da tela nunca ofereça um valor assim — é ignorado
  // aqui em vez de vazar "encontrado/não encontrado" por diferença de
  // comportamento. `platform_admin`/`tenant_admin` não passam por aqui: a
  // RLS já resolve o alcance deles sem este par.
  const empresa =
    staffAdmin && empresaRequested && !(await isTenantAdminOf(profile, empresaRequested))
      ? ''
      : empresaRequested;
  const page = Math.max(1, Number(raw.page) || 1);

  const current = { periodo, tabela, acao, ator, empresa };

  const [{ entries, total }, tenantOptions] = await Promise.all([
    fetchAuditLog({
      dias: periodo === 'tudo' ? null : Number(periodo) || 30,
      tableName: tabela || null,
      action: acao || null,
      ator: ator || null,
      tenantId: empresa || null,
      page,
    }),
    platformAdmin ? fetchAuditTenants() : Promise.resolve(staffGrantedTenants),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));

  // Mistura de empresas só é possível quando há mais de uma administrada e
  // nenhuma selecionada — nesse caso, mostrar de qual empresa é cada linha
  // (mesma técnica do `platform_admin`) é o que evita "os dois logs
  // misturados sem como separar" (T-18-18/RESEARCH §6 item 18).
  const showTenant = platformAdmin || (staffAdmin && staffGrantedTenants.length > 1);

  // `ScopeBadge`: só quando há UMA empresa específica em foco — nunca "Agindo
  // em: —" para o conjunto misturado (nesse estado, `showTenant` acima já
  // resolve a separação por linha). Super-admin preserva comportamento atual
  // (SC-12): o marcador não representa "em qual empresa estou agindo" para
  // ele aqui, já que `/logs` é cross-tenant por papel, não por seletor.
  const multipleCompanies = staffAdmin && staffGrantedTenants.length > 1;
  const scopeTenantName = multipleCompanies
    ? (staffGrantedTenants.find((t) => t.id === empresa)?.name ?? null)
    : staffAdmin && staffGrantedTenants.length === 1
      ? staffGrantedTenants[0].name
      : null;

  const subtitulo = platformAdmin
    ? ' na plataforma'
    : staffAdmin
      ? ' nas empresas que você administra'
      : ' na sua empresa';

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-txt">Rastreabilidade</h1>
          <p className="text-xs text-mut">
            Tudo que foi criado, editado ou excluído
            {subtitulo} — registro automático e somente leitura.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ScopeBadge tenantName={scopeTenantName} multiple={multipleCompanies} />
          <Link
            href="/opportunities"
            className="text-xs font-semibold text-pri hover:underline"
          >
            ← Voltar
          </Link>
        </div>
      </div>

      {/* Form GET puro: os filtros viram query string e a página é um Server
          Component do começo ao fim — nenhum JS de cliente para filtrar. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-lg border border-bdr bg-wh p-3"
      >
        <select name="periodo" defaultValue={periodo} className={SELECT_CLASS}>
          {PERIODOS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        <select name="tabela" defaultValue={tabela} className={SELECT_CLASS}>
          <option value="">Todos os registros</option>
          {Object.entries(TABLE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select name="acao" defaultValue={acao} className={SELECT_CLASS}>
          <option value="">Todas as ações</option>
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>

        {canFilterByEmpresa && (
          <select name="empresa" defaultValue={empresa} className={SELECT_CLASS}>
            <option value="">Todas as empresas</option>
            {tenantOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}

        <input
          type="search"
          name="ator"
          defaultValue={ator}
          placeholder="E-mail do usuário"
          className="h-8 w-52 rounded-md border border-bdr bg-wh px-2 text-[12px] text-txt placeholder:text-mut"
        />

        <button
          type="submit"
          className="h-8 rounded-md bg-pri px-3 text-[12px] font-semibold text-white hover:opacity-90"
        >
          Filtrar
        </button>
        <Link
          href="/logs"
          className="h-8 leading-8 px-2 text-[12px] font-medium text-mut hover:underline"
        >
          Limpar
        </Link>
      </form>

      <div className="rounded-lg border border-bdr bg-wh overflow-x-auto">
        {entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-mut italic">
            Nenhum registro no período e filtros selecionados.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-mut border-b border-bdr">
                <th className="px-4 py-2 whitespace-nowrap">Data/Hora</th>
                <th className="py-2 pr-3">Usuário</th>
                <th className="py-2 pr-3">Ação</th>
                <th className="py-2 pr-3">Registro</th>
                <th className="py-2 pr-4">Alteração (de → para)</th>
              </tr>
            </thead>
            <tbody className="[&>tr>td:first-child]:pl-4 [&>tr>td:last-child]:pr-4">
              {entries.map((e) => (
                <EntryRow key={e.id} entry={e} showTenant={showTenant} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-[12px] text-mut">
          <span>
            {total} registro(s) — página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildHref(current, { page: String(page - 1) })}
                className="font-semibold text-pri hover:underline"
              >
                ← Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildHref(current, { page: String(page + 1) })}
                className="font-semibold text-pri hover:underline"
              >
                Próxima →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
