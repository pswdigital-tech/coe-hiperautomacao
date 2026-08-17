---
phase: 07-filtros-busca-sort-kpis
plan: 03
status: complete
completed_at: 2026-05-21
---

# 07-03 — Sort interativo nos headers · SUMMARY

## Entregue

| Arquivo | Conteúdo |
|---|---|
| `components/opportunities/table.tsx` | Convertida pra Client Component. 6 headers clicáveis (ID, Solicitante, Área, Processo, Status, Score) alternam asc/desc via URL. Seta ↑/↓ no header ativo |

## Decisões

- **Tabela vira `'use client'`** — precisa `useSearchParams` + `useRouter` pra sincronia com URL
- **`SORTABLE_COLS` mapeia coluna → SortKey** asc/desc — código declarativo, fácil de estender
- **Click sucessivo alterna** quando coluna ativa; primeira click define padrão (score começa desc, demais começa asc)
- **Seta visual SÓ no header ativo** — visual limpo, alinhado com o mockup
- **Sort dropdown** + **header click** = mesma fonte da verdade (URL) → sincronizados gratuitamente

## Validação

- `npm run typecheck` ✅
- `npm run build` ✅
- **Checkpoint visual: APROVADO** pelo usuário
