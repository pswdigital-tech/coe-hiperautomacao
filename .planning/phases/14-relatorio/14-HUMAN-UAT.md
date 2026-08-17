---
status: passed
phase: 14-relatorio
source: [14-VERIFICATION.md]
started: 2026-06-05
updated: 2026-06-05
---

## Current Test

[complete — aprovado pelo PO em 2026-06-05]

## Tests

### 1. Paridade visual da view Relatório
expected: Com `?view=relatorio`, a view renderiza em paridade com `renderRelatorio` do mockup (`_giba_wsi-dashboard.html:898-928`): Seção 1 com 7 cards (Total Oport., FTE Total/mês, Prioridade Alta, Prioridade Média, RPA Ideal, RPA + n8n, Áreas); Seção 2 com header + uma linha por área (barra azul de quantidade + barra verde de FTE + badges QTD/FTE) + rodapé de totais; Seção 3 com dois donuts SVG (Oportunidades por Área / FTE Estimado por Área) com legenda rótulo+valor+%. Badge de fonte no título mostra o nome real do tenant.
result: passed — "view relatorio aprovado" (PO, 2026-06-05)

### 2. Relatório ignora os filtros da toolbar (D-01)
expected: Aplicar filtros na toolbar (área/busca/sort) e então selecionar a view Relatório — o relatório deve agregar o portfólio INTEIRO do tenant (todas as oportunidades), não a lista filtrada. A KPI bar continua refletindo o filtro; só o Relatório ignora.
result: passed — aprovado pelo PO (2026-06-05)

### 3. Isolamento de tenant em runtime (T-14-04)
expected: Sob duas sessões de tenants diferentes (A e B), a view Relatório de cada um agrega apenas as oportunidades do próprio tenant — nunca dados cross-tenant. O fetch não-filtrado permanece escopado pelo RLS.
result: passed — aprovado pelo PO (2026-06-05)

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
