'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  buildQuery,
  parseFilters,
  REQUEST_TYPE_OPTIONS,
  SORT_LABELS,
  type OpportunityFilters,
  type SortKey,
} from '@/lib/opportunities/filters';
import { saveListState } from '@/lib/opportunities/filters-storage';
import { STATUS_OPTIONS } from '@/lib/opportunities/status';
import { PRIORITY_OPTIONS } from '@/lib/opportunities/priority-labels';
import {
  assigneeName,
  type AssignableProfile,
} from '@/lib/opportunities/assignee-types';
import { CARGOS, CARGO_LABEL, type Cargo } from '@/lib/security/cargo';
import type { TenantSummary } from '@/lib/tenants/queries';
import type { AutomationToolOption } from '@/lib/opportunities/tools';

type Props = {
  counts: { visible: number; total: number };
  areas: string[];
  /** Pessoas do tenant, para o filtro "Membro" (0032). Vazio = filtro escondido
   *  (ex: seletor de empresa sem nenhuma selecionada). */
  members: AssignableProfile[];
  /** Pessoas atribuídas às oportunidades que NÃO são do tenant (staff PSW).
   *  Entram no mesmo dropdown, num grupo separado — o filtro é o mesmo
   *  `?assignee=<profile.id>`. */
  externalMembers?: AssignableProfile[];
  tenantSlug: string | null;
  /** Mantido por compatibilidade com os callers; sem uso desde a remoção do
   *  botão "Nova Oportunidade" (a criação agora é só pelo formulário público). */
  readOnly?: boolean;
  /** Empresas em que o usuário tem oportunidade atribuída (Phase 17, Plan
   *  17-07) — alimenta o filtro "Empresa". Vazio por padrão: nenhuma mudança
   *  de comportamento para os demais papéis. */
  companies?: TenantSummary[];
  /** Exibe o filtro "Empresa" — flag calculada no servidor a partir do papel
   *  do usuário. Este componente NÃO decide por papel; só lê a flag. */
  showCompanyFilter?: boolean;
  /** 0055 — catálogo de ferramentas visível ao usuário, para o filtro
   *  "Ferramenta". Vazio = o dropdown fica só com "Todas as Ferramentas". */
  tools?: AutomationToolOption[];
  /** Empresa em foco — slug já resolvido no servidor (URL ou cookie), '' para
   *  "Todas as empresas"/usuário sem seletor. Só chave a memória de filtros
   *  por empresa (filters-storage.ts); não afeta o que é buscado/exibido. */
  companyScope?: string;
};

type View = 'table' | 'cards' | 'kanban' | 'gantt' | 'relatorio';

// Rótulos do switcher: Lista · Gestão · Gantt (os ids internos table/kanban/gantt
// permanecem; cards/relatorio ainda existem por URL mas saíram do switcher).
const VIEWS: { id: View; icon: string; label: string }[] = [
  { id: 'table', icon: '☰', label: 'Lista' },
  { id: 'kanban', icon: '📊', label: 'Gestão' },
  { id: 'gantt', icon: '📅', label: 'Gantt' },
];

function parseView(raw: string | null): View {
  if (raw === 'cards' || raw === 'kanban' || raw === 'gantt' || raw === 'relatorio')
    return raw;
  return 'table';
}

export function Toolbar({
  counts,
  areas,
  members,
  externalMembers = [],
  tenantSlug,
  companies = [],
  showCompanyFilter = false,
  tools = [],
  companyScope = '',
}: Props) {
  const [copied, setCopied] = useState(false);

  async function copyPublicLink() {
    if (!tenantSlug) return;
    const url = `${window.location.origin}/r/${tenantSlug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback se clipboard API falhar (ex: contexto não-seguro)
      window.prompt('Copie o link manualmente:', url);
    }
  }
  const router = useRouter();
  const params = useSearchParams();
  const currentView = parseView(params.get('view'));
  const filters = parseFilters(params);

  // Export CSV: mesmo recorte de filtros/empresa que a lista (a route handler
  // relê a mesma query string). `view` não afeta o export, mas é inofensivo.
  const exportHref = (() => {
    const qs = params.toString();
    return qs ? `/opportunities/export?${qs}` : '/opportunities/export';
  })();
  const sortValue: SortKey = filters.sort ?? 'score_desc';

  // ===========================================================================
  // Memória de filtros (view+filtros sobrevivem a "abrir oportunidade → voltar")
  // ===========================================================================
  // Não grava na PRIMEIRA execução se a URL já chegou "crua" (sem querystring):
  // isso normalmente vem de um link de OUTRA página (Equipe, Configurações,
  // Admin...) que aponta para `/opportunities` puro de propósito — gravar
  // apagaria a memória de filtros de quem só estava de passagem por lá. Depois
  // do mount, toda mudança (incl. "Limpar", que também é crua) grava normal.
  const hasMounted = useRef(false);
  useEffect(() => {
    const qs = params.toString();
    const isBare = !qs;
    if (!hasMounted.current) {
      hasMounted.current = true;
      if (isBare) return;
    }
    saveListState(companyScope, isBare ? '/opportunities' : `/opportunities?${qs}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, companyScope]);

  // ===========================================================================
  // Busca livre com debounce 200ms
  // ===========================================================================
  const [searchText, setSearchText] = useState(filters.q ?? '');

  useEffect(() => {
    setSearchText(filters.q ?? '');
  }, [filters.q]);

  useEffect(() => {
    const trimmed = searchText.trim();
    if ((trimmed || undefined) === (filters.q || undefined)) return;
    const sp = new URLSearchParams(params.toString());
    const handle = setTimeout(() => {
      const next: OpportunityFilters = {
        ...filters,
        q: trimmed || undefined,
      };
      const qs = buildQuery(next, sp);
      router.replace(qs ? `/opportunities?${qs}` : '/opportunities');
    }, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  // ===========================================================================
  // Dropdown changes
  // ===========================================================================
  function applyChange(patch: Partial<OpportunityFilters>) {
    const sp = new URLSearchParams(params.toString());
    const next: OpportunityFilters = { ...filters, ...patch };
    (Object.keys(patch) as (keyof OpportunityFilters)[]).forEach((k) => {
      if (!patch[k]) delete next[k];
    });
    const qs = buildQuery(next, sp);
    router.replace(qs ? `/opportunities?${qs}` : '/opportunities');
  }

  function changeView(v: View) {
    const sp = new URLSearchParams(params.toString());
    if (v === 'table') sp.delete('view');
    else sp.set('view', v);
    const qs = sp.toString();
    router.replace(qs ? `/opportunities?${qs}` : '/opportunities');
  }

  // Filtro "Empresa" (Phase 17, Plan 17-07) — flag `showCompanyFilter`
  // calculada no servidor a partir do papel do usuário. A URL carrega o
  // SLUG legível, nunca o id interno do tenant: o mesmo mecanismo `?empresa=`
  // já usado pelo seletor de empresa existente. Não passa por
  // `applyChange`/`buildQuery` porque `empresa` não é um `OpportunityFilters`
  // lido de `parseFilters` (populado pela page depois de resolver o slug no
  // servidor) — é só um parâmetro de URL que este componente propaga.
  // Esconder o filtro é cosmético: quem impede acesso a outra empresa é a
  // RLS, não esta renderização.
  const companySlug = params.get('empresa') ?? '';
  function changeCompany(slug: string) {
    const sp = new URLSearchParams(params.toString());
    if (slug) sp.set('empresa', slug);
    else sp.delete('empresa');
    const qs = sp.toString();
    router.replace(qs ? `/opportunities?${qs}` : '/opportunities');
  }

  function clearAll() {
    const view = params.get('view');
    setSearchText('');
    router.replace(view ? `/opportunities?view=${view}` : '/opportunities');
  }

  const hasAnyFilter =
    !!filters.q ||
    !!filters.area ||
    !!filters.ferramenta ||
    !!filters.priority ||
    !!filters.priorityTag ||
    !!filters.status ||
    !!filters.dateFrom ||
    !!filters.dateTo ||
    !!filters.assignee ||
    !!filters.cargo ||
    !!filters.requestType ||
    !!companySlug ||
    (filters.sort && filters.sort !== 'score_desc');

  const selectClass =
    'px-2.5 py-1.5 border border-bdr rounded-lg text-[12px] bg-wh text-txt focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/15';

  return (
    // v0.3: linha de busca/ações + views, e abaixo a linha de filtros.
    // Sem barra full-width — vive dentro do conteúdo da página.
    <div className="flex flex-col gap-3">
      {/* Linha 1: busca + ações + view switcher */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mut pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Buscar por nome, processo ou área..."
            className="w-full pl-9 pr-3 py-2 border border-bdr rounded-lg text-[13px] bg-wh text-txt focus:outline-none focus:border-pril focus:ring-2 focus:ring-pril/15"
          />
        </div>

        <a
          href={exportHref}
          title="Exportar oportunidades (com os filtros atuais) em CSV"
          className="px-3 py-2 text-[13px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors border border-bdr bg-wh text-txt hover:bg-bg whitespace-nowrap"
        >
          <span>⬇</span>
          <span className="hidden md:inline">Exportar CSV</span>
        </a>

        {tenantSlug && (
          <button
            type="button"
            onClick={copyPublicLink}
            title="Copiar o link do formulário público para cadastrar uma nova oportunidade — envie para quem vai preencher"
            className={
              'px-3 py-2 text-[13px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors border whitespace-nowrap ' +
              (copied
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700'
                : 'bg-wh text-txt border-bdr hover:bg-bg')
            }
          >
            <span>{copied ? '✓' : '🔗'}</span>
            <span className="hidden md:inline">
              {copied ? 'Link copiado!' : 'Copiar link do formulário'}
            </span>
          </button>
        )}

        {/* Switcher de view, à direita */}
        <div className="ml-auto flex items-center gap-1 bg-bg border border-bdr rounded-lg p-0.5">
          {VIEWS.map((v) => {
            const isActive = v.id === currentView;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => changeView(v.id)}
                title={v.label}
                className={
                  'px-2.5 py-1.5 rounded-md text-[12px] font-semibold transition-colors inline-flex items-center gap-1 whitespace-nowrap ' +
                  (isActive
                    ? 'bg-wh text-txt shadow-sm'
                    : 'text-mut hover:text-txt')
                }
              >
                <span>{v.icon}</span>
                <span className="hidden lg:inline">{v.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Linha 2: filtros + ordenação + limpar + counts */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Filtro "Empresa" (Phase 17, Plan 17-07): escondido sem a flag ou
            com uma única empresa (mesmo precedente do filtro "Membro" acima
            — filtro que não filtra nada só ocupa espaço). */}
        {showCompanyFilter && companies.length > 1 && (
          <select
            value={companySlug}
            onChange={(e) => changeCompany(e.target.value)}
            className={selectClass}
            aria-label="Filtrar por empresa"
          >
            <option value="">Todas as empresas</option>
            {companies.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <select
          value={filters.requestType ?? ''}
          onChange={(e) =>
            applyChange({
              requestType:
                (e.target.value as OpportunityFilters['requestType']) || undefined,
            })
          }
          className={selectClass}
          aria-label="Filtrar por tipo de solicitação"
        >
          <option value="">Todos os Tipos</option>
          {REQUEST_TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          value={filters.area ?? ''}
          onChange={(e) => applyChange({ area: e.target.value || undefined })}
          className={selectClass}
          aria-label="Filtrar por área"
        >
          <option value="">Todas as Áreas</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          value={filters.cargo ?? ''}
          onChange={(e) =>
            applyChange({ cargo: (e.target.value as Cargo) || undefined })
          }
          className={selectClass}
          aria-label="Filtrar por papel de quem está atribuído"
        >
          <option value="">Todos os Papéis</option>
          {CARGOS.map((c) => (
            <option key={c} value={c}>
              {CARGO_LABEL[c]}
            </option>
          ))}
        </select>
        {(members.length > 0 || externalMembers.length > 0) && (
          <select
            value={filters.assignee ?? ''}
            onChange={(e) => applyChange({ assignee: e.target.value || undefined })}
            className={selectClass}
            aria-label="Filtrar por membro atribuído"
          >
            <option value="">Todos os Membros</option>
            {externalMembers.length === 0
              ? members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {assigneeName(m)}
                  </option>
                ))
              : [
                  <optgroup key="equipe" label="Equipe">
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {assigneeName(m)}
                      </option>
                    ))}
                  </optgroup>,
                  <optgroup key="externos" label="Atribuídos (PSW / externos)">
                    {externalMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {assigneeName(m)}
                      </option>
                    ))}
                  </optgroup>,
                ]}
          </select>
        )}
        {/* 0055 — opções vêm do catálogo `automation_tools` (o seed global +
            as registradas por este tenant), não mais de uma lista fixa. O
            filtro casa por "contém" no array `ferramentas`. */}
        <select
          value={filters.ferramenta ?? ''}
          onChange={(e) =>
            applyChange({ ferramenta: e.target.value || undefined })
          }
          className={selectClass}
          aria-label="Filtrar por ferramenta"
        >
          <option value="">Todas as Ferramentas</option>
          {tools.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.nome}
            </option>
          ))}
        </select>
        {/* Prioridade CALCULADA — faixa do score. Os rótulos dizem a faixa
            justamente para não se confundir com o filtro da tag manual ao
            lado. */}
        <select
          value={filters.priority ?? ''}
          onChange={(e) =>
            applyChange({
              priority:
                (e.target.value as 'alta' | 'media' | 'baixa') || undefined,
            })
          }
          className={selectClass}
          aria-label="Filtrar pela prioridade calculada (faixa de score)"
        >
          <option value="">Score: todas as faixas</option>
          <option value="alta">Score alto (≥ 70)</option>
          <option value="media">Score médio (40–69)</option>
          <option value="baixa">Score baixo (&lt; 40)</option>
        </select>
        {/* Tag MANUAL (0050) — independente da faixa de score acima; os dois
            podem ser combinados. "Sem prioridade" é a fila de quem ainda não
            foi classificado. */}
        <select
          value={filters.priorityTag ?? ''}
          onChange={(e) =>
            applyChange({
              priorityTag:
                (e.target.value as OpportunityFilters['priorityTag']) ||
                undefined,
            })
          }
          className={selectClass}
          aria-label="Filtrar pela prioridade definida manualmente"
        >
          <option value="">Todas as Prioridades</option>
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.icon} {p.label}
            </option>
          ))}
          <option value="sem">— Sem prioridade definida</option>
        </select>
        <select
          value={filters.status ?? ''}
          onChange={(e) =>
            applyChange({
              status: (e.target.value || undefined) as OpportunityFilters['status'],
            })
          }
          className={selectClass}
          aria-label="Filtrar por status"
        >
          <option value="">Todos os Status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {/* Range de data de criação (created_at) */}
        <div className="flex items-center gap-1.5 border border-bdr rounded-lg px-2 py-1 bg-wh">
          <span className="text-[11px] font-medium text-mut whitespace-nowrap">
            Criadas:
          </span>
          <input
            type="date"
            value={filters.dateFrom ?? ''}
            max={filters.dateTo || undefined}
            onChange={(e) => applyChange({ dateFrom: e.target.value || undefined })}
            aria-label="Data de criação — de"
            className="text-[12px] bg-transparent text-txt focus:outline-none"
          />
          <span className="text-[11px] text-mut">–</span>
          <input
            type="date"
            value={filters.dateTo ?? ''}
            min={filters.dateFrom || undefined}
            onChange={(e) => applyChange({ dateTo: e.target.value || undefined })}
            aria-label="Data de criação — até"
            className="text-[12px] bg-transparent text-txt focus:outline-none"
          />
        </div>
        {/* Controle segmentado de prioridade (0050) — o MESMO par de modos da
            lista de tarefas, trazido para cá porque era onde a ordenação
            manual estava escondida (só existia como uma opção no dropdown ao
            lado). "Ordem manual" é o único modo em que o arrasto funciona. O
            dropdown continua existindo para os demais critérios (score, FTE,
            nome, área...) e reflete o que estes botões escolhem. */}
        <div className="flex items-center gap-1 bg-bg border border-bdr rounded-lg p-0.5">
          {(
            [
              { key: 'manual_asc' as SortKey, label: '✋ Ordem manual' },
              { key: 'tag_asc' as SortKey, label: '🔺 Prioridade' },
            ]
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => applyChange({ sort: opt.key })}
              aria-pressed={sortValue === opt.key}
              title={
                opt.key === 'manual_asc'
                  ? 'Ordenar pela ordem que você montou — libera o arrasto'
                  : 'Ordenar pela prioridade definida manualmente (Alta → Baixa)'
              }
              className={
                'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ' +
                (sortValue === opt.key
                  ? 'bg-wh text-txt shadow-sm'
                  : 'text-mut hover:text-txt')
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
        <select
          value={sortValue}
          onChange={(e) => applyChange({ sort: e.target.value as SortKey })}
          className={selectClass}
          aria-label="Ordenação"
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABELS[k]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={clearAll}
          disabled={!hasAnyFilter}
          className="px-2.5 py-1.5 bg-wh border border-bdr hover:bg-bg text-txt text-[12px] font-semibold rounded-lg whitespace-nowrap disabled:opacity-40 disabled:hover:bg-wh disabled:cursor-default"
        >
          ↺ Limpar
        </button>

        <span className="ml-auto text-[12px] text-mut whitespace-nowrap">
          {counts.visible} de {counts.total} oportunidades
        </span>
      </div>
    </div>
  );
}
