# Phase 14: View "Relatório" - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Entrega uma **nova view analítica "📈 Relatório"**, selecionável pelo seletor de views da toolbar, que sintetiza o portfólio de oportunidades do tenant em três blocos (espelhando `renderRelatorio()` do mockup):

1. **Cards de portfólio** — Total de oportunidades, FTE Total/mês, Prioridade Alta, Prioridade Média, RPA Ideal, RPA + n8n, nº de Áreas.
2. **Distribuição por área de negócio** — lista de barras por área: quantidade de oportunidades (azul) somada ao FTE estimado por área (verde), com badges de QTD e FTE/mês.
3. **Dois donut charts SVG** — "Oportunidades por Área" e "FTE Estimado por Área (h/mês)", com legenda (rótulo + valor + %).

Requisitos: REPORT-01, REPORT-02, REPORT-03, REPORT-04.

**Fora de escopo (novas capacidades = outras fases):** drill-down/clique nos charts, export PDF/CSV, filtros próprios do relatório, séries temporais, comparação entre tenants.

</domain>

<decisions>
## Implementation Decisions

### Escopo dos dados (Filtros × Relatório)
- **D-01:** O Relatório agrega **sempre o portfólio inteiro do tenant**, ignorando os filtros ativos da toolbar (área/busca/sort). Casa com o mockup (`renderRelatorio` usa `DATA`, não a lista filtrada `getList()`) e evita distribuição/pizza degenerada quando um filtro de área única está ligado.
- **D-01a (consequência):** O `page.tsx` deve buscar o conjunto **completo** de oportunidades quando `view==='relatorio'` (ex.: `fetchOpportunities` sem filtros), em vez de reusar a `opportunities[]` filtrada que alimenta table/cards/kanban. A query continua escopada por tenant via RLS — "portfólio inteiro" = todo o tenant, nunca cross-tenant.

### Charts (donut SVG)
- **D-02:** **Portar `svgPie`/`pieCard`** do mockup ([_giba_wsi-dashboard.html:818-850](../../../_giba_wsi-dashboard.html#L818-L850)) como componente(s) SVG próprio(s). **Zero dependências novas** — não adicionar recharts/visx/d3. Honra SC4 ("dois pie charts SVG") e o princípio "o mockup é o contrato visual".
- **D-02a:** Reusar a `PALETTE` de 18 cores do mockup ([_giba:817](../../../_giba_wsi-dashboard.html#L817)) ciclando por índice de área, para que barras, legendas e donuts usem a mesma cor por área (consistência visual entre os 3 blocos).

### Renderização
- **D-03:** O componente Relatório é um **Server Component** (read-only, sem interação). Agrega no servidor e renderiza HTML + SVG estático. Casa com "Server Components por padrão" e com o `page.tsx` que já renderiza condicionalmente por `?view=`. A toolbar (troca de view) permanece o client component existente que atualiza o URL param.

### Estados de borda
- **D-04:** Donuts mostram **"Sem dados"** quando `total=0` (comportamento já existente em `svgPie`). Áreas com FTE 0 aparecem com barra de largura mínima (não somem).
- **D-04a:** Adicionar um **empty state dedicado** (mensagem pt-BR amigável) quando o tenant tem **0 oportunidades** no total, em vez de renderizar seções/cards zerados.

### Agregação (regras do mockup a replicar)
- **D-05:** Agrupar por `area` (trim; fallback **"Sem Área"**). Ordenar áreas por **contagem desc**. `maxC`/`maxF` definem a largura relativa das barras.
- **D-06:** Contagens de prioridade usam **`calcScore`** ([lib/opportunities/score.ts](../../../lib/opportunities/score.ts)): Alta ≥70, Média 40–69 (Baixa <40 não é card, mas pode ser derivado). **Score nunca persistido** — sempre calculado. *(Nota: a view `opportunities_with_score` já expõe `score`/`priority_level`; o planner pode usar a coluna computada em vez de recalcular no cliente, desde que o resultado seja idêntico à fórmula de `score.ts`.)*
- **D-07:** "RPA Ideal" = `rpa_score >= 5`; "RPA + n8n" = `rpa_score >= 3 && < 5` (consistente com `rpaTier` em [lib/opportunities/cells.ts](../../../lib/opportunities/cells.ts)).
- **D-08:** FTE por área = soma de `fte_horas` (nullable → tratar como 0). "FTE Total/mês" = soma global arredondada.

### Executor's Discretion
- Decomposição em subcomponentes (ex.: `relatorio.tsx` + `PieCard`/`AreaBar`) — escolha do planner.
- Markup/Tailwind exato das seções, desde que reproduza a estrutura visual do mockup (`.rel-section`, grid de KPIs, `charts-row` 2 colunas) com paridade antes de qualquer melhoria.
- Comportamento responsivo (mobile) — seguir o padrão das views existentes; o mockup é desktop-grid.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contrato visual + lógica de agregação (fonte da verdade)
- `_giba_wsi-dashboard.html` §853-929 — `renderRelatorio()`: estrutura completa da view (7 KPIs, barras por área, 2 donuts, rodapé de totais). **Replicar.**
- `_giba_wsi-dashboard.html` §816-850 — `PALETTE`, `svgPie(slices,size)` (donut com raio interno = donut, large-arc flag, "Sem dados" em total=0) e `pieCard(slices,title,valFmt)` (SVG + legenda). **Portar.**
- `_giba_wsi-dashboard.html` §275-286 — CSS `.rel-section` / `.charts-row` / `.pie-*` (referência de espaçamento/tipografia).
- `_giba_wsi-dashboard.html` §338, §378-379, §812 — wiring do seletor de view (`setView('relatorio')`, `#view-relatorio`, dispatch).

### Código existente a reusar/estender
- `components/opportunities/toolbar.tsx` §22-26, §103-109 — array `VIEWS` + `parseView()`; adicionar `{ id:'relatorio', icon:'📈', label:'Relatório' }` e o tipo `View`.
- `app/(app)/opportunities/page.tsx` §49-55 — render condicional por view; adicionar branch `relatorio` (e busca não-filtrada — D-01a).
- `lib/opportunities/queries.ts` — `fetchOpportunities(filters)` (view `opportunities_with_score`) e `computeKpis(opportunities[])` (padrão de agregação de KPIs).
- `lib/opportunities/types.ts` §7, §54-77 — type `Opportunity` (Row da view) e `OpportunityKpis`.
- `lib/opportunities/score.ts` — `calcScore`, `priorityLevel` (Alta/Média/Baixa).
- `lib/opportunities/cells.ts` §28-32 — `rpaTier` (Ideal ≥5 / RPA+n8n ≥3).
- `components/opportunities/kpi-bar.tsx` — `KpiBar` / `KpiCell` (padrão de card de KPI a reusar nos cards de portfólio).

### Projeto
- `docs/PROJETO.md` — princípio "o mockup é o contrato visual"; "score calculado, nunca persistido"; idioma (UI pt-BR / código inglês); RLS multi-tenant.
- `.planning/ROADMAP.md` §234-244 — Goal + 4 Success Criteria da Phase 14.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `KpiBar`/`KpiCell` (`components/opportunities/kpi-bar.tsx`) — padrão `bg-white border-bdr` + valor/label com cor; base dos 7 cards de portfólio.
- `fetchOpportunities` + `computeKpis` (`lib/opportunities/queries.ts`) — query escopada por tenant (view `opportunities_with_score`) e agregação server-side; `computeKpis` pode ser aplicado ao conjunto completo e por grupo de área.
- `calcScore`/`priorityLevel` (`lib/opportunities/score.ts`), `rpaTier` (`lib/opportunities/cells.ts`) — derivações de prioridade e RPA já implementadas e consistentes com o mockup.
- Type `Opportunity` (`lib/opportunities/types.ts`) já traz `score`, `priority_level`, `fte_horas`, `rpa_score`, `area`, `ferramenta` — nenhuma coluna nova precisa ser buscada.

### Established Patterns
- Views recebem `opportunities: Opportunity[]` por prop de Server Component (`page.tsx`); zero fetch no cliente. Relatório segue o mesmo, mas com o conjunto **completo** (D-01a).
- Troca de view via URL `?view=` (toolbar client component) + render condicional no `page.tsx` (server). Relatório = Server Component encaixa sem novo wiring de estado.
- Tailwind v4 (`@theme` em `app/globals.css`) + CSS custom; **sem shadcn/ui**. Cores via tokens `--color-pri/acc/bdr/mut`. Sem biblioteca de charts no projeto (D-02 confirma: não adicionar).

### Integration Points
- `components/opportunities/toolbar.tsx` — registrar a nova view no array `VIEWS` + tipo `View` + `parseView`.
- `app/(app)/opportunities/page.tsx` — branch de render `relatorio` + busca não-filtrada do portfólio.
- Novo componente: `components/opportunities/relatorio.tsx` (Server Component) + helper(s) de pie SVG portados do mockup.

</code_context>

<specifics>
## Specific Ideas

- Donut (não pizza cheia): `svgPie` usa raio interno `ri = size*0.22` sobre raio externo `R = size*0.4` → anel. Manter o look de donut.
- Mesma cor por área nos 3 blocos (barras, legenda dos donuts, fatias) via índice na `PALETTE`.
- Rodapé da seção de distribuição: "Total: N oportunidades em M áreas · FTE Total: Xh/mês" (replicar).
- Ícones/títulos pt-BR exatos do mockup: "📊 Resumo do Portfólio", "📊 Distribuição por Área de Negócio — Oportunidades & FTE Estimado", "🔵 Oportunidades por Área", "⏱️ FTE Estimado por Área (h/mês)". O badge de fonte no topo é "📋 Workshop I · Unidasul" no mockup — usar rótulo real do tenant/fonte, não hardcode.

</specifics>

<deferred>
## Deferred Ideas

- **Interatividade nos charts** (hover/tooltip, clique para drill-down por área) — exigiria Client Component; fora do escopo read-only desta fase. Futuro.
- **Export do relatório** (PDF/CSV/imagem) — nova capacidade, fase própria.
- **Filtros próprios do relatório** (período, status, ferramenta) — conflita com D-01 (portfólio inteiro); avaliar como fase futura se houver demanda.

None pendente além dessas — a discussão ficou dentro do escopo da fase.

</deferred>

---

*Phase: 14-relatorio*
*Context gathered: 2026-06-05*
