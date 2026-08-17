---
phase: 14-relatorio
verified: 2026-06-05T14:36:00Z
status: human_needed
score: 8/8 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Abrir /opportunities, clicar no 4º botão do seletor (📈) e confirmar que a view Relatório renderiza com paridade visual ao mockup (_giba_wsi-dashboard.html renderRelatorio): 7 cards, barras azul/verde por área, 2 donuts."
    expected: "View troca para ?view=relatorio, botão 📈 fica ativo (bg-pri), e as 3 seções aparecem com o layout do mockup (donut com furo central, legendas com %, rodapé de totais)."
    why_human: "Paridade pixel/visual e renderização SVG real só confirmáveis no browser; o código está correto mas a fidelidade visual ao mockup é subjetiva/visual."
  - test: "Com a view Relatório ativa, alterar filtros da toolbar (área/busca/sort) e confirmar que o Relatório NÃO muda (agrega o portfólio inteiro), enquanto a KPI bar acima reflete o filtro."
    expected: "Relatório permanece estável (portfólio completo do tenant); apenas a KPI bar e a contagem mudam com os filtros (D-01)."
    why_human: "Comportamento de runtime (re-fetch não-filtrado vs filtrado) exige sessão autenticada e dados reais para observar."
  - test: "Logar como usuário do tenant A e confirmar que o Relatório só mostra dados do tenant A (nenhum dado de outro tenant aparece nos cards/áreas/donuts)."
    expected: "Apenas o portfólio do tenant logado; isolamento RLS efetivo (T-14-04)."
    why_human: "Isolamento multi-tenant em runtime depende do RLS no banco e de duas sessões reais — não verificável estaticamente (código já confirmado sem filtro manual)."
---

# Phase 14: View "Relatório" Verification Report

**Phase Goal:** O usuário acessa uma nova view analítica "Relatório" que sintetiza o portfólio de oportunidades em cards, distribuição por área e gráficos de pizza.
**Verified:** 2026-06-05T14:36:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | View "📈 Relatório" selecionável pelo seletor da toolbar (SC1 / REPORT-01) | ✓ VERIFIED | toolbar.tsx:20 `type View` inclui `'relatorio'`; :26 `{ id:'relatorio', icon:'📈', label:'Relatório' }` no array VIEWS; :41 `parseView` reconhece `'relatorio'`; :104-110 `changeView` seta `?view=relatorio`; :166-184 renderiza o botão e marca ativo via `currentView`. |
| 2 | 7 cards de portfólio (Total, FTE Total/mês, Prio Alta, Prio Média, RPA Ideal, RPA+n8n, nº Áreas) (SC2 / REPORT-02) | ✓ VERIFIED | relatorio.tsx:61-67 exatamente 7 `<SummaryCard>` na ordem do mockup, alimentados por `report.totalCount/totalFte/prioAlta/prioMedia/rpaIdeal/rpaHybrid/areas.length`. Spot-check de buildReport confirma os valores corretos. |
| 3 | Distribuição por área com barra azul (qtd) + barra verde (FTE) + badges + rodapé (SC3 / REPORT-03) | ✓ VERIFIED | relatorio.tsx:72-160 seção com header 4-col, `report.areas.map` → barra azul (`a.count/maxCount`), barra verde (`a.fte/maxFte`, `minWidth:4`), badges QTD/FTE, rodapé "Total: N … FTE Total: Xh/mês". |
| 4 | Dois donut charts SVG (Oportunidades por Área + FTE por Área) com legenda rótulo+valor+% (SC4 / REPORT-04) | ✓ VERIFIED | relatorio.tsx:163-170 dois `<PieCard>` (pieCount/pieFte); pie.tsx:17-77 PieChart porta a matemática do arco (R=size*0.4, ri=size*0.22, large-arc), :108-133 legenda com label truncado + valor + %. |
| 5 | Áreas sem FTE ainda aparecem (largura mínima); donut total 0 → "Sem dados" | ✓ VERIFIED | relatorio.tsx:113/129 `minWidth:4` em ambas as barras; pie.tsx:20-32 `total===0` → `<text>Sem dados</text>`. Spot-check: RH com fte null→0 aparece na lista. |
| 6 | Zero dependência de chart lib; componentes server-safe | ✓ VERIFIED | grep em pie.tsx/relatorio.tsx: nenhum `recharts\|visx\|d3\|use client\|dangerouslySetInnerHTML`. SVG portado à mão. |
| 7 | Score nunca recomputado nem persistido (docs/PROJETO.md §3) | ✓ VERIFIED | report.ts: nenhum import de `score.ts` nem `server-only`; lê `priority_level` e `rpa_score` das colunas da view `opportunities_with_score` (database.types.ts:424-425 confirma colunas computadas); função pura, sem escrita no banco. |
| 8 | Fetch do portfólio completo permanece RLS-scoped ao tenant (T-14-04, docs/PROJETO.md §1) | ✓ VERIFIED | page.tsx:40 `fetchOpportunities()` sem args → `filters={}` (queries.ts:62-79: nenhum `.eq`/`.or` aplicado); nenhum `tenant_id` manual no page.tsx; RLS da view escopa por tenant. |

**Score:** 8/8 truths verified (código). 3 itens roteados para verificação humana (visual/runtime/RLS).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/opportunities/report.ts` | Agregação pura por área (buildReport) | ✓ VERIFIED | 113 linhas; exporta `buildReport` + `PALETTE` (18 cores confirmadas); puro, sem React/server-only/score.ts. WIRED ← relatorio.tsx:11. |
| `components/opportunities/relatorio/pie.tsx` | PieChart + PieCard donut SVG | ✓ VERIFIED | 137 linhas; `viewBox`, math do arco, "Sem dados". Server-safe. WIRED ← relatorio.tsx:12. |
| `components/opportunities/relatorio/relatorio.tsx` | Server Component 3 seções | ✓ VERIFIED | 194 linhas; "Resumo do Portfólio", empty state global, 3 seções. WIRED ← page.tsx:13/56-60. |
| `components/opportunities/toolbar.tsx` | Entrada 'relatorio' em VIEWS/View/parseView | ✓ VERIFIED | Modificado; todas as 3 inserções presentes. |
| `app/(app)/opportunities/page.tsx` | Branch render + fetch não-filtrado | ✓ VERIFIED | Modificado; import, `isReport`, fetch sem filtros, branch de render. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| relatorio.tsx | report.ts | `import { buildReport }` + `buildReport(opportunities)` | ✓ WIRED | relatorio.tsx:11, :21 |
| relatorio.tsx | pie.tsx | dois `<PieCard>` | ✓ WIRED | relatorio.tsx:12, :164-169 |
| toolbar.tsx | URL ?view=relatorio | `changeView('relatorio')` + `parseView` | ✓ WIRED | toolbar.tsx:41, :104-110, :172 |
| page.tsx | relatorio.tsx | `<Relatorio>` quando view==='relatorio' c/ `fetchOpportunities()` | ✓ WIRED | page.tsx:13, :40, :56-60 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| relatorio.tsx | `opportunities` (prop) | page.tsx `fullPortfolio` ← `fetchOpportunities()` → view `opportunities_with_score` | ✓ (real DB query via Supabase) | ✓ FLOWING |
| page.tsx `fullPortfolio` | — | `isReport ? fetchOpportunities() : []` | ✓ quando view=relatorio | ✓ FLOWING — prop NÃO hardcodada vazia (só `[]` quando não é a view relatório, por design) |

Nota: `sourceLabel={tenant?.name ?? null}` flui de `getCurrentTenant()` (PublicTenant.name confirmado) — rótulo real, sem hardcode "Workshop I/Unidasul".

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| buildReport agrega corretamente (count/fte/prio/rpa, null→0, ordenação) | node spot-check da lógica portada | Financeiro c2/f15, totalFte 18, prioAlta 2/prioMedia 1, rpaIdeal 2/rpaHybrid 1, empty→all-zero | ✓ PASS |
| tsc limpo | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Suite de testes | `npx vitest run` | 151 passed / 32 skipped / 0 failed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| REPORT-01 | 14-02 | Nova view "📈 Relatório" no seletor | ✓ SATISFIED | toolbar.tsx + page.tsx branch (Truth 1) |
| REPORT-02 | 14-01 | 7 cards de portfólio | ✓ SATISFIED | relatorio.tsx:61-67 (Truth 2) |
| REPORT-03 | 14-01 | Distribuição por área (barras qtd + FTE) | ✓ SATISFIED | relatorio.tsx:72-160 (Truth 3) |
| REPORT-04 | 14-01 | Dois pie charts SVG | ✓ SATISFIED | pie.tsx + relatorio.tsx:163-170 (Truth 4) |

Nenhum requisito órfão: REQUIREMENTS.md mapeia REPORT-01..04 → Phase 14, todos reivindicados nos plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| page.tsx | 40 | `Promise.resolve([] as Opportunity[])` | ℹ️ Info | NÃO é stub — é o ramo intencional quando a view não é Relatório; `fullPortfolio` só é consumido no branch `view==='relatorio'`, onde recebe dados reais. |

Nenhum TODO/FIXME/placeholder, nenhum `dangerouslySetInnerHTML`, nenhum handler vazio, nenhum dado hardcoded user-visible. Os comentários de cabeçalho foram redigidos para evitar os literais proibidos pelos greps de acceptance (desvio cosmético documentado nos SUMMARYs).

### Human Verification Required

1. **Paridade visual da view** — Abrir /opportunities, selecionar 📈; confirmar layout (7 cards, barras azul/verde, donuts com furo, legendas %, rodapé) em paridade com renderRelatorio do mockup.
2. **Relatório ignora filtros (D-01)** — Com a view ativa, mudar área/busca/sort; o Relatório deve permanecer estável (portfólio inteiro) enquanto a KPI bar reflete o filtro.
3. **Isolamento de tenant (T-14-04)** — Logar como tenant A e confirmar que nenhum dado de outro tenant aparece (RLS efetivo em runtime).

### Gaps Summary

Nenhum gap. Todos os 8 must-haves (5 da SC do roadmap + truths dos plans, incluindo os 3 não-negociáveis do docs/PROJETO.md §1/§3 e o mandato zero-dep) verificam-se contra o código: artefatos existem, são substantivos, estão wired e os dados fluem. `tsc` exit 0; suite 151/0. Os 3 itens de verificação humana são intrínsecos a uma fase visual/UI (fidelidade ao mockup, comportamento de runtime de re-fetch, isolamento RLS sob sessão real) — não bloqueiam o código, mas exigem confirmação em browser/sessão antes do encerramento definitivo. Status = human_needed por força da árvore de decisão (Step 9): itens humanos não-vazios têm prioridade mesmo com score 8/8.

---

_Verified: 2026-06-05T14:36:00Z_
_Verifier: agente gsd-verifier_
