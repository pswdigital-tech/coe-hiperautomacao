# Phase 13: Atualizações de Tela (KPI / Tabela / Kanban / Modal) - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

As 4 telas existentes — **KPI bar, tabela, kanban (Gestão à Vista) e modal de detalhe** — passam a refletir o modelo v0.2 (FTE, frequência, complexidade, RPA Fit, score de 5 fatores) em paridade com `_giba_wsi-dashboard.html`. É trabalho de **apresentação**: os dados do novo modelo (`fte_horas`, `rpa_score`, `score`, `priority_level`, `frequencia`, `num_pessoas`, `complexidade`) já estão disponíveis no front via a view `opportunities_with_score` (Phases 9–10).

Cobre VIEW-01 (KPI), VIEW-02/VIEW-03 (tabela colunas + sort), VIEW-04 (kanban FTE), VIEW-05 (modal 8 abas).

**Expansão de escopo deliberada (PO opt-in):** além de *exibir* as 8 abas (texto literal de VIEW-05), esta fase também torna o **modal editável** pelas 8 abas. A Phase 11 deferiu explicitamente "edição do modal (8 abas) + `stepsFor(edit)`" para cá. O planner deve tratar a edição como um **bloco de trabalho próprio** (provavelmente plan(s) separado(s)), maior que o realinhamento de exibição.

**Fora de escopo:** view "Relatório" (Phase 14), seed Unidasul (Phase 15), qualquer mudança de backend/schema (Phases 9–10 já entregaram os dados).
</domain>

<decisions>
## Implementation Decisions

### KPI bar (VIEW-01)
- **D-01:** **Paridade total com o mockup** (`_giba:296-305`). A KPI bar é reconstruída para os **9 KPIs** exatos: Total · Alta (≥70) · Média (40-69) · Baixa (<40) · Score Médio · **FTE Total/mês** · **Novos** · **Produção** · **Concluídos**.
- **D-02:** **Removidos** da barra: `Personas` / `Formulários` (conceito legado v0.1 — criação é sempre `formulario`) e as contagens por ferramenta `RPA`/`n8n`/`ambos`. A granularidade extra por status (Em Análise/Dev) também sai — só Novos/Produção/Concluídos.
- **D-03:** Consequência: `OpportunityKpis` (`lib/opportunities/types.ts:54-70`) e `computeKpis` (`lib/opportunities/queries.ts:243`) são reduzidos/ajustados — drop de `personas`/`formularios`/`byTool` e da granularidade de `byStatus` não usada; adicionar `fteTotal` (soma de `fte_horas`, arredondada, em h/mês). FTE Total = `Math.round(Σ fte_horas)` (espelha `_giba:666/945`).

### Tabela (VIEW-02 / VIEW-03)
- **D-04:** A coluna **"Fonte"** (badge persona/formulário) **permanece** — útil para distinguir, linha a linha, as 29 personas legadas FGCoop dos registros novos enquanto houver dados legados misturados. (Diverge do mockup, que não tem essa coluna — divergência consciente; o agregado da KPI não precisa do conceito, mas a linha se beneficia.)
- **D-05:** Adicionar as colunas faltantes em **paridade com o mockup** (`_giba:346-359`):
  - **FTE/mês** — número `Xh` (a partir de `fte_horas`).
  - **RPA Fit** — badges por faixa de `rpa_score` (`_giba:520-525`): `⭐ RPA Ideal (n/6)` quando `rpa_score >= 5`; `✓ RPA+n8n (n/6)` quando `>= 3`; `n8n (n/6)` caso contrário.
- **D-06:** **Sort** (VIEW-03): tornar **FTE/mês** e **RPA Fit** colunas sortáveis (clique no header), além de `score` que já é. Estender `SortableColumn`/`SortKey` em `lib/opportunities/filters.ts` e o `SORTABLE_COLS` de `components/opportunities/table.tsx`. Validar que o sort por FTE e por score funciona ponta a ponta.

### Modal — exibição unificada (VIEW-05)
- **D-07:** **Conjunto único de 8 abas** para QUALQUER oportunidade (`MODAL_TABS`, `_giba:959-968`): 📋 Processo · ✅ Critérios · 🤖 Automação · 📈 Benefícios · 📊 Score · 📅 Fases · ⚠️ Risco · 💬 Observação. Substitui os dois conjuntos atuais (`TABS_PERSONA` / `TABS_FORMULARIO` em `OpportunityDetail.tsx:24-44`). Não há mais ramificação por `source`.
- **D-08:** Personas legadas (FGCoop) **usam as mesmas 8 abas**; onde não há dado first-class (ex.: `criterios`/`beneficios` camelCase vazios numa persona antiga), a aba renderiza **empty state em pt-BR**. Modelo v0.2 é global.
- **D-09:** As abas **só-persona** (Perfil / Desafios / CoE — `PerfilTab`/`DesafiosTab`/`CoeTab`) **saem da exibição**. Os dados continuam no DB (`persona_extras`), apenas não são mais mostrados — não fazem parte do modelo v0.2.
- **D-10:** O **campo legado de texto livre `risco`** (≠ tabela `opportunity_risks`; "notas livres legadas" da 0009) **vai para a aba Observação**, junto de `observacao`. Resolve a pendência deferida da Phase 12. A aba **Risco** fica 100% dedicada à **tabela estruturada** entregue na Phase 12 (`RiscoTab` + sub-rota de CRUD).
- **D-11:** As abas Processo/Critérios/Automação/Benefícios/Score precisam **ler os campos first-class do v0.2** (criterios camelCase sim/nao/parcial, beneficios 1–5, `fte_horas`, `ferramenta`, `rpa_score`, score de 5 fatores via `lib/opportunities/score.ts`). Onde hoje leem jsonb legado, realinhar para o novo modelo.

### Modal — edição (expansão de escopo, PO opt-in)
- **D-12:** O modal fica **editável** pelas 8 abas, em **modo global** (paridade `_giba:969-973`): um botão **Editar** no header (`Header.tsx`) destrava TODAS as abas; **Salvar** persiste tudo; **Cancelar** descarta. Não é edição por-aba.
- **D-13:** **Reuso**: a edição reaproveita a Server Action **`updateOpportunity`** + **`opportunityInputSchema`** (Phase 10) e os **componentes de campo do wizard** (`components/opportunities/wizard/steps/*` / `fields.tsx`) como base dos inputs editáveis. **Zero retrabalho de backend.**
- **D-14:** A rota **`/edit` (wizard) é mantida** e coexiste como caminho alternativo de edição. Não remover/redirecionar nesta fase.
- **D-15 (constraint herdada — docs/PROJETO.md):** Em modo de edição, **campos derivados permanecem read-only e recalculam**, nunca viram input manual:
  - `score` / `priority_level` — recalculados pelos 4 fatores editáveis (`esforco`, `complexidade`, `tempo`/frequência, `objetivo`) + bucket FTE; exibidos via `score.ts`, nunca persistidos.
  - `prioridade.fte` (bucket FTE, 5º fator) — derivado de `fte_horas` editável (`lib/opportunities/fte.ts` `deriveFteBucket`); read-only.
  - `rpa_score` (0–6) — derivado dos 8 `criterios` editáveis; read-only (coluna GENERATED).
  - Editar uma **persona legada** pelo modal grava nos campos first-class do v0.2 (consistente com D-08).

### Kanban (VIEW-04)
- **D-16:** **Header + cards** (paridade total `_giba:698-741`):
  - Header de cada coluna mostra o **FTE somado** das oportunidades naquela coluna: `⏱️ {Σ fte_horas}h FTE/mês` (`_giba:734`), ao lado do contador atual (`Column.tsx`).
  - Cada **card** (`kanban/Card.tsx`) ganha **chip de FTE** (`⏱️ Xh/mês`) + **badge RPA** (mesmas faixas de D-05), espelhando `_giba:718-721`.

### Executor's Discretion
- Microcópia dos empty states pt-BR por aba (D-08), ícones, espaçamentos finos — desde que mantenha paridade estrutural com `_giba`.
- Mecânica fina do estado de edição global (gerência de form state no client, dirty-checking, exibição de `fieldErrors`) — seguir o padrão já usado no wizard.
- Layout exato da aba Observação ao acomodar `observacao` + `risco` legado (D-10).
- Como cada aba (Processo/Critérios/Benefícios) compõe inputs editáveis a partir dos componentes do wizard vs. inputs próprios — o executor decide reuso vs. cópia conforme acoplamento.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contrato visual / modelo (fonte da verdade)
- `_giba_wsi-dashboard.html` §296-305 — KPI bar de 9 KPIs (base de D-01/D-02).
- `_giba_wsi-dashboard.html` §346-359 — cabeçalho/colunas da tabela, incl. FTE/mês, Score, Prioridade, RPA Fit e quais são sortáveis (base de D-05/D-06).
- `_giba_wsi-dashboard.html` §520-525 — `rpaBadge`: faixas de `rpa_score` → badges ⭐ RPA Ideal / ✓ RPA+n8n / n8n (base de D-05, D-16).
- `_giba_wsi-dashboard.html` §493-494 — `scChip` / `fteChip` (chips usados nos cards do kanban; base de D-16).
- `_giba_wsi-dashboard.html` §698-741 — `renderGestao`/kanban: FTE somado por coluna (§734) + composição do card com fte/rpa (§718-721) (base de D-16).
- `_giba_wsi-dashboard.html` §959-968 — `MODAL_TABS`: as 8 abas únicas (base de D-07).
- `_giba_wsi-dashboard.html` §969-1003 — `openMo`/`buildTabs`/`switchTab` + `btn-edit`/`btn-save`/`btn-cancel`: modo de edição global do modal (base de D-12).
- `_giba_wsi-dashboard.html` §483-490 — fórmula de score de 5 fatores (pesos/fallbacks); fonte da verdade do score exibido.

### Requisitos / roadmap
- `.planning/ROADMAP.md` (Phase 13) — Goal + 4 Success Criteria.
- `.planning/REQUIREMENTS.md` — VIEW-01, VIEW-02, VIEW-03, VIEW-04, VIEW-05.

### Decisões das fases anteriores (carry-forward)
- `.planning/phases/11-wizard-fluxo-unico/11-CONTEXT.md` — persona = legado read/edit-only (D-04/D-05); modelo first-class de criterios/beneficios/FTE; **deferiu "modal edição 8 abas" para esta fase**.
- `.planning/phases/12-registro-riscos-modal/12-CONTEXT.md` — aba Risco estruturada + sub-rota de CRUD; enums minúsculos + camada de labels (D-07); **deferiu o destino do campo legado `risco` para cá** (resolvido em D-10).
- `.planning/phases/10-backend-queries-validation-score/10-CONTEXT.md` — `opportunityInputSchema`, `updateOpportunity`, whitelist de colunas, paridade SCORE-04.
- `.planning/phases/09-schema-evolution-foundation/09-CONTEXT.md` — modelo de score 5 fatores, `rpa_score` GENERATED, FTE.

### Código a tocar / reaproveitar
- `components/opportunities/kpi-bar.tsx` — reconstruir para os 9 KPIs (D-01/D-02).
- `lib/opportunities/types.ts` §54-70 (`OpportunityKpis`) + `lib/opportunities/queries.ts` §243 (`computeKpis`) — ajustar buckets + `fteTotal` (D-03).
- `components/opportunities/table.tsx` + `components/opportunities/cells.tsx` — colunas FTE/mês + RPA Fit + sort (D-04/D-05/D-06).
- `lib/opportunities/filters.ts` — estender `SortKey`/`SortableColumn` para FTE e RPA Fit (D-06).
- `components/opportunities/kanban/Column.tsx` + `kanban/Card.tsx` — FTE por coluna + chip/badge no card (D-16).
- `components/opportunities/modal/OpportunityDetail.tsx` — colapsar `TABS_PERSONA`/`TABS_FORMULARIO` em 1 conjunto de 8 (D-07/D-08/D-09).
- `components/opportunities/modal/Header.tsx` — botões Editar/Salvar/Cancelar do modo de edição global (D-12).
- `components/opportunities/modal/tabs/{ProcessoTab,CriteriosTab,AutomacaoTab,BeneficiosTab,ScoreTab,FasesTab,ObservacaoTab}.tsx` — realinhar leitura ao first-class v0.2 + tornar editáveis (D-11/D-12/D-15); `ObservacaoTab` acomoda `risco` legado (D-10).
- `components/opportunities/modal/tabs/{PerfilTab,DesafiosTab,CoeTab}.tsx` — removidas da exibição (D-09).
- `components/opportunities/modal/tabs/RiscoTab.tsx` — inalterada (já estruturada na Phase 12; mantém a tabela + sub-rota).
- `lib/opportunities/actions.ts` (`updateOpportunity`) + `lib/opportunities/schema.ts` (`opportunityInputSchema`) — alvo de gravação da edição do modal (D-13). **Não duplicar validação nem backend.**
- `components/opportunities/wizard/steps/*` + `components/opportunities/wizard/fields.tsx` — componentes de campo reaproveitáveis na edição (D-13).
- `lib/opportunities/score.ts` (`calcScore`/`priorityLevel`) + `lib/opportunities/fte.ts` (`deriveFteBucket`) — recálculo de derivados em edição (D-15). Não duplicar.
- `lib/database.types.ts` — **hand-maintained** (gen:types bloqueado). Tratar como verdade verificada; não depender de regen.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Server Action `updateOpportunity` + `opportunityInputSchema`** (Phase 10): edição do modal grava por aqui — zero backend novo (D-13).
- **Componentes de campo do wizard** (`steps/*`, `fields.tsx`): inputs prontos (selects de peso, click-to-cycle de critérios, barras 1–5) reaproveitáveis no modo de edição.
- **`score.ts` / `fte.ts`**: recálculo de score, priority_level, bucket FTE e (via critérios) rpa_score em runtime — reuso direto para manter derivados read-only (D-15).
- **`RiscoTab` (Phase 12)**: já entrega a aba Risco estruturada; nada a refazer ali.
- **`cells.tsx`**: já tem `ComplexityBadge`, `ScoreDisplay`, `ToolBadge` etc.; adicionar `FteCell`/`RpaFitBadge` no mesmo estilo.

### Established Patterns
- Modal hoje é **read-only** (Server Components); o wizard é o editor. Esta fase introduz **edição inline no modal** — primeira vez que o modal escreve. Estado de edição vive no client (`OpportunityDetail` é `'use client'`).
- Score calculado em runtime, **nunca persistido**; `rpa_score`/bucket FTE **derivados**, nunca input manual (docs/PROJETO.md princípio 3 → D-15).
- UI pt-BR / código inglês; enums minúsculos no DB + camada de labels (Phase 12).
- Sort por querystring (`filters.ts` + `router.replace`) — estender, não reinventar (D-06).

### Integration Points
- KPI bar e tabela são alimentadas por `computeKpis`/queries no Server Component da lista (`app/(app)/opportunities/page.tsx`).
- Modal: `app/(app)/@modal/(.)opportunities/[id]/page.tsx` → `OpportunityDetail`. Edição → `updateOpportunity` → Zod → UPDATE (RLS por `tenant_id`) → `revalidatePath` + `router.refresh()`.
- Kanban: `Board.tsx` → `Column.tsx` → `Card.tsx`; drag-and-drop muda status (trigger de fase preservado).
</code_context>

<specifics>
## Specific Ideas

- Paridade com `_giba` é o norte em todas as 4 telas (docs/PROJETO.md princípio 2). Divergência consciente única: **manter a coluna "Fonte"** na tabela (D-04) enquanto houver dados legados FGCoop misturados.
- A KPI bar fica **enxuta** (some o que era v0.1): o PO priorizou o contrato do mockup sobre preservar métricas legadas.
- O modal vira **editor de verdade** (modo global, estilo mockup), não só display — mas **sem tocar no backend** (reusa Phase 10) e **sem aposentar** o wizard /edit.
- Derivados (score/rpa_score/bucket FTE) **nunca** viram input na edição — sempre recalculados e read-only.
</specifics>

<deferred>
## Deferred Ideas

- **Aposentar a rota /edit (wizard)** — considerado e rejeitado nesta fase (D-14: coexistem). Consolidar num único editor pode ser limpeza futura.
- **Remover a coluna "Fonte" da tabela** — rejeitado enquanto houver dados legados (D-04). Quando o legado FGCoop sair/for migrado, a coluna pode cair (paridade plena com o mockup).
- **Exibir riscos/prioridade de risco na KPI bar / tabela** — fora de escopo (era Deferred da Phase 12); não pedido por VIEW-01..05.
- **Dados de persona (Perfil/Desafios/CoE) em alguma visualização v0.2** — removidos da exibição (D-09); se o negócio quiser resgatá-los, é fase própria (dados preservados em `persona_extras`).
- **View "Relatório"** — Phase 14. **Seed Unidasul** — Phase 15.

</deferred>

---

*Phase: 13-atualizacoes-tela*
*Context gathered: 2026-06-05*
