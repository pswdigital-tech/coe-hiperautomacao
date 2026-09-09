import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import {
  fetchOpportunities,
  fetchAreas,
  computeKpis,
  fetchPhasesForOpportunities,
  fetchTasksForOpportunities,
} from '@/lib/opportunities/queries';
import { parseFilters } from '@/lib/opportunities/filters';
import {
  fetchAssigneesForOpportunities,
  fetchAssignableProfiles,
  fetchAllAssignableProfiles,
  fetchAssignedProfiles,
} from '@/lib/opportunities/assignees';
import {
  assigneeName,
  type Assignee,
  type AssignableProfile,
} from '@/lib/opportunities/assignee-types';
import { resolveEmpresaSlug } from '@/lib/tenants/scope';
import {
  fetchTenantIdBySlug,
  fetchTenantsByIds,
  type TenantSummary,
} from '@/lib/tenants/queries';
import {
  fetchAllEventOptions,
  fetchEventOptions,
  resolveEventIdsBySlug,
} from '@/lib/events/queries';
import type { EventFilterOption } from '@/components/opportunities/toolbar';
import {
  getCurrentProfile,
  isPlatformAdmin,
  isPswStaff,
} from '@/lib/security/role';
import { KpiBar } from '@/components/opportunities/kpi-bar';
import { Toolbar } from '@/components/opportunities/toolbar';
import { listAutomationTools } from '@/lib/opportunities/tools-actions';
import { OpportunityTable } from '@/components/opportunities/table';
import { OpportunityCards } from '@/components/opportunities/cards';
import { KanbanBoard } from '@/components/opportunities/kanban/Board';
import { GanttChart } from '@/components/opportunities/gantt/GanttChart';
import {
  ListSkeleton,
  ToolbarSkeleton,
} from '@/components/opportunities/skeletons';
import type { OpportunityListItem } from '@/lib/opportunities/types';
import type { EventOption } from '@/lib/events/types';

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') sp.set(k, v);
  }

  const filters = parseFilters(sp);
  const view = sp.get('view');

  // O Relatório saiu da listagem e virou rota própria (/opportunities/relatorio).
  // Este redirect existe só pelos links antigos (favoritos, memória de filtros
  // no sessionStorage): preserva o recorte de empresa e descarta o resto, que
  // o relatório ignora de propósito.
  if (view === 'relatorio') {
    const empresa = sp.get('empresa')?.trim();
    redirect(
      empresa
        ? `/opportunities/relatorio?empresa=${encodeURIComponent(empresa)}`
        : '/opportunities/relatorio',
    );
  }

  // Seletor de empresa (platform_admin) / filtro de empresa (psw_staff, Phase
  // 17 Plan 17-07, D-03): a URL carrega o SLUG (?empresa=fgcoop), nunca o
  // UUID. Resolve para tenant_id server-side — e só tentamos resolver se o
  // usuário corrente for platform_admin OU psw_staff (para os demais papéis,
  // ?empresa= é ignorado; a RLS bloquearia de qualquer forma, mas evitamos o
  // round-trip e uma mensagem de "empresa não encontrada" que não faz
  // sentido pra eles — a listagem deles é sempre um único tenant).
  const profile = await getCurrentProfile();
  const isAdmin = isPlatformAdmin(profile);
  const isStaff = isPswStaff(profile);
  // A URL manda; o cookie do seletor cobre as navegações que perdem a query.
  const empresaSlug =
    isAdmin || isStaff ? await resolveEmpresaSlug(sp) : undefined;
  const scopedTenantId = empresaSlug
    ? (await fetchTenantIdBySlug(empresaSlug)) ?? undefined
    : undefined;
  // Slug informado mas não resolvido = empresa inexistente (ou sem acesso).
  // NÃO cair silenciosamente em "Todas" — sinaliza o erro explicitamente.
  const empresaNotFound = !!empresaSlug && !scopedTenantId;

  // Filtro de evento (0066): `?evento=<slug>` — slug legível na URL, resolvido
  // aqui para ids (mesma disciplina de `?empresa=`). O slug é único POR
  // empresa, então a resolução usa a empresa em foco: a selecionada (PSW) ou
  // a do próprio usuário (papéis de cliente). Sem empresa em foco (super-admin
  // em "Todas"), o mesmo slug pode casar em várias — todas entram. Vazio =
  // não encontrado → sinaliza, nunca cai em "todos os eventos".
  const eventoSlug = sp.get('evento')?.trim() || undefined;
  const eventTenantId =
    scopedTenantId ?? (isAdmin || isStaff ? undefined : profile?.tenantId);
  const eventIds =
    eventoSlug && !empresaNotFound
      ? await resolveEventIdsBySlug(eventoSlug, eventTenantId)
      : undefined;
  const eventoNotFound = !!eventoSlug && !!eventIds && eventIds.length === 0;
  const listFilters = { ...filters, tenant: scopedTenantId, event: eventIds };

  // `viewer` é somente-leitura (role.ts) — decidido pelo profile já em mãos,
  // sem a segunda ida ao Auth + `profiles` que `isReadOnlyViewer()` custava.
  const readOnly = profile?.role === 'viewer';

  // Coluna/filtro "Empresa" (Phase 17, Plan 17-07, D-03/D-06) — SOMENTE para
  // psw_staff: sua listagem é unificada cross-tenant e, sem o rótulo da
  // empresa, ele veria demandas de clientes diferentes misturadas sem saber
  // de quem é cada uma. Para os demais papéis nada disto roda (nenhuma query
  // extra, flag falsa, markup idêntico ao de hoje).
  //
  // A COLUNA vale também para o platform_admin (sua listagem em "Todas as
  // empresas" é igualmente cross-tenant); o FILTRO da toolbar continua só do
  // psw_staff, porque o admin já escolhe a empresa pelo seletor global e dois
  // controles concorrentes para o mesmo recorte confundem.
  const showCompany = isStaff || isAdmin;
  const showCompanyFilter = isStaff;

  // Recorte de pessoas do filtro "Membro" (0032): o tenant selecionado; o
  // platform_admin em "Todas as empresas" vê todo mundo (a RLS de 0021
  // permite) para o filtro não sumir da toolbar.
  const membersTenantId =
    scopedTenantId ?? (isAdmin ? undefined : profile?.tenantId);

  // ---------------------------------------------------------------------------
  // Streaming: as consultas são DISPARADAS aqui, em paralelo e sem `await`, e
  // cada seção abaixo espera só o que ela mesma renderiza, dentro do próprio
  // <Suspense>. O header e os esqueletos saem no primeiro chunk da resposta; a
  // toolbar aparece assim que áreas/pessoas/ferramentas chegam; a lista — a
  // consulta pesada, mais as atribuições que dependem dela — chega depois, sem
  // segurar o resto da tela.
  // ---------------------------------------------------------------------------
  const opportunities: Promise<OpportunityListItem[]> =
    empresaNotFound || eventoNotFound
      ? Promise.resolve([])
      : fetchOpportunities(listFilters);
  // Rótulos de empresa para a coluna (staff + admin) e o filtro (só staff). Os
  // ids vêm das oportunidades JÁ retornadas pela RLS — não é um `select`
  // aberto em `tenants` — então nunca revelam empresas fora do escopo.
  const companies: Promise<TenantSummary[]> = showCompany
    ? opportunities.then((list) =>
        fetchTenantsByIds(Array.from(new Set(list.map((o) => o.tenant_id)))),
      )
    : Promise.resolve([]);
  const counts = opportunities.then((list) => ({
    visible: list.length,
    total: list.length,
  }));

  return (
    <div className="px-6 lg:px-8 py-6 flex flex-col gap-6">
      <header>
        <h1 className="text-[26px] font-bold text-txt tracking-tight">
          Oportunidades
        </h1>
        <p className="text-[13px] text-mut mt-0.5">
          Gerencie e acompanhe todas as oportunidades de automação
        </p>
      </header>

      <Suspense fallback={<ToolbarSkeleton />}>
        <ToolbarSection
          scopedTenantId={scopedTenantId}
          membersTenantId={membersTenantId}
          // Super-admin em "Todas as empresas": o filtro "Evento" lista os
          // eventos de TODAS as empresas, agrupados por empresa.
          crossTenantEvents={isAdmin && !scopedTenantId}
          empresaNotFound={empresaNotFound}
          counts={counts}
          companies={companies}
          showCompanyFilter={showCompanyFilter}
          readOnly={readOnly}
          companyScope={empresaSlug ?? ''}
        />
      </Suspense>

      {eventoNotFound ? (
        <div className="bg-wh border border-bdr rounded-xl p-12 text-center flex flex-col items-center gap-2">
          <h2 className="text-[16px] font-bold text-txt">
            Evento &quot;{eventoSlug}&quot; não encontrado
          </h2>
          <p className="text-[13px] text-mut max-w-sm">
            Este evento não existe na empresa em foco (ou está fora do seu
            acesso). Escolha outro no filtro &quot;Evento&quot; ou limpe os
            filtros.
          </p>
        </div>
      ) : empresaNotFound ? (
        <div className="bg-wh border border-bdr rounded-xl p-12 text-center flex flex-col items-center gap-2">
          <h2 className="text-[16px] font-bold text-txt">
            Empresa &quot;{empresaSlug}&quot; não encontrada
          </h2>
          <p className="text-[13px] text-mut max-w-sm">
            Escolha uma empresa válida no seletor da barra lateral (ou
            &quot;Todas as empresas&quot;).
          </p>
        </div>
      ) : (
        <Suspense fallback={<ListSkeleton />}>
          <ListSection
            opportunities={opportunities}
            companies={companies}
            view={view}
            showCompany={showCompany}
            readOnly={readOnly}
          />
        </Suspense>
      )}
    </div>
  );
}

/**
 * Toolbar: depende só das consultas leves (áreas, pessoas, ferramentas). A
 * contagem e a lista de empresas do filtro chegam como Promise e são lidas
 * DENTRO do Toolbar (React `use`) — assim os filtros aparecem antes de a
 * consulta de oportunidades terminar.
 */
async function ToolbarSection({
  scopedTenantId,
  membersTenantId,
  crossTenantEvents,
  empresaNotFound,
  counts,
  companies,
  showCompanyFilter,
  readOnly,
  companyScope,
}: {
  scopedTenantId: string | undefined;
  membersTenantId: string | undefined;
  crossTenantEvents: boolean;
  empresaNotFound: boolean;
  counts: Promise<{ visible: number; total: number }>;
  companies: Promise<TenantSummary[]>;
  showCompanyFilter: boolean;
  readOnly: boolean;
  companyScope: string;
}) {
  // Pessoas do filtro "Membro" (0032). Além das pessoas DO tenant, o filtro
  // precisa oferecer quem está atribuído às oportunidades sem pertencer a ele
  // (staff PSW, ACCESS-09/D-05): a coluna de atribuídos já mostra essa gente,
  // então não poder filtrar por ela era um buraco. Vêm em lista separada
  // (`externalMembers`) só para a toolbar agrupá-las sob outro rótulo — o
  // valor do filtro é o mesmo `profiles.id`.
  const [areas, tools, tenantMembers, assignedMembers, rawEvents] = await Promise.all([
    fetchAreas(scopedTenantId),
    // 0055 — catálogo de ferramentas para o filtro da toolbar. A RLS já limita
    // ao global + o do tenant do usuário.
    listAutomationTools(),
    membersTenantId
      ? fetchAssignableProfiles(membersTenantId)
      : fetchAllAssignableProfiles(),
    empresaNotFound
      ? Promise.resolve([] as AssignableProfile[])
      : fetchAssignedProfiles(membersTenantId),
    // 0066 — eventos para o filtro "Evento": os da empresa em foco, ou, para
    // o super-admin em "Todas as empresas", os de todas (a RLS decide), que a
    // toolbar agrupa por empresa e, ao escolher, foca a empresa junto.
    empresaNotFound
      ? Promise.resolve([] as EventOption[])
      : membersTenantId
        ? fetchEventOptions(membersTenantId)
        : crossTenantEvents
          ? fetchAllEventOptions()
          : Promise.resolve([] as EventOption[]),
  ]);
  // Em "Todas as empresas" cada opção carrega slug/nome da empresa dona — o
  // slug de evento só é único DENTRO de uma empresa, então o filtro precisa
  // dos dois para não misturar homônimos.
  let events: EventFilterOption[] = rawEvents;
  if (crossTenantEvents && rawEvents.length > 0) {
    const owners = await fetchTenantsByIds(rawEvents.map((e) => e.tenant_id));
    const ownerById = new Map(owners.map((t) => [t.id, t]));
    events = rawEvents.map((e) => {
      const owner = ownerById.get(e.tenant_id);
      return owner ? { ...e, tenantSlug: owner.slug, tenantName: owner.name } : e;
    });
  }
  const tenantMemberIds = new Set(tenantMembers.map((m) => m.id));
  const externalMembers = assignedMembers
    .filter((m) => !tenantMemberIds.has(m.id))
    .sort((a, b) => assigneeName(a).localeCompare(assigneeName(b), 'pt-BR'));

  return (
    <Toolbar
      counts={counts}
      areas={areas}
      members={tenantMembers}
      externalMembers={externalMembers}
      events={events}
      readOnly={readOnly}
      companies={companies}
      showCompanyFilter={showCompanyFilter}
      tools={tools}
      companyScope={companyScope}
    />
  );
}

/**
 * KPIs + a view escolhida (lista/cards/kanban/gantt). Espera a consulta de
 * oportunidades e, só então, o que a view corrente precisa por cima dela.
 */
async function ListSection({
  opportunities: pendingOpportunities,
  companies: pendingCompanies,
  view,
  showCompany,
  readOnly,
}: {
  opportunities: Promise<OpportunityListItem[]>;
  companies: Promise<TenantSummary[]>;
  view: string | null;
  showCompany: boolean;
  readOnly: boolean;
}) {
  const [opportunities, companies] = await Promise.all([
    pendingOpportunities,
    pendingCompanies,
  ]);
  const kpis = computeKpis(opportunities);
  const companyById: Record<string, string> = Object.fromEntries(
    companies.map((t) => [t.id, t.name]),
  );
  const ids = opportunities.map((o) => o.id);

  // Só o que a view corrente renderiza: a coluna de atribuídos (0032) existe
  // apenas na tabela; fases + tarefas (expandir/comprimir de cada linha) só no
  // Gantt. Cards e kanban não pagam nenhuma das duas consultas.
  const isGantt = view === 'gantt';
  const isTable = view !== 'cards' && view !== 'kanban' && !isGantt;
  const assigneesByOpportunity: Record<string, Assignee[]> = isTable
    ? await fetchAssigneesForOpportunities(ids)
    : {};
  const ganttIds = isGantt ? ids : [];
  const [ganttPhases, ganttTasks] = await Promise.all([
    fetchPhasesForOpportunities(ganttIds),
    fetchTasksForOpportunities(ganttIds),
  ]);

  return (
    <>
      <KpiBar kpis={kpis} />

      <div>
        {view === 'cards' ? (
          <OpportunityCards opportunities={opportunities} readOnly={readOnly} />
        ) : view === 'kanban' ? (
          <KanbanBoard opportunities={opportunities} readOnly={readOnly} />
        ) : isGantt ? (
          <GanttChart
            opportunities={opportunities}
            phases={ganttPhases}
            tasks={ganttTasks}
          />
        ) : (
          <OpportunityTable
            opportunities={opportunities}
            assigneesByOpportunity={assigneesByOpportunity}
            companyById={companyById}
            showCompany={showCompany}
            readOnly={readOnly}
          />
        )}
      </div>
    </>
  );
}
