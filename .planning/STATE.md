---
gsd_state_version: 1.0
milestone: v0.5
milestone_name: "Execução: Tarefas e Subtarefas por Oportunidade"
current_phase: 18
current_phase_name: staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa
status: verifying
stopped_at: Completed 18-08-PLAN.md — Phase 18 código completo; roteiro visual A-H pendente (checkpoint bloqueante)
last_updated: "2026-08-07T20:08:36.908Z"
last_activity: 2026-08-07
last_activity_desc: Phase 18 execution started
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 23
  completed_plans: 22
  percent: 67
---

# Project State

## Milestone v0.5 — Phase 18 (planejada em 2026-08-07)

**Goal:** um `psw_staff` passa a ser **admin de N empresas** ao mesmo tempo. Sem concessão ele continua
vendo só as oportunidades atribuídas a ele (comportamento da `0044`, intocado); com concessão no tenant
A ele vê tudo de A e exerce ali os poderes de `tenant_admin` (convites, equipe, configurações/branding,
logs), sem perder as atribuições em outras empresas. Só o `platform_admin` concede e revoga, na tela
`/admin/staff`.

**O achado da pesquisa que mudou a FORMA da fase (não só o conteúdo):** o CONTEXT descreve o trabalho de
RLS como "acrescentar um disjunto na restritiva da `0044`". Lido ao pé da letra isso produz uma migration
que **aplica limpa, não erra em lugar nenhum e não faz nada** — policy `RESTRICTIVE` só subtrai, e
nenhuma permissiva viva concede tenant-wide a um `psw_staff`. Toda concessão precisa das **duas metades**
(restritiva + permissiva) no mesmo pacote.

**Waves:** 1 → `18-01` (Wave 0: decisão do `.env.test`, specs decisivos baseline→concede→revoga→baseline,
tipos à mão); 2 → `18-02` (**TRACER** — migration `0045`: tabela + 3 helpers + trigger + as duas metades
da RLS em `opportunities`); 3 → `18-03` (`0046`: 7 filhas + `profiles`) ‖ `18-04` (tela `/admin/staff`);
4 → `18-05` (`0047`: as 11 policies vivas pela fonte única + Storage); 5 → `18-06` (`isTenantAdminOf` /
`resolveAdminTenantId` + escritas de admin); 6 → `18-07` (leitura escopada + marcador nas 4 telas);
7 → `18-08` (shell + gate de atribuição + verificação visual A–H).

**Gates humanos:** 3 applies manuais (`0045` → `0046` → `0047`) + 2 `checkpoint:decision` (18-02 ratifica
o mecanismo; 18-05 reescreve 11 policies de um papel de cliente vivo em produção). Wave 3 é o único
paralelismo — zero sobreposição de `files_modified`.

**Três decisões que podem exigir o PO antes de executar:** (1) `.env.test` — se a escolha for "prova por
SQL no handoff", nenhum SUMMARY desta fase pode dizer "testes verdes", a evidência vira o bloco colado;
(2) um staff-admin de A **pode convidar um `tenant_admin` de A** — consequência direta de D-A (equivalência
plena), está no `checkpoint:decision` da 18-05 para ratificação; (3) identidade visual do shell — recomendado
manter a do tenant de lotação, com a empresa de atuação no marcador de escopo.

**Ainda pendente da Phase 17:** `17-08` Task 3 (`checkpoint:human-verify`, roteiros A–G) nunca rodou —
sem acesso a browser na sessão. A Phase 17 não está selada.

## Milestone v0.5 — Phase 17 (planejada em 2026-08-06)

**Goal:** uma pessoa da PSW é cadastrada **uma única vez**, no tenant da PSW, e é atribuída a
oportunidades de qualquer empresa; ao logar ela enxerga **somente** as oportunidades atribuídas —
de tenants diferentes ao mesmo tempo — numa lista unificada com coluna e filtro de empresa, sem
mexer no isolamento de quem é do cliente.

**Problema que originou a fase (PO, 2026-08-06):** hoje a pessoa da PSW é cadastrada dentro do
tenant do cliente e vê tudo dele; e cadastrá-la num segundo cliente falha, porque o e-mail já
existe em `auth.users`.

**Decisões travadas com o PO (não reabrir):** granularidade = a oportunidade (reusa
`opportunity_assignees`, sem entidade `projects`); só a PSW é multi-tenant (usuário de cliente
segue com 1 tenant); navegação = lista unificada cross-tenant, não seletor de contexto; escrita
como `member` nas oportunidades atribuídas; só `platform_admin` atribui e convida staff PSW;
`psw_staff` ≠ `platform_admin`. Pós-pesquisa: `psw_staff` **pode** ser responsável de tarefa
(D-14 → ACCESS-11) e `audit_log` entra na RLS aditiva de forma condicional (D-15).

**Achados da pesquisa/planejamento que ampliaram o escopo:** os ~9 `.eq('tenant_id',
profile.tenant_id)` das escritas bloqueariam o staff PSW **em silêncio** (0 linhas, sem erro);
`invited_emails` tem CHECK que não admite o papel novo e policy que não o barra para
`tenant_admin`; `tenants` e `profiles` também precisam de SELECT aditivo (senão a coluna de
empresa e o nome do responsável ficam vazios); e a função `opportunity_audit_trail()` da `0038`
tem gate de tenant dentro do corpo `SECURITY DEFINER` — policy sozinha não resolveria.

**Waves:** 1 → `17-01` (migration `0039`, enum isolado + tipos + gate de apply);
2 → `17-02` (Wave 0 de testes: tenant/perfil PSW, `asPswStaff()`, spec decisivo);
3 → `17-03` (**TRACER** — `0040`: helper + trigger reescrito + SELECT aditivo);
4 → `17-04` (`0041`/`0042`: filhas + `profiles` + Storage + trigger de tarefa + convites + audit);
5 → `17-05` (specs de propagação/escrita) ‖ `17-06` (escopo server-side + 9 call sites);
6 → `17-07` (lista unificada: coluna e filtro "Empresa"); 7 → `17-08` (responsável de tarefa,
convite de staff PSW, gate visual).

**Gates humanos:** 4 (apply da `0039` sozinha → apply da `0040` → apply da `0041`+`0042` →
verificação visual A–G) + 3 `checkpoint:decision` antes de cada porta one-way.

**Pendência de ambiente que trava a prova real:** `.env.test` apontando para um Supabase Cloud de
teste segue pendente desde a Phase 7.5. Sem ele os specs decisivos entram em `describe.skipIf` e
passam sem verificar nada — o `checkpoint:decision` do `17-01` força essa escolha antes do
primeiro apply.

**Herdado da Phase 16:** `16-07` (Gantt) foi executado no código (commits `c698b7b`..`fa06606`) mas
ainda **não tem SUMMARY nem verificação** — a Phase 16 não está selada.

## Milestone v0.5 — Phase 16 (planejada em 2026-08-04)

**Goal:** dentro de uma oportunidade, o usuário mapeia as atividades de execução como tarefas com
subtarefas (2 níveis), atribui cada uma a uma pessoa do próprio tenant e acompanha o conjunto em
Lista, Kanban e Gantt, expandindo/comprimindo as subtarefas.

**Decisões travadas com o PO (não reabrir):** 2 níveis exatos com a regra no banco; datas manuais e
rollup da tarefa-pai calculado em runtime, nunca persistido; enum fixo de 4 status
(Backlog / Em Andamento / Bloqueio / Finalizado) = as 4 colunas do Kanban, com motivo obrigatório ao
bloquear; 1 responsável por tarefa, FK para `profiles(id)` do mesmo tenant; escrita liberada a todos
os papéis exceto `viewer`.

**Correções de premissa descobertas no código** (o docs/PROJETO.md está desatualizado nestes pontos):
migration desta fase é a **0037** (a última no repo é a 0036, não a 0027); a tabela de pessoas é
**`profiles`**, não `users`; **não há shadcn/ui** instalado (`components/ui/` não existe); já existem
**dois Gantt zero-dep** no projeto, então nenhuma dependência de Gantt é necessária; e a busca de
pessoas atribuíveis do tenant já existe em `lib/opportunities/assignees.ts`.

**Waves:** 1 → `16-01` (migration 0037 + tipos à mão + checkpoint humano de apply, write-only mode);
2 → `16-02` (TRACER ponta-a-ponta com a Lista) ‖ `16-03` (testes de banco);
3 → `16-04` (rollup + Lista hierárquica); 4 → `16-05` (CRUD completo + cascata);
5 → `16-06` (Kanban + interceptação do bloqueio); 6 → `16-07` (Gantt + checkpoint visual).

**Dois gates humanos no caminho crítico:** o apply manual da `0037` no SQL Editor do Supabase Cloud
(fim da wave 1 — nada avança sem ele) e a verificação visual das 3 views (fim da wave 6).

**Fora de escopo desta fase** (candidatos a próxima): visão de tarefas cross-oportunidade
("minhas tarefas"), dependências entre tarefas / caminho crítico, arrastar barras no Gantt para
alterar datas, notificar o responsável por e-mail, comentários/anexos/log de horas.

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-20)

**Core value:** Cliente final consegue ver suas demandas de automação e cadastrar novas em um único lugar, sem planilhas/e-mails.
**Current focus:** Phase 18 — staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa

## Current Position

Phase: 18 (staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa) — EXECUTING
Plan: 8 of 8
Status: Phase complete — ready for verification
Last activity: 2026-08-07 — Phase 18 execution started

**Phase 17 não está selada:** `17-08` Task 3 (`checkpoint:human-verify`, roteiros A–G) segue pendente.

**Carryover do v0.1 (pendente):** Phase 7.6 (Enriquecimento por IA) ficou `ready_to_execute` mas será REALINHADA aos novos campos do v0.2 antes de executar (os 9 campos-alvo do enrichment mudam). Phase 8 (Deploy) será ABSORVIDA ao final do v0.2 (schema muda por baixo). Artefatos do 7.6 preservados em `.planning/phases/07.6-enriquecimento-ia-oportunidades/`.

Previous activity: 2026-05-26 — `/gsd-insert-phase 7.6` (Enriquecimento por IA das Oportunidades) inserida entre 7.5 e 8 a pedido do PO. Criados: `.planning/phases/07.6-enriquecimento-ia-oportunidades/PHASE.md` (148 linhas, escopo em 6 blocos A-F). ROADMAP.md atualizado. `.env.example` (linha 30) e `.env.local` (linha 24) ganharam `OPENAI_API_KEY=` vazio. Reversão escopada da decisão "IA generativa = out-of-scope" do PROJECT.md.

Previous activity: 2026-05-22 — `/gsd-execute-phase 7.5` executou Plan 06 em **write-only mode** (Supabase Cloud, sem .env.test): 8 commits (f4f17f9 install botid+@marsidev/react-turnstile, 4f9974a migration 0007 public_form_submissions+RPC hardened, 909e016 handoff doc, be85e0b lib/security/* helpers, 02b6e6a createPublicOpportunity refatorado com BotID+Turnstile+log+pt-BR genérico, a779acb withBotId+initBotId, 55b6689 PublicForm widget invisible + token, b98bf6d 13 specs turnstile unit + public-form integration). 1 deviation Rule 3 (server-only não resolve em Vitest — alias para stub em vitest.config.ts; padrão Next.js, zero impacto em prod). typecheck clean. `npm run test:security` exit 0 (24 passed = 6 turnstile + 18 mass-assignment + 22 skipped = 3 atomicity + 7 public-form + 12 tenant-isolation). audit:secrets clean (TURNSTILE_SECRET_KEY só em server-only). Total ~17min.

Progress: [██████████] 96%
<!-- Phase 7.5: 6/6 plans completos. Próximo phase: 8 (Polish & Deploy) -->

## Milestone v0.1 — Roadmap (Reordenado em 2026-05-20)

| # | Fase | Entrega |
|---|------|---------|
| **1** | **Modelagem do Banco** | **`.planning/DATA-MODEL.md` + migration SQL inicial (`supabase/migrations/0001_init.sql`) com enums, tabelas, RLS, funções (`opportunity_score`), triggers (`seq_id`), índices. Aplicada em ambiente Supabase.** |
| 2 | Bootstrap App | Repo Next.js 16 inicializado, Supabase linkado, Vercel conectada, env vars + types gerados |
| 3 | Auth & Tenant Context | Login Supabase Auth, callback, hook `useTenant()`, middleware de proteção de rotas |
| 4 | Migração Visual do Mockup | Header, KPI bar, toolbar e as 3 views (tabela / cards / kanban) com dados reais — somente leitura |
| 5 | CRUD via Wizard | Modal "Nova Oportunidade" multi-step (5 para persona, 6 para formulário), incluindo edição inline |
| 6 | Pipeline & Fases | Troca de status pelo header do modal, gravação de datas início/fim por fase, atualização do kanban |
| 7 | Filtros, Busca, Ordenação, KPIs | Paridade com o mockup nos filtros, recálculo de score, KPIs reativos |
| **7.5** | **Hardening de Segurança MVP** | **Testes automatizados de isolamento de tenant (RLS), Zod centralizado em Server Actions, atomicidade do `seq_id`, rate limit + captcha no formulário público, headers de segurança, auditoria de segredos.** |
| 8 | Polish & Deploy | Responsivo, loading states, error boundaries, deploy de produção, smoke test com cliente piloto |

**Reordenação (2026-05-20):** banco antes do bootstrap do app. Schema é o contrato; corrigir migration depois é caro.

**Inserção (2026-05-21):** Phase 7.5 (Hardening de Segurança MVP) inserida entre 7 e 8. Motivo: deploy de produção com cliente piloto sem testes automatizados de isolamento de tenant + sem rate limit no formulário público é risco real. Documentado em `.planning/phases/07.5-hardening-seguranca-mvp/PHASE.md`.

**Inserção (2026-05-26):** Phase 7.6 (Enriquecimento por IA das Oportunidades) inserida entre 7.5 e 8 (URGENT). Motivo: o wizard de criação e o formulário público pedem 9 campos (`ferramenta`, `escopo_automacao[]`, `beneficios_esperados[]`, `observacao`, `risco`, `esforco`, `complexidade`, `tempo`, `objetivo`) que o usuário final não tem contexto pra responder bem. Esses campos passam a ser **output** de um pós-processamento OpenAI server-side, disparado assincronamente após o INSERT da oportunidade. Reverte escopadamente "IA generativa = out-of-scope" do PROJECT.md — IA é auxiliar interno invisível, não feature do produto. `OPENAI_API_KEY` já adicionada (vazia) em `.env.example` e `.env.local`. Documentado em `.planning/phases/07.6-enriquecimento-ia-oportunidades/PHASE.md`. Próximo: `/gsd-discuss-phase 7.6` (decisões em aberto: disparo via `after()` do Next vs Supabase Edge Function via webhook vs Vercel Cron).

## Performance Metrics

**Velocity:**

- Total plans completed: 12
- Average duration: 7.7min
- Total execution time: ~46min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 7.5 | 6 | 46min | 7.7min |
| 11 | 3 | - | - |
| 12 | 2 | - | - |
| 15 | 1 | - | - |

**Recent Trend:**

- Last 6 plans: 07.5-05 (5min), 07.5-02 (8min), 07.5-04 (3min), 07.5-06 (17min), 12-01 (5min)
- Trend: 12-01 rápido (5min) — fase de "wiring" puro de `lib/` sem UI/install; 3 tasks reusando padrões consolidados (`actions.ts`/`queries.ts`/`risk-schema.ts`). Zero deviations, zero migration.

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 16 P01 | 12min | 3 tasks | 4 files |
| Phase 16 P02 | 35min | 3 tasks | 13 files |
| Phase 16 P03 | 20min | 3 tasks | 4 files |
| Phase 16 P04 | ~25min | 2 tasks | 4 files |
| Phase 16 P05 | ~20min | 3 tasks | 10 files |
| Phase 16 P06 | ~30min | 3 tasks | 8 files |
| Phase 17 P01 | 21min | 4 tasks | 8 files |
| Phase 17 P02 | ~15min | 2 tasks | 4 files |
| Phase 17 P03 | ~2h | 4 tasks | 3 files |
| Phase 17 P04 | ~45min | 4 tasks | 4 files |
| Phase 17 P06 | 35min | 3 tasks | 8 files |
| Phase 17 P05 | ~50min | 2 tasks | 1 files |
| Phase 17 P07 | ~7min | 3 tasks | 6 files |
| Phase 18 P01 | 25min | 3 tasks | 4 files |
| Phase 18 P02 | multi-sessão | 4 tasks | 5 files |
| Phase 18 P04 | 14min | 3 tasks | 6 files |
| Phase 18 P03 | checkpoint-gated | 3 tasks | 3 files |
| Phase 18 P05 | checkpoint-gated | 4 tasks | 4 files |
| Phase 18 P06 | ~55min | 3 tasks | 7 files |
| Phase 18 P07 | ~50min | 3 tasks | 7 files |
| Phase 18 P08 | ~45min | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisões registradas em `.planning/PROJECT.md` → tabela "Key Decisions". Resumo das que já guiam o trabalho:

- **Stack**: Next.js 16 + Supabase + Vercel
- **Multi-tenancy**: Row Level Security do Postgres (não schema-per-tenant)
- **Score**: calculado em runtime, não persistido
- **Tipos**: `persona` e `formulario` na mesma tabela `opportunities` com discriminator + JSONB para campos exclusivos
- **Admin panel**: fora do MVP
- **Test runner (Plan 07.5-01)**: Vitest 3.2.x com `pool='forks'` `singleFork=true` — serializa specs contra mesma instância Supabase (Pitfall 4 do RESEARCH); testes de integração rodam contra Postgres real, NUNCA contra mocks
- **Tenants de teste (Plan 07.5-01)**: `fgcoop-test` (UUID `11111111-...`) + `acme-test` (UUID `22222222-...`); seed via Supabase Admin API; trigger `handle_new_user` cria profiles automaticamente
- **globalSetup unit-only mode (Plan 07.5-03)**: `tests/setup/global-setup.ts` detecta `NEXT_PUBLIC_SUPABASE_URL` vazio e pula seed (loga `[vitest globalSetup] modo unit-only`). Permite que specs puros (mass-assignment, futuros unit) rodem sem `supabase start`. URL apontando para produção ainda ABORTA (defesa hard preservada).
- **Mass Assignment defense por construção (Plan 07.5-03)**: `opportunityInputSchema` é `discriminatedUnion` com `.strict()` em CADA variant — `tenant_id`, `created_by`, `seq_id`, `id`, `created_at`, `updated_at` rejeitados como `unrecognized_keys`. `formularioExtrasSchema` adiciona `.superRefine` 8KB. `updateOpportunity` ganha `.eq('tenant_id', profile.tenant_id)` como defesa em profundidade sobre o RLS.
- **Security headers em proxy.ts (Plan 07.5-05)**: 6 headers (`Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`) anexados ao `NextResponse` retornado por `updateSession` — cobre redirect, 200, 404. CSP permite Turnstile (challenges.cloudflare.com em script/frame/connect) e Supabase REST/Realtime (`*.supabase.co` + `wss://`). `'unsafe-inline'` em script-src é tech debt MVP aceito (CONTEXT.md A6); `'unsafe-eval'` somente em `NODE_ENV=development`. `next.config.ts` fica reservado para Plan 06 (`withBotId`).
- **Whitelist de colunas em queries.ts (Plan 07.5-05)**: 3 `.select('*')` substituídos por constantes `OPPORTUNITY_COLUMNS` (30 colunas) e `PHASE_COLUMNS` (8 colunas). `.returns<Opportunity[]>()` posicionado AO FINAL da chain (não logo após `.select()`) para preservar `.eq()/.or()/.order()` do builder e a inferência de tipos do Supabase. Migrations futuras com colunas sensíveis exigem decisão explícita de inclusão.
- **Atomicidade `seq_id` por tenant (Plan 07.5-02)**: aux table `tenant_sequences(tenant_id uuid pk, last_seq int)` com RLS enabled + ZERO policies (acesso só via service_role / SECURITY DEFINER). Função `next_seq_id(p_tenant_id uuid)` usa `INSERT ... ON CONFLICT DO UPDATE ... RETURNING last_seq` — row-lock transacional, sem gaps em rollback (diferente de `CREATE SEQUENCE` cujo `nextval` não rollback). Trigger `trg_opportunities_seq_id` SEMPRE sobrescreve `new.seq_id := next_seq_id(...)` (sem `if null`) — defesa contra forge de seq_id pelo cliente (threat T-07.5-C-02).
- **Write-only mode para Supabase Cloud (Plan 07.5-02)**: projeto roda em Cloud (hosted), não local Docker. Migration 0006 é arquivo + handoff doc copy-paste-ready para Supabase Dashboard SQL Editor (NÃO `supabase db push`). Apply manual via Dashboard mantém controle visual e evita exigência de `SUPABASE_ACCESS_TOKEN` em sessão não-TTY. Padrão para próximas migrations enquanto projeto não tiver CI.
- **Vitest skip-when-no-db pattern (Plan 07.5-02)**: `describe.skipIf(!process.env.NEXT_PUBLIC_SUPABASE_URL)` + lazy-init de `serviceRoleClient()` dentro de `beforeAll` (corpo do describe roda mesmo em skip mode, só pula os `it`s). Permite `npm run test` exit 0 sem `.env.test` populado — específicos de integração entram em modo skipped, unit tests rodam normal.
- **RLS tenant-isolation suite (Plan 07.5-04)**: 12 specs em 4 grupos cobrindo HARDEN-A-01..05. SELECT/UPDATE/DELETE cross-tenant retornam `data: []` (RLS USING filtra silenciosamente). INSERT com `tenant_id` forjado retorna erro (RLS WITH CHECK levanta 42501). Cobertura simétrica em `opportunities` (4 verbos), `opportunity_phases` (4 verbos — HARDEN-A-05d adicionado por simetria), `profiles` (SELECT — `profiles_update_self` é id=auth.uid(), não tenant-based, fora do escopo Bloco A). Grupo 4 cross-check: `opportunityInputSchema.strict()` rejeita `tenant_id` no payload — defesa em profundidade Zod antes do RLS. Padrão skipIf + lazy-init reusado integralmente do Plan 02.
- **Formulário público hardened (Plan 07.5-06)**: 4 camadas de defesa em `/r/[slug]` — (1) Vercel BotID edge classifier, (2) Cloudflare Turnstile invisível (challenge → siteverify single-use), (3) Server Action valida ambos + loga em `public_form_submissions`, (4) RPC `create_public_opportunity` enforce length/array/jsonb limits no DB (SECURITY DEFINER). Rate limit por janela fixa NÃO implementado — deferido para backlog 999.x (CONTEXT.md `<deferred>` lock); BotID+Turnstile+limits cobrem ~95%, Upstash custo só justifica com monitoring real de abuso. IP hashado por construção (`hashIp()` THROW sem `IP_HASH_SALT` env). `error.message` raw NUNCA retornado ao cliente — só para `public_form_submissions.error_message` (audit). pt-BR genérico em todas as respostas. Token Turnstile single-use, reset() após cada submit. `withBotId(nextConfig)` + `initBotId({protect: [{ path: '/r/*', method: 'POST' }]})` em `instrumentation-client.ts`. BotID retorna `isBot:false` em local dev (RESEARCH Pitfall 1) — E2E ficam manuais em preview deploy.
- **server-only stub para Vitest (Plan 07.5-06)**: `vitest.config.ts` alias `'server-only' → ./tests/setup/server-only-stub.ts` (módulo vazio). Pacote `server-only` é dev-dep do Next bundler — não existe em Node puro de teste. Padrão recomendado pela própria doc do Next. Zero impacto em produção. Necessário para que helpers `lib/security/*` (todos abrem com `import 'server-only';`) sejam importáveis em test.
- **Camada de dados/mutação de riscos (Plan 12-01)**: `risk-actions.ts` (`'use server'`) modela `actions.ts` — `riskInputSchema.safeParse` → `auth.getUser` → `profiles.tenant_id` server-derived → enumeração explícita de colunas (sem spread) → `revalidatePath`. **`priority` NUNCA no payload** (insert/update): o trigger `set_risk_priority()` é `before insert OR update` (0011:294), única autoridade; `updateRisk` não faz nada de especial — editar impacto/probabilidade recalcula sozinho (RISK-02/03 = app-layer puro, sem migration). `updateRisk`/`deleteRisk` recebem `opportunityId` só p/ `revalidatePath` e escopam por `.eq('tenant_id', profile.tenant_id)` (defesa em profundidade). Query `fetchRisksForOpportunity`/`fetchRiskById` com whitelist `RISK_COLUMNS` (sem `select('*')`), ordenadas por `created_at asc` (rank de severidade `critica>alta>media>baixa` fica no client em 12-02 — `.order('priority')` é alfabético, não semântico; Pitfall 6). `risk-labels.ts` = módulo único enum minúsculo→PT Title-Case (`Record<Enum,string>` type-safe) + badges (🚧/⚠️/💡, `PRIORITY_BADGE_CLASS` por cor) + `RESPONSAVEL_SUGGESTIONS` p/ datalist (D-08, tenant-agnóstico).
- [Phase ?]: Migration 0037 (opportunity_tasks) aplicada no Supabase Cloud pelo PO — 10/10 verificacoes passaram (14 colunas, enum de 4 status, 2 guards de trigger, RLS com 4 policies); planos 16-02+ destravados
- [Phase ?]: Verificacao 7 do handoff (UPDATE de re-parentamento) exercitou o ramo 'pai ja e subtarefa' do guard check_task_depth, nao o ramo 'linha ja tem filhas' — ambos os ramos existem na funcao, D-01 se sustenta nos dois sentidos
- [Phase ?]: 16-02: TaskList/página /tarefas reusam fetchAssignableProfiles(tenant_id) para resolver nome do responsável a partir de assignee_id — zero query nova (D-08)
- [Phase ?]: 16-02: tracer feedback gate tratado como execução autônoma (plano autonomous:true, <verify> da Task 1 100% automatizada, sem componente visual)
- [Phase ?]: 16-03: testes de trigger via service-role (bypassa RLS de propósito); 6ª spec de cascade em opportunity-tasks-isolation; promoção a viewer como fixture do describe aninhado (não it próprio) para bater com a contagem de 7 specs do plano
- [Phase ?]: task-rollup.ts espelha score.ts (fonte única, nunca persistido) mas sem espelho SQL/teste de paridade — único consumidor já tem o array em memória
- [Phase ?]: groupTasksByParent é o único ponto de agrupamento por parent_task_id — Lista (16-04) e Gantt (16-07) importam a mesma função
- [Phase ?]: task-actions.ts: as 4 mutações de tarefa nunca interpolam error.message do banco na resposta ao cliente (T-16-13) — mensagens pt-BR genéricas apenas, retroativo em createTask
- [Phase ?]: TaskFormDialog.close()/TaskList row-action hrefs reconstroem a query via URLSearchParams removendo só tarefa/parent — preservam view (16-06) e qualquer parâmetro futuro automaticamente
- [Phase ?]: decideBlockReason(reason: string | null) unifica cancelamento (null) e motivo-vazio no mesmo noop, permitindo testar cada caminho separadamente sem duplicar a regra de rejeição do motivo do bloqueio (16-06)
- [Phase ?]: TaskKanbanColumn.tsx/TaskKanbanCard.tsx foram escritos no disco durante a Task 1 do plano 16-06 (para TaskKanbanBoard.tsx typecheckar) mas só entraram no commit da Task 2 — cada commit permanece exatamente com os arquivos que o plano atribui a cada task
- [Phase ?]: 17-01: checkpoint:decision resolvido pelo PO com aplicar-agora — 0039 aplicada em producao sem .env.test; prova real de RLS adiada para 0040+ (17-02/17-03/17-05)
- [Phase ?]: 17-01: lib/security/cargo.ts (AccessRole) permanece intocado — psw_staff fica fora da allowlist de convite do tenant_admin por construcao (D-05)
- [Phase ?]: 17-02: seed compartilhado do tenant/perfil PSW (idempotente) + asPswStaff(); fixture com 3 oportunidades (X atribuida, Y nao atribuida no mesmo tenant, Z atribuida em outro tenant) escrita ANTES da policy — os 5 specs decisivos ficam RED ate a 0040 (Plan 17-03) e em skipIf ate .env.test existir
- [Phase ?]: 17-02: platform_admin de teste recriado localmente em psw-staff-isolation.test.ts (mesmo padrao de platform-admin-cross-tenant.test.ts) em vez de centralizado no seed compartilhado — so o papel psw_staff foi centralizado
- [Phase ?]: Task 2 (17-03): reescrever-in-place confirmada pelo PO — trigger check_assignee_tenant() reescrito + abertura de tenants escopada às oportunidades atribuídas
- [Phase ?]: Migration 0040 aplicada e provada em produção: 7 verificações manuais, incluindo o negativo decisivo ACCESS-04 (1 de 43 oportunidades visíveis) — .env.test continua ausente, suíte Vitest segue em skip
- [Phase ?]: 17-04: aplicar-as-duas (0041+0042) — a 0038 ja estava commitada (f3d2846) antes desta fase, entao o risco de divergencia da RPC de auditoria que motivava as outras opcoes nao se aplica.
- [Phase ?]: 17-04: vazamento aparente (7 linhas em notes/risks) investigado e EXONERA a 0041 — causa raiz e defeito PRE-EXISTENTE (0011/0018): opportunity_notes/opportunity_risks/opportunity_documents nao tem guarda de coerencia de tenant. PO decidiu migration 0043 (fora do escopo do 17-04) para corrigir.
- [Phase ?]: 17-04: as 9 verificacoes do handoff NAO foram executadas — o fechamento se apoiou no apply confirmado + verificacao de vazamento do orquestrador + diagnostico ad-hoc. ACCESS-11, ACCESS-09, Storage (D-12) e a 0042 seguem sem prova empirica em producao (ver WINDOWS #10).
- [Phase ?]: resolveWriteTenantId() estendido tambem aos 5 INSERTs de child rows (createRisk/createTask/createNote/addDocumentLink/uploadDocumentFile), alem dos 9 pontos UPDATE/DELETE do plano literal -- necessario para D-04 nao quebrar ao criar linhas numa oportunidade atribuida de outro tenant
- [Phase ?]: updateTaskStatus (sem opportunityId no contrato do Kanban) le a tarefa primeiro via SELECT autenticado RLS-filtrado para descobrir a oportunidade, so entao resolve o escopo de escrita
- [Phase ?]: Plan 17-05: @ts-expect-error para inserts de invited_emails com role=psw_staff (tipo hand-maintained ainda nao reflete o CHECK ampliado pela 0041) — registrado como todo em WINDOWS.md #14, fora do escopo deste plano.
- [Phase ?]: Plan 17-05: 38 specs de RLS (tabelas filhas, profiles, triggers, escrita escopada, gate de viewer, invited_emails) escritos e corretos por leitura cruzada do SQL aplicado, mas NAO executados (.env.test ausente) — fecha a lacuna de cobertura, nao a de execucao.
- [Phase ?]: Coluna e filtro Empresa condicionados a flag isPswStaff calculada no servidor; UI client nunca decide por papel.
- [Phase ?]: 17-08: painel de atribuicao de [id]/page.tsx usa fetchAssignableProfilesForPlatformAdmin (candidatos a RECEBER atribuicao), nao fetchTaskAssignableProfiles (quem JA esta atribuido e pode ser responsavel de tarefa) — funcoes com proposito distinto
- [Phase ?]: 17-08: sinalizacao de empresa no cabecalho exigiu tocar Header.tsx/OpportunityDetail.tsx (fora dos files_modified do plano) porque page.tsx delega todo o markup do cabecalho a esses componentes
- [Phase ?]: 18-01: PO escolheu env-test-populado (Task 1) — .env.test antes do apply da 0045; suíte pulada passa a contar como falha, não como verde
- [Phase ?]: 18-01: psw_tenant_admins escrito à mão em lib/database.types.ts, casando com o DDL da 0045 (RESEARCH); typecheck limpo
- [Phase ?]: Task 2 (checkpoint:decision): PO escolheu aplicar-como-escrito — concessão órfã inerte, leitura de psw_tenant_admins restrita a platform_admin + a própria pessoa
- [Phase ?]: Cardinalidade (D-D/add-alongside): profiles.tenant_id permanece singular/NOT NULL; pluralidade admin-de-N-empresas vive só em psw_tenant_admins
- [Phase ?]: Desvio autorizado: acréscimo de opportunities_update_psw_admin — nenhum plano futuro da fase concederia UPDATE ao staff-admin sem ele
- [Phase ?]: Modo de prova da fase revertido: env-test-populado -> prova-por-sql-no-handoff (colisão de UUID entre fixture de teste e tenant real de produção)
- [Phase ?]: 18-04: Linha expansível de /admin/staff via <details>/<summary> nativo (não <table>/<tr> literal), mantendo o Server Component sem 'use client'
- [Phase ?]: 18-04: countRevokeImpact reusa fetchOpportunityIdsForAssignee (helper existente) em vez de query nova, para que actions.ts nunca mencione opportunity_assignees (T-18-31/D-C)
- [Phase ?]: 18-03: profile de teste no tenant de controle para popular opportunity_assignees da fixture c4 sem violar check_assignee_tenant() nem contaminar c3/c4-negativo
- [Phase ?]: 18-05: aplicar-as-11 — as 11 policies vivas de tenant_admin trocadas pela fonte unica is_tenant_admin_of() de uma vez; ratificado que staff-admin de A pode convidar tenant_admin de A (equivalencia D-A), sem poder conceder nem convidar psw_staff/platform_admin
- [Phase ?]: 18-05: byte-equivalencia provada por construcao (leitura de pg_get_functiondef + tabela de equivalencia papel-a-papel), nao por amostragem — o baseline pre-apply foi capturado depois do apply por engano
- [Phase ?]: 18-05: impersonacao de sessao via set_config nao funciona no SQL Editor do Supabase Cloud — invalida verificacoes D5/D6/D7-style dos handoffs 18-02/18-03/18-05; usar inspecao estatica ou observacao pelo app daqui em diante
- [Phase ?]: 18-06: isTenantAdminOf/resolveAdminTenantId espelham is_tenant_admin_of() SQL; guard de admin muda de isTenantAdmin(profile) para isTenantAdminOf(profile, tenantAlvo) em team/actions.ts e configuracoes/actions.ts
- [Phase ?]: 18-06: tenant-alvo de escrita de admin resolvido via resolveAdminTenantIdFromSelector (seletor de empresa da Sidebar), nunca de profile.tenantId — fecha o caso canônico de sucesso silencioso (D-K) em convite/revogação de equipe e nas 3 escritas de branding
- [Phase ?]: /team ficou sem acesso para platform_admin (diferente de configuracoes/logs) — resolve ambiguidade entre o <action> da Task 2 e a prohibitions list do plano a favor de zero-regressão; PO deve confirmar
- [Phase ?]: Nenhum helper novo em lib/security/role.ts ou lib/tenants/queries.ts — contagem/lista de concessões psw_tenant_admins ficou inline em cada página, para respeitar o files_modified exato do plano 18-07
- [Phase ?]: <fieldset disabled> em vez de prop disabled em TeamInviteForm/BrandingForm — cascata nativa do HTML desabilita os Client Components filhos sem editar seus arquivos
- [Phase ?]: Identidade visual do shell (Phase 18): permanece a do tenant de lotação da pessoa, nunca a da empresa selecionada no seletor — a empresa de atuação é comunicada só pelo ScopeBadge nas telas de admin. Decisão revisável.
- [Phase ?]: Gate de atribuição em oportunidade (lib/opportunities/assignee-actions.ts) alinhado com a RLS de 0047: platform_admin OU isTenantAdminOf(profile, tenant-da-oportunidade), substituindo o antigo gate por papel isolado — interface e banco concordam.

### Pending Todos

- **[BLOQUEIA Phase 15] Aplicar `supabase/migrations/0013_seed_unidasul_opportunities.sql` no Supabase Cloud SQL Editor** (Phase 15 Plan 01 — checkpoint:human-action write-only). Handoff: `.planning/phases/15-seed-dados-workshop/15-01-MIGRATION-HANDOFF.md`. Colar o arquivo inteiro no SQL Editor, rodar, e colar o resultado das 9 queries de verificação (esperado: 1 tenant Unidasul, 1 admin tenant_admin, 64 opps, 0 nulos em fonte/criterios/beneficios/fte_horas, 0 nulos em score/priority_level/rpa_score). `gen:types` opcional (migration não muda schema). Após o apply + verificação, marcar a fase completa.
- **Aplicar `supabase/migrations/0006_seq_id_atomic.sql` no Supabase Cloud SQL Editor** (Phase 7.5 Plan 02 deliverable — handoff em `.planning/phases/07.5-hardening-seguranca-mvp/07.5-02-MIGRATION-HANDOFF.md`). Após apply, rodar `npm run gen:types` para regenerar `lib/database.types.ts`. Sem isso, o teste `tests/security/atomicity.test.ts` permanece em skip mode quando `.env.test` apontar para o projeto Cloud.
- **Aplicar `supabase/migrations/0007_public_form_hardening.sql` no Supabase Cloud SQL Editor** (Phase 7.5 Plan 06 deliverable — handoff em `.planning/phases/07.5-hardening-seguranca-mvp/07.5-06-MIGRATION-HANDOFF.md`). Cria `public_form_submissions` + funções `log_public_form_attempt`/`update_public_form_attempt` + recria `create_public_opportunity` hardened. Após apply, rodar `npm run gen:types` para remover os casts em `lib/public-form/log.ts`.
- **Configurar 3 env vars no Vercel** (Phase 7.5 Plan 06 — formulário público anônimo):
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (público) + `TURNSTILE_SECRET_KEY` (server): criar widget Mode:Invisible em Cloudflare Dashboard → Turnstile. Setar via `vercel env add ... production preview`.
  - `IP_HASH_SALT`: gerar com `openssl rand -hex 32`. Setar via `vercel env add ... production preview`. Sem isso, Server Action retorna sempre "Erro de configuração do servidor."
- **Popular `.env.test` apontando para projeto Supabase Cloud DE TESTE** (Phase 7.5 Plan 04+06 activation — instruções em `.planning/phases/07.5-hardening-seguranca-mvp/07.5-04-SUMMARY.md` §"Apply Manually" + `07.5-06-SUMMARY.md` §"User Setup"). Ativa 22 integration specs (3 atomicity + 12 tenant-isolation + 7 public-form) em modo green. Sem isso, suite roda em skip mode (válido para CI sem Docker, mas não verifica RLS/RPC de fato). REQUER: aplicar todas migrations 0001..0007 no projeto Cloud de teste antes (não usar produção).
- **[BLOQUEIA continuidade]** Revisar e commitar o que está pendente na working tree: pacote v0.3 (RBAC/status/documentos-notas-histórico, 58 arquivos da sessão 2026-07-15) + sidebar/identidade PSW (sessão 2026-07-16) + migration `0019_fix_view_v03_columns.sql` + `_giba_wsi-dashboard.html` recuperado (está untracked, precisa ser adicionado — é a fonte da verdade visual citada no docs/PROJETO.md e não pode continuar fora do repo). Nada disso foi commitado ainda.
- **Reconciliar numeração de migrations com a branch remota `feat/v0.3-produtizacao`** — ela tem seus próprios arquivos `0014` a `0019` (conteúdo diferente: platform_admin/invited_emails/seed GSMM) já aplicados no MESMO banco Supabase por outra sessão. Não colidiu tecnicamente (tabelas/enums diferentes), mas os nomes de arquivo estão duplicados entre branches. Qualquer migration nova deve usar número ≥ `0020`. Ver memória `feat-v03-produtizacao-branch-conflict`.
- **Decidir se/quando portar o resto da branch `feat/v0.3-produtizacao`** (admin panel `platform_admin`, export CSV, overlay de enriquecimento por IA) — só a sidebar foi trazida (2026-07-16); o resto segue só naquela branch, não commitada em `main`. Painel admin já está parcialmente live no banco (enum + tabela `invited_emails`) mas sem código correspondente em `main` — decisão do PO foi "deixar como está" por enquanto.
- Definir nome final do projeto (`fgcoop-coe`? `coe-platform`? `psw-coe`?) antes da Fase 2 (bootstrap do app)
- ~~Levantar a marca / paleta do cliente piloto~~ — **decidido: identidade PSW Digital (azul `#183799`/`#2341e1` + Poppins), extraída de pswdigital.com.br (2026-07-16)**
- Decidir provedor de e-mail/magic link (Supabase nativo basta para MVP)
- ~~Confirmar com o time se Supabase será compartilhado~~ — **decidido: compartilhado + RLS (2026-05-20)**

### Blockers/Concerns

- **Risco**: vazamento entre tenants caso alguma query backend esqueça `tenant_id`. Mitigação: RLS obrigatório + testes de integração simulando dois tenants
- **Risco**: divergência entre o mockup e o sistema final cria retrabalho. Mitigação: na Fase 4, replicar a estrutura visual fielmente antes de evoluir
- **Risco**: dependência de Supabase como SPOF — aceitar por enquanto, plano B é migrar para Postgres gerenciado próprio só se cliente exigir
- 17-01: .env.test continua ausente (so .env.test.example) — specs de RLS decisivos dos planos 17-02/17-03/17-05 rodarao em describe.skipIf ate isso ser resolvido (pendencia desde Phase 7.5)
- Fase 17 (Plan 17-08, Task 3): checkpoint:human-verify BLOCKING pendente — roteiros visuais A-G (listagem unificada, abas populadas, download, escrita pós-reload, responsavel de tarefa, isolamento do cliente, convite/atribuicao psw_staff) nao executados nesta sessao, sem acesso a browser. Conta de QA ja provisionada: qa.pswstaff@pswdigital.com.br.
- 18-03: 6 das 8 verificacoes do handoff da 0046 (V2/V3/V5/V6/V7 + idempotencia) nao foram executadas pelo PO — propagacao positiva e negativo cross-tenant sem prova de runtime; recomendado rodar antes/durante 18-05
- Phase 18 completa funcionalmente e auditada estruturalmente, mas o roteiro visual A–H (Task 3, checkpoint bloqueante) não foi executado — sem acesso a browser nesta sessão. Registrado em WINDOWS.md id 37. Fase 17 também permanece não-selada pelo mesmo motivo (17-08 Task 3).

## Session Continuity

Last session: 2026-08-07T20:08:36.899Z

Previous session: 2026-07-16 (parte 3) — **Bug pós-apply do pacote v0.3 encontrado e corrigido.** Depois do PO corrigir um desvio de relógio do sistema (não relacionado, causava `JWT issued at future` no Supabase Auth), `/opportunities` continuou quebrado: `column opportunities_with_score.criticidade does not exist`. Causa raiz: a migration 0017 adicionou 9 colunas em `opportunities`, mas não recriou a VIEW `opportunities_with_score` (definida em 0011 com `select o.*`) — no Postgres, a lista de colunas de uma view com `select o.*` fica congelada no momento da criação; colunas novas na tabela base via `ALTER TABLE` não aparecem sozinhas na view. Criada e aplicada `supabase/migrations/0019_fix_view_v03_columns.sql` (mesma definição de view de 0011, só recriada — agora captura o shape pós-0017). Verificado via `information_schema.columns` (9 colunas v0.3 + score/priority_level presentes) e confirmado end-to-end no browser (`/opportunities` carrega 65 registros, coluna Criticidade visível). **Lição registrada em memória:** toda migration futura que adicionar coluna em `opportunities` precisa também recriar essa view no mesmo pacote.

Previous session: 2026-07-15 (parte 2) — **Migrations 0014-0018 aplicadas no Supabase Cloud via MCP (`mcp__supabase__apply_migration`), uma de cada vez, na ordem obrigatória** (`mcp add --transport http supabase "https://mcp.supabase.com/mcp?project_ref=vxgthycrjetniejsjmee"`, scope local, já estava conectado nesta sessão). Antes de aplicar, `execute_sql` confirmou o estado pré-apply (`tenant_role` sem `'viewer'`, `opportunity_status` com 8 valores) — bateu com a memória. Depois das 5 migrations: as 7 queries de verificação do handoff todas OK (enum `tenant_role`={member,tenant_admin,platform_admin,viewer}; `opportunity_status` com 11 valores; 9 colunas novas em `opportunities`; 3 tabelas novas com `rowsecurity=true`; bucket `opportunity-documents` privado). Rodado também o smoke test do handoff (INSERT de teste → `data_abertura_coe` auto-preenchido; UPDATE status='gestao' não quebrou `sync_opportunity_phase()`; UPDATE status='descontinuado' → `data_fechamento_coe` auto-preenchido; registro de teste deletado). `get_advisors(security)` rodado pós-apply: nenhum finding novo introduzido pelo pacote além de `sync_coe_dates` ter `search_path` mutável — mesmo padrão pré-existente de outras funções do projeto (`set_updated_at`, `opportunity_score`), não é regressão, não corrigido (fora do escopo pedido). **Schema v0.3 está live.** Memória `v03-feature-package-pending-migrations` e Pending Todos deste arquivo atualizados para refletir o apply. **PRÓXIMO:** revisar e commitar os 58 arquivos do pacote v0.3 (RBAC viewer, 11 status, documentos/anotações/histórico, criticidade) — nada foi commitado ainda.

Previous session: 2026-07-15 — **Pacote v0.3 implementado direto no código, FORA do fluxo GSD** (o PO comparou o produto com um inventário de referência externo — "COE — COPA ENERGIA" — e pediu implementação direta de tudo que fazia sentido, "sem ceremonial GSD"; decisão registrada em PROJECT.md → Key Decisions). Escopo: RBAC somente-leitura por usuário (`profiles.role='viewer'`, bloqueado por RLS de verdade, não só UI), pipeline de 8→11 status (`gestao`/`manutencao`/`descontinuado`), campos operacionais (`criticidade`, `azure_boards_codigo`, `linguagem`, `execucao`, `usuarios_servico`, `execucoes_mes`, `data_conclusao`, datas de abertura/fechamento no COE automáticas), Código do Chamado (reaproveita `seq_id` — sem coluna nova), 3 tabelas novas (`opportunity_documents` com upload real via Supabase Storage, `opportunity_notes` anotações estruturadas, `opportunity_history` auditoria automática append-only), segmentação de portfólio na toolbar, guia de ajuda contextual no wizard, filtro de área no Relatório. Excluído por decisão explícita do PO: import/export Excel, campos `vp` e `economiaFinanceira`, botão "restaurar base" e um 2º sistema de login (redundante com Supabase Auth+RLS).

**5 migrations novas escritas** (`0014` a `0018`, write-only mode, cada uma isolada por causa da restrição do Postgres de não poder usar um valor de enum recém-adicionado na mesma transação) — **NENHUMA aplicada ainda**. Handoff completo (ordem + 7 queries de verificação) em `supabase/migrations/0014-0018_HANDOFF.md`; resumo também em Pending Todos acima. `lib/database.types.ts` já atualizado à mão refletindo o schema pós-0018.

58 arquivos tocados (34 modificados + 24 novos): backend (`schema.ts`/`queries.ts`/`actions.ts` estendidos + `document-actions.ts`/`note-actions.ts`/`history.ts`/`ticket.ts`/`coe.ts`/`status.ts`/`lib/security/role.ts` novos), frontend (tabela/kanban/toolbar/modal com 2 abas novas — Documentos e Histórico — + Anotações estruturadas na aba Observação, wizard com guia de ajuda + campos operacionais, Relatório com filtro de área, RBAC propagado até nas rotas de criação/edição bloqueadas por `redirect()` mesmo por URL direta). Testes novos: isolamento cross-tenant das 3 tabelas, bloqueio de escrita pra viewer, mass-assignment de nota/documento, lógica pura de status/código-chamado/tempo-COE. `tsc --noEmit` limpo; `vitest run` 186 passed/48 skipped (integração sem `.env.test`, esperado)/1 falha pré-existente não-relacionada (`tests/ai/prompts.test.ts`, snapshot desatualizado de `lib/ai/prompts.ts` — arquivo não tocado nesta sessão, já sinalizado como REALIGN-7.6 pendente). `audit:secrets` limpo. **Nada commitado.**

**Sessão foi encerrada de propósito para reabrir com o Supabase MCP autenticado** (`mcp add --transport http supabase "https://mcp.supabase.com/mcp?project_ref=vxgthycrjetniejsjmee"`, scope `local`) — objetivo: aplicar as 5 migrations DIRETO no banco via MCP em vez de copiar/colar manual no SQL Editor. **PRÓXIMO: aplicar 0014→0015→0016→0017→0018 em ordem (uma de cada vez) via MCP, rodar as queries de verificação do handoff, e então revisar/commitar o pacote de código.**

Previous session: 2026-06-05 — `/gsd-execute-phase 15` (sequential, main tree). **Plan 15-01 — artefatos escritos+commitados (3 commits, ~5min); PARADO no checkpoint:human-action (apply manual write-only da 0013).** Task 1 (`76cdbf0`, feat): `0013_seed_unidasul_opportunities.sql` — tenant Unidasul (UUID `55551da5-…`) + admin `admin.unidasul@pswdigital.com.br`/`0123456789` (UUID `bbbbbbbb-…`), espelha 0002; INSERT das **64** opps do Workshop I extraídas do `const DATA` (`_giba:439`) por script descartável `/tmp/gen_0013.js` (NÃO commitado, `JSON.parse` → 64 VALUES); colunas enumeradas como 0003, SEM `seq_id`/`rpa_score`/`score`/`priority_level` (docs/PROJETO.md §3); guard de idempotência por count (D-06, `raise notice`); `ferramenta` RPA→rpa / RPA+n8n→ambos, criterios sim/nao/parcial (de-acentuado), beneficios 1–5, tempo=frequency_bucket, fte=fte_bucket. Paridade validada programaticamente: **rpa_score 64/64**, score seq 0001 = 100, 0 valores uppercase no jsonb, 0 casts raw 'RPA'. Task 2 (`5a62f2b`, test): `tests/security/unidasul-isolation.test.ts` espelha `tenant-isolation.test.ts` (skipIf + lazy-init), semeia tenant Unidasul + 1 opp via service-role, specs SC3-a (`asAcme` SELECT → `[]`), sanity service-role (opp existe), SC3-b (count Unidasul = 0); mitiga T-15-01. `vitest run` exit 0 (3 skipped sem `.env.test`), `tsc --noEmit` clean. Task 3 (`aca6c19`, docs, checkpoint:human-action): `15-01-MIGRATION-HANDOFF.md` espelha 09-handoff — passo-a-passo SQL Editor + 9 queries de verificação SC1/SC2 + idempotência + rollback + notas PII/senha. **1 ajuste cosmético** (reformular frase do handoff p/ não conter o literal proibido pelo grep do acceptance criterion). **Fronteira write-only (docs/PROJETO.md): o agente NÃO aplicou a 0013** — o PO deve aplicar no SQL Editor e colar o resultado das queries. SUMMARY status `awaiting_human_apply`; ROADMAP/STATE marcam "aguardando apply". **Nota runtime:** `gsd-sdk query` indisponível (binário só run/auto/init) — STATE/ROADMAP/SUMMARY/commit manuais; `lib/ai/prompts.ts`+`N8N/`+`_giba_wsi-dashboard.html` preservados sem stage. **PRÓXIMO: PO aplica a 0013 + cola verificação → fase marcada completa.**

Previous session: 2026-06-05 — `/gsd-discuss-phase 15` (Seed dos Dados Reais do Workshop I — Unidasul). Contexto capturado em `.planning/phases/15-seed-dados-workshop/15-CONTEXT.md` (+ DISCUSSION-LOG). 4 áreas discutidas, **6 decisões travadas (D-01..D-06):** (1) **Fonte** = `const DATA` em `_giba_wsi-dashboard.html:439` (64 registros já na shape v0.2, fonte canônica, sem arquivo externo). (2) **Acesso** = criar tenant Unidasul **+ admin user de login** (paridade com 0002), credenciais `admin.unidasul@pswdigital.com.br`/`0123456789` + UUID fixo próprio; `created_by` das 64 = esse admin. (3) **PII** = manter nomes/e-mails reais (dado do cliente piloto, isolado por RLS). (4) **Idempotência** = guard por count do tenant (pula insert se Unidasul já tem opps; seq_id é trigger-assigned, ON CONFLICT não protege). Confirmado o mapeamento de `criterios` (chaves camelCase já batem com o schema 0011 §89-97; só `lower()`+de-acento nos valores) e que o seed **NÃO** insere `seq_id`/`rpa_score`/`score`/`priority_level` (trigger/GENERATED/view). Migration write-only `0013` + handoff manual. Teste cross-tenant obrigatório (SC3/docs/PROJETO.md §1, padrão `tenant-isolation.test.ts`). **Nota runtime:** `gsd-sdk query` indisponível (binário só run/auto/init) — workflow manual (AskUserQuestion nativo; CONTEXT/LOG/STATE/commit manuais; pattern-mapper/scout feitos inline). **Próximo: `/gsd-plan-phase 15`.**

Previous session: 2026-06-05 — **Phase 14 (View "Relatório") COMPLETA e VERIFICADA (2/2 plans, `/gsd-execute-phase 14`, sequential no main).** **Wave 1** 14-01 (núcleo): `lib/opportunities/report.ts` `buildReport` (agregação pura por área — count desc, "Sem Área" fallback, FTE null→0, prioridades via coluna computada `priority_level` D-06, RPA Ideal≥5/RPA+n8n≥3<5 D-07, `PALETTE` 18 cores), `components/opportunities/relatorio/pie.tsx` (`PieCard`/`PieChart` donut SVG portado de `_giba:818-850`, **zero-dep**, "Sem dados" em total 0), `relatorio.tsx` (Server Component: 7 cards + distribuição barras azul/verde + 2 donuts + empty state pt-BR; badge de fonte real via prop `sourceLabel`) [REPORT-02/03/04]. **Wave 2** (dep 01) 14-02 (wiring): view **📈 Relatório** na toolbar (VIEWS/View/parseView) + branch no `page.tsx` com fetch **não-filtrado** `fetchOpportunities()` do portfólio inteiro (D-01a; RLS-scoped, sem `tenant_id` manual; `sourceLabel=tenant.name`) [REPORT-01]. **6 commits feat + 2 SUMMARY + 1 verificação.** Gates: `tsc --noEmit` exit 0; suite **151 passed / 32 skipped / 0 failed** (sem regressão; fase não adicionou testes — UI em paridade). **gsd-verifier PASSED 8/8 truths** (`14-VERIFICATION.md`, status `human_needed`): REPORT-01..04 rastreados, non-negociáveis confirmados (§3 score não persistido — `report.ts` lê colunas computadas, sem `score.ts`/escrita; §1 RLS-only sem filtro cross-tenant T-14-04; zero-dep + server-safe). **3 itens de UAT humano (browser: paridade visual / ignore-filtros / isolamento runtime) APROVADOS pelo PO** ("view relatorio aprovado") — `14-HUMAN-UAT.md` status `passed`. **Nota runtime:** `gsd-sdk query` indisponível (binário só run/auto/init) — workflow manual (verifier via Agent tool; STATE/ROADMAP/REQUIREMENTS/UAT/commits manuais); `gsd:code-review` pulado (depende de gsd-sdk; cobertura pelo verifier, precedente P12/P13); `lib/ai/prompts.ts`+`N8N/`+`_giba_wsi-dashboard.html` preservados sem stage. **Próximo: `/gsd-discuss-phase 15` ou `/gsd-plan-phase 15`** (Seed dos Dados Reais do Workshop I — Unidasul).

Previous session: 2026-06-05 — `/gsd-plan-phase 14` (skip-research + skip-ui, ambos confirmados pelo PO: `_giba_wsi-dashboard.html` é o contrato visual e o CONTEXT.md já fixou todas as refs canônicas). **Phase 14 (View "Relatório") PLANEJADA — 2 plans em 2 waves, plan-checker PASSED na 1ª passada (0 blockers/0 warnings, 4/4 REPORT-IDs + 8/8 decisões D-01..D-08 cobertas).** **Wave 1:** 14-01 (núcleo — novos arquivos `lib/opportunities/report.ts` `buildReport` (agrega por área: count desc, "Sem Área" fallback, maxC/maxF, FTE null→0, prioridade via coluna `priority_level` da view ≥70/40-69, RPA Ideal ≥5 / RPA+n8n ≥3<5), `components/opportunities/relatorio/pie.tsx` `PieCard` (porta `svgPie`/`pieCard` do `_giba:816-850` — donut ri=size*0.22/R=size*0.4, large-arc, "Sem dados" em total=0, PALETTE 18 cores), `relatorio.tsx` Server Component das 3 seções: 7 cards + barras azul/verde por área + 2 donuts + empty state global pt-BR; **zero dep nova** — grep-guard contra recharts/visx/d3) [REPORT-02/03/04]. **Wave 2** (dep 14-01, sem overlap de arquivos): 14-02 (wiring — registra `{id:'relatorio',icon:'📈'}` em `toolbar.tsx` VIEWS/View/parseView + branch de render em `page.tsx` com **fetch NÃO-filtrado** `fetchOpportunities()` do portfólio inteiro — D-01a; threat T-14-04: continua RLS-scoped via `current_tenant_id()`, acceptance criterion proíbe `tenant_id` manual; badge de fonte usa `tenant.name` real, não hardcode) [REPORT-01]. **Score nunca persistido** (read-only, sem payload; usa coluna computada `priority_level`, criterion proíbe importar `score.ts`). `<threat_model>` STRIDE em ambos. Artefatos em `.planning/phases/14-relatorio/` (CONTEXT/DISCUSSION-LOG/2×PLAN). Commit `5cbbfb1` (plans + ROADMAP). **Nota runtime:** `gsd-sdk query <subcmd>` indisponível (binário só expõe run/auto/init) — workflow rodado manualmente (planner/checker via Agent tool; STATE/commit manuais; pattern-mapper pulado — `<code_context>` do CONTEXT.md já mapeia os assets reusáveis). `lib/ai/prompts.ts`+`N8N/`+`_giba_wsi-dashboard.html` preservados sem stage. **Próximo: `/gsd-execute-phase 14`.**

Previous session: 2026-06-05 — **Phase 13 COMPLETA e VERIFICADA (5/5 plans, `/gsd-execute-phase 13`, sequential no main).** Checkpoint human-verify do 13-05 **APROVADO pelo PO** no browser. `gsd-verifier` PASSED **11/11 must-haves** (`13-VERIFICATION.md`, status `passed`) — VIEW-01..05 todos ✅. Gates finais do orquestrador: `tsc --noEmit` exit 0; suite **151 passed / 32 skipped / 0 failed**. Entregue: (W1) 13-01 fundação `deriveRpaScore`+`rpaTier`+specs Wave 0; 13-04 modal 8-abas único lendo first-class + risco→Observação (read-only); (W2) 13-02 KPI 9-cells + colunas FTE/RPA Fit + sort; (W3) 13-03 kanban FTE/coluna + chips; 13-05 modal **editável** modo global via recipe `WizardShell`+`updateOpportunity`, derivados read-only ao vivo nunca no payload (docs/PROJETO.md §3 confirmado pelo verifier: `updateOpportunity` enumera colunas, sem score/rpa_score/priority; tenant-scoped). Achado de valor: 13-05 expôs+corrigiu 2 bugs latentes de seed da P11 em `opportunityToFormData` (`fte_horas` omitido; ambos `*_extras` semeados quebrando o `.strict()` da persona). **Code-review gate (`gsd:code-review`) pulado** — skill depende de `gsd-sdk` (indisponível nesta máquina); cobertura de qualidade/não-negociáveis feita pelo gsd-verifier. **Nota runtime:** `gsd-sdk` indisponível — STATE/ROADMAP/REQUIREMENTS/VERIFICATION/commit manuais; `lib/ai/prompts.ts` (REALIGN-7.6 deferido, não commitado)+`N8N/`+`_giba_wsi-dashboard.html` preservados sem stage. **Próximo: `/gsd-discuss-phase 14` ou `/gsd-plan-phase 14`** (View "Relatório").

Previous session: 2026-06-05 — `/gsd-execute-phase 13` (sequential, main tree). **Plan 13-05 CÓDIGO COMPLETO — modal editável modo global (2 tasks de implementação commitadas; PARADO no checkpoint human-verify, Task 3 blocking).** Task 1 (`15f4f28`, fix/TDD): o spec `13-EDIT-01` (round-trip) expôs DOIS bugs latentes no seed `opportunityToFormData` (herdado da P11; a edição global do modal é o 1º consumidor a submeter o seed cru): (1) **omitia `fte_horas`** → bucket FTE derivado nunca recalcularia + submit gravaria `fte=null`; (2) **semeava AMBOS `persona_extras`+`formulario_extras`** → variante `persona` do `discriminatedUnion .strict()` rejeitava `formulario_extras` (`unrecognized_keys`) ao salvar persona legada. Corrigidos: semeia `fte_horas` + extras XOR por `source` + `criterios`/`beneficios` first-class. Guard de mass-assignment confirma payload sem `tenant_id/id/seq_id/score/rpa_score/priority_level` (mitiga T-13-05-01/04). Task 2 (`86bb78c`, feat): `OpportunityDetail` lift da recipe do `WizardShell` (`editMode`+`form`+`patch`+`onSave`/`onCancel`/`onEdit`); `onSave` gateia critérios all-or-null (`validateStep`), deriva `prioridade_fte`, chama `updateOpportunity` em transition, e — **Pitfall 4** — faz `setEditMode(false)+router.refresh()` (modal NÃO fecha, repinta DB-authoritative) em vez de `router.back()`. `renderTab` ramifica leitura↔edição: Processo/Automação via `fields.tsx`, Critérios/Benefícios/Score via `CriteriosStep`/`BeneficiosStep`/`PriorizacaoStep`, Observação via `TextareaField` (observacao+risco); **Fases/Risco seguem read-only** (fora do payload global). Derivados (score/priority/bucket FTE/rpa_score) recalculam ao vivo, **read-only, nunca no payload** (D-15/docs/PROJETO.md §3). `Header` dirige Editar/Salvar(`Salvando...`)/Cancelar + score circle ao vivo + linha de `submitError` pt-BR; `EditButton` (/edit, D-14) preservado em leitura. Edição vive DENTRO de `OpportunityDetail` (client) → funciona idêntico no intercepting modal e no fullscreen sem duplicar lógica. **2 deviations Rule 1 (os 2 bugs de seed acima).** `tsc --noEmit` exit 0; suite **151 passed / 32 skipped / 0 failed** (17 em `state.test.ts`, 3 novos do 13-EDIT-01; zero novas falhas). Self-check PASSED. **Nota runtime:** `gsd-sdk query` indisponível — STATE/ROADMAP/SUMMARY/commit manuais; `lib/ai/prompts.ts`+`N8N/`+`_giba_wsi-dashboard.html` (out-of-scope) preservados sem stage. **PRÓXIMO: aprovação humana do checkpoint Task 3 (browser UAT) → depois verificação de fase pelo orquestrador.**

Previous session: 2026-06-05 — `/gsd-execute-phase 13` (sequential, main tree). **Plan 13-03 COMPLETO — Kanban FTE por coluna + chips FTE/RPA Fit no card (2 tasks, 2 commits, ~6min).** Task 1 (`cbc710e`, feat): `Column.tsx` ganhou `fteSum = Math.round(opportunities.reduce((s,o)=>s+(o.fte_horas ?? 0),0))` (null-safe) renderizado como sub-linha `⏱️ {fteSum}h FTE/mês` abaixo do label (mirror `_giba:704,734`); count pill + wiring `useDroppable`/drag-target intactos. Task 2 (`d63756d`, feat): `Card.tsx` importa `RpaFitBadge` de `../cells` (helper do Plan 13-02, fonte única de faixas/cores via `rpaTier`) e adiciona linha de chips acima do rodapé — `⏱️ {Math.round(o.fte_horas ?? 0)}h/mês` (pill cinza) + `<RpaFitBadge score={o.rpa_score} />` (mirror `_giba:718-721`); draggable (`setNodeRef`/`listeners`/`attributes`) e `onClick` de navegação preservados (drag-and-drop intacto). **Display puro:** `o.fte_horas`/`o.rpa_score` já presentes em `opportunities_with_score['Row']` — zero fetch/migration. **Zero deviations.** `tsc --noEmit` exit 0; suite **148 passed / 32 skipped / 0 failed** (sem novas falhas; baseline pós-13-02). Self-check PASSED. Kanban em paridade com `_giba:698-741`. **VIEW-04 ✅.** **Nota runtime:** `gsd-sdk query` indisponível — STATE/ROADMAP/REQUIREMENTS/SUMMARY/commit manuais; `lib/ai/prompts.ts`+`N8N/`+`_giba_wsi-dashboard.html` (out-of-scope) preservados sem stage. **Próximo: Plan 13-05** (modal editável modo global, dep 01+04, autonomous:no — termina em checkpoint human-verify).

Previous session: 2026-06-05 — `/gsd-execute-phase 13` (sequential, main tree). **Plan 13-02 COMPLETO — KPI 9-cells + colunas FTE/RPA Fit + sort FTE (3 tasks, 3 commits, ~9min).** Task 1 (`4079555`, feat): `OpportunityKpis` + `computeKpis` reduzidos ao contrato de 9 KPIs do mockup (D-01..D-03) — drop de `personas`/`formularios`/`byTool`, `byStatus` narrow a `{novo,producao,concluido}`, `fteTotal = Math.round(Σ fte_horas null→0)`; `kpi-bar.tsx` reescrito p/ os 9 cells (`_giba:296-305`); os 2 RED intencionais de `kpis.test.ts` viraram GREEN. Task 2 (`83ef726`, feat): `cells.tsx` ganhou `FteCell` (`Xh`, null→travessão) + `RpaFitBadge` (pill por faixa `rpa_score`, cores `_giba:520-525`) reusando `rpaTier` da fonte única `lib/opportunities/cells.ts` (reexport, sem 2ª cópia dos thresholds); `queries.ts` +2 cases `fte_asc`/`fte_desc` (`order('fte_horas',{nullsFirst:false})`). Task 3 (`1ace08b`, feat): `table.tsx` ganhou `SORTABLE_COLS.fte`, header **FTE/mês** sortable (`ThSort`/`toggleSort('fte')`) + **RPA Fit** não-sortable, body cells `FteCell`/`RpaFitBadge`; coluna **Fonte**/`SourceBadge` mantida (D-04). **1 deviation Rule 3 (blocking):** remoção do import `OpportunityStatus` (unused após o narrow de `byStatus`) p/ manter `tsc --noEmit` verde. `tsc --noEmit` exit 0; suite **148 passed / 32 skipped / 0 failed** (nenhum RED intencional remanescente). Self-check PASSED. **Nota runtime:** `gsd-sdk query` indisponível — STATE/ROADMAP/REQUIREMENTS/SUMMARY/commit manuais; `lib/ai/prompts.ts`+`N8N/`+`_giba_wsi-dashboard.html` (out-of-scope) preservados sem stage. VIEW-01/02/03 ✅. **Próximo: Plan 13-03** (kanban FTE/coluna + chips, reusa `RpaFitBadge`).

Previous session: 2026-06-05 — `/gsd-execute-phase 13` (sequential, main tree). **Plan 13-04 COMPLETO — Modal display 8 abas (3 tasks, 3 commits, ~12min).** Task 1 (`fb04696`, feat): colapsa `TABS_PERSONA`/`TABS_FORMULARIO` em um único `MODAL_TABS` de 8 na ordem do mockup (`_giba:959-968`); remove a ramificação `isPersona` e desliga Perfil/Desafios/CoE da exibição (arquivos preservados no disco, dados em `persona_extras` — D-09); `TabId` union estreitado p/ as 8 ids first-class. Task 2 (`887dafa`, feat): `CriteriosTab` lê `o.criterios` (8 camelCase, `sim/nao/parcial`) em vez do legado `formulario_extras.criterios` (UPPERCASE, 10 keys); `BeneficiosTab` lê `o.beneficios` (camelCase 1–5) + `o.fte_horas`; personas legadas (first-class null) → empty state pt-BR (D-08). Task 3 (`239077a`, feat): `ScoreTab` reconstruído com `calcScore`/`priorityLevel` de `@/lib/opportunities/score` — 5 fatores (incl. bucket FTE), total DB-authoritative (`o.score`/`o.priority_level`, sem 3ª cópia da fórmula — T-13-04b), placeholder "Phase 6" removido; `ObservacaoTab` renderiza `observacao` + `risco` (nota livre legada da 0009, ≠ tabela `opportunity_risks`) com empty states pt-BR por bloco (D-10). **Modal segue 100% READ-ONLY** (edição é o Plan 13-05). **Zero deviations.** `tsc --noEmit` exit 0; suite **146 passed / 32 skipped / 2 RED-intencionais** (os 2 RED são de `kpis.test.ts`, escopo do Plan 13-02 — idênticos à baseline do 13-01, nenhuma nova falha). Self-check PASSED. **Nota runtime:** `gsd-sdk query` indisponível — STATE/ROADMAP/SUMMARY/commit manuais; `lib/ai/prompts.ts`+`N8N/`+`_giba_wsi-dashboard.html` (out-of-scope) preservados sem stage. **Próximo: Plan 13-02** (KPI 9-cells + colunas FTE/RPA Fit + sort FTE, dep 01).

Previous session: 2026-06-05 — `/gsd-execute-phase 13` (sequential, main tree). **Plan 13-01 COMPLETO — Fundação Wave 0 (2 tasks, 2 commits, ~10min).** Task 1 (`9c6095f`, feat/TDD): extraiu a regra do `rpa_score` para `lib/opportunities/rpa.ts deriveRpaScore` (mirror exato do GENERATED 0011:127-136; criterios null/undefined→null) e re-apontou `tests/schema/rpa-score-rule.test.ts` (remove fn inline, importa `@/lib/opportunities/rpa` — vira portão de paridade 64/64 do `_giba`, 10 specs verdes). Task 2 (`9844ebe`, test): 3 contratos Wave 0 — `tests/opportunities/{kpis,rpa-badge,filters}.test.ts` — encodando a nova shape de `computeKpis` (`fteTotal`, byStatus só novo/producao/concluido, sem buckets legados), os thresholds de `rpaTier` (`_giba:520-525`) e as sort keys `fte_asc`/`fte_desc` (VIEW-03). **2 deviations Rule 3 (blocking):** (1) criou `lib/opportunities/cells.ts` puro com `rpaTier()` (o `cells` real é `.tsx` com JSX, não importável como unit; módulo inexistente crashava o collect); (2) adicionou alvos de TIPO mínimos p/ manter `tsc --noEmit` clean (convenção firme do repo) — `OpportunityKpis.fteTotal` + `computeKpis` somando `fte_horas` (null→0), `SORT_VALUES` exportado + chaves `fte_*` em `SortKey`/`SORT_VALUES`/`SORT_LABELS`. Mudanças puramente ADITIVAS, zero regressão. **2 specs RED intencionais** (`'personas'/'byTool' in result === false`) — o drop dos buckets legados + ordenação real por coluna FTE são escopo do Plan 13-02 (aceito pelo acceptance criterion da Task 2). `tsc --noEmit` exit 0; suite **146 passed / 2 RED-intencionais / 32 skipped**. Self-check PASSED. **Nota runtime:** `gsd-sdk query` indisponível — STATE/ROADMAP/SUMMARY/commit manuais; `lib/ai/prompts.ts`+`N8N/`+`_giba_wsi-dashboard.html` (out-of-scope) preservados sem stage. **Próximo: Plan 13-04** (modal display 8 abas).

Previous session: 2026-06-05 — `/gsd-execute-phase 12` (sequential, main tree). **Plan 12-01 COMPLETO — camada de dados/mutação de riscos (3 tasks, 4 commits, ~5min).** Wave 1 entregue: `queries.ts` ganhou `RISK_COLUMNS` whitelist + `fetchRisksForOpportunity`/`fetchRiskById` (ordenadas por `created_at asc`; rank de severidade fica no client em 12-02, Pitfall 6); `risk-actions.ts` (`'use server'`) com `createRisk`/`updateRisk`/`deleteRisk` (Zod `.strict()` + `tenant_id`/`opportunity_id` server-derived + enumeração explícita sem spread + `revalidatePath`; `priority` NUNCA no payload — trigger `set_risk_priority()` `before insert OR update`, 0011:294, é a autoridade; update/delete escopam `.eq('tenant_id', profile.tenant_id)`); `risk-labels.ts` (5 mapas enum→PT Title-Case `Record<Enum,string>` + badges 🚧/⚠️/💡 + `PRIORITY_BADGE_CLASS` por cor + `RESPONSAVEL_SUGGESTIONS` PSW/UnidaSul, D-08); `OpportunityRisk` + enums `Risk*` em `types.ts`. **TDD nuance (Task 2):** o teste de mass-assignment (`tests/security/risk-mass-assignment.test.ts`, 15 asserts) passou já na RED porque exercita `riskInputSchema.strict()` (Phase 10) — investigado conforme fail-fast: é a 1ª linha de defesa legítima das actions; o artefato novo (`risk-actions.ts`) é integração-only (`opportunity-risks-isolation.test.ts` skipIf, Wave 0 já fechada). Gates `test→feat` presentes (`26d22d0`→`e68b693`). `tsc --noEmit` clean; suite tests/security+tests/schema 78 passed/32 skipped/0 failed; parity matrix 17/17 verde. Zero deviations. Commits: `4fb21eb` (query+tipos), `26d22d0` (test), `e68b693` (actions), `a9eb080` (labels). **Nota runtime:** `gsd-sdk query` indisponível (binário só run/auto/init) — STATE/ROADMAP/SUMMARY/commit manuais. **Próximo: executar Plan 12-02** (RiscoTab→tabela `_giba:1198-1232`, RiskForm/RiskFormDialog, DeleteRiskButton, 2 rotas fullscreen; termina em checkpoint `human-verify` blocking).

Previous session: 2026-06-05 — `/gsd-plan-phase 12` (research first + skip-ui, ambos confirmados pelo PO: mockup `_giba` é o contrato visual). **Phase 12 PLANEJADA — 2 plans em 2 waves, plan-checker PASSED após 1 revisão (1 blocker + 1 warning, ambos artifact-gaps fechados sem mexer na lógica dos plans).** **Achado de arquitetura decisivo (RESEARCH, HIGH confidence):** um slot de parallel route (`@modal`) rastreia só UMA subpágina ativa → NÃO dá pra empilhar um segundo intercept dentro do `@modal` sobre o modal de oportunidade (descarta D-02 literal "modal aninhado interceptado"). Escolhida **opção (c)**: form de risco = **Dialog client-side empilhado** (overlay hand-rolled `z-[60]` sobre o modal `z-50`, como `DeleteButton.tsx`; shadcn NÃO instalado), acionado por search param `?risco=new|<id>`, MAIS **rotas fullscreen reais não-interceptadas** `opportunities/[id]/riscos/{new,[riskId]/edit}/page.tsx` p/ deep-link (satisfaz o contrato comportamental de D-02). Guard explícito nos plans: NÃO criar `@riskModal`/intercept aninhado (acceptance criteria com grep). **Sem migration/schema:** trigger `trg_opportunity_risks_priority` é `before insert OR update` (0011:294 verificado) → editar impacto/probabilidade recalcula `priority` sozinho; RISK-02/03 são app-layer puro. **Pitfall 5:** `OpportunityDetail` é client component → `RiscoTab` não pode ser async RSC; `risks` buscados no RSC pai (`fetchRisksForOpportunity`, whitelist sem `select('*')`) e passados por props (espelha `phases`). Wave 1: 12-01 (camada de dados — query whitelisted `fetchRisksForOpportunity`/`fetchRiskById`, server actions create/update/deleteRisk via `riskInputSchema.strict()` + tenant/opportunity_id server-derived, módulo `risk-labels.ts` enum→PT, parity test já existente confirmado). Wave 2 (dep 12-01): 12-02 (RiscoTab→tabela estruturada `_giba:1198-1232`, RiskForm+RiskFormDialog, DeleteRiskButton com confirmação, 2 rotas fullscreen; termina em checkpoint `human-verify` blocking). 4/4 REQ-IDs cobertos (RISK-01/02/03/05; RISK-04 é Phase 9). VALIDATION.md criado (Nyquist; Wave 0 já satisfeita por `risk-priority-matrix.test.ts` + `opportunity-risks-isolation.test.ts`). **Nota runtime:** `gsd-sdk query <subcmd>` indisponível nesta máquina (binário só expõe run/auto/init) — workflow rodado manualmente (researcher/planner/checker via Agent tool; STATE/commit manuais; pattern-mapper falhou por socket error, non-blocking). Próximo: `/gsd-execute-phase 12`.

Previous session: 2026-06-04 — `/gsd-plan-phase 11` (skip-research + skip-ui, ambos confirmados pelo PO: mockup é o contrato visual + componentes já existem). **Phase 11 PLANEJADA — 3 plans em 2 waves, plan-checker PASSED na 1ª passada (zero blockers/warnings, 12 dimensões, validado contra código vivo).** Wave 1: 11-01 (fundação — `lib/opportunities/fte.ts` `deriveFteBucket` horas→bucket fonte única + teste de bordas; `state.ts` fluxo único create 5 steps sempre `source='formulario'` sem Tipo/Classificação; `validateStep` Identificação(nome+área)/Processo(processo) pt-BR) [WIZARD-01,04]. Wave 2 (dep 11-01, zero overlap de arquivos → paralelos): 11-02 (rewrite Critérios/Benefícios p/ first-class — 8 chaves camelCase em `data.criterios` sim/nao/parcial + `data.beneficios` 1–5 + `fte_horas`; remove `formulario_extras`) [WIZARD-03,04] ‖ 11-03 (Processo: Frequência→`tempo` fonte única + Ferramenta default n8n; Priorização: 4 fatores manuais + display read-only do bucket FTE derivado + `ScorePreview` recebe `fte`; `WizardShell` deriva `prioridade_fte` no submit) [WIZARD-01,02]. **Achado do checker confirmado:** `actions.ts:359` já persiste `fte: data.prioridade_fte ?? null` mas o wizard nunca setava → 11-03 T3 fecha o gap usando a MESMA `deriveFteBucket` (display=persistência, impossível divergir). Escopo travado: NÃO toca edit mode / modal de detalhe (Phase 13); persona variant preservada no schema. 4/4 REQ-IDs cobertos. **Nota runtime:** `gsd-sdk query` indisponível nesta máquina (binário diferente) — workflow rodado manualmente (planner/checker via Agent tool, commit manual). Próximo: `/gsd-execute-phase 11`.

Previous session: 2026-06-04 — `/gsd-discuss-phase 11`. Contexto da Phase 11 (Wizard de Fluxo Único — 5 steps) capturado em `.planning/phases/11-wizard-fluxo-unico/11-CONTEXT.md` (+ DISCUSSION-LOG). Escopo travado: **só o wizard de CRIAÇÃO** (modal/edição 8-abas → Phase 13). 4 áreas discutidas, PO escolheu todas as recomendações → 11 decisões (D-01..D-11): (1) **FTE fonte única** — usuário digita só `fte_horas` (Benefícios); `prioridade_fte` (5º fator) **derivado** das faixas do mockup (<10/10-40/40-100/100-200/>200), exibido read-only+peso na Priorização (`ScorePreview` já tem prop `fte`). (2) **Fluxo único** — remove steps Tipo+Classificação, sempre `source='formulario'`; discriminator persona fica só p/ ler/editar legado FGCoop. (3) **Automação** — `ferramenta` vira select no step Processo (default n8n); `escopo_automacao[]`/`beneficios_esperados[]` saem do create (null; IA/edição depois) — REALIGN-7.6 segue deferido, só garante compat MODEL-10. (4) **Critérios/Benefícios** — reaproveitar componentes (click-to-cycle + barras 1–5) reescritos p/ modelo first-class (Critérios 10 UPPERCASE/formulario_extras → 8 camelCase lowercase; Benefícios → `beneficios` top-level). Discrição sinalizada ao planner: redundância `frequencia` (Processo) × `tempo` (fator score) — preferir alimentar `tempo` da frequência do Processo (fonte única). Próximo: `/gsd-plan-phase 11`.

Previous session: 2026-06-04 — `/gsd-discuss-phase 10`. Contexto da Phase 10 (Backend — Queries, Validação e Paridade de Score) capturado em `.planning/phases/10-backend-queries-validation-score/10-CONTEXT.md` (+ DISCUSSION-LOG, commit 38a94c6). 4 áreas discutidas, **todas delegadas pelo PO ("Você decide")** → direções recomendadas travadas (D-01..D-04): (1) **Paridade SCORE-04** = módulo único `lib/opportunities/score.ts` (5 fatores `_giba`) importado por ScorePreview + teste, com 2º nível de teste SQL `skipIf` contra `opportunity_score()`; achado: `ScorePreview.tsx` tem a fórmula v0.1 obsoleta, `tests/schema/score-rule.test.ts` já tem a nova travada. (2) **Schema Zod aditivo** — adiciona campos novos, corrige `criterioEnum`→minúsculo (D-08) e `timeBucketEnum`→frequência, **mantém** o split persona/formulário (P11 reestrutura). (3) **opportunity_risks** = só tipos + `riskInputSchema` Zod; CRUD vai p/ Phase 12. (4) **Tipos** via MCP Supabase `generate_typescript_types` (fallback `npm run gen:types`, ref já no `.env.local`) + migrar ~7 testes legados (`tempo:'medio'/'pequeno'`) ao domínio de frequência. Riscos de execução flagados: confirmar domínio de `p_tempo` da RPC `create_public_opportunity` pós-0011; checar compat MODEL-10 (`enrichment.ts`). Próximo: `/gsd-plan-phase 10 --skip-research`.

Previous session: 2026-06-04 — `/gsd-discuss-phase 9`. Contexto da Phase 9 (Schema Evolution + Score/Risk/Contract Foundation) capturado: 4 áreas discutidas e travadas (17 decisões D-01..D-17). Destaques: backfill FGCoop deriva `tempo` da coluna `frequencia` existente (personas→NULL), `fte_horas`/`fte` NULL, `fonte='FGCoop'`; critérios e benefícios em colunas jsonb dedicadas (não escalares); `rpa_score` como coluna GENERATED dos critérios com regra inferida por engenharia reversa do `_giba` (validada contra o seed); `opportunity_risks` com enums (tipo/impacto/probabilidade/status), `responsavel` text livre (tenant-agnóstico) e `priority` GENERATED da matriz. Artefatos: `.planning/phases/09-schema-evolution-foundation/09-CONTEXT.md` + `09-DISCUSSION-LOG.md` (commit bd58604). Próximo: `/gsd-plan-phase 9`.
Resume file: None

---

Update 2026-06-04 (mesma sessão) — **Phase 10 COMPLETA** (`/gsd-execute-phase 10`, execução inline). 4 plans, gsd-verifier **passed 4/4 must-haves**. Gate: `tsc --noEmit` 0 erros; `vitest` 109 passed/0 failed/32 skipped (skipIf integração). **SCORE-04 validado AO VIVO** contra `opportunity_score()` (casos 100/88/59/36/67 — cliente=backend). Commits 36e4e69 (10-02 fórmula única+paridade), bd979e4 (10-01 tipos+0012), 9bdb027 (10-03 schema+cascata), 3aa438a (10-04 testes+AI-COMPAT), + fix do overload duplicado.

**Decisões/descobertas-chave (registradas nos SUMMARYs):**

1. **Regen de tipos (D-04) não foi possível pelos caminhos do plano** — o MCP do Supabase aponta para OUTRO projeto (`yzjlhezmvdkwdhibyvwh`, sem as tabelas do CoE); `gen:types` sem privilégio em `vxgthycrjetniejsjmee` (sem SUPABASE_ACCESS_TOKEN). `lib/database.types.ts` foi **hand-derived do 0011 + verificado contra o catálogo vivo** via introspecção rodada pelo PO. (O arquivo já era hand-maintained.) **TODO:** rodar `gen:types` quando houver token (deve ser no-op de verificação).
2. **Migration `0012` aplicada** (RPC pública `create_public_opportunity` → `frequency_bucket`). Descoberta no apply: existiam **2 overloads** (18 + 21 params com defaults) → `42725 is not unique`; a app chama o de 21 (de 0009), que ainda tinha o mapeamento antigo. 0012 revisada **dropa o de 18 e recria o de 21** com frequência. Confirmado: 1 overload, sem cast `time_bucket`.
3. **Cascata de domínio descoberta** (tempo duração→frequência além dos testes): ScoreTab.tsx (3ª cópia da fórmula v0.1), wizard/state.ts + PriorizacaoStep.tsx, `lib/ai/enrichment.ts` (NÃO sobrescreve mais `tempo` — **REALIGN-7.6** deferido), `actions.ts` PublicSubmitInput.tempo + fallback. Todos corrigidos minimamente (sem antecipar o wizard da P11).
4. **REALIGN-7.6 (deferido):** `lib/ai/schema.ts:31` ainda gera `tempo` no domínio antigo; antes de reativar o enrichment, realinhar o schema da IA p/ frequência e restaurar o write. Doc: `10-04-AI-COMPAT.md`.

**Pendência herdada (não bloqueia):** rodar `gen:types` quando o token existir (verificação). Próximo: **`/gsd-discuss-phase 11`** (Wizard de Fluxo Único — 5 steps).

---

Update 2026-06-04 (mesma sessão) — `/gsd-plan-phase 10 --skip-research`. **Phase 10 PLANEJADA — 4 plans em 3 waves, aprovados pelo plan-checker na 1ª passada (VERIFICATION PASSED, zero blockers/warnings).** Wave 1: 10-01 (regen tipos via MCP do Supabase + **migration 0012** + remove any-casts do teste de riscos; Task 3 = [BLOCKING] apply manual no SQL Editor, `autonomous:false`) ‖ 10-02 (SCORE-04: módulo único `lib/opportunities/score.ts` + ScorePreview rewire + paridade 2 níveis pure+skipIf SQL, inclui trap case `(baixo,baixo,diario,5,muito_alto)=88`; type `tdd`). Wave 2: 10-03 (schema Zod aditivo — campos novos, `criterioEnum`→minúsculo, `timeBucketEnum`→frequência, `riskInputSchema`, whitelist ampliada; dep 10-01). Wave 3: 10-04 (migra ~7 testes legados `tempo:'medio'/'pequeno'`→frequência + verificação MODEL-10/SC4 + gate suite verde; deps 10-01+10-03). SCORE-04 coberto em todos os 4 plans; 4/4 Success Criteria mapeados. **Achado crítico do planner (encodado nos plans):** a RPC `create_public_opportunity` (def viva em 0009, intocada por 0011) ainda mapeia `p_tempo` via `time_bucket` enquanto 0011 mudou `opportunities.tempo`→`frequency_bucket` — **regressão latente do formulário público da Phase 7.5**. 10-01 entrega migration `0012` (write-only + apply manual BLOCKING) recriando a RPC no domínio de frequência; 10-04 migra o valor de teste p/ `'mensal'`. Nota: ROADMAP SC2 lista `rpaScore` entre os campos do input, mas D-02 (travado) prevalece — `rpa_score` é GENERATED e é REJEITADO no input; os plans implementam D-02. Commit: 3c88745. **Próximo: `/gsd-execute-phase 10`** (Plan 10-01 Task 3 exige apply manual de 0012 no Supabase Cloud SQL Editor).
Status: **ready_to_execute**.

---

Update 2026-06-04 (mesma sessão) — **Phase 9 COMPLETA.** Migration `0011` aplicada no Supabase Cloud pelo PO (confirmado "applied") após validação por **dry-run transacional (begin/rollback) 11/11 checks green** contra dados reais. 5 deviations descobertas e corrigidas no apply (todas no `09-01-SUMMARY.md`): (1) drop do overload antigo de `opportunity_score`; (2) CHECKs sem subquery (Postgres 0A000); (3) `opportunity_risks.priority` via TRIGGER em vez de GENERATED (42P17 — qualquer cast de enum é não-imutável); (4) backfill de `fonte` escopado ao tenant FGCoop (banco tinha 33 opps, 4 de outro tenant 99999999 — não carimbar 'FGCoop'); (5) 2 valores de `frequencia` mapeados (eventual→anual, '5 vezes por dia'→diario). typecheck clean, suite 103 passed/27 skipped/0 failed. **Pendências p/ Phase 10 (não bloqueiam):** `npm run gen:types` (falta SUPABASE_PROJECT_REF) → vai quebrar typecheck dos 7 testes com `tempo:'medio'` (corrigir junto); remover `any`-casts do teste de riscos; decidir destino do tenant 99999999. Próximo: `/gsd-plan-phase 10`.
Status: **phase_complete** → Phase 10.

---

Update 2026-06-04 (mesma sessão) — `/gsd-execute-phase 9` (inline sequential). **Wave 0 + Wave 1 escritos e commitados; bloqueado no checkpoint [BLOCKING] de apply manual de 0011.** 09-02 (contrato/docs) ✅ completo. 09-03 (testes de validação) ✅ completo — 33 testes puros green (rpa_score/score/matriz), 5 de isolamento em skip mode; `tsc --noEmit` clean; suite completa 103 passed/27 skipped/0 failed. 09-01 (migration 0011 + handoff) escrito e commitado, **Task 3 = apply manual no Supabase Cloud SQL Editor PENDENTE** (resume: usuário digita "applied" ou descreve erro; ver `09-MIGRATION-HANDOFF.md`). Após apply: rodar `npm run gen:types`. Regressão conhecida deferida p/ Phase 10: 7 testes existentes usam `tempo:'medio'` (domínio antigo) — integração quebra quando test DB tiver 0011. Commits fe6ea42..eb31590.
Status: **executing_blocked_on_apply** — Phase 9 NÃO marcada completa até apply + verificação.

---

Update 2026-06-04 (mesma sessão) — `/gsd-plan-phase 9`. RESEARCH.md produzido (regra do rpa_score resolvida por engenharia reversa: reproduz 64/64 linhas do `_giba` — soma de 6 indicadores; `causaReclamacoes`+`temDocumentacao` excluídos). 3 plans criados em 2 waves e **aprovados pelo plan-checker após 1 revisão** (corrigidos 2 blockers: backfill abortava na linha seq_id 18 sem `padronizacao_docs` → coalesce p/ 'nao'; smoke-test esperava score 100 num caso que dá 88 → trocado p/ `(alto,baixo,diario,5,muito_alto)=100`). Wave 0: 09-01 (migration 0011, `autonomous:false` [BLOCKING] apply manual) ‖ 09-02 (docs/PROJETO.md + fgcoop deprecated). Wave 1: 09-03 (testes de regra puros + isolamento A≠B). 16/16 REQ-IDs cobertos. Commits: research, 3 plans. **Próximo: `/gsd-execute-phase 9`.**
Status: **ready_to_execute**.

---

Previous session: 2026-05-22
Stopped at: Completed 18-08-PLAN.md — Phase 18 código completo; roteiro visual A-H pendente (checkpoint bloqueante)
Resume file: `/gsd-verify-work 7.5` ou `/gsd-plan-phase 8` quando setup do Vercel/Cloud estiver pronto.
