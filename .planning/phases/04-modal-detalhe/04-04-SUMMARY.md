---
phase: 04-modal-detalhe
plan: 04
status: complete
completed_at: 2026-05-21
---

# 04-04 — Linkar Tabela + Smoke + Checkpoint · SUMMARY

## Entregue

- `components/opportunities/table.tsx`: botão `<button disabled>` substituído por `<Link href={\`/opportunities/${id}\`}>`
- `getInitials` interno removido (agora vem de `lib/opportunities/utils.ts`)

## Validação

- `npm run typecheck` ✅
- Smoke routes ✅ (todas as rotas sem sessão → 307 /login)
- **Checkpoint visual: APROVADO pelo usuário** ✅

## Status final da Phase 4

Modal de detalhe completo, navegável por URL, com 6 abas por tipo (persona vs formulário), todos os campos do JSONB renderizados, fechamento via ESC/click-fora/X, fullscreen como fallback em refresh/share.
