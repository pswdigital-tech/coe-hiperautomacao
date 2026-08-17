# Phase 10: Backend — Queries, Validação e Paridade de Score - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

A camada de aplicação (TypeScript/Next.js) alcança o modelo da migration `0011` (Phase 9) e o **preview de score do cliente passa a ser numericamente idêntico** ao `opportunity_score()` do backend.

Entrega:
1. **Tipos regenerados** (`lib/database.types.ts`) expondo os novos campos de `opportunities` (`fte_horas`, `rpa_score`, `fonte`, `tipo_processo`, `beneficio_qualitativo`, `criterios`, `beneficios`) **e** a nova tabela `opportunity_risks`.
2. **Queries de leitura** com a whitelist `OPPORTUNITY_COLUMNS` ampliada para os novos campos (sem `select('*')` cego).
3. **Zod `opportunityInputSchema`** aceitando/validando o novo modelo (campos novos + 8 critérios em domínio minúsculo + bucket `prioridade.fte`), preservando a defesa anti mass-assignment (`.strict()`).
4. **Paridade de score (SCORE-04)**: fórmula única compartilhada cliente/servidor + teste de paridade.
5. **Tipos Zod de risco** (`riskInputSchema`) — só validação/tipos; o CRUD de riscos é Phase 12.
6. **Migração dos testes legados** ao novo domínio (frequência) para manter typecheck + suite verdes.

**Fora desta fase (são Phases 11–15):** wizard 5-steps (P11), UI/CRUD da aba Risco (P12), atualizações de telas/KPI/kanban (P13), view Relatório (P14), seed Unidasul (P15). Nenhuma tela nova aqui — só camada de dados/validação/score do app.

</domain>

<decisions>
## Implementation Decisions

> Todas as 4 áreas discutidas foram respondidas **"Você decide"** pelo PO — o PO confia na recomendação. Abaixo a direção travada (a recomendada de cada questão) + a flexibilidade restante.

### D-01 — Paridade de score: fórmula única compartilhada (SCORE-04)
- **Extrair UM `calcScore` (5 fatores `_giba:483-490`) para `lib/opportunities/score.ts`** (cliente-safe, sem `server-only`), importado por:
  - `components/opportunities/wizard/ScorePreview.tsx` (que **deixa de ter fórmula própria** — hoje contém a fórmula v0.1 obsoleta: pesos ×25, 4 fatores, sem FTE, domínio `pequeno/medio/grande`).
  - O teste de paridade.
- O módulo replica **literalmente** os pesos e fallbacks já travados em `tests/schema/score-rule.test.ts` (`ef{baixo:8,medio:14,alto:20}|14`, `cx{baixo:20,medio:13,alto:6}|13`, `tm{diario:20,semanal:16,quinzenal:12,mensal:8,anual:2}|16`, `ob{obj*4}|12`, `ft{muito_baixo:4..muito_alto:20}|12`) — incluindo `priority_level` (alta ≥70 / média 40–69 / baixa <40).
- **Prova de paridade em dois níveis:**
  1. **Teste puro** comparando `calcScore` (cliente) contra a tabela de casos canônicos de `tests/schema/score-rule.test.ts` (reuso do "SEED da paridade").
  2. **Teste de integração `skipIf`** que roda a função SQL real `opportunity_score()` no Supabase Cloud (mesmo padrão `describe.skipIf(!process.env.NEXT_PUBLIC_SUPABASE_URL)` + lazy `serviceRoleClient()` dos testes de isolamento) e compara linha-a-linha com o `calcScore` do cliente — prova viva, não só replicação da tabela de pesos. Em modo unit-only (sem env), entra em skip; suite continua exit 0.
- **Por quê:** uma única fonte da verdade no cliente elimina a divergência atual; o teste SQL fecha o loop contra o backend de fato.

### D-02 — Schema de input: aditivo, mantém o split persona/formulário
- **Adicionar** ao `opportunityInputSchema` (sem colapsar o `discriminatedUnion('source', …)`): `fte_horas` (numeric ≥0, opcional/nullable), `fonte` (text, opcional), `tipo_processo` (`string[]` com limites), `beneficio_qualitativo` (text), bucket `prioridade.fte` (`fte_bucket`: `muito_baixo|baixo|medio|alto|muito_alto`), e os 8 `criterios`/8 `beneficios` como **campos top-level dedicados** (espelhando as colunas jsonb de 0011), validados por `.strict()`.
- **Corrigir o domínio obsoleto:** `criterioEnum` `['SIM','NAO','PARCIAL']` → **`['sim','nao','parcial']`** (D-08 da Phase 9); `timeBucketEnum` `['pequeno','medio','grande']` (duração) → enum de **frequência** `['diario','semanal','quinzenal','mensal','anual']` para o campo `tempo`.
- **NÃO** colapsar o split persona/formulário nem reescrever o fluxo de wizard — isso é Phase 11. P10 só garante que o novo modelo é **aceito e validado**, preservando a defesa mass-assignment (campos server-derived `id/tenant_id/created_by/seq_id/...` e `rpa_score`/`score`/`priority` continuam rejeitados como `unrecognized_keys`).
- **rpa_score NÃO entra no input** (é GENERATED no DB, derivado de `criterios`) — só aparece nos tipos de leitura/saída.

### D-03 — opportunity_risks na P10: só tipos + validação Zod
- **P10 entrega:** tipos regenerados (tabela `opportunity_risks` visível) + um `riskInputSchema` Zod (`.strict()`, enums `tipo/impacto/probabilidade/status`, `responsavel` text livre, `descricao`/`resposta`/`descricao_impacto`; `priority` é **GENERATED** → fora do input).
- **P10 NÃO entrega:** queries de leitura nem server actions de mutação (create/update/delete) de riscos — ficam na **Phase 12** junto da UI. Mantém a P10 enxuta e focada em SCORE-04 + cobertura do novo modelo.
- Satisfaz a dependência declarada da P12 ("server actions / validação") na parte de **validação**; a P12 acrescenta as actions.

### D-04 — Regeneração de tipos + migração dos testes legados
- **Regenerar `lib/database.types.ts`** via a ferramenta **MCP do Supabase (`generate_typescript_types`)** — contorna `npm run gen:types`, que exige `supabase` CLI logado em sessão não-TTY. **Fallback:** `npm run gen:types` (o `SUPABASE_PROJECT_REF=vxgthycrjetniejsjmee` já está no `.env.local`).
- **Migrar TODOS os ~7+ testes legados** que usam o domínio antigo para o domínio de frequência no mesmo passo, deixando `tsc --noEmit` + suite verdes:
  - `tests/opportunities/actions.test.ts` (`tempo:'medio'`)
  - `tests/security/tenant-isolation.test.ts`, `tests/security/atomicity.test.ts`, `tests/security/mass-assignment.test.ts` (`tempo:'medio'`)
  - `tests/security/public-form.test.ts` (`p_tempo:'medio'` — **ver code_context: confirmar o domínio do parâmetro da RPC `create_public_opportunity` pós-0011 antes de migrar o valor**)
  - `tests/ai/enrichment.test.ts` (`tempo:'pequeno'`)
- Remover os `any`-casts do teste de riscos da Phase 9 quando os tipos regenerados passarem a expor `opportunity_risks` (pendência registrada no STATE).

### Executor's Discretion
- Nome/local exato do módulo de score (`lib/opportunities/score.ts` é a recomendação) e assinatura de `calcScore` (aceitar um objeto `Prioridade` alinhado a `tests/schema/score-rule.test.ts`).
- Forma exata de representar `criterios`/`beneficios` no input Zod (objeto top-level com `.strict()` espelhando as colunas jsonb vs. sub-schema reutilizável) — desde que rejeite chaves desconhecidas e valores fora do domínio.
- Índices/ordenations adicionais nas queries (ex.: ordenar por `fte_horas`) — só se necessário; P13 detalha as telas.
- Se a coluna whitelist deve incluir `criterios`/`beneficios` jsonb agora (provável SIM, P11/P12 consomem) — decidir explicitamente conforme HARDEN-E-06.
- Estratégia exata do teste de paridade SQL (uma query `select opportunity_score(...)` por caso vs. uma RPC batch) e o conjunto de casos representativos (no mínimo: máximo=100, intermediário=59, mínimo=36, todos-fallback=67).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Fórmula de score (fonte da verdade)
- `_giba_wsi-dashboard.html` §483-490 — `calcScore` (5 fatores × 20, pesos e fallbacks) → SCORE-04, D-01
- `tests/schema/score-rule.test.ts` — **a fórmula já travada em TS** (pesos + fallbacks + `priority_level` + tabela de casos canônicos). É o "SEED da paridade SCORE-04" — reusar, não reinventar.
- `supabase/migrations/0011_*.sql` (a migration aplicada da Phase 9) — `opportunity_score()` SQL de 5 fatores + view `opportunities_with_score`. A função SQL é o lado "servidor" da paridade.

### Escopo / requisitos / decisões
- `.planning/ROADMAP.md` §"Phase 10" — Goal + 4 Success Criteria (autoridade do escopo desta fase)
- `.planning/REQUIREMENTS.md` — SCORE-04 (único REQ-ID desta fase)
- `.planning/phases/09-schema-evolution-foundation/09-CONTEXT.md` — decisões D-01..D-17 da Phase 9 (domínio de `criterios` minúsculo D-08, `tempo`→frequência D-05, `rpa_score` GENERATED D-09, `opportunity_risks` enums/priority D-12..D-15)
- `.planning/phases/09-schema-evolution-foundation/09-01-SUMMARY.md` — 5 deviations do apply de 0011 (priority via trigger, backfill escopado ao tenant FGCoop, tenant 99999999 com fonte NULL, mapeamentos de frequência)

### Código a evoluir (camada de app — alvos diretos)
- `lib/opportunities/schema.ts` — `opportunityInputSchema`, `criterioEnum` (uppercase→lowercase), `timeBucketEnum` (duração→frequência), defesa mass-assignment `.strict()` → D-02
- `lib/opportunities/queries.ts` §23-33 — whitelist `OPPORTUNITY_COLUMNS` a ampliar → SC1, D-04
- `lib/opportunities/actions.ts` — server actions de mutação (alinhar ao schema novo)
- `lib/opportunities/types.ts` — tipos de domínio que dependem de `database.types.ts`
- `components/opportunities/wizard/ScorePreview.tsx` — **fórmula v0.1 obsoleta a substituir** pelo módulo único → D-01
- `lib/opportunities/utils.ts` §20-24 — `scoreColor()` (thresholds 70/40 — já corretos, conferir)

### Geração de tipos / processo
- `package.json` §10 — script `gen:types` (`supabase gen types … --project-id $SUPABASE_PROJECT_REF`); `.env.local` já tem o ref. Preferir MCP do Supabase `generate_typescript_types` (D-04).
- Padrão `describe.skipIf(!process.env.NEXT_PUBLIC_SUPABASE_URL)` + lazy `serviceRoleClient()` — dos testes de isolamento da Phase 7.5 (reusar no teste de paridade SQL).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/schema/score-rule.test.ts` exporta `calcScore`/`priorityLevel` em TS já no novo domínio — base direta do módulo `lib/opportunities/score.ts` (D-01).
- Whitelist `OPPORTUNITY_COLUMNS`/`PHASE_COLUMNS` (queries.ts) — padrão HARDEN-E-06 a estender, não substituir por `select('*')`.
- Defesa mass-assignment por `.strict()` em cada variant do `discriminatedUnion` (schema.ts §231-244) — preservar ao adicionar campos.
- Padrão de teste de integração `skipIf` + lazy service-role client (Phase 7.5) — reaproveitar para o teste SQL de paridade.
- `scoreColor()` (utils.ts) já usa thresholds 70/40 corretos — alinhado a `priority_level`.

### Established Patterns
- **Score nunca persistido**: a fórmula vive em função/módulo, nunca em coluna. `rpa_score`/`risk.priority` são GENERATED no DB (não entram no input Zod).
- **Tipos vêm do schema vivo**: `lib/database.types.ts` é gerado, não editado à mão; consumido por `types.ts`/`queries.ts`/`actions.ts`.
- **Domínio de `tempo` mudou** (duração→frequência): qualquer literal `'pequeno'/'medio'/'grande'` em testes/código de app é dívida do v0.1 a migrar.

### Integration Points / Riscos de execução
- **RPC `create_public_opportunity`**: os testes de `public-form` passam `p_tempo:'medio'`. Antes de migrar esses valores, **confirmar a assinatura/domínio do parâmetro `p_tempo` da RPC pós-0011** — se a RPC ainda espera o enum antigo, decidir se a RPC é atualizada nesta fase ou se o valor de teste só acompanha o domínio do parâmetro real. (Formulário público anônimo — não regredir a Phase 7.5.)
- **`enrichment.ts` / `lib/ai/schema.ts` (MODEL-10)**: SC4 exige que o schema continue compatível com enrichment por IA — campos derivados preenchíveis manual agora / IA depois, sem refatorar schema. Verificar que adicionar os campos novos não quebra o contrato de `enrichOpportunity()`.
- **`opportunity_score()` ganhou o 5º fator (`p_fte`)**: a view é o único call-site SQL; o lado de app só lê `score`/`priority_level` da view.

</code_context>

<specifics>
## Specific Ideas

- A paridade deve bater **número a número** com `_giba:483-490` e com `tests/schema/score-rule.test.ts` — incluindo os fallbacks `14/13/16/12/12`. O caso `(baixo,baixo,diario,5,muito_alto)=88` (não 100) é a armadilha já documentada — o teste de paridade deve incluí-lo.
- O `ScorePreview` hoje renderiza um número **errado** para o modelo novo (fórmula v0.1). Corrigir isso é o ganho visível de SCORE-04.
- "Aditivo, não reescrever": a P10 não deve antecipar o wizard da P11. Se o plan-checker apontar o split persona/formulário como "não-paridade com `_giba`", responder que a reestruturação é escopo explícito da Phase 11.

</specifics>

<deferred>
## Deferred Ideas

- **CRUD de `opportunity_risks`** (queries de leitura + server actions create/update/delete) — Phase 12 (junto da UI da aba Risco). P10 só faz tipos + `riskInputSchema`.
- **Colapsar persona/formulário num fluxo único** — Phase 11 (wizard 5-steps).
- **Thresholds `fte_horas` → bucket `prioridade.fte`** (regra de bucketização do FTE numérico) — Phase 11 ou 2º momento (IA); legado fica NULL.
- **Destino do tenant `99999999`** (4 oportunidades com `fonte` NULL) — decisão de **dados/ops**, não de código de app. Recomenda-se tratar na Phase 15 (seed) ou numa limpeza de dados dedicada; não bloqueia a P10.
- **Geração por IA dos campos derivados** — Future Requirement (REALIGN-7.6 / AI-GEN), fora do v0.2; schema só fica compatível (MODEL-10).

</deferred>

---

*Phase: 10-backend-queries-validation-score*
*Context gathered: 2026-06-04*
