---
phase: 05-cards-kanban-status
plan: 02
status: complete
completed_at: 2026-05-21
note: "Migration 0004 precisa ser aplicada pelo usuário no Supabase Studio antes do Plan 05-03"
---

# 05-02 — Server Action + Trigger SQL + StatusSelector · SUMMARY

## Entregue

| Arquivo | Conteúdo |
|---|---|
| `supabase/migrations/0004_phase_sync_trigger.sql` | Function `sync_opportunity_phase()` + trigger `AFTER INSERT OR UPDATE OF status ON opportunities`. Status `novo` não vira phase row; outros fazem upsert em `opportunity_phases` |
| `lib/opportunities/actions.ts` | `updateOpportunityStatus(id, newStatus)` — Server Action que UPDATE + revalidatePath |
| `lib/opportunities/types.ts` | + `OpportunityPhase` (Row do schema) |
| `lib/opportunities/queries.ts` | + `fetchPhasesForOpportunity(id)`; re-exporta `OpportunityPhase` |
| `components/opportunities/modal/StatusSelector.tsx` | Client dropdown estilizado no header do modal, com optimistic state + rollback em erro |
| `components/opportunities/modal/Header.tsx` | Substituído `StatusBadge` por `StatusSelector` |
| `components/opportunities/modal/tabs/FasesTab.tsx` | Refatorado: recebe `phases` como prop (não busca mais — fetch fica no Server Component pai) |
| `components/opportunities/modal/OpportunityDetail.tsx` | Aceita `phases` prop, passa pra `FasesTab` |
| `app/(app)/opportunities/[id]/page.tsx` | Faz `fetchPhasesForOpportunity` e passa pro OpportunityDetail |
| `app/(app)/@modal/(.)opportunities/[id]/page.tsx` | Idem (intercepting) |

## Decisões

- **Tipo `OpportunityPhase` movido pra `types.ts`** — `queries.ts` tem `import 'server-only'`. Se Client Component importasse type dali, puxava `server-only` pro bundle. Solução: types puros em `types.ts`, queries só re-exportam.
- **Phases buscadas server-side** pelas duas páginas wrapper — `OpportunityDetail` (client) recebe como prop. Resolve "Server Component nested in Client Component" do Next 16.
- **`StatusSelector` com optimistic state** — atualiza UI imediatamente; rollback se a Server Action falhar.
- **Trigger SQL idempotente em re-status pra trás** — `ON CONFLICT (opportunity_id, phase_key) DO UPDATE` com `COALESCE(started_at, EXCLUDED.started_at)` preserva data original; `finished_at = NULL` reabre.

## Validação

- `npm run typecheck` ✅
- `npm run build` ✅ (rotas todas geradas, incluindo intercepting `(.)opportunities/[id]`)
- **Pendente**: usuário aplicar `0004_phase_sync_trigger.sql` no Supabase Studio antes do checkpoint final no Plan 05-03

## Bug evitado

Primeira tentativa: `FasesTab` async server component sendo renderizado dentro do `OpportunityDetail` (client). Build quebrou com erro de boundary. Refatorado pra fetch upstream + prop drilling. Vale como precedent para Phase 6/7.
