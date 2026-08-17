---
phase: 03-lista-tabela
status: complete
completed_at: 2026-05-21
plans_completed: 3
---

# Phase 3 — Lista Tabela (read-only) · SUMMARY

## Goal atingido

Usuário logado acessa `/opportunities` e vê as 29 oportunidades reais do FGCoop em tabela com paridade visual ao mockup, com KPI bar reativa no topo. Read-only — sem filtros/sort/modal ainda.

## Plans entregues

| Plan | Goal | Status |
|---|---|---|
| **03-01** Data Layer | `lib/opportunities/{queries,types}.ts` | ✅ |
| **03-02** Cell Components | 7 componentes visuais reutilizáveis | ✅ |
| **03-03** Page + KPI + Tabela | `/opportunities` end-to-end + migração `/dashboard` | ✅ aprovado pelo usuário |

## Estrutura resultante

```
app/(app)/
├── layout.tsx
├── dashboard/page.tsx          ← agora é redirect → /opportunities
├── logout/route.ts
└── opportunities/page.tsx      ← rota principal pós-login

components/opportunities/
├── cells.tsx                   ← 7 componentes visuais
├── kpi-bar.tsx                 ← KPI bar com 17 células
└── table.tsx                   ← tabela 13 colunas

lib/opportunities/
├── queries.ts                  ← fetchOpportunities + computeKpis (server-only)
└── types.ts                    ← Opportunity + OpportunityKpis
```

## Must-haves verificados

| Truth | Verificação |
|---|---|
| `/opportunities` logado mostra 29 linhas | ✅ aprovado visualmente |
| Cada linha com 13 colunas conforme mockup | ✅ aprovado |
| Score calculado em runtime (não null/0) | ✅ top 3 com score=100, todas alta |
| KPI bar mostra Total=29 / Personas=9 / Formulários=20 | ✅ via computeKpis |
| Paridade visual com o mockup | ✅ aprovado |
| `/dashboard` redireciona para `/opportunities` | ✅ |
| Login redireciona para `/opportunities` | ✅ |

## Reuso esperado nas próximas fases

- **Phase 4** (modal) — vai abrir clicando na linha; reusa `cells.tsx` no header do modal
- **Phase 5** (Cards/Kanban) — Cards usam `cells.tsx` em layout diferente; Kanban agrupa por `status`
- **Phase 7** (filtros) — toolbar adiciona estado client + queries com filtro WHERE; KPI bar passa a recalcular sobre o subset filtrado

## Próximo

**Phase 4 — Modal de Detalhe**. Abre ao clicar numa linha da tabela. Múltiplas abas (persona vs formulário) replicando o modal do mockup.
