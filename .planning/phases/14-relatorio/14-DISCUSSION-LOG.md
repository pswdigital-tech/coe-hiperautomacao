# Phase 14: View "Relatório" - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisões estão em CONTEXT.md — este log preserva as alternativas consideradas.

**Date:** 2026-06-05
**Phase:** 14-relatorio
**Areas discussed:** Filtros × Relatório, Charts (SVG vs lib), Server vs Client, Estados de borda

---

## Filtros × Relatório

| Option | Description | Selected |
|--------|-------------|----------|
| Portfólio inteiro (mockup) | Sempre agrega TODAS as oportunidades do tenant, ignora filtros da toolbar | ✓ |
| Reflete filtros da toolbar | Agrega só a lista filtrada (área/busca/sort ativos) | |

**User's choice:** Portfólio inteiro (mockup)
**Notes:** Consequência derivada registrada como D-01a — `page.tsx` busca o conjunto completo (`fetchOpportunities` sem filtros) quando `view==='relatorio'`. Escopo tenant via RLS mantido.

---

## Charts: SVG vs lib

| Option | Description | Selected |
|--------|-------------|----------|
| Portar svgPie do mockup | Reimplementar svgPie/pieCard como SVG. Zero deps, casa com SC4 'pie charts SVG' | ✓ |
| Adicionar recharts | Instalar recharts + <PieChart>. Nova dependência, diverge do contrato | |

**User's choice:** Portar svgPie do mockup
**Notes:** Reusar PALETTE de 18 cores ciclando por índice de área (D-02a) p/ cor consistente entre barras/legenda/fatias.

---

## Server vs Client

| Option | Description | Selected |
|--------|-------------|----------|
| Server Component | Read-only → agrega no servidor, renderiza HTML/SVG estático | ✓ |
| Client Component | Agrega no cliente a partir de Opportunity[] (como o mockup) | |

**User's choice:** Server Component
**Notes:** Toolbar (troca de view) permanece o client component existente que atualiza `?view=`.

---

## Estados de borda

| Option | Description | Selected |
|--------|-------------|----------|
| Mockup + empty state dedicado | 'Sem dados' nos donuts (total=0) + mensagem amigável p/ tenant sem oportunidades; área FTE 0 com barra mínima | ✓ |
| Só o comportamento do mockup | Apenas 'Sem dados' nos donuts | |

**User's choice:** Mockup + empty state dedicado

---

## Executor's Discretion

- Decomposição em subcomponentes (relatorio.tsx + PieCard/AreaBar).
- Markup/Tailwind exato (paridade com mockup antes de melhorias).
- Comportamento responsivo (mobile) — seguir padrão das views existentes.

## Deferred Ideas

- Interatividade nos charts (hover/tooltip, drill-down) — exigiria Client Component.
- Export do relatório (PDF/CSV/imagem) — fase própria.
- Filtros próprios do relatório — conflita com D-01.
