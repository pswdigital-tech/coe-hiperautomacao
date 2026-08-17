---
phase: 04-modal-detalhe
plan: 03
status: complete
completed_at: 2026-05-21
---

# 04-03 — Tabs Formulário · SUMMARY

## Entregue

| Arquivo | Conteúdo |
|---|---|
| `components/opportunities/modal/tabs/ProcessoTab.tsx` | Grid 2 cols com 9 campos do processo + StatusBadge + 3 campos full-width (sistemas/responsavel/notas) |
| `components/opportunities/modal/tabs/CriteriosTab.tsx` | 10 critérios renderizados como cards coloridos por valor (SIM verde ✅ / NAO vermelho ❌ / PARCIAL âmbar ⚠️) |
| `components/opportunities/modal/tabs/BeneficiosTab.tsx` | 8 benefícios em barras horizontais coloridas, cada uma com valor X/5 + escala explicativa |
| `components/opportunities/modal/OpportunityDetail.tsx` | Switch case dos 3 tabs formulário; placeholder removido (todos os tabs implementados) |

## Decisões

- **`CriteriosTab`** trata `undefined` separadamente do `NAO` (ícone ⚪ "—") — distingue "não respondido" de "respondido com Não"
- **`BeneficiosTab`** **omite** benefícios sem valor (filter `.filter(r => r.value != null)`) — não polui visual com barras vazias
- **Cores dos benefícios** literais do mockup (linha 760-769)
- **`Placeholder` component removido** — não tem mais slot vazio no switch case

## Validação

- `npm run typecheck` ✅
- Switch case cobre todos os 9 TabIds (3 persona + 3 formulário + 3 comuns)
