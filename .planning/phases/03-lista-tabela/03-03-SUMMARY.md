---
phase: 03-lista-tabela
plan: 03
status: complete
completed_at: 2026-05-21
---

# 03-03 — Página /opportunities + KPI bar + Tabela · SUMMARY

## Entregue

| Arquivo | Papel |
|---|---|
| [components/opportunities/kpi-bar.tsx](../../../components/opportunities/kpi-bar.tsx) | KPI bar com 17 células (Total, Personas, Formulários, Score Médio, prioridades, status, ferramentas) |
| [components/opportunities/table.tsx](../../../components/opportunities/table.tsx) | Tabela com 13 colunas conforme mockup, usando todos os cells |
| [app/(app)/opportunities/page.tsx](../../../app/(app)/opportunities/page.tsx) | Server Component que orquestra: fetch + KPI bar + tabela |
| [app/(app)/dashboard/page.tsx](../../../app/(app)/dashboard/page.tsx) | Convertido em redirect → /opportunities |
| [lib/supabase/session.ts](../../../lib/supabase/session.ts) | Destinos `/dashboard` substituídos por `/opportunities` (2 lugares) |
| [app/login/actions.ts](../../../app/login/actions.ts) | Login redireciona pra `/opportunities` |

## Validação executada

- `npm run typecheck` ✅
- `curl /opportunities` sem sessão → 307 → /login ✅
- `curl /dashboard` sem sessão → 307 → /login ✅
- `curl /login` → 200 ✅
- Smoke test backend autenticado: 29 oportunidades retornadas, top 3 com score=100 ✅
- **Checkpoint visual: APROVADO pelo usuário** ✅

## Decisões

- **Botão "Abrir" desabilitado de propósito** — slot visual mantido pra Phase 4 (modal de detalhe)
- **Ordenação default**: score desc, depois seq_id asc (paridade com mockup `sort=score_desc`)
- **Empty state** na tabela trata caso de 0 resultados (não aparece hoje, mas será útil quando filtros entrarem)
- **`/dashboard` virou redirect** em vez de remoção — preserva URLs existentes sem 404

## Pendência conhecida

- **Botão "Abrir"** vai ativar quando Phase 4 (modal de detalhe) entrar
- **Sort interativo no header** vai entrar na Phase 7 (filtros + sort)
