---
phase: 05-cards-kanban-status
status: complete
completed_at: 2026-05-21
plans_completed: 3
---

# Phase 5 — Cards + Kanban + Mudança de Status · SUMMARY

## Goal atingido

Sistema deixa de ser read-only. Usuário pode mover oportunidades pelo pipeline arrastando cards no kanban OU trocando status pelo dropdown no modal. Banco mantém histórico de fases automaticamente.

## Plans entregues

| Plan | Entrega | Status |
|---|---|---|
| **05-01** View Switcher + Cards | Toolbar `?view=` + grid de cards | ✅ |
| **05-02** Server Action + Trigger SQL + StatusSelector | Mudança de status persistente + trigger sincroniza opportunity_phases | ✅ aprovado (migration aplicada) |
| **05-03** Kanban + Drag-and-Drop | `@dnd-kit` com 8 colunas, drag-drop, optimistic UI | ✅ aprovado |

## Estrutura resultante

```
components/opportunities/
├── toolbar.tsx                  ← view switcher ?view=table|cards|kanban
├── cards.tsx                    ← Cards view (grid auto-fill)
├── kanban/
│   ├── Board.tsx                ← DndContext + onDragEnd
│   ├── Column.tsx               ← useDroppable
│   └── Card.tsx                 ← useDraggable
└── modal/
    └── StatusSelector.tsx       ← dropdown que chama updateOpportunityStatus

lib/opportunities/
├── actions.ts                   ← updateOpportunityStatus (Server Action)
└── queries.ts                   ← + fetchPhasesForOpportunity

supabase/migrations/
└── 0004_phase_sync_trigger.sql  ← trigger AFTER INSERT/UPDATE OF status
```

## Descobertas técnicas

- **Server Component aninhado em Client Component** quebra build no Next 16 (`server-only` puxado pro bundle). Solução: fetch upstream + prop drilling.
- **Tipos vs imports**: `import 'server-only'` em `queries.ts` força types ficarem em `types.ts` separado (caso contrário client puxa server-only via import de type)
- **PointerSensor com threshold** resolve click-vs-drag elegantemente; sem isso, `<Link>` e `useDraggable` brigam
- **Trigger SQL idempotente** via `ON CONFLICT (...) DO UPDATE SET started_at = COALESCE(...)` permite "voltar pra trás" no kanban sem perder data original

## Must-haves verificados

- ✅ View switcher altera URL (`?view=cards|kanban`) e renderiza componente certo
- ✅ Cards view com 29 cartões em grid
- ✅ Kanban com 8 colunas, drag-and-drop entre elas, optimistic UI
- ✅ Status persiste no banco após drop
- ✅ Dropdown de status no modal substitui o badge estático
- ✅ Aba "Fases" mostra timeline real com fase ativa destacada em verde

## Pendência carregada

Nenhuma — Phase 5 fechada totalmente.

## Próximo

**Phase 6 — Wizard CRUD (Criar + Editar)**. Botão "Nova Oportunidade" abre wizard multi-step; botão "Editar" no modal reusa o mesmo wizard pré-preenchido.
