# Phase 11: Wizard de Fluxo Único (5 steps) - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

O usuário cria uma oportunidade por **um único wizard de 5 steps** — Identificação → Processo → Critérios → Benefícios → Priorização — substituindo o split persona/formulário do v0.1. O wizard grava via as Server Actions / validação Zod da Phase 10 e usa o `ScorePreview` (fórmula única SCORE-04) da Phase 10.

**ESCOPO TRAVADO:** Phase 11 mexe **apenas no fluxo de CRIAÇÃO** ("Nova Oportunidade"). O modal de detalhe + edição (8 abas) e o `stepsFor()` `mode='edit'` ficam para a **Phase 13** (VIEW-04). Não reestruturar edição nesta fase.

Cobre WIZARD-01, WIZARD-02, WIZARD-03, WIZARD-04.
</domain>

<decisions>
## Implementation Decisions

### FTE — horas/mês × bucket (5º fator)
- **D-01:** O usuário digita **apenas `fte_horas`** (horas/mês) no step **Benefícios** (WIZARD-03). O **bucket FTE** (`prioridade_fte`, 5º fator de score) é **derivado automaticamente** das horas — fonte única, sem campo manual, impossível divergir.
- **D-02:** Faixas de derivação (das `ftOpts` do mockup [_giba:1565](_giba_wsi-dashboard.html#L1565)): `<10h → muito_baixo` · `10–40h → baixo` · `40–100h → medio` · `100–200h → alto` · `>200h → muito_alto`. Limites inferiores inclusivos / superiores exclusivos: `<10` muito_baixo; `>=10 & <40` baixo; `>=40 & <100` medio; `>=100 & <200` alto; `>=200` muito_alto. (Planner: documentar e cobrir as bordas em teste.)
- **D-03:** O step **Priorização** **exibe** o bucket derivado + seu peso (read-only) para satisfazer WIZARD-02 ("bucket FTE com pesos visíveis"). O `ScorePreview` recebe o `fte` derivado (a prop `fte` já existe em [ScorePreview.tsx](../../../components/opportunities/wizard/ScorePreview.tsx) — hoje não é passada).

### Aposentadoria do split persona/formulário
- **D-04:** Fluxo **único**: remove os steps **Tipo** e **Classificação** do `mode='create'`. O wizard **sempre grava `source='formulario'`**.
- **D-05:** O `discriminatedUnion` persona/formulário **permanece no schema** ([schema.ts:287+](../../../lib/opportunities/schema.ts#L287)) — usado apenas para **ler/editar dados FGCoop legados** (personas existentes), nunca mais para criar. Não remover a variant `persona`.
- **D-06:** `STEP_TIPO` / `STEP_CLASSIFICACAO` e os branches `STEPS_PERSONA_EXTRA` em [state.ts](../../../components/opportunities/wizard/state.ts) saem do caminho de criação. `validateStep('tipo'|'classificacao')` deixa de ser exercitado no create.

### Campos de Automação (relação com 7.6)
- **D-07:** `ferramenta` (Ferramenta Sugerida) entra como **select no step Processo** (paridade mockup [_giba:1550](_giba_wsi-dashboard.html#L1550), default `n8n`).
- **D-08:** `escopo_automacao[]` e `beneficios_esperados[]` **saem do fluxo de criação** (ficam `null`/vazios; preenchíveis por IA/edição depois). Mantém os 5 steps enxutos e respeita a intenção da 7.6 de tirar campos técnicos do usuário. **REALIGN-7.6 continua deferido** — esta fase NÃO reativa o enrichment de IA; apenas garante que o schema segue compatível (campos derivados preenchíveis manualmente agora, por IA depois — MODEL-10).

### Steps Critérios & Benefícios
- **D-09:** **Reaproveitar** os componentes atuais com **reescrita** para o modelo first-class v0.2: manter o **click-to-cycle** dos Critérios e as **barras 1–5** dos Benefícios (UX superior aos dropdowns do mockup), mas:
  - Critérios: migrar de **10 chaves UPPERCASE** em `formulario_extras.criterios` → **8 chaves camelCase lowercase** first-class (`causaReclamacoes, totalmenteManual, regrasClaras, decisaoHumana, padronizacaoDocs, validacaoDados, schedulable, temDocumentacao`), valores `sim/nao/parcial`. Ver [schema.ts:245-258](../../../lib/opportunities/schema.ts#L245-L258).
  - Benefícios: gravar em **`beneficios` top-level** (8 chaves camelCase: `reducaoTempo, eliminacaoErros, produtividade, qualidadeDados, reducaoCustos, reducaoRetrabalho, compliance, objetivosEstrategicos`), escala 1–5. Ver [schema.ts:260-273](../../../lib/opportunities/schema.ts#L260-L273).
- **D-10:** Os 4 fatores manuais da Priorização (`esforco`, `complexidade`, `tempo`/frequência, `objetivo`) seguem como em [PriorizacaoStep.tsx](../../../components/opportunities/wizard/steps/PriorizacaoStep.tsx); adiciona-se a **exibição** do 5º (bucket FTE derivado). Todos com pesos visíveis (WIZARD-02).

### Validações por step (WIZARD-04)
- **D-11:** Identificação: nome + área obrigatórios (+ processo, conforme `validateStep('identificacao')` atual). Processo: processo obrigatório. Mensagens claras em pt-BR. Reaproveitar o `validateStep` existente, ajustado ao fluxo único.

### Executor's Discretion
- **Redundância `frequencia` × `tempo`:** o mockup pede "Frequência" no step Processo (`frequencia`, texto descritivo) e "Frequência/Retorno" na Priorização (`tempo` = fator de score `diario..anual`). Para não pedir frequência duas vezes, o planner deve preferir **alimentar o fator `tempo` a partir da seleção de frequência do step Processo** (fonte única) — discrição do executor, redundância sinalizada.
- Layout/ordem visual interna de cada step, ícones, microcópia — discrição, desde que mantenha paridade estrutural com o mockup.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contrato visual / modelo (fonte da verdade)
- `_giba_wsi-dashboard.html` §1502–1599 — wizard de 5 steps (`FORM_STEPS`, `renderFormStep`, `formNext`): a estrutura exata dos steps Identificação/Processo/Critérios/Benefícios/Priorização.
- `_giba_wsi-dashboard.html` §483–490 — fórmula de score de 5 fatores (pesos + fallbacks).
- `_giba_wsi-dashboard.html` §1565 — `ftOpts`: as faixas horas→bucket FTE (base de D-02).

### Requisitos / roadmap
- `.planning/ROADMAP.md` (Phase 11) — Goal + 4 Success Criteria.
- `.planning/REQUIREMENTS.md` — WIZARD-01, WIZARD-02, WIZARD-03, WIZARD-04.

### Decisões e schema das fases anteriores
- `.planning/phases/10-backend-queries-validation-score/10-CONTEXT.md` — D-01..D-08 (schema aditivo, `criterios` minúsculo, `tempo`→frequência, `riskInputSchema`, paridade SCORE-04).
- `.planning/phases/09-schema-evolution-foundation/09-CONTEXT.md` — modelo de critérios/benefícios/FTE/score de 5 fatores.

### Código a tocar / reaproveitar
- `lib/opportunities/schema.ts` §243–299 — `opportunityInputSchema` (first-class `criterios`/`beneficios`/`fte_horas`/`prioridade_fte`; discriminatedUnion persona/formulário). **Alvo de gravação do wizard.**
- `lib/opportunities/score.ts` — fórmula única de 5 fatores (SCORE-04). Não duplicar.
- `lib/opportunities/actions.ts` — `createOpportunity` (mapeamento dos campos do wizard → input; alvo de ajuste para first-class + source fixo).
- `components/opportunities/wizard/state.ts` — `stepsFor()`, `validateStep()`, `WizardFormData`, `defaultFormData()` (reestruturar para fluxo único create).
- `components/opportunities/wizard/steps/{CriteriosStep,BeneficiosStep,PriorizacaoStep}.tsx` — reescrever para o modelo first-class (D-09, D-10).
- `components/opportunities/wizard/ScorePreview.tsx` — já suporta a prop `fte`; passar o bucket derivado.
- `lib/database.types.ts` — **hand-maintained** (gen:types bloqueado: MCP aponta p/ projeto errado, sem `SUPABASE_ACCESS_TOKEN`). Não depender de regen automática; tratar como verdade verificada contra o catálogo vivo.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ScorePreview.tsx`: consome a fórmula única; **prop `fte` já existe** mas não é passada hoje — basta alimentar o bucket derivado.
- `score.ts` (`calcScore`, `priorityLevel`): 5 fatores completos, inclui peso de FTE. Reuso direto.
- `CriteriosStep` / `BeneficiosStep` / `PriorizacaoStep`: estrutura de UI reaproveitável (click-to-cycle, barras 1–5, selects de peso), mas **modelo de dados desatualizado** — precisa reescrita p/ first-class (D-09).
- `validateStep()` em `state.ts`: base das validações pt-BR por step (WIZARD-04).
- `fields.tsx` (`SelectField` etc.): primitivos de formulário compartilhados.

### Established Patterns
- Wizard é `'use client'`; estado intermediário em `WizardFormData` (`state.ts`), submit final filtra/mapeia para `OpportunityInput`.
- Mass-assignment defense: `opportunityInputSchema` é `discriminatedUnion` + `.strict()`; campos server-derived (tenant_id, seq_id, etc.) rejeitados. O wizard nunca envia esses campos.
- Score calculado em runtime, nunca persistido; `rpa_score`/`prioridade.fte` derivados.

### Integration Points
- Submit do wizard → `createOpportunity` (Server Action, `lib/opportunities/actions.ts`) → Zod `opportunityInputSchema` → INSERT (RLS por `tenant_id`).
- `prioridade_fte` derivado deve entrar no payload do input (campo aceito pelo schema, [schema.ts:243](../../../lib/opportunities/schema.ts#L243)).
</code_context>

<specifics>
## Specific Ideas

- FTE com **fonte única** (horas) e bucket derivado — o PO priorizou simplicidade/menos atrito sobre paridade literal com os dois inputs do mockup.
- Click-to-cycle nos Critérios e barras 1–5 nos Benefícios são deliberadamente **melhores que os dropdowns do mockup** — manter a UX superior, só realinhar o modelo de dados.
- Persona vira **legado read/edit-only**; criação é sempre `formulario`.
</specifics>

<deferred>
## Deferred Ideas

- **Modal de detalhe + edição (8 abas) e `stepsFor('...', 'edit')`** → **Phase 13** (VIEW-04). Não tocar nesta fase.
- **REALIGN-7.6 / reativação do enrichment de IA** dos campos técnicos (`escopo_automacao[]`, `beneficios_esperados[]`, e a revisão de `lib/ai/schema.ts` p/ domínio de frequência) → deferido (carryover v0.1; ver `10-04-AI-COMPAT.md`). Phase 11 só garante compat de schema (MODEL-10), não reativa IA.
- **Override manual do bucket FTE** — considerado e rejeitado (D-01: derivação automática). Se o negócio pedir override no futuro, é mudança incremental no step Priorização.

</deferred>

---

*Phase: 11-wizard-fluxo-unico*
*Context gathered: 2026-06-04*
