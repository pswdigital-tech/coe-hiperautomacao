---
phase: 05-cards-kanban-status
plan: 03
status: complete
completed_at: 2026-05-21
---

# 05-03 — Kanban + Drag-and-Drop · SUMMARY

## Entregue

| Arquivo | Conteúdo |
|---|---|
| `package.json` | + `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |
| `components/opportunities/kanban/Card.tsx` | Client. `useDraggable` + click via `router.push` quando não está draging |
| `components/opportunities/kanban/Column.tsx` | Client. `useDroppable` + highlight visual no hover de drop |
| `components/opportunities/kanban/Board.tsx` | Client. `DndContext` + `PointerSensor` (threshold 5px) + optimistic state + rollback em erro |
| `app/(app)/opportunities/page.tsx` | KanbanPlaceholder substituído por `<KanbanBoard>` |

## Decisões

- **Optimistic UI** com `useState` local + rollback em caso de erro da Server Action — usuário não fica esperando rede
- **PointerSensor com `activationConstraint.distance = 5`** resolve conflito click-vs-drag — toques curtos navegam, drags movem
- **Click implementado via `router.push`** (não `<Link>`) porque `<Link>` dentro de `useDraggable` polui muito o JSX e atrapalha event handlers do dnd-kit
- **Cards mostram só o essencial** no kanban: seq_id, processo (2 linhas), solicitante, source badge, score com dot — versão compacta dos cards da view "Cards"

## Validação

- `npm run typecheck` ✅
- `npm run build` ✅ (8 rotas geradas, incluindo intercepting)
- **Checkpoint visual: APROVADO** pelo usuário
- Trigger SQL `sync_opportunity_phase` (migration 0004) confirmado funcionando

## Status final da Phase 5

Sistema agora tem **mutações reais**: usuário consegue mover oportunidades pelo pipeline via drag-and-drop (kanban) ou dropdown (modal). Banco mantém histórico de fases automaticamente via trigger SQL. Padrão de Server Action + revalidatePath + optimistic UI estabelecido para Phase 6 (CRUD wizard) usar.
