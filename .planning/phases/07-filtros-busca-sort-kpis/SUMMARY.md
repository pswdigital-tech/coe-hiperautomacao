---
phase: 07-filtros-busca-sort-kpis
status: complete
completed_at: 2026-05-21
plans_completed: 3
---

# Phase 7 — Filtros + Busca + Sort + KPIs reativos · SUMMARY

## Goal atingido

Toolbar tem paridade funcional total com o mockup: busca livre, 5 dropdowns (Fonte/Área/Ferramenta/Prioridade/Status), sort por dropdown + click no header, botão Limpar, KPIs reativos. Estado vive na URL → shareable + refresh-safe.

## Plans entregues

| Plan | Entrega | Status |
|---|---|---|
| **07-01** filters.ts + Toolbar UI | URL state management + 5 dropdowns + busca debounced | ✅ |
| **07-02** Fetch com filters + KPIs reativos | `fetchOpportunities(filters)` + `fetchAreas()` + page.tsx parsing | ✅ |
| **07-03** Sort interativo nos headers | Headers clicáveis com seta direcional | ✅ aprovado |

## Estrutura resultante

```
lib/opportunities/
├── filters.ts         ← NEW: OpportunityFilters, parseFilters, buildQuery, SortKey, SORT_LABELS
├── queries.ts         ← fetchOpportunities aceita filters; + fetchAreas()
└── ...

components/opportunities/
├── toolbar.tsx        ← Redesenhada com 2 linhas + 5 dropdowns + busca + sort + Limpar
└── table.tsx          ← 'use client'; headers ordenáveis com seta
```

## Must-haves verificados

- ✅ Busca livre (200ms debounce) filtra solicitante/processo/area
- ✅ 5 dropdowns filtram com AND
- ✅ Sort dropdown + click no header sincronizados via URL
- ✅ Seta ↑/↓ indica direção no header ativo
- ✅ KPI bar recalcula automaticamente sobre subset filtrado
- ✅ "↺ Limpar" zera tudo (preserva ?view=)
- ✅ Refresh / compartilhamento de URL preservam estado
- ✅ Cards e Kanban respeitam os mesmos filtros
- ✅ Empty state amigável

## Descobertas técnicas

- **`AutomationTool` e `PriorityLevel` são nullable** na tabela (view herda) → criar `NonNullable<>` aliases pro filtro
- **`.or(ilike)` no Supabase**: sintaxe `col.ilike.%term%,col2.ilike.%term%` separada por vírgula — escape `%` no termo evita match indesejado com wildcards do usuário
- **Sincronizar 2 controles via URL** (header + dropdown sort) é trivial quando a URL é a fonte da verdade — zero state local
- **Tabela como Client Component** não atrapalha SSR — só o `<tr>` interno re-renderiza no client; dados continuam vindo do server

## Pendências carregadas

Nenhuma — toolbar do mockup 100% replicada.

## Próximo

**Phase 8 — Polish + Deploy**. Loading states, error boundaries, mobile responsive, deploy Vercel + smoke test em produção. **Última fase do MVP.**
