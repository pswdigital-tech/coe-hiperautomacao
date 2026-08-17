---
phase: 14-relatorio
plan: 02
subsystem: frontend
tags: [relatorio, toolbar, view-switcher, page, portfolio-fetch, rls, wiring]

# Dependency graph
requires:
  - phase: 14-relatorio
    plan: 01
    provides: "components/opportunities/relatorio/relatorio.tsx Relatorio({ opportunities, sourceLabel })"
  - phase: 04-migracao-visual-mockup
    provides: "components/opportunities/toolbar.tsx (VIEWS/View/parseView/changeView), app/(app)/opportunities/page.tsx (fetch + render condicional)"
provides:
  - "View '📈 Relatório' selecionável no seletor da toolbar (?view=relatorio)"
  - "page.tsx renderiza <Relatorio> com o portfólio inteiro do tenant (fetch não-filtrado, RLS-scoped) e tenant.name como sourceLabel"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "View que ignora os filtros da toolbar: fetch dedicado SEM filtros condicionado a isReport, em paralelo no Promise.all — a lista filtrada das demais views permanece intacta (D-01a)"
    - "Escopo de tenant 100% via RLS no fetch (sem .eq('tenant_id') manual no app) — 'portfólio inteiro' = todo o tenant logado, nunca cross-tenant"

key-files:
  created: []
  modified:
    - components/opportunities/toolbar.tsx
    - app/(app)/opportunities/page.tsx

# Requirements
requirements: [REPORT-01]

commits:
  - 93f563c feat(14-02): registra view 'relatorio' na toolbar (📈 Relatório)
  - a8c9619 feat(14-02): branch de render 'relatorio' + fetch não-filtrado do portfólio
---

# Plan 14-02 — Wiring da view "Relatório"

## O que foi construído

Conecta a view Relatório (núcleo do Plan 14-01) ao app.

1. **`components/opportunities/toolbar.tsx`** — `type View` estendido para incluir
   `'relatorio'`; entrada `{ id: 'relatorio', icon: '📈', label: 'Relatório' }`
   adicionada ao array `VIEWS` (4º botão do seletor); `parseView` reconhece
   `'relatorio'`. `changeView` intocado (já seta `?view=v` para `v !== 'table'`).
   Os filtros permanecem visíveis na view Relatório (paridade com as demais views;
   é o `page.tsx` que ignora os filtros — D-01a).

2. **`app/(app)/opportunities/page.tsx`** — flag `isReport = view === 'relatorio'`;
   `fullPortfolio` buscado em paralelo no `Promise.all` via `fetchOpportunities()`
   **sem filtros** (apenas quando `isReport`, senão `[]`), garantindo o portfólio
   completo do tenant (D-01a) sem reusar a lista filtrada. Branch de render adicionado
   ANTES dos demais: `<Relatorio opportunities={fullPortfolio} sourceLabel={tenant?.name ?? null} />`.
   `KpiBar`/`Toolbar`/table/cards/kanban inalterados (continuam refletindo o filtro).

## Verificação

- `npx tsc --noEmit` → exit 0, 0 erros.
- Suite completa: **151 passed / 32 skipped / 0 failed** — sem regressão vs baseline P13.
- Acceptance criteria das 2 tasks passam: VIEWS contém `id: 'relatorio'` + label/ícone;
  `parseView` reconhece; `type View` estendido; `page.tsx` importa/renderiza
  `Relatorio`, faz `fetchOpportunities()` sem filtros, passa `tenant?.name` como
  `sourceLabel`, e **não contém `tenant_id` manual** (escopo via RLS — T-14-04).

## Desvios

Nenhum desvio de lógica. Ajuste cosmético: comentário do fetch reescrito para não
conter o literal `tenant_id` (o acceptance criterion `grep -qi "tenant_id"` é
literal e proíbe o token, para garantir que nenhum filtro cross-tenant manual seja
introduzido — o escopo é 100% RLS).

## Threat model (T-14-04)

O fetch não-filtrado retira apenas os `.eq`/`.or` de busca/área/sort; **não** altera
o escopo de tenant — `fetchOpportunities` consulta `opportunities_with_score`, cujo
RLS filtra pelo tenant corrente derivado de `auth.uid()`. Nenhum `tenant_id` é
passado pelo app. "Portfólio inteiro" = todo o tenant logado, jamais outro tenant.

## Self-Check: PASSED
