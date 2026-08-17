---
phase: 05-cards-kanban-status
status: ready_to_execute
total_plans: 3
waves: 3
---

# Phase 5 — Cards + Kanban + Mudança de Status

## Goal

3 entregas que andam juntas porque dependem do mesmo backbone:

1. **View switcher** (☰ Tabela / ⊞ Cards / 📊 Kanban) no toolbar, persistido via `?view=...` na URL
2. **Cards view** — layout alternativo de cartões com mesma data da tabela
3. **Kanban view (Gestão à Vista)** — 8 colunas por status, drag-and-drop entre colunas
4. **Mudança de status real** — via drag no kanban OU dropdown no header do modal; persiste com Server Action
5. **Trigger SQL `sync_opportunity_phase`** — escuta `UPDATE opportunities.status` e mantém `opportunity_phases` em sincronia automaticamente

Quando esta fase fechar, o usuário consegue **mover oportunidades pelo pipeline** e a aba "Fases" do modal **passa a mostrar datas reais** (cada transição cria/fecha uma linha em `opportunity_phases`).

## Por que esta fatia agora

- Cards e Kanban reusam diretamente `cells.tsx` (componentes da Phase 3) — quase zero código novo de visual
- Mudança de status é a **primeira mutação real** do sistema — estabelece padrão de Server Action + revalidatePath que CRUD da Phase 6 vai imitar
- Trigger SQL fecha a aba Fases "—" que tá vazia desde a Phase 4

## Padrão técnico

- **`?view=table|cards|kanban`** como query param. Decisão: query param ao invés de state local porque permite **share URL** ("manda pra Maria a kanban filtrada por...")
- **Drag-and-drop**: `@dnd-kit/core` + `@dnd-kit/sortable` (modern, React 19 compat, lightweight, accessibility-friendly)
- **Mutação**: Server Action `updateOpportunityStatus(id, newStatus)` chamada por:
  - Kanban: ao soltar o card numa coluna nova
  - Modal: ao trocar o dropdown
- **Revalidação**: `revalidatePath('/opportunities')` + `revalidatePath('/opportunities/[id]')` na Server Action
- **Trigger SQL**: nova migration `supabase/migrations/0004_phase_sync_trigger.sql`. Roda `BEFORE UPDATE OF status ON opportunities`. Lógica idêntica ao esboço já discutido em sessão anterior

## Estrutura de execução (3 plans, 3 waves)

```
Wave 1  ──────────────────►  05-01: View switcher (?view) + Cards view
                              (toolbar.tsx, ViewSwitcher.tsx, cards.tsx, page.tsx)

Wave 2  ──────────────────►  05-02: SQL trigger + Server Action + dropdown no modal
                              (migration 0004, lib/opportunities/actions.ts,
                               components/opportunities/modal/StatusSelector.tsx,
                               update Header.tsx)

Wave 3  ──────────────────►  05-03: Kanban view + drag-and-drop + checkpoint
                              (install @dnd-kit, KanbanBoard.tsx, KanbanCard.tsx,
                               KanbanColumn.tsx, consume updateOpportunityStatus)
```

## Must-haves

**Truths observáveis:**
- Em `/opportunities`, há 3 botões de view: ☰ Tabela (default), ⊞ Cards, 📊 Kanban
- Trocar de view atualiza a URL com `?view=cards` ou `?view=kanban` (compartilhável)
- **Cards view** mostra os 29 itens como cartões num grid responsivo (~auto-fill 260px)
- **Kanban view** mostra 8 colunas (uma por status), inicialmente todos os 29 cards na coluna "Novo"
- **Arrastar** um card pra outra coluna persiste o novo status no banco (rede); UI atualiza
- **No modal**, o `StatusBadge` do header vira um `<select>` editável; trocar persiste e fecha modal (ou stays open com novo valor)
- Após mudar status pela primeira vez, a aba **"Fases" do modal** mostra a fase atual com `started_at` real (vinda do trigger SQL)
- Refresh em `/opportunities?view=kanban` mantém a view kanban
- Sem sessão, qualquer view → redirect /login (já garantido pelo proxy)

**Artifacts necessários:**
- `supabase/migrations/0004_phase_sync_trigger.sql` (trigger + function)
- `lib/opportunities/actions.ts` (Server Actions)
- `components/opportunities/toolbar.tsx` (view switcher)
- `components/opportunities/cards.tsx` (Cards view)
- `components/opportunities/kanban/{Board,Column,Card}.tsx` (Kanban + drag)
- `components/opportunities/modal/StatusSelector.tsx` (dropdown no header)
- atualização em `components/opportunities/modal/Header.tsx` (recebe slot pra StatusSelector)
- atualização em `app/(app)/opportunities/page.tsx` (lê `?view=` e renderiza correto)
- atualização em `components/opportunities/modal/tabs/FasesTab.tsx` (busca de `opportunity_phases` reais)

**Key links:**
- `KanbanBoard` chama `updateOpportunityStatus` no drop
- `StatusSelector` chama `updateOpportunityStatus` no change
- `updateOpportunityStatus` faz `UPDATE` em `opportunities` → trigger SQL escuta → mantém `opportunity_phases`
- `revalidatePath` invalida cache da lista e do detalhe

## Out of scope

- **Drag dentro da mesma coluna** (reordenar) — kanban hoje é só "mudar de status", não "priorizar dentro do status"
- **Multi-select e bulk status change** — pós-MVP
- **Animações sofisticadas de drag** — visual simples, ghost card + hover state da coluna
- **Edição inline de datas das fases** — Phase 8

## Decisões prévias

- **`?view=` na URL** (não cookie nem localStorage) — share-friendly, recovers from refresh, server-decided initial render
- **`@dnd-kit`** (não react-dnd nem HTML5 drag nativo) — mais moderno, melhor pra React 19, gera elementos acessíveis
- **Trigger SQL no banco** (não tudo em Server Action) — robusto contra qualquer caminho que faça UPDATE direto (admin, scripts, n8n futuro)
- **Server Action faz `UPDATE` + `revalidatePath`** — trigger SQL cuida das fases automaticamente
- **Status `novo` não vira phase row** — só status do enum `phase_key` aparecem em `opportunity_phases` (o trigger filtra)

## Mapeamento do mockup

| Elemento | Origem mockup |
|---|---|
| View switcher (☰ ⊞ 📊) | linha 312-316 |
| Cards layout | função `renderCards()` linha 524-553 |
| Kanban (8 colunas) | função `renderGestao()` linha 554-594 |
| Dropdown de status no modal | linha 363-365, `quickChangeStatus()` linha 1726 |

## Após esta fase

Phase 6 (Wizard CRUD) começa a permitir CRIAR novas oportunidades (já existem 29 do seed). Phase 7 (filtros) tem dados pra filtrar de verdade — kanban filtrado é especialmente útil.
