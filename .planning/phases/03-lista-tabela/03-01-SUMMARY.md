---
phase: 03-lista-tabela
plan: 01
status: complete
completed_at: 2026-05-21
---

# 03-01 — Data Layer · SUMMARY

## Entregue

- [lib/opportunities/types.ts](../../../lib/opportunities/types.ts): type `Opportunity` derivado da view + tipos auxiliares + `OpportunityKpis`
- [lib/opportunities/queries.ts](../../../lib/opportunities/queries.ts): `fetchOpportunities()` (Server-only, lê `opportunities_with_score`, ordenado por score desc → seq_id asc) + `computeKpis()` (em memória)

## Validação

- `npm run typecheck` ✅
- Endpoint REST autenticado retorna 29 linhas (RLS confirmada)
- Top 3 por score: todos score=100, priority=alta (Inez Passos, João Paulo Sabino, Cynthia Borba)

## Decisões

- **`import 'server-only'`** em queries.ts protege contra import acidental no client
- **Score já vem calculado** pela view — não fazer dupla compute
- **`computeKpis` é puro** — não vai ao banco, opera no array recebido
