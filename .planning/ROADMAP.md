# ROADMAP — CoE Hiperautomação · Milestone v0.1 (MVP)

> Roadmap das 8 fases para o MVP. Vai sair daqui um sistema multi-tenant com login, listagem, CRUD e kanban — pronto pro cliente piloto FGCoop usar de verdade.
>
> Fonte da verdade do escopo: [.planning/PROJECT.md](PROJECT.md). Estado de execução: [.planning/STATE.md](STATE.md).

## Visão geral

| # | Phase | Status | Entrega Verificável | Plans |
|---|---|---|---|---|
| 1 | **Modelagem do Banco** | ✅ Done | Schema + RLS + funções + 29 oportunidades reais no Supabase | (modelagem feita manualmente) |
| 2 | **Bootstrap + Login** | ✅ Done | Login com `admin.fgcoop`, route guard, dashboard com nome + tenant + RLS check | 02-01 a 02-04 |
| 3 | **Lista (Tabela read-only)** | ✅ Done | Vê as 29 oportunidades reais em tabela com paridade visual do mockup | 03-01 a 03-03 |
| 4 | **Modal de Detalhe (read-only)** | ✅ Done | Modal com 6 abas por tipo (persona/formulário), URL-navegável, fullscreen fallback | 04-01 a 04-04 |
| 5 | **Trocar Status + Cards + Kanban** | ✅ Done | Drag-and-drop kanban + dropdown modal + trigger SQL sincronia | 05-01 a 05-03 |
| 6 | **Wizard CRUD (Criar + Editar + Excluir)** | ✅ Done | Wizard criar/editar + popup confirmação de delete (extra) | 06-01 a 06-03 |
| 7 | **Filtros, Busca, Sort, KPIs reativos** | ✅ Done | Paridade total com toolbar do mockup + KPI bar reativa | 07-01 a 07-03 |
| 7.5 | **Hardening de Segurança MVP** | ✅ Done (6/6) | Testes RLS, Zod centralizado, atomicidade `seq_id`, hardening form público (BotID+Turnstile+RPC limits+IP hashed), headers de segurança | **6 plans** (07.5-01 a 07.5-06) |
| 7.6 | **Enriquecimento por IA das Oportunidades** *(INSERTED)* | 🔜 Planejado (0/6) | Remove steps "Automação" e "Priorização" do user input; pós-processamento OpenAI server-side preenche 9 campos automaticamente; admin edita no modal de detalhe | **6 plans** (07.6-01 a 07.6-06) |
| 8 | **Polish + Deploy** | ⏸ Aguardando 7.6 | Loading states, error boundaries, responsivo, deploy Vercel | 08-01 a 08-03 |

## Phase 7.5 — Plans (planejados em 2026-05-21)

**Goal:** Endurecer a plataforma contra os vetores de ataque relevantes ao contexto multi-tenant + formulário público anônimo, antes do deploy de produção (Phase 8).

**Plans:** 6 plans em 6 waves (paralelismo limitado — cada plan tem dependência clara).

Plans:

- [x] 07.5-01-PLAN.md — Wave 0: Infraestrutura de testes (Vitest + seed + scripts shell) [HARDEN-INFRA-01..04] — **DONE 2026-05-22** (8min, 4 commits 059cddd..4fdfeac)
- [x] 07.5-02-PLAN.md — Wave 1: Atomicidade `seq_id` (migration 0006 + teste 50 inserts paralelos) [Bloco C, HARDEN-C-01..03] — **DONE 2026-05-22** (~8min, 3 commits f964c69 migration 0006 tenant_sequences + next_seq_id atômico + trigger always-override, d11a110 HANDOFF.md para apply manual no Supabase Cloud, d635d22 atomicity.test.ts com describe.skipIf). **Apply manual no Dashboard SQL Editor pendente** — handoff em `.planning/phases/07.5-hardening-seguranca-mvp/07.5-02-MIGRATION-HANDOFF.md`.
- [x] 07.5-03-PLAN.md — Wave 2: Zod `.strict()` + audit de Mass Assignment em Server Actions [Bloco B, HARDEN-B-01..04] — **DONE 2026-05-22** (~5min, 4 commits a91e924..e42b486)
- [x] 07.5-04-PLAN.md — Wave 3: Testes de isolamento de tenant (RLS + IDOR cross-tenant) [Bloco A, HARDEN-A-01..05] — **DONE 2026-05-22** (~3min, 1 commit e3b9736 tenant-isolation.test.ts 399 linhas com 12 specs em 4 grupos cobrindo opportunities/opportunity_phases/profiles + schema integration). **Write-only mode** — suite em skip mode até `.env.test` apontar para Supabase Cloud de teste. Detalhes em `.planning/phases/07.5-hardening-seguranca-mvp/07.5-04-SUMMARY.md`.
- [x] 07.5-05-PLAN.md — Wave 4: Security headers em `proxy.ts` + audit de service-role + whitelist em queries [Bloco E, HARDEN-E-01..06] — **DONE 2026-05-22** (5min, 2 commits c760809 proxy.ts headers + 17e2272 queries whitelist)
- [x] 07.5-06-PLAN.md — Wave 5: Hardening do formulário público (migration 0007 + Turnstile + BotID + logging) [Bloco D, HARDEN-D-01..04, D-06, D-07; D-05 manual-only] — **DONE 2026-05-22** (~17min, 8 commits f4f17f9..b98bf6d). 4 camadas de defesa: BotID edge + Cloudflare Turnstile invisível + Server Action com log/pt-BR genérico + RPC `create_public_opportunity` com length/array/jsonb limits. IP hashed por construção (THROW sem `IP_HASH_SALT`). **Write-only mode** — migration 0007 + 3 env vars Vercel (NEXT_PUBLIC_TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY + IP_HASH_SALT) pendentes de setup manual. Detalhes em `.planning/phases/07.5-hardening-seguranca-mvp/07.5-06-SUMMARY.md`.

**Dependências entre plans:**

- 02, 03, 05 dependem só de 01 (infra de testes)
- 04 depende de 01 + 02 + 03 (testes RLS usam infra + seq_id atômico + schema strict)
- 06 depende de 01 + 02 + 03 + 05 (form público usa todas as defesas, inclusive CSP do Plan 05)

**Tasks com [BLOCKING] schema push:** Plan 02 (migration 0006) e Plan 06 (migration 0007) — pedem confirmação humana antes de aplicar.

## Phase 7.6 — Plans (planejados em 2026-05-26)

**Goal:** Tirar do usuário final a responsabilidade de preencher campos técnicos (Automação + Priorização) e transferi-la para pós-processamento OpenAI server-side disparado via `after()` do Next.js. Usuário NUNCA sabe que existe IA — vê só um formulário menor. Bloqueia Phase 8 (deploy).

**Plans:** 6 plans em 4 waves (paralelismo otimizado em waves 2-3).

Plans:

- [ ] 07.6-01-PLAN.md — Wave 0: Infra (npm install openai + `serviceRoleClient()` em lib/supabase/server.ts + migration 0010 + handoff doc + OPPORTUNITY_COLUMNS update) [AI-DB-01, AI-DB-02, AI-RLS-01, HARDEN-E-06-EXT]. Inclui **[BLOCKING] apply manual** da migration 0010 no Supabase Cloud Dashboard SQL Editor.
- [ ] 07.6-02-PLAN.md — Wave 1: Pipeline IA (`lib/ai/schema.ts` Zod 9 campos + `lib/ai/prompts.ts` builder anti prompt-injection + `lib/ai/enrichment.ts` wrapper completo com gpt-4o-mini + parse + zodResponseFormat + WHERE defensivo triplo + testes mockados via `vi.mock('openai')`) [AI-MODEL-01, AI-RLS-01, AI-IDEMP-01, AI-TEST-01, AI-TEST-02].
- [ ] 07.6-03-PLAN.md — Wave 2: Server Action integration (campos enriquecidos viram opcionais em `opportunityInputSchema` + `createOpportunity`/`createPublicOpportunity` disparam `after(enrichOpportunity)` envolto em try/catch + testes mockam `next/server.after` para verificar wiring) [AI-ASYNC-01, AI-SCHEMA-OPT-01].
- [ ] 07.6-04-PLAN.md — Wave 3: Wizard refactor (remover steps `automacao` e `priorizacao` de `STEPS_COMMON`, `STEPS_PERSONA_EXTRA`, `STEPS_FORMULARIO_EXTRA` em `state.ts` + remover branch validateStep priorizacao + componentes `AutomacaoStep`/`PriorizacaoStep` PRESERVADOS para mode='edit' + testes puros sobre `stepsFor()`) [AI-WIZARD-01]. **Paralelo com 05 e 06.**
- [ ] 07.6-05-PLAN.md — Wave 3: PublicForm refactor (reduzir `app/r/[slug]/PublicForm.tsx` de 6 para 2-3 steps; remover campos enriquecidos do `FormState`/`initialState`/submit payload; Turnstile widget INTACTO via 7.5 Plan 06; testes via regex sobre source code) [AI-PUB-01]. **Paralelo com 04 e 06.**
- [ ] 07.6-06-PLAN.md — Wave 3: Modal badge + smoke E2E (componente novo `AiEnrichmentBadge.tsx` com 3 estados pt-BR pending/failed/enriched + integração em `ModalHeader.tsx` ao lado do StatusSelector + instalar `@testing-library/react` + `jsdom` + tests + `checkpoint:human-verify` para smoke A wizard interno + smoke B form público + smoke C path de falha com `OPENAI_API_KEY` inválida) [AI-UI-01, AI-ADMIN-01]. **Paralelo com 04 e 05.**

**Dependências entre plans (encoded em frontmatter `depends_on`):**

- Wave 0: Plan 01 sozinho (sem deps; bloqueia tudo).
- Wave 1: Plan 02 depende de 01 (precisa do openai npm pkg + `serviceRoleClient()` para implementar enrichment).
- Wave 2: Plan 03 depende de 01 + 02 (importa `enrichOpportunity` de Plan 02).
- Wave 3: Plans 04, 05, 06 dependem só de 01 (no overlap de arquivos entre eles → paralelos). Plan 06 também depende de 02 + 03 (smoke checkpoint precisa do pipeline funcionando).

**Tasks com [BLOCKING] schema push:** Plan 01 Task 6 (migration 0010 — `add column ai_enrichment_status` + DROP/CREATE view `opportunities_with_score`).
**Tasks com [BLOCKING] smoke verification:** Plan 06 Task 3 (smoke E2E manual com `OPENAI_API_KEY` real).

**User setup pendente antes de executar:**

- `SUPABASE_SERVICE_ROLE_KEY` em `.env.local` (gerado em Supabase Dashboard → Project Settings → API → service_role)
- `OPENAI_API_KEY` em `.env.local` populado com chave real (gerado em https://platform.openai.com/api-keys; já presente vazio em `.env.example` e `.env.local`)
- Aplicar migration 0010 no Dashboard SQL Editor + rodar `npm run gen:types` (gates de Plan 01 Task 6)

## Requisitos validados (mapeados de PROJECT.md)

Cada requisito de PROJECT.md → uma ou mais fases:

| Requisito | Phase(s) |
|---|---|
| Autenticação por tenant | 2 |
| Listagem em 3 views (Tabela/Cards/Kanban) | 3, 5 |
| CRUD via wizard multi-step | 6 |
| Dois tipos (persona/formulário) com schemas próprios | 1 (schema), 6 (UI) |
| Pipeline de 8 status | 1 (enum), 5 (UI), 8 (timeline) |
| Score calculado | 1 (função SQL), 3 (exibir) |
| Fases com datas | 1 (tabela), 8 (UI + trigger) |
| Filtros + busca + ordenação | 7 |
| KPIs no topo | 7 |
| Modal de detalhe com edição inline | 4, 6, **7.6 (badge AI + edit dos 9 campos enriquecidos)** |
| Deploy em produção | 8 |
| **Defesa contra vazamento entre tenants** | **7.5 (Bloco A)** |
| **Validação centralizada anti-Mass Assignment** | **7.5 (Bloco B)** |
| **Atomicidade `seq_id` (race condition)** | **7.5 (Bloco C)** |
| **Hardening do formulário público anônimo** | **7.5 (Bloco D)** |
| **Headers de segurança + audit de segredos** | **7.5 (Bloco E)** |
| **Enriquecimento server-side por IA dos campos técnicos** | **7.6 (Blocos A–F)** |

## Ordem das Phases

A ordem é por dependência prática, não por importância. Cada fase entrega algo testável.

- **Phase 1 antes de tudo**: nada de UI sem schema. **Feito.**
- **Phase 2 antes de qualquer tela com dados**: precisa de auth + tenant pra RLS fazer sentido. Sem isso, queries retornam vazio.
- **Phase 3 antes de Phase 4**: o modal abre a partir de uma linha da lista.
- **Phase 5 (kanban) antes de Phase 8 (fases/timeline)**: a mudança de status pelo kanban dispara o trigger de fase.
- **Phase 6 (CRUD) pode ser paralela a Phase 5**, mas plano sequencial pra evitar context switching.
- **Phase 7 (filtros/KPIs)** depende da lista funcionando (Phase 3).
- **Phase 7.5 (hardening de segurança)** inserida entre 7 e 8 — deploy de produção sem testes de isolamento de tenant + rate limit no formulário público é risco real, não teórico. Bloqueia Phase 8.
- **Phase 7.6 (enriquecimento por IA)** inserida entre 7.5 e 8 (2026-05-26) — wizard precisa ser refatorado antes do deploy (steps "Automação" e "Priorização" deixam de ser inputs do usuário; viram output de OpenAI server-side). Reverte escopadamente a decisão "IA generativa = out-of-scope" do PROJECT.md: IA é auxiliar interno invisível, não feature do produto. Bloqueia Phase 8.
- **Phase 8 (polish/deploy)** é sempre por último.

## Princípios de execução

1. **Fatias verticais** — cada plan entrega front + integração com Supabase + verificação visual. Nada de "Plan X = só schema, Plan Y = só API, Plan Z = só UI".
2. **Mockup como contrato** — quando UI for ambígua, abre `fgcoop-coe-v2.html` no navegador e copia o comportamento. Só evolui depois da paridade.
3. **RLS first** — toda query nova passa por teste cruzado: criar segundo tenant (`acme` de teste), garantir que ele NÃO vê dados do FGCoop.
4. **Cada plan tem checkpoint visual** — `npm run dev` rodando + verificação humana antes de marcar plan como complete.

## Pós-MVP (fora desta milestone)

Listado em PROJECT.md → Out of Scope. Resumo:

- Admin panel cross-tenant
- Integração viva com n8n/RPA
- IA generativa
- Notificações por e-mail
- Audit log
- Importação CSV
- Mobile nativo

---
*Última atualização: 2026-05-26 — Phase 7.6 planejada em 6 plans/4 waves. `/gsd-plan-phase 7.6` produziu plans `07.6-01-PLAN.md` a `07.6-06-PLAN.md` em `.planning/phases/07.6-enriquecimento-ia-oportunidades/`. Próximo: rodar Plan 01 (Wave 0 — `npm install openai` + `serviceRoleClient()` + migration 0010 + [BLOCKING] apply manual + handoff doc), depois Plans 02 (Wave 1, depende de 01) → 03 (Wave 2, depende de 02) → 04+05+06 em paralelo (Wave 3, todos dependem só de 01 com 06 também dependendo de 02+03 para smoke).*

---

# Milestone v0.2 — Roadmap (Evolução do Modelo / Workshop I — Unidasul)

> Evolução do produto do contrato `fgcoop-coe-v2.html` (v0.1) para o novo contrato `_giba_wsi-dashboard.html` — score de 5 fatores, FTE, RPA Fit, registro de riscos e view de Relatório, aplicado globalmente a todos os tenants.
>
> Fonte da verdade do escopo: [.planning/PROJECT.md](PROJECT.md) → "Current Milestone: v0.2". Requisitos: [.planning/REQUIREMENTS.md](REQUIREMENTS.md). Fonte da verdade visual/modelo: [`_giba_wsi-dashboard.html`](../_giba_wsi-dashboard.html).
>
> **Numeração:** continua a partir do v0.1 (que terminou na Phase 8). A primeira fase do v0.2 é a **Phase 9**.
>
> **Granularidade:** standard (7 fases). **Cobertura:** 35/35 REQ-IDs mapeados.
>
> **Carryover v0.1 (não faz parte deste roadmap):** Phase 7.6 (Enriquecimento por IA) será REALINHADA aos novos campos do v0.2 antes de executar (REALIGN-7.6). Deploy de produção foi ADIADO (Future Requirements) — **não há fase de deploy no v0.2**.

## Phases

- [x] **Phase 9: Schema Evolution + Score/Risk/Contract Foundation** ✅ — Migration `0011` aplicada (write-only): `opportunities` evoluída (7 col + `rpa_score` GENERATED + `tempo`→frequência), `opportunity_score()` 5 fatores, view recriada, backfill FGCoop (29, escopado ao tenant), `opportunity_risks` (tenant_id + RLS + priority via trigger). Contrato trocado p/ `_giba`, `fgcoop` deprecated. Validado por dry-run 11/11.
- [x] **Phase 10: Backend — Queries, Validação e Paridade de Score** ✅ — Tipos pós-0011 (hand-derived, verificados vs catálogo vivo), Zod aditivo (criterios minúsculo, tempo→frequência, campos novos, mass-assignment preservado), whitelist ampliada, `riskInputSchema`. SCORE-04: fórmula única `lib/opportunities/score.ts` (cliente=backend, paridade validada ao vivo 100/88/59/36/67). Migration `0012` (RPC pública → frequência, dropa overload duplicado). tsc 0 erros, suíte 109 passed/0 failed.
- [x] **Phase 11: Wizard de Fluxo Único (5 steps)** — Substitui o split persona/formulário por um wizard de 5 steps com critérios, benefícios, FTE e priorização de 5 fatores. (completed 2026-06-05)
- [x] **Phase 12: Registro de Riscos (UI do modal)** — Aba "Risco" do modal: criar/editar/remover riscos com prioridade auto-calculada pela matriz impacto×probabilidade. (completed 2026-06-05)
- [x] **Phase 13: Atualizações de Tela (KPI / Tabela / Kanban / Modal)** — KPI FTE Total/mês, novas colunas e ordenação na tabela, FTE somado no kanban e modal com 8 abas alinhadas ao novo modelo. (completed 2026-06-05)
- [x] **Phase 14: View "Relatório"** — Dashboard analítico: cards de portfólio, distribuição por área (barras qtd + FTE) e 2 pie charts SVG. (2026-06-05)
- [x] **Phase 15: Seed dos Dados Reais do Workshop I (Unidasul)** — Importa as 64 oportunidades do Workshop I como seed de um tenant "Unidasul", isolado por tenant. (completed 2026-06-05)

## Phase Details

### Phase 9: Schema Evolution + Score/Risk/Contract Foundation

**Goal**: O banco passa a suportar o novo modelo (FTE, RPA Fit, fonte, tipoProcesso, benefício qualitativo, 8 critérios first-class, score de 5 fatores e registro de riscos), aplicado a todos os tenants sem perda de dados — e o contrato visual/modelo é oficialmente trocado.
**Depends on**: Phase 8 (v0.1 — schema base existente)
**Requirements**: MODEL-01, MODEL-02, MODEL-03, MODEL-04, MODEL-05, MODEL-06, MODEL-07, MODEL-08, MODEL-09, MODEL-10, SCORE-01, SCORE-02, SCORE-03, RISK-04, CONTRACT-01, CONTRACT-02
**Success Criteria** (what must be TRUE):

  1. Uma migration aplicada (write-only mode: arquivo + handoff de apply manual no Supabase Cloud SQL Editor) adiciona `fteHoras`, `rpaScore`, `fonte`, `tipoProcesso`, `beneficioQualitativo` e os 8 critérios first-class (SIM/NÃO/PARCIAL) às oportunidades, com backfill dos critérios antigos de `formulario_extras` sem perda de dados.
  2. A função `opportunity_score()` recriada retorna 5 fatores × 20 = 100 (esforço + complexidade + tempo[frequência] + objetivo + fte) batendo com `_giba:483-490`; a view `opportunities_with_score` expõe `score` + `priority_level` (alta ≥70 / média 40–69 / baixa <40). Score continua calculado em runtime, nunca persistido em coluna.
  3. `rpaScore` (0–6) é derivado dos 8 critérios por regra determinística documentada (em função SQL ou na view), não persistido como input manual arbitrário.
  4. A tabela `opportunity_risks` existe com `tenant_id not null` + RLS ativado e as 4 policies padrão (select/insert/update/delete por `current_tenant_id()`); um teste cruzado confirma que tenant A não enxerga riscos do tenant B.
  5. `_giba_wsi-dashboard.html` está documentado como a fonte da verdade visual/modelo e o `docs/PROJETO.md` reflete a nova fórmula de score, o novo modelo e o novo wizard; `fgcoop-coe-v2.html` está marcado como deprecated.

**Plans**: 3 plans (planejados em 2026-06-04) — Wave 0: 01 (migration) ‖ 02 (docs); Wave 1: 03 (testes)

- [ ] 09-01-PLAN.md — Migração 0011 (enums, colunas, rpa_score GENERATED, tempo→frequência, opportunity_score 5-fatores, backfill FGCoop, opportunity_risks + RLS) + handoff de apply manual [BLOCKING]
- [ ] 09-02-PLAN.md — Troca de contrato: docs/PROJETO.md (nova fórmula/modelo/wizard/risco) + fgcoop-coe-v2.html marcado deprecated
- [ ] 09-03-PLAN.md — Validação: testes de regra puros (rpa_score, score, matriz priority) + isolamento cross-tenant A≠B em opportunity_risks (skipIf)

### Phase 10: Backend — Queries, Validação e Paridade de Score

**Goal**: A camada de aplicação (queries de leitura, server actions de mutação, Zod schema e tipos gerados) cobre o novo modelo, e o preview de score exibido no cliente é idêntico ao calculado no backend.
**Depends on**: Phase 9
**Requirements**: SCORE-04
**Success Criteria** (what must be TRUE):

  1. Tipos TypeScript regenerados (`gen:types`) expõem os novos campos e a tabela `opportunity_risks`; as queries de leitura selecionam os novos campos via whitelist de colunas (sem `select('*')` cego).
  2. O `opportunityInputSchema` (Zod `.strict()` / discriminatedUnion) aceita e valida `fteHoras`, `rpaScore`, `fonte`, `tipoProcesso`, `beneficioQualitativo`, os 8 critérios e o bucket `prioridade.fte`, rejeitando campos não reconhecidos (defesa anti mass-assignment preservada).
  3. O preview de score calculado no cliente (durante o wizard) produz exatamente o mesmo número que `opportunity_score()` no backend para o mesmo input — verificado por um teste de paridade que compara as duas fórmulas em casos representativos.
  4. O schema permanece compatível com o enrichment por IA (MODEL-10): campos derivados são preenchíveis manualmente agora e por IA depois, sem exigir refatoração de schema.

**Plans**: 4 plans (planejados em 2026-06-04) — Wave 1: 01 (tipos+RPC) ‖ 02 (paridade score); Wave 2: 03 (schema+whitelist); Wave 3: 04 (testes legados+AI-compat)

- [ ] 10-01-PLAN.md — Regen de tipos (MCP) + migration 0012 (RPC create_public_opportunity p_tempo→frequency_bucket, BLOCKING apply) + remoção dos any-casts do teste de riscos [SC1, D-04]
- [ ] 10-02-PLAN.md — Paridade SCORE-04: módulo único lib/opportunities/score.ts + rewire do ScorePreview + teste de paridade 2 níveis (puro + skipIf SQL contra opportunity_score()) [SCORE-04, D-01]
- [ ] 10-03-PLAN.md — opportunityInputSchema aditivo (campos novos + criterios minúsculo + tempo frequência + bucket prioridade.fte) + riskInputSchema + whitelist OPPORTUNITY_COLUMNS ampliada [SC1, SC2, D-02, D-03]
- [ ] 10-04-PLAN.md — Migração dos ~7 testes legados ao domínio de frequência + verificação MODEL-10/SC4 (AI-compat) + suite/tsc verdes [SC4, D-04]

### Phase 11: Wizard de Fluxo Único (5 steps)

**Goal**: O usuário cria uma oportunidade por um único wizard de 5 steps que coleta identificação, processo, os 8 critérios, os 8 benefícios + FTE e a priorização de 5 fatores — substituindo o split persona/formulário.
**Depends on**: Phase 10
**Requirements**: WIZARD-01, WIZARD-02, WIZARD-03, WIZARD-04
**Success Criteria** (what must be TRUE):

  1. Ao criar uma oportunidade, o usuário percorre exatamente 5 steps na ordem Identificação → Processo → Critérios → Benefícios → Priorização (sem ramificação persona/formulário).
  2. O step "Critérios" coleta os 8 critérios com valores SIM/NÃO/PARCIAL; o step "Benefícios" coleta os 8 benefícios em escala 1–5 mais a estimativa de FTE em horas/mês.
  3. O step "Priorização" coleta os 5 fatores de score, incluindo o bucket de FTE, com os pesos visíveis ao usuário, e exibe o score resultante.
  4. Validações por step bloqueiam o avanço quando faltam campos obrigatórios (nome + área no step 1; processo no step 2), com mensagem clara em pt-BR.

**Plans**: 3 plans (planejados em 2026-06-04, plan-checker PASSED 1ª passada) — Wave 1: 01 (fundação); Wave 2: 02 ‖ 03 (zero overlap)

- [x] 11-01-PLAN.md — Fundação: `lib/opportunities/fte.ts` `deriveFteBucket` (horas→bucket, fonte única, teste de bordas) + `state.ts` fluxo único create (5 steps, sempre `source='formulario'`, sem Tipo/Classificação) + `validateStep` Identificação(nome+área)/Processo(processo) pt-BR [WIZARD-01, WIZARD-04]
- [x] 11-02-PLAN.md — Rewrite Critérios + Benefícios p/ modelo first-class v0.2: 8 chaves camelCase em `data.criterios`(sim/nao/parcial, click-to-cycle) e `data.beneficios`(1–5, barras) + captura de `fte_horas`; remove gravação em `formulario_extras` [WIZARD-03, WIZARD-04]
- [x] 11-03-PLAN.md — Processo: Frequência→select que alimenta `tempo` (fonte única, resolve redundância) + Ferramenta (default n8n); Priorização: 4 fatores manuais com pesos + display read-only do bucket FTE derivado + `ScorePreview` recebe `fte`; `WizardShell` deriva `prioridade_fte` no submit (persiste o 5º fator) [WIZARD-01, WIZARD-02]

**UI hint**: yes

### Phase 12: Registro de Riscos (UI do modal)

**Goal**: Dentro do modal de uma oportunidade, o usuário gerencia riscos estruturados — cadastra, edita e remove — com prioridade auto-calculada pela matriz impacto×probabilidade.
**Depends on**: Phase 9 (tabela `opportunity_risks`), Phase 10 (server actions / validação)
**Requirements**: RISK-01, RISK-02, RISK-03, RISK-05
**Success Criteria** (what must be TRUE):

  1. Na aba "Risco" do modal, o usuário cadastra um risco com descrição, tipo (Impedimento/Risco/Oportunidade), responsável (PSW/UnidaSul), impacto, probabilidade, status (Novo/Gerenciado/Mitigado/Ocorrido), resposta ao risco e descrição do impacto.
  2. A prioridade do risco (Crítica/Alta/Média/Baixa) é exibida automaticamente conforme a matriz impacto×probabilidade de `_giba:1180-1185`, sem o usuário escolhê-la manualmente.
  3. O usuário edita e remove riscos existentes de uma oportunidade, e as mudanças persistem (refletem após reabrir o modal).
  4. A aba "Risco" lista os riscos da oportunidade em tabela com ID (Rxxx), descrição, tipo, responsável, impacto, probabilidade, prioridade, status e ações.

**Plans**: 2 plans (planejados em 2026-06-05) — Wave 1: 01 (camada de dados); Wave 2: 02 (UI, depende de 01)

- [x] 12-01-PLAN.md — Camada de dados: query whitelisted (fetchRisksForOpportunity/fetchRiskById), server actions create/update/deleteRisk (Zod + tenant server-derived, priority via trigger), módulo de labels enum→PT [RISK-01, RISK-02, RISK-03] — **DONE 2026-06-05** (~5min, 4 commits `4fb21eb`/`26d22d0`/`e68b693`/`a9eb080`). Zero deviations, zero migration. tsc clean; tests/security+schema 78 passed/32 skipped/0 failed. Detalhes em `.planning/phases/12-registro-riscos-modal/12-01-SUMMARY.md`.
- [x] 12-02-PLAN.md — UI da aba Risco: tabela estruturada (RISK-05, remove campo legado), RiskForm + dialog empilhado (?risco, z-[60]) + prioridade read-only só após salvar (D-04), exclusão com confirmação (D-06), rotas fullscreen de deep-link (D-02) [RISK-01, RISK-02, RISK-03, RISK-05]

**UI hint**: yes

### Phase 13: Atualizações de Tela (KPI / Tabela / Kanban / Modal)

**Goal**: As telas existentes (KPI bar, tabela, kanban e modal de detalhe) refletem o novo modelo — FTE, frequência, complexidade, RPA Fit e novo score — em paridade com `_giba_wsi-dashboard.html`.
**Depends on**: Phase 10 (dados do novo modelo disponíveis no front)
**Requirements**: VIEW-01, VIEW-02, VIEW-03, VIEW-04, VIEW-05
**Success Criteria** (what must be TRUE):

  1. A KPI bar exibe FTE Total/mês mais contadores de Novos/Produção/Concluídos.
  2. A tabela exibe as colunas Frequência, Pessoas, Complexidade, FTE/mês e RPA Fit; a ordenação oferece classificar por FTE e pelo novo score.
  3. No kanban (Gestão à Vista), cada coluna de status mostra o FTE somado das oportunidades naquela coluna.
  4. O modal de detalhe exibe as 8 abas alinhadas ao novo modelo (Processo / Critérios / Automação / Benefícios / Score / Fases / Risco / Observação).

**Plans**: 5 plans (planejados em 2026-06-05) — Wave 1: 01 (fundação/testes) ‖ 04 (modal display 8 abas); Wave 2: 02 (KPI+tabela, dep 01) ‖ 05 (modal editável, dep 01+04); Wave 3: 03 (kanban, dep 02)

- [x] 13-01-PLAN.md — Fundação Wave 0: extrai `lib/opportunities/rpa.ts` `deriveRpaScore` (do teste existente) + specs de contrato (kpis/rpa-badge/filters) [VIEW-01, VIEW-03] ✅ 2026-06-05
- [x] 13-02-PLAN.md — KPI bar 9 KPIs (FTE Total + Novos/Produção/Concluídos) + tabela colunas FTE/mês+RPA Fit (mantém Fonte) + sort por FTE; `FteCell`/`RpaFitBadge`/`rpaTier` em cells.tsx [VIEW-01, VIEW-02, VIEW-03] ✅ 2026-06-05
- [x] 13-03-PLAN.md — Kanban: FTE somado por coluna + chip FTE/badge RPA por card (reusa RpaFitBadge) [VIEW-04] ✅ 2026-06-05
- [x] 13-04-PLAN.md — Modal display: colapsa 2 conjuntos em 1 de 8 abas, realinha Critérios/Benefícios/Score ao first-class v0.2, move `risco` legado → Observação; Perfil/Desafios/CoE desligados [VIEW-05] ✅ 2026-06-05
- [x] 13-05-PLAN.md — Modal editável (modo global D-12): Editar/Salvar/Cancelar reusando WizardShell recipe + `updateOpportunity`; derivados read-only que recalculam; checkpoint human-verify APROVADO pelo PO (commits 15f4f28+86bb78c+7555049) [VIEW-05] ✅ 2026-06-05

**UI hint**: yes

### Phase 14: View "Relatório"

**Goal**: O usuário acessa uma nova view analítica "Relatório" que sintetiza o portfólio de oportunidades em cards, distribuição por área e gráficos de pizza.
**Depends on**: Phase 10 (dados agregáveis do novo modelo)
**Requirements**: REPORT-01, REPORT-02, REPORT-03, REPORT-04
**Success Criteria** (what must be TRUE):

  1. Uma nova view "📈 Relatório" é selecionável pelo seletor de views da toolbar.
  2. A view exibe cards de portfólio: total de oportunidades, FTE Total/mês, prioridade Alta/Média, RPA Ideal, RPA+n8n e nº de áreas.
  3. A view mostra a distribuição por área de negócio com barras de quantidade somada ao FTE estimado por área.
  4. A view renderiza dois pie charts SVG: oportunidades por área e FTE por área.

**Plans**: 2 plans (planejados em 2026-06-05) — Wave 1: 14-01 (núcleo: agregação + SVG donut + Server Component Relatorio); Wave 2: 14-02 (wiring toolbar + page.tsx fetch não-filtrado, dep 01)

- [x] 14-01-PLAN.md — Núcleo do Relatório: `lib/opportunities/report.ts` (buildReport — agregação por área), `relatorio/pie.tsx` (PieCard donut SVG portado de _giba:818-850, zero-dep), `relatorio/relatorio.tsx` (Server Component: 7 cards + distribuição + 2 donuts + empty state) [REPORT-02, REPORT-03, REPORT-04]
- [x] 14-02-PLAN.md — Wiring: registra view 📈 Relatório na toolbar (VIEWS/View/parseView) + branch de render no page.tsx com fetch não-filtrado do portfólio (D-01a, RLS-scoped) [REPORT-01]

**UI hint**: yes

### Phase 15: Seed dos Dados Reais do Workshop I (Unidasul)

**Goal**: As 64 oportunidades reais do Workshop I existem no sistema como dados de um tenant "Unidasul", isolado dos demais tenants.
**Depends on**: Phase 9 (schema novo pronto — o import depende dos novos campos), Phase 10 (validação do novo modelo)
**Requirements**: DATA-01
**Success Criteria** (what must be TRUE):

  1. Existe um tenant "Unidasul" e as 64 oportunidades do Workshop I aparecem associadas a ele (migration de dados isolada por tenant).
  2. As oportunidades importadas trazem os novos campos preenchidos (fonte = "Workshop I", critérios, benefícios, FTE), e o score/`priority_level`/`rpaScore` calculam corretamente sobre elas.
  3. Um usuário de outro tenant não enxerga nenhuma das 64 oportunidades da Unidasul (verificação cruzada de RLS).

**Plans**: 1 plan

Plans:

- [~] 15-01-PLAN.md — Migration write-only 0013 (tenant+admin Unidasul + 64 opportunities, guard de idempotência) + teste cross-tenant SC3 + handoff de apply manual [DATA-01] — **artefatos escritos+commitados (76cdbf0/5a62f2b/aca6c19); AGUARDANDO apply manual da 0013 no SQL Editor (checkpoint:human-action)** 2026-06-05

## Progresso v0.2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 9. Schema Evolution + Score/Risk/Contract Foundation | 3/3 | ✅ Done | 2026-06-04 |
| 10. Backend — Queries, Validação e Paridade de Score | 4/4 | ✅ Done | 2026-06-04 |
| 11. Wizard de Fluxo Único (5 steps) | 3/3 | Complete    | 2026-06-05 |
| 12. Registro de Riscos (UI do modal) | 2/2 | Complete    | 2026-06-05 |
| 13. Atualizações de Tela (KPI/Tabela/Kanban/Modal) | 5/5 | Complete | 2026-06-05 |
| 14. View "Relatório" | 2/2 | Complete | 2026-06-05 |
| 15. Seed dos Dados Reais do Workshop I (Unidasul) | 1/1 | Complete    | 2026-06-05 |

## Ordem das Phases (v0.2)

Schema-first, como no v0.1. A ordem é por dependência prática:

- **Phase 9 antes de tudo**: nada de UI/backend sem o schema novo. MODEL + SCORE(SQL) + RISK(tabela) são fundação; CONTRACT dobrado aqui (trocar a fonte da verdade junto com o schema que ela descreve). Migration em **write-only mode** (arquivo + handoff de apply manual no Supabase Cloud — padrão do v0.1).
- **Phase 10 sobre o schema**: queries, server actions, Zod e tipos. SCORE-04 (paridade cliente/servidor) vive aqui porque depende da fórmula SQL já existir (Phase 9) e do preview do cliente já ser implementável.
- **Phase 11 (wizard) sobre o backend**: o wizard grava via as server actions/validação da Phase 10 e usa o preview de score da Phase 10.
- **Phase 12 (riscos UI) depende de 9 (tabela) + 10 (actions)**: pode ser paralela a 11 (arquivos distintos), mas plano sequencial para evitar context switching.
- **Phase 13 (telas) depende de 10**: exibe o novo modelo nas views existentes.
- **Phase 14 (Relatório) depende de 10**: agrega o novo modelo; independente de 11/12/13 (nova view).
- **Phase 15 (seed Unidasul) por último entre as de dados**: depende do schema novo (9) e da validação (10); fecha o milestone com dados reais. **Sem fase de deploy** — adiada para milestone próprio.

## Restrições aplicadas (de PROJECT.md / docs/PROJETO.md)

1. **Multi-tenant via RLS**: a nova tabela `opportunity_risks` carrega `tenant_id` + RLS com policy padrão `tenant_id = current_tenant_id()`. Todo critério de sucesso de tabela nova inclui verificação cruzada A≠B.
2. **Score calculado, nunca persistido**: a função SQL muda, mas score não vira coluna (Phase 9 SC2).
3. **Stack**: Next.js 16 (App Router) + Supabase + Vercel; Server Components por padrão; `"use client"` só em wizard/modal/kanban/relatório interativos.
4. **Deploy fora de escopo**: nenhuma fase de deploy no v0.2 (Future Requirements / DEPLOY).
5. **Write-only mode para migrations**: arquivo + handoff manual no SQL Editor do Supabase Cloud (Key Decisions v0.1).

---
*Seção v0.2 criada em 2026-06-04 pelo gsd-roadmapper. 7 fases (9–15), 35/35 REQ-IDs mapeados. Próximo: `/gsd-plan-phase 9`.*

---

# Milestone v0.5 — Execução: Tarefas e Subtarefas por Oportunidade

> **Numeração:** continua a partir do v0.2 (que terminou na Phase 15). A primeira fase do v0.5 é a **Phase 16**.
>
> **Contexto:** entre o fim do v0.2 e esta milestone houve trabalho v0.3/v0.4 entregue fora do roadmap (super-admin de plataforma, e-mails transacionais, blend de score 50/30/20 na migration `0027`, backlog no fluxo de priorização). A Phase 16 parte do estado real do `main`, não do estado registrado no fim do v0.2.
>
> **Granularidade:** standard. **Cobertura:** 11/11 REQ-IDs `TASK-*` (Phase 16) + 11/11 REQ-IDs `ACCESS-*` (Phase 17) mapeados.

## Phases

- [ ] **Phase 16: Tarefas e Subtarefas por Oportunidade (Lista / Kanban / Gantt)** — Cada oportunidade ganha um plano de atividades em 2 níveis (tarefa → subtarefa), com responsável do próprio tenant, visível em Lista, Kanban e Gantt.
- [ ] **Phase 17: Acesso Multi-Tenant do Staff PSW por Atribuição** — Uma pessoa da PSW é cadastrada uma única vez no tenant da PSW e passa a enxergar apenas as oportunidades às quais foi atribuída, em qualquer tenant, numa lista unificada com filtro por empresa.

## Phase Details

### Phase 16: Tarefas e Subtarefas por Oportunidade (Lista / Kanban / Gantt)

**Goal**: Dentro de uma oportunidade, o usuário mapeia as atividades de execução como tarefas com subtarefas (2 níveis), atribui cada uma a uma pessoa do seu tenant e acompanha o conjunto em três visões — Lista, Kanban e Gantt — expandindo e comprimindo as subtarefas de cada tarefa.
**Depends on**: Phase 9 (schema/RLS base + padrão `opportunity_risks` como analog de tabela filha), Phase 10 (server actions + Zod + whitelist de colunas), Phase 13 (padrão de Kanban com dnd-kit e de modal por abas)
**Requirements**: TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, TASK-07, TASK-08, TASK-09, TASK-10, TASK-11
**Success Criteria** (what must be TRUE):

  1. Existe a tabela `opportunity_tasks` com `tenant_id uuid not null` (FK → `tenants`), `opportunity_id`, `parent_task_id` self-FK, `title`, `description`, `status`, `start_date`, `due_date`, `assignee_id` (FK → `profiles`) e `blocked_reason`; RLS ativado com as 4 policies padrão via `current_tenant_id()`, e um teste cruzado confirma que tenant A não enxerga tarefas do tenant B.
  2. O banco impede aninhamento além de 2 níveis: uma linha cujo `parent_task_id` não é nulo não pode ser pai de nenhuma outra (rejeitado por constraint/trigger, não só pela UI). Também é rejeitada no banco a atribuição de um `assignee_id` cujo profile pertence a outro tenant — mesmo trigger de coerência de tenant usado em `opportunity_assignees` (0032).
  3. A partir de uma oportunidade, o usuário cria uma tarefa preenchendo título, descrição, responsável (select que lista **somente** usuários do tenant corrente), status, início e fim; e a partir dessa tarefa adiciona subtarefas com os mesmos campos. Edição e remoção funcionam para os dois níveis; remover a pai remove as filhas após confirmação explícita.
  4. A view **Lista** mostra as tarefas com suas subtarefas aninhadas e um controle de expandir/comprimir por tarefa; o estado de expansão é por tarefa, não global.
  5. A view **Kanban** mostra exatamente 4 colunas na ordem Backlog → Em Andamento → Bloqueio → Finalizado; arrastar um card muda o status persistido; mover para **Bloqueio** exige o motivo do bloqueio antes de concluir a movimentação, e o motivo aparece no card.
  6. A view **Gantt** posiciona cada tarefa/subtarefa no tempo pelas suas datas, com expandir/comprimir das subtarefas; a barra da tarefa-pai cobre o span do menor início ao maior fim das filhas e exibe o % de conclusão agregado.
  7. Span agregado e % de conclusão da tarefa-pai são **calculados em runtime** (view SQL ou client) e **não existem como coluna persistida** em `opportunity_tasks`; alterar uma subtarefa reflete imediatamente na pai sem escrita adicional.
  8. `lib/database.types.ts` (mantido à mão — type-gen bloqueado) inclui `opportunity_tasks` e os enums novos, e `tsc --noEmit` passa limpo.

**Plans**: 6/7 plans executed

- [x] 16-01-PLAN.md — Migration `0037` (`opportunity_tasks`, enum, 2 triggers de guarda, 4 policies), tipos hand-maintained e handoff de apply write-only **[BLOQUEIA todos os demais]**
- [x] 16-02-PLAN.md — **TRACER** ponta-a-ponta: Zod + labels + queries + `createTask` + sub-rota `/tarefas` com a Lista + formulário de criação + entrada no detalhe
- [x] 16-03-PLAN.md — Testes de banco: guarda de 2 níveis, coerência de tenant do responsável, isolamento cross-tenant e autorização de escrita por papel
- [x] 16-04-PLAN.md — `computeTaskRollup` (span + % agregados, runtime) e Lista hierárquica com expandir/comprimir por tarefa
- [x] 16-05-PLAN.md — CRUD completo: editar, excluir com confirmação em cascata, criar subtarefa, diálogo e deep-links
- [x] 16-06-PLAN.md — Kanban de 4 colunas com arraste e prompt obrigatório de motivo no Bloqueio + controle de views
- [ ] 16-07-PLAN.md — Gantt de 2 níveis com barra agregada da pai + checkpoint de verificação humana das 3 views

**UI hint**: yes

### Decisões travadas com o PO (2026-08-04) — não reabrir no planejamento

1. **Hierarquia** — exatamente 2 níveis. Tabela única `opportunity_tasks` com `parent_task_id` self-FK; subtarefa não pode ter filhas (CHECK/trigger no banco).
2. **Gantt** — `start_date`/`due_date` manuais em tarefa e subtarefa. A pai **exibe** span agregado (min início / max fim das filhas) e % de conclusão agregado, sempre **calculado, nunca persistido** (princípio 3 do docs/PROJETO.md).
3. **Status** — enum fixo de 4 valores = 4 colunas do Kanban, na ordem Backlog → Em Andamento → Bloqueio → Finalizado. Sem colunas configuráveis por tenant. Bloqueio exige motivo.
4. **Responsável** — **um** por tarefa: `assignee_id` FK → `users(id)`, obrigatoriamente do mesmo tenant (validado no banco além do RLS). Sem múltiplos responsáveis, sem nome livre.

## Restrições aplicadas (de PROJECT.md / docs/PROJETO.md)

1. **Multi-tenant via RLS**: `opportunity_tasks` carrega `tenant_id` + RLS com policy padrão `tenant_id = current_tenant_id()`; critério de sucesso inclui verificação cruzada A≠B.
2. **Derivado é calculado, nunca persistido**: span e % de conclusão da tarefa-pai seguem a mesma regra do score.
3. **Sem cross-tenant/admin**: nenhuma rota ou query que cruze tenants.
4. **Stack**: Next.js 16 (App Router) + Supabase; Server Components por padrão, `"use client"` só em Kanban/Gantt/modais; mutações por Server Actions.
5. **Reuso obrigatório** (verificado no `main` em 2026-08-04):
   - `@dnd-kit/core` + `@dnd-kit/sortable` já são dependências; o Kanban de oportunidades (`components/opportunities/kanban/{Board,Column,Card}.tsx`) é o analog do Kanban de tarefas.
   - **Gantt não precisa de biblioteca nova**: já existem dois Gantt zero-dep em CSS/Tailwind com barras posicionadas por porcentagem — `components/opportunities/gantt/GanttChart.tsx` e `components/proposal/GanttChart.tsx`. O Gantt de tarefas segue esse padrão.
   - **O seletor de pessoas já existe**: `lib/opportunities/assignees.ts` (`AssignableProfile`, 0032) já lista os profiles atribuíveis do tenant corrente. O select de responsável reusa isso em vez de criar query nova.
   - Camada de dados de `opportunity_risks` (`lib/opportunities/risk-{schema,actions,labels}.ts` + `components/opportunities/modal/risk/`) é o analog end-to-end mais próximo: Zod strict → server actions com tenant server-derived → tabela + form em sub-rota.
   - **Não há shadcn/ui instalado** — `components/` é Tailwind escrito à mão (`components/ui/` não existe). Compor no estilo vigente; não introduzir shadcn nesta fase.
6. **Write-only mode para migrations**: arquivo + handoff de apply manual no SQL Editor do Supabase Cloud. Próximo número livre: **`0037`** (a última no repo é `0036_public_opportunities_no_status_filter.sql` — o `0027` citado no docs/PROJETO.md está desatualizado).
7. **`lib/database.types.ts` é hand-maintained** (type-gen bloqueado) — a fase precisa incluir a task de atualizá-lo à mão.
8. **Responsável é `profiles`, não `users`**: a tabela de pessoas do tenant no schema vivo é `profiles` (`opportunity_assignees.profile_id → profiles(id)`, 0032). O `assignee_id` de tarefa referencia `profiles(id)`.

### Phase 17: Acesso Multi-Tenant do Staff PSW por Atribuição

**Goal**: Uma pessoa da PSW (dev, tech lead, PM) é cadastrada **uma única vez**, no tenant da PSW, e é atribuída a oportunidades de qualquer empresa cliente; ao logar, ela enxerga **somente** as oportunidades às quais foi atribuída — de tenants diferentes ao mesmo tempo — numa lista unificada com coluna e filtro de empresa, sem que isso afete o isolamento dos usuários dos clientes.
**Depends on**: Phase 9 (schema/RLS base), Phase 16 (`opportunity_tasks` — mais uma tabela filha que precisa herdar a visibilidade por atribuição)
**Requirements**: ACCESS-01, ACCESS-02, ACCESS-03, ACCESS-04, ACCESS-05, ACCESS-06, ACCESS-07, ACCESS-08, ACCESS-09, ACCESS-10, ACCESS-11

**Plans:** 8/8 plans executed

Plans:

- [x] 17-01-PLAN.md — Wave 1: migration `0039` (enum isolado) + tipos hand-maintained + `isPswStaff()` + **gate humano de apply** [ACCESS-01, ACCESS-02]
- [x] 17-02-PLAN.md — Wave 2: Wave 0 de validação — tenant/perfil PSW de teste, `asPswStaff()` e a spec decisiva [ACCESS-01, ACCESS-02, ACCESS-07]
- [x] 17-03-PLAN.md — Wave 3: **TRACER** — migration `0040` (helper `current_assigned_opportunity_ids()` + `check_assignee_tenant()` reescrito + SELECT aditivo em `opportunities`/`tenants`) + **gate humano** + fatia ponta-a-ponta verde [ACCESS-03, ACCESS-04, ACCESS-10]
- [x] 17-04-PLAN.md — Wave 4: migrations `0041`/`0042` — 7 tabelas filhas + `profiles` + Storage + `check_task_tenant_coherence()` + `invited_emails` + `audit_log` condicional + **gate humano** [ACCESS-05, ACCESS-06, ACCESS-09, ACCESS-11]
- [x] 17-05-PLAN.md — Wave 5: specs de propagação, escrita escopada (com releitura por service-role), triggers, `viewer` e convites [ACCESS-05, ACCESS-06, ACCESS-07, ACCESS-09, ACCESS-11]
- [x] 17-06-PLAN.md — Wave 5: `resolveWriteTenantId()` + os 9 call sites de escrita + `assignee-actions.ts` cross-tenant [ACCESS-06, ACCESS-09]
- [x] 17-07-PLAN.md — Wave 6: listagem unificada — coluna e filtro "Empresa" condicionados ao papel [ACCESS-08, ACCESS-10]
- [x] 17-08-PLAN.md — Wave 7: responsável de tarefa com staff PSW, convite pelo `/admin/invites` e **verificação visual de fechamento** [ACCESS-09, ACCESS-11]

**Success Criteria** (what must be TRUE):

  1. Existe o papel `psw_staff` no enum `tenant_role`, adicionado numa migration isolada (o Postgres não permite usar um valor de enum recém-criado na mesma transação — mesmo procedimento da `0020`), e um profile com `tenant_id` = tenant da PSW + `role = 'psw_staff'` pode logar sem erro.
  2. `opportunity_assignees` aceita vincular um profile `psw_staff` a uma oportunidade de **qualquer** tenant, com `opportunity_assignees.tenant_id` sempre igual ao `tenant_id` **da oportunidade**; e continua **rejeitando** no banco qualquer outro vínculo cruzado (profile do tenant A em oportunidade do tenant B quando o profile não é `psw_staff`).
  3. Um `psw_staff` logado enxerga exatamente as oportunidades em que tem linha em `opportunity_assignees` — nem uma a mais. Um teste cruzado prova que ele **não** vê outras oportunidades do mesmo tenant onde ele já tem alguma atribuição.
  4. A visibilidade se propaga para todas as tabelas filhas da oportunidade — `opportunity_phases`, `opportunity_risks`, `opportunity_tasks`, `opportunity_notes`, `opportunity_documents`, `opportunity_history`, `opportunity_assignees` e, condicionalmente, `audit_log` (D-15) — além do bucket `opportunity-documents` no Storage, de modo que abrir uma oportunidade atribuída mostra as abas populadas e o download do anexo funciona; nenhuma linha filha de oportunidade **não** atribuída aparece.
 11. Um `psw_staff` atribuído a uma oportunidade pode ser **responsável de uma tarefa** dela: o trigger de coerência de tenant de `opportunity_tasks` (0037) aceita esse `assignee_id`, o select de responsável o lista, e continua rejeitando profile de outro tenant que não seja `psw_staff`.
  5. Um `psw_staff` escreve nas oportunidades atribuídas com os mesmos poderes de um `member` (tarefas, notas, documentos, riscos, status/campos da oportunidade) e recebe erro do banco ao tentar escrever em oportunidade não atribuída — a garantia é de RLS, não só de UI.
  6. Nada muda para quem é do cliente: `profiles.tenant_id` continua único e NOT NULL, `current_tenant_id()` continua sendo a fronteira dos papéis `member`/`viewer`/`tenant_admin`, e os testes de isolamento cross-tenant existentes continuam passando sem alteração.
  7. A listagem de oportunidades de um `psw_staff` é **unificada**: traz demandas de tenants diferentes na mesma tabela, com coluna de empresa visível e filtro por empresa; para os demais papéis a listagem permanece idêntica à de hoje (sem coluna de empresa).
  8. Os call sites que hoje aplicam `.eq('tenant_id', profile.tenant_id)` como defesa em profundidade passam a usar um escopo de acesso resolvido no servidor, que continua sendo `tenant_id = <tenant>` para papéis de tenant e vira "só as oportunidades atribuídas" para `psw_staff` — nenhuma query volta linhas fora do escopo do usuário.
  9. Um `platform_admin` (e apenas ele) cadastra/convida uma pessoa como `psw_staff` no tenant da PSW e a atribui a oportunidades de qualquer empresa pela UI; um `tenant_admin` de cliente **não** consegue atribuir alguém da PSW nem enxergar pessoas de fora do próprio tenant.
 10. `lib/database.types.ts` (hand-maintained — type-gen bloqueado) reflete o novo papel e quaisquer colunas/objetos novos, e `tsc --noEmit` passa limpo.

### Decisões travadas com o PO (2026-08-06) — não reabrir no planejamento

1. **Granularidade do acesso** — o vínculo é com a **oportunidade** (a "demanda"), reusando `opportunity_assignees` (0032). Não se cria entidade `projects`, nem se dá acesso ao tenant inteiro.
2. **Só a PSW é multi-tenant** — usuário de cliente continua travado em um único tenant. Não existe multi-tenancy para `member`/`viewer`/`tenant_admin`; `profiles.tenant_id` **não** vira N:N.
3. **Navegação** — lista **unificada cross-tenant** com coluna de empresa e filtro por empresa (não é seletor de contexto que troca o tenant ativo).
4. **Escrita** — `psw_staff` escreve nas oportunidades atribuídas exatamente como um `member` escreve nas do próprio tenant. Não é acesso somente-leitura.
5. **Quem atribui** — apenas `platform_admin` vincula gente da PSW a oportunidades. `tenant_admin` de cliente não escolhe pessoas da PSW.
6. **`psw_staff` ≠ `platform_admin`** — o `platform_admin` continua vendo tudo (0021); o `psw_staff` vê **apenas** o que lhe foi atribuído. São papéis distintos, não níveis do mesmo papel.
7. **`psw_staff` pode ser responsável de tarefa** (decidido após a pesquisa) — o trigger de coerência de `opportunity_tasks` (0037) passa a aceitar um `assignee_id` `psw_staff`, e o select de responsável da tarefa o lista quando ele está atribuído àquela oportunidade.
8. **`audit_log` entra na RLS aditiva** (decidido após a pesquisa) — a policy é escrita de forma **condicional/idempotente** (só aplica se a tabela existir), porque a `0038_audit_log.sql` ainda não está commitada. A fase não edita a `0038` nem `lib/audit/`.

## Restrições aplicadas à Phase 17 (de PROJECT.md / docs/PROJETO.md)

1. **Isolamento multi-tenant é existencial**: a fase **afrouxa** uma fronteira, então cada policy nova é **aditiva** (policies PERMISSIVE combinam com OR, padrão já usado na `0021`) — nenhuma policy existente por tenant pode ser removida ou relaxada. Testes obrigatórios: "tenant A não vê dados de tenant B" (existentes, devem continuar verdes) **+** "psw_staff não vê oportunidade não atribuída do mesmo tenant".
2. **Migrations em write-only mode**: arquivo + handoff de apply manual no SQL Editor do Supabase Cloud. **Próximo número livre: `0039`** — a `0038_audit_log.sql` já existe no working tree (ainda não commitada) e não deve ser tocada por esta fase.
3. **Enum em migration isolada**: o valor `psw_staff` do enum `tenant_role` entra sozinho numa migration, e as policies que o referenciam vêm na migration seguinte (mesma razão e mesmo formato de `0020` → `0021`).
4. **`lib/database.types.ts` é hand-maintained** (type-gen bloqueado — MCP aponta para o projeto errado): a fase inclui a task de atualizá-lo à mão.
5. **Reuso obrigatório** (verificado no `main` em 2026-08-06):
   - `opportunity_assignees` + `check_assignee_tenant()` (`supabase/migrations/0032_opportunity_assignees.sql`) é a tabela de vínculo e o trigger que precisa ser reescrito — não criar tabela nova de atribuição.
   - `is_platform_admin()` (0021) e `current_user_role()` (0015) são o padrão de helper `SECURITY DEFINER` a espelhar no helper novo de acesso por atribuição.
   - `lib/opportunities/assignees.ts` já lista os profiles atribuíveis do tenant; a UI de atribuição do `platform_admin` estende essa camada em vez de criar outra.
   - `lib/opportunities/queries.ts` já tem o filtro `filters.tenant` (`.eq('tenant_id', …)`) usado pelo `platform_admin` — o filtro "empresa" da lista unificada reusa esse caminho.
   - `lib/security/role.ts` + `lib/supabase/session.ts` são o ponto único onde papel e tenant do usuário são resolvidos no servidor; o escopo de acesso novo mora ali, não espalhado por call site.
6. **Sem painel admin novo**: a fase não cria rotas super-admin além do que já existe em `app/(app)/admin/` e `app/(app)/team/`.

### Phase 18: Staff PSW como Admin de Tenant (concessão pessoa × empresa)

**Goal**: Um `psw_staff` passa a poder ser **admin de N empresas** ao mesmo tempo: sem concessão ele continua vendo somente as oportunidades atribuídas a ele (comportamento da `0044`, intocado); com concessão no tenant A ele vê tudo de A e exerce ali os mesmos poderes de um `tenant_admin` — convites, equipe, configurações/branding e logs — sem deixar de ver, na mesma listagem, as oportunidades que lhe foram atribuídas em outras empresas. A concessão é dada e retirada apenas pelo `platform_admin`, numa tela `/admin/staff` que também mostra, por pessoa, as duas origens de acesso separadas.
**Depends on**: Phase 17 (papel `psw_staff`, `opportunity_assignees` cross-tenant, `current_assigned_opportunity_ids()`, `resolveWriteTenantId()` e as restritivas da `0044` — esta fase estende exatamente esse mecanismo um nível acima)
**Requirements**: GRANT-01, GRANT-02, GRANT-03, GRANT-04, GRANT-05, GRANT-06, GRANT-07, GRANT-08, GRANT-09, GRANT-10
**Plans**: 8/8 plans executed

Plans:
**Wave 1**

- [x] 18-01-PLAN.md — Wave 0: decisão de como a fase prova a RLS, specs decisivos (baseline → concede → revoga → baseline) e tipos de `psw_tenant_admins` à mão

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 18-02-PLAN.md — **TRACER**: migration `0045` (tabela da concessão + 3 helpers + trigger + as DUAS metades da RLS em `opportunities`) e prova ponta-a-ponta

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 18-03-PLAN.md — Expansão RLS: migration `0046` (7 tabelas filhas por laço com paridade de verbos + `profiles`) e prova de propagação
- [x] 18-04-PLAN.md — Tela `/admin/staff`: duas origens separadas, revogação quantificada, concessão órfã sinalizada

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 18-05-PLAN.md — Poderes de `tenant_admin`: migration `0047` (as 11 policies vivas pela fonte única + Storage), com a barreira de escalada de convite preservada

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 18-06-PLAN.md — Camada de servidor: `isTenantAdminOf` / `resolveAdminTenantId` e as escritas de Equipe e Configurações sobre tenant-alvo

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 18-07-PLAN.md — Leitura escopada e gate visual nas 4 telas de admin (marcador de escopo + aviso de escrita desabilitada)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 18-08-PLAN.md — Shell (seletor e menus para o staff-admin), gate de atribuição alinhado à RLS, e verificação visual A–H com auditoria de não-regressão

**Success Criteria** (what must be TRUE):

  1. Existe a tabela de concessão `psw_tenant_admins` (pessoa × empresa) com `tenant_id`, RLS ativa e escrita restrita ao `platform_admin`; um mesmo `psw_staff` tem linhas para N tenants simultaneamente, e `profiles.tenant_id` continua único e NOT NULL.
  2. Existe `current_admin_tenant_ids()` — `security definer`, `stable`, `set search_path = public`, consumido como `t in (select current_admin_tenant_ids())` e usando `(select auth.uid())` para virar InitPlan — espelhando na forma o `current_assigned_opportunity_ids()` da `0040`, com índice de suporte por `profile_id`.
  3. Existe `is_tenant_admin_of(t uuid)` como **fonte única** do predicado "é admin deste tenant", verdadeiro para (a) `tenant_admin` cujo `current_tenant_id()` é `t` e (b) `psw_staff` com concessão em `t` — e os 17 predicados de RLS hoje escritos como `tenant_id = current_tenant_id() and current_user_role() = 'tenant_admin'` passam todos a chamá-la, sem que nenhum fique para trás.
  4. Um `psw_staff` **sem** concessão enxerga exatamente o mesmo conjunto de oportunidades que enxergava antes desta fase — a contagem é idêntica, provada por teste.
  5. Um `psw_staff` **com** concessão no tenant A enxerga todas as oportunidades de A mais as atribuídas a ele em qualquer outra empresa, na listagem unificada com coluna e filtro de empresa; e não enxerga nada de um tenant onde não tem nem concessão nem atribuição.
  6. Esse mesmo staff exerce em A os poderes de `tenant_admin`: gerencia a allowlist de convites de A, a equipe de A, o branding/configurações de A e lê os logs de A — e recebe erro do banco ao tentar o mesmo num tenant B onde não tem concessão.
  7. As Server Actions de admin recebem o **tenant-alvo explícito** e o validam contra a concessão antes de mutar; nenhuma delas deriva o tenant de `profile.tenantId` para um `psw_staff`, e nenhuma responde `{ ok: true }` tendo afetado zero linhas (o sucesso silencioso que `resolveWriteTenantId()` eliminou uma camada abaixo).
  8. Um `psw_staff` com concessão **não** consegue conceder nem revogar a condição de admin para ninguém — nem para si, nem em tenant onde já é admin; só o `platform_admin` escreve em `psw_tenant_admins`, garantido por RLS e não só por UI.
  9. A tela `/admin/staff` existe sob o guard `platform_admin` de `app/(app)/admin/layout.tsx`, lista os `psw_staff`, concede e revoga concessões, e mostra por pessoa as duas origens de acesso **separadas** — empresas administradas e atribuições individuais, sinalizando quantas destas são redundantes por estarem em empresa já administrada.
 10. Revogar exige confirmação explícita informando quantas oportunidades a pessoa deixará de enxergar; após a revogação ela continua vendo as que lhe foram atribuídas nominalmente naquele tenant.
 11. A tela de admin **não** escreve em `opportunity_assignees` — atribuição continua editável apenas na oportunidade (`AssigneesPanel`); ali as atribuições aparecem em leitura, com link.
 12. Nada muda para `member`, `viewer`, `tenant_admin` e `platform_admin`: os testes de isolamento cross-tenant existentes continuam passando sem alteração, e um teste de não-regressão prova que a contagem de linhas visíveis de um `member` e de um `tenant_admin` é idêntica à de antes da fase.
 13. `lib/database.types.ts` (hand-maintained — type-gen bloqueado) reflete a tabela nova e `tsc --noEmit` passa limpo.

### Decisões travadas com o PO (2026-08-07) — não reabrir no planejamento

1. **A concessão é uma tabela, não um valor de enum** — "admin nas empresas A e C" é um par (pessoa × empresa) que se repete; nenhuma coluna `role` expressa isso. `profiles.tenant_id` **não** vira N:N: continua sendo o tenant de lotação da pessoa (a PSW, no caso do staff).
2. **Poderes = `tenant_admin` daquele tenant** — não é só leitura ampliada. Inclui convites/allowlist, equipe, configurações/branding e logs do tenant concedido.
3. **Só o `platform_admin` concede e revoga** — sem escalada lateral: um staff-admin do tenant A não promove outra pessoa em A.
4. **Atribuição continua editada só na oportunidade** (`AssigneesPanel`) — dois pontos de escrita divergiriam em validação e deixariam `check_assignee_tenant()` como única barreira. A tela de admin lê, não escreve.
5. **`psw_staff` sem concessão não muda** — a restritiva da `0044` continua valendo integralmente para ele; a concessão só acrescenta um disjunto.
6. **Mecanismo reusado, não inventado** — é o padrão `opportunity_assignees` (0032) + `current_assigned_opportunity_ids()` (0040) elevado de "pessoa × oportunidade" para "pessoa × tenant". Não criar helper com forma diferente.
7. **A tela mostra as duas origens separadas** — um número agregado de acesso levaria a conclusão errada sobre o alcance real da pessoa, já que atribuições dentro de um tenant administrado são redundantes.

## Restrições aplicadas à Phase 18 (de PROJECT.md / docs/PROJETO.md)

1. **Isolamento multi-tenant é existencial**: a fase **afrouxa** uma fronteira. Cada policy nova é aditiva; a troca dos 17 predicados por `is_tenant_admin_of()` precisa ser **byte-equivalente** para `tenant_admin` (a função retorna exatamente o predicado antigo nesse ramo). Testes obrigatórios: os de isolamento existentes verdes **+** "psw_staff sem concessão vê o mesmo de antes" **+** "psw_staff com concessão em A não vê nada de B".
2. **Migrations em write-only mode**: arquivo + apply manual pelo PO no SQL Editor do Supabase Cloud, com bloco de verificação pós-apply e bloco de ROLLBACK no padrão da `0044`. **Próximo número livre: `0045`.**
3. **`lib/database.types.ts` é hand-maintained** (type-gen bloqueado — MCP aponta para o projeto errado): a fase inclui a task de atualizá-lo à mão.
4. **Reuso obrigatório** (verificado no `main` em 2026-08-07):
   - `current_assigned_opportunity_ids()` (`0040:86`) é a forma exata a espelhar no helper novo — mesma assinatura, mesmo `(select auth.uid())`, mesmo índice de suporte por `profile_id`.
   - O laço das 8 policies restritivas da `0044` é o ponto de encaixe do disjunto novo — estender o laço, não escrever 8 blocos à mão.
   - `resolveWriteTenantId()` + `WRITE_SCOPE_DENIED_MESSAGE` (`lib/security/role.ts`, D-11 da Phase 17) são o padrão a aplicar uma camada acima nas actions de admin; não inventar um segundo mecanismo de resolução de tenant-alvo.
   - `app/(app)/admin/layout.tsx` já é o guard `platform_admin` — `/admin/staff` herda dele, sem plumbing de auth novo.
   - `lib/tenants/scope.ts` (`resolveEmpresaSlug`, cookie `coe_empresa`) já resolve a empresa selecionada; o contexto de escrita das telas de admin parte dali em vez de criar outro seletor.
5. **Sem persistir o que é derivado**: a contagem de "quantas oportunidades a pessoa deixa de ver" e a marcação de atribuição redundante são calculadas em runtime, nunca gravadas.

---
*Seção v0.5 criada em 2026-08-04. 3 fases (16, 17, 18). 11/11 REQ-IDs `TASK-*` → Phase 16; 11/11 REQ-IDs `ACCESS-*` → Phase 17; 10/10 REQ-IDs `GRANT-*` → Phase 18. Phase 17 adicionada em 2026-08-06. Phase 18 adicionada em 2026-08-07.*
