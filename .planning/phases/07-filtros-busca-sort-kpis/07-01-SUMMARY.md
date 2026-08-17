---
phase: 07-filtros-busca-sort-kpis
plan: 01
status: complete
completed_at: 2026-05-21
---

# 07-01 — filters.ts + Toolbar UI · SUMMARY

## Entregue

| Arquivo | Conteúdo |
|---|---|
| `lib/opportunities/filters.ts` | `OpportunityFilters` type + `SortKey` + `parseFilters(sp)` + `buildQuery(filters, currentSp)` + `SORT_LABELS` + `FILTER_KEYS` |
| `components/opportunities/toolbar.tsx` | Toolbar 2-linhas: action+counts+views (linha 1), busca+5 dropdowns+sort+Limpar (linha 2). Debounce 200ms na busca. Preserva `?view=` em todas as mudanças |

## Decisões

- **`URLSearchParams` como source of truth** — toolbar é stateless, lê tudo da URL
- **Debounce só na busca livre** — dropdowns são síncronos (1 mudança = 1 request)
- **`buildQuery` preserva params alheios** — view não some quando muda filtro
- **`ToolFilter` / `PriorityFilter`** = `NonNullable<>` dos types da view — RLS nunca filtra por null mesmo
- **Botão "Limpar"** aparece condicionalmente quando algum filtro está ativo

## Validação

- `npm run typecheck` ✅
- Toolbar renderiza, debounce funciona, URL atualiza
