---
phase: 07-filtros-busca-sort-kpis
plan: 02
status: complete
completed_at: 2026-05-21
---

# 07-02 — fetch com filters + KPIs reativos · SUMMARY

## Entregue

| Arquivo | Conteúdo |
|---|---|
| `lib/opportunities/queries.ts` | `fetchOpportunities(filters)` aplica `.eq()` por source/area/ferramenta/priority/status + `.or(ilike)` na busca + sort dinâmico. Novo `fetchAreas()` retorna distinct sorted |
| `app/(app)/opportunities/page.tsx` | Parseia `searchParams` → `filters`; Promise.all com `fetchAreas`; passa `kpis` calculado sobre subset filtrado |

## Decisões

- **Filtros aplicados no banco** (não client-side) — 1 viagem, KPIs naturalmente reativos
- **Busca com `ilike`** + `OR` em 3 colunas (`solicitante`, `processo`, `area`) — case-insensitive
- **Escape de `%`** no termo de busca pra evitar injection-via-wildcard
- **Sort default**: `score_desc` + `seq_id asc` (tiebreaker) — paridade com plan 03-01
- **`fetchAreas` lê `opportunities`** (não a view) — leve, distinct via Set no JS

## Validação

- `npm run typecheck` ✅
- `?source=persona` → 9 itens, KPI Total=9
- `?q=Inez` → matches em solicitante/processo/area
- KPIs reativos automaticamente (computeKpis opera sobre o array já filtrado)
