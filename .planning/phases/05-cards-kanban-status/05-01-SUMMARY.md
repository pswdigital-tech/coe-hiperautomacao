---
phase: 05-cards-kanban-status
plan: 01
status: complete
completed_at: 2026-05-21
---

# 05-01 — View Switcher + Cards · SUMMARY

## Entregue

| Arquivo | Conteúdo |
|---|---|
| `components/opportunities/toolbar.tsx` | Client: switcher ☰/⊞/📊 via `?view=` URL param + counts |
| `components/opportunities/cards.tsx` | Server: grid auto-fill 260px com 29 cartões, cada um `<Link>` pro modal |
| `app/(app)/opportunities/page.tsx` | searchParams.view → switch entre Table/Cards/KanbanPlaceholder |

## Decisões

- **`?view=`** persistido via `router.replace` (não polui history) — Cards/Kanban são "modos de exibição", não navegação
- **Cards reusam** `SourceBadge`, `StatusBadge`, `ToolBadge`, `SeqIdDisplay`, `getInitials`, `scoreColor` — zero duplicação
- **`KanbanPlaceholder`** inline (não componente separado) — vai ser substituído no plan 05-03 e sumir

## Validação

- `npm run typecheck` ✅
- `/opportunities` (sem param) → tabela
- `/opportunities?view=cards` → cards grid
- `/opportunities?view=kanban` → placeholder
