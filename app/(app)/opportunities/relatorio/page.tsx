import {
  fetchOpportunities,
  fetchPhasesForOpportunities,
  fetchRisksForOpportunities,
} from '@/lib/opportunities/queries';
import { resolveEmpresaSlug } from '@/lib/tenants/scope';
import { fetchTenantIdBySlug } from '@/lib/tenants/queries';
import { getCurrentProfile, isPlatformAdmin, isPswStaff } from '@/lib/security/role';
import { Relatorio } from '@/components/opportunities/relatorio/relatorio';
import type { OpportunityListItem } from '@/lib/opportunities/types';

export const metadata = {
  title: 'Relatórios',
};

type SearchParams = Promise<Record<string, string | undefined>>;

// =============================================================================
// /opportunities/relatorio — visão estratégica do portfólio.
//
// Rota PRÓPRIA desde 2026-09-09 (antes era `/opportunities?view=relatorio`, um
// branch dentro da listagem). O relatório nunca foi uma "view" da lista: ele
// ignora os filtros da toolbar de propósito (D-01a — agrega o portfólio
// INTEIRO) e tem o seu próprio filtro de área. Como rota separada, o único
// recorte que ele carrega na URL é `?empresa=<slug>`, o mesmo do seletor da
// barra lateral.
// =============================================================================
export default async function RelatorioPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') sp.set(k, v);
  }

  // Mesma resolução de empresa da listagem: a URL carrega o SLUG
  // (?empresa=fgcoop), nunca o UUID, e só platform_admin/psw_staff podem
  // recortar por empresa (para os demais o parâmetro é ignorado — a RLS
  // bloquearia de qualquer forma).
  const profile = await getCurrentProfile();
  const isAdmin = isPlatformAdmin(profile);
  const isStaff = isPswStaff(profile);
  const empresaSlug =
    isAdmin || isStaff ? await resolveEmpresaSlug(sp) : undefined;
  const scopedTenantId = empresaSlug
    ? (await fetchTenantIdBySlug(empresaSlug)) ?? undefined
    : undefined;
  // Slug informado mas não resolvido = empresa inexistente (ou sem acesso).
  const empresaNotFound = !!empresaSlug && !scopedTenantId;

  // D-01a: o Relatório agrega o portfólio INTEIRO do tenant (ou da empresa
  // selecionada pelo admin) — preserva o recorte de empresa e ignora qualquer
  // outro filtro.
  const portfolio: OpportunityListItem[] = empresaNotFound
    ? []
    : await fetchOpportunities(scopedTenantId ? { tenant: scopedTenantId } : {});

  // Fases (cycle time) + riscos (painel de riscos) do MESMO recorte.
  const ids = portfolio.map((o) => o.id);
  const [phases, risks] = await Promise.all([
    fetchPhasesForOpportunities(ids),
    fetchRisksForOpportunities(ids),
  ]);

  return (
    <div className="px-6 lg:px-8 py-6 flex flex-col gap-6">
      <header>
        <h1 className="text-[26px] font-bold text-txt tracking-tight">
          Relatórios
        </h1>
        <p className="text-[13px] text-mut mt-0.5">
          Visão estratégica do portfólio — valor, priorização, esteira e riscos
        </p>
      </header>

      <div>
        {empresaNotFound ? (
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
          <Relatorio
            opportunities={portfolio}
            phases={phases}
            risks={risks}
            // Tenant de lotação — já vem no profile (mesma origem que o antigo
            // `getCurrentTenant()`, sem a segunda ida ao Auth + `profiles`).
            sourceLabel={profile?.tenantName ?? null}
          />
        )}
      </div>
    </div>
  );
}
