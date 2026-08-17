---
phase: 07.6-enriquecimento-ia-oportunidades
status: ready_to_plan
total_plans: 0
waves: 0
inserted_between: ["07.5-hardening-seguranca-mvp", "08-polish-deploy"]
marker: INSERTED
---

# Phase 7.6 — Enriquecimento por IA das Oportunidades

## Goal

Tirar do usuário final a responsabilidade de preencher campos que ele não tem condições/contexto de responder bem (decisões técnicas e de priorização) e transferi-la para um **pós-processamento server-side com OpenAI** que enriquece a oportunidade depois do submit. O usuário continua não sabendo que existe IA — vê só um formulário menor.

Ao final, ter:

- **Wizard de criação enxuto**: steps "Automação" e "Priorização" deixam de ser inputs do usuário (criação interna + formulário público).
- **Pós-processamento IA assíncrono**: após `INSERT` da oportunidade, dispara enrichment server-side que preenche `ferramenta`, `escopo_automacao[]`, `beneficios_esperados[]`, `observacao`, `risco`, `esforco`, `complexidade`, `tempo`, `objetivo` (alinhamento estratégico).
- **Estado de enrichment visível**: coluna `ai_enrichment_status` (`pending` → `enriched` | `failed`) na `opportunities`, com fallback manual em caso de falha.
- **Modal de detalhe editável por admin**: o membro do CoE consegue revisar e editar todos os campos gerados pela IA.
- **Mockada em testes**: suite Vitest com fixtures determinísticas de resposta OpenAI; CI NUNCA chama a API real.

## Por que esta fatia agora (antes de Phase 8)

PROJECT.md classificou "IA generativa" como out-of-scope. Esta phase é uma **reversão escopada** dessa decisão — a IA aqui não é feature do produto vendida ao cliente, é um auxiliar interno do CoE que reduz a fricção do formulário. Três motivos para inserir antes do deploy:

1. **O wizard precisa ser refatorado de qualquer jeito**: 2 steps inteiros saem do fluxo do usuário. Fazer isso depois do deploy de produção dobra o trabalho — repõe testes UAT, refaz fixtures, retreina o piloto.
2. **Schema impactado**: `esforco/complexidade/tempo/objetivo/ferramenta/escopo_automacao/beneficios_esperados` vão ficar opcionais no input do user (não no DB). Migration nova é mais barata pré-piloto.
3. **Fluxo público (`/r/[slug]`) precisa do mesmo tratamento**: o formulário público hardened (Phase 7.5 Plan 06) também pede esses campos hoje. Phase 8 precisa entregar a versão final dos dois fluxos.

## Escopo proposto (a refinar em `/gsd-discuss-phase 7.6` ou `/gsd-plan-phase 7.6`)

### Bloco A — Refatoração do wizard (interno)

- Remover steps `automacao` e `priorizacao` da sequência em `components/opportunities/wizard/state.ts` (`STEPS_COMMON`, `STEPS_PERSONA_EXTRA`, `STEPS_FORMULARIO_EXTRA`).
- `validateStep` deixa de validar `esforco/complexidade/tempo/objetivo` no fluxo de criação.
- `AutomacaoStep.tsx` e (eventual) `PriorizacaoStep.tsx` **continuam existindo como componentes**, mas só são renderizados no modal de detalhe / edit (admin) — `mode === 'edit'`.
- `defaultFormData()` continua provendo defaults (`esforco='medio'`, etc.) para satisfazer o schema do DB no INSERT inicial — IA sobrescreve depois.

### Bloco B — Refatoração do formulário público (`/r/[slug]`)

- Remover as seções equivalentes de `app/r/[slug]/PublicForm.tsx`.
- `createPublicOpportunity` (Server Action) e RPC `create_public_opportunity` aceitam payload mínimo; campos de automação/priorização viram `NULL` ou default no INSERT.
- Server Action dispara enrichment via `after()` do Next.js logo após sucesso da RPC.

### Bloco C — Pipeline de enrichment por IA

- Coluna nova: `opportunities.ai_enrichment_status enum('pending','enriched','failed')` default `'pending'` (migration `0010_ai_enrichment.sql`).
- Coluna nova: `opportunities.ai_enrichment_error text null` para diagnóstico de falha.
- Coluna nova (opcional): `opportunities.ai_enriched_at timestamptz null`.
- Wrapper `lib/ai/enrichment.ts`:
  - Lê `tenant_id`, `solicitante`, `processo`, `frequencia`, `volume_medio`, `tempo_execucao`, `num_pessoas`, `formulario_extras` da row inserida.
  - Chama OpenAI Chat Completions com `response_format: { type: 'json_schema', json_schema: {...} }` (structured output garante shape determinístico).
  - Modelo: `gpt-4.1-mini` ou `gpt-4o-mini` (custo baixo, latência ok pra background).
  - Sem streaming. Sem agentes. Sem retries automáticos (1 chamada → sucesso ou `failed`).
  - Retorna JSON tipado com os 9 campos.
- Disparo: `after()` do Next.js dentro do Server Action de criação. Não bloqueia a resposta ao usuário. **Decisão a tomar em discuss-phase:** `after()` vs Supabase Edge Function via webhook vs Vercel Cron a cada 1min.
- Update server-side: usa service role (não a connection do user) porque o user pode nem estar logado (caso `/r/[slug]` anônimo). Defesa: filtro explícito por `id = $X AND tenant_id = $Y AND ai_enrichment_status = 'pending'` (idempotência).

### Bloco D — Modal de detalhe editável

- `components/opportunities/modal/OpportunityDetail.tsx` (ou tabs) precisam permitir edição dos 9 campos para roles autorizados.
- Indicador visual de `ai_enrichment_status` (badge "Enriquecendo…" / "Falha — preencher manualmente" / silencioso quando `enriched`).
- Se `failed`, abre os mesmos componentes (`AutomacaoStep` reaproveitado, `PriorizacaoStep` reaproveitado) já existentes — sem reescrever UI.

### Bloco E — Testes

- `tests/ai/enrichment.test.ts`: mock de fetch para `api.openai.com/v1/chat/completions`; verifica que (1) prompt é montado com o tenant_id + payload corretos, (2) response JSON é validado contra schema Zod antes de persistir, (3) `tenant_id` NUNCA aparece no prompt como string interpolada exposta (defesa contra prompt injection cross-tenant).
- Skip em CI se `OPENAI_API_KEY` não estiver setado (sem fallback para chamada real).
- 1 teste de integração que cobre: criar oportunidade → ver `ai_enrichment_status='pending'` no DB → forçar callback do mock → ver `'enriched'` e campos preenchidos.

### Bloco F — Configuração & docs

- `.env.example` + `.env.local` — `OPENAI_API_KEY` já adicionado (vazio).
- Vercel env vars: `vercel env add OPENAI_API_KEY production preview` no setup do deploy (Phase 8).
- Documentar fallback manual em `.planning/phases/07.6-.../OPS.md` ou similar — "se enrichment quebrar, admin edita pelo modal".

## Must-haves

**Truths observáveis:**

- Wizard de criação interna mostra 5 steps (era 7 para persona, 8 para formulário) — usuário nunca vê "Automação" nem "Priorização".
- Formulário público em `/r/[slug]` não pede `ferramenta`, `escopo_automacao`, `beneficios_esperados`, `observacao`, `risco`, `esforco`, `complexidade`, `tempo`, `objetivo`.
- Após criar uma oportunidade, query `select ai_enrichment_status from opportunities order by created_at desc limit 1` retorna `pending` imediatamente.
- Em ambiente com `OPENAI_API_KEY` válida, dentro de N segundos a mesma query retorna `enriched` e os 9 campos da row estão preenchidos.
- Em ambiente sem `OPENAI_API_KEY` (ou com erro de API), o status vira `failed` e `ai_enrichment_error` contém a causa; oportunidade continua acessível e editável no modal.
- Modal de detalhe permite a um membro com role apropriada editar `ferramenta`, `escopo_automacao`, etc., e o update persiste com `updated_at` movido.
- `npm run test` (modo unit) passa sem rede — fixtures + mocks cobrem o caminho da IA.

**Artifacts:**

- `components/opportunities/wizard/state.ts` — steps `automacao` + `priorizacao` removidos do fluxo `create`.
- `components/opportunities/wizard/WizardShell.tsx` — render atualizado.
- `app/r/[slug]/PublicForm.tsx` — seções equivalentes removidas.
- `lib/opportunities/actions.ts` — `createOpportunity` + (se aplicável) `createPublicOpportunity` disparam enrichment via `after()`.
- `lib/opportunities/schema.ts` — `OpportunityInput` torna campos de automação/priorização opcionais; novo `OpportunityEnrichedFields` para schema da resposta OpenAI.
- `lib/ai/enrichment.ts` (NOVO) — wrapper OpenAI com structured output + Zod validation da resposta.
- `lib/ai/prompts.ts` (NOVO) — templates de prompt versionados.
- `supabase/migrations/0010_ai_enrichment.sql` (NOVO) — colunas `ai_enrichment_status`, `ai_enrichment_error`, `ai_enriched_at`.
- `lib/database.types.ts` — regenerado.
- `components/opportunities/modal/...` — edit path para os 9 campos + badge de status.
- `tests/ai/enrichment.test.ts` (NOVO) — mocks da OpenAI + verificação anti prompt injection.

## Out of scope

- **IA visível ao usuário final** — esta phase NÃO expõe nenhum botão "gerar com IA" no produto. É invisível.
- **Retry automático em falha** — 1 tentativa, depois `failed` + admin edita. Retry pode entrar em backlog se monitoring mostrar muita falha transitória.
- **Streaming** — não há UI esperando resposta. Submit é assíncrono.
- **Fine-tuning / RAG** — usar prompts engineered + structured output. Sem embeddings, sem custom model.
- **IA em outros pontos do produto** (sugestão de processos, score automático, classificação de status) — escopo restrito ao enrichment de automação + priorização. Outras aplicações ficam em backlog 999.x.
- **Painel de observabilidade da IA** (taxa de falha, custo, tokens consumidos) — log básico em coluna `ai_enrichment_error` chega. Dashboard fica pós-MVP.

## Decisões locked para esta phase (2026-05-26, defaults aceitos pelo PO)

> Estas 3 escolhas estavam em aberto após `/gsd-insert-phase`. O PO aceitou os defaults para evitar discuss-phase. Bloqueadas — não reabrir no plan.

1. **Disparo do enrichment**: `after()` do Next.js (App Router) dentro do Server Action `createOpportunity` / `createPublicOpportunity`. Roda após a resposta ser enviada ao cliente, na mesma região da função; sem infra extra; falha não bloqueia submit. Trade-off aceito: se a função der cold-restart entre o INSERT e o `after()`, o enrichment pode não rodar — mitigação é a coluna `ai_enrichment_status='pending'` permanecer como flag para um job de catch-up futuro (backlog 999.x se vier a ser necessário).
2. **Modelo OpenAI**: `gpt-4o-mini` (Chat Completions + `response_format: { type: 'json_schema', json_schema: {...}, strict: true }`). Custo baixo, latência boa, maduro. Sem streaming, sem tools, sem agentes.
3. **Bypass do RLS no UPDATE pós-IA**: client `serviceRoleClient()` (já existe em `lib/supabase/server.ts`) com filtro defensivo `WHERE id = $X AND tenant_id = $Y AND ai_enrichment_status = 'pending'` — idempotente, evita race se chamado 2x, e protege contra cross-tenant write mesmo com bug no callsite. Sem SECURITY DEFINER function (mais simples, menos cirurgia no DB; pode migrar para function em phase futura se audit pedir).

## Decisões prévias (docs/PROJETO.md + PROJECT.md)

- **Multi-tenancy via RLS** — chamada de IA é per-row server-side; nunca cruza tenants.
- **Score nunca persistido** — não muda. Os 9 campos da IA são INPUTS pro cálculo do score, não o score em si.
- **pt-BR** em UI e textos visíveis; **EN** em código (inclusive prompts da IA — separar arquivo `lib/ai/prompts.ts` para revisão fácil).
- **`tenant_id` derivado de `auth.uid()` no server** — para `/r/[slug]` anônimo, deriva-se do `tenant_slug` antes da chamada da IA. Validar em discuss.

## Dependências

- Phase 7.5 (Hardening) — **concluída**. Reaproveita defesas do form público.
- Phase 6 (Wizard CRUD) — refatoração afeta diretamente.
- Migration 0007 (form público hardened) — aplicar primeiro para não conflitar com 0010.

## Após esta fase

Phase 8 (Polish + Deploy) executa com:

- Wizard e form público no formato **final** — sem refatoração pós-piloto.
- Schema completo de IA — apply de 0010 entra no checklist de deploy.
- `OPENAI_API_KEY` setado em Vercel (production + preview) como pré-requisito de deploy.

Cliente piloto recebe um formulário **mais curto e mais alinhado ao que ele consegue responder**, e o CoE recebe a oportunidade já pré-priorizada e pré-classificada pela IA — pronta para revisão humana.

---

*Phase 7.6 aberta em 2026-05-26, inserida entre 07.5 e 08 a pedido do product owner. Reverte parcialmente a decisão "IA generativa = out-of-scope" do PROJECT.md, com escopo restrito: IA é auxiliar interno invisível, não feature do produto. Próximo: `/gsd-discuss-phase 7.6` (recomendado — decisões de arquitetura ainda em aberto: disparo via `after()` vs Edge Function vs Cron) ou `/gsd-plan-phase 7.6`.*
