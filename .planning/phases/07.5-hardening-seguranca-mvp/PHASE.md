---
phase: 07.5-hardening-seguranca-mvp
status: ready_to_plan
total_plans: 0
waves: 0
inserted_between: ["07-filtros-busca-sort-kpis", "08-polish-deploy"]
---

# Phase 7.5 — Hardening de Segurança MVP

## Goal

Endurecer a plataforma contra os vetores de ataque relevantes ao contexto **multi-tenant + formulário público anônimo**, antes do deploy de produção (Phase 8). Ao final, ter:

- **Suite de testes de isolamento de tenant** que provem que tenant A não vê/escreve/deleta dados do tenant B — rodando em CI antes de cada deploy.
- **Validação centralizada com Zod** em todos os Server Actions / Route Handlers que mutam `opportunities`, cobrindo Mass Assignment + Limitação de Input.
- **Atomicidade na criação de oportunidades** (resolver race no `seq_id` por tenant).
- **Hardening da RPC pública** (`create_public_opportunity`) — rate limiting, limites de payload, captcha invisível, logging de submissões.
- **Auditoria de segredos e cabeçalhos de segurança** (CSP, X-Frame-Options, `SUPABASE_SERVICE_ROLE_KEY` confinado a server).

## Por que esta fatia agora (antes de Phase 8)

Phase 8 é deploy em produção com cliente piloto real. Quatro motivos para inserir hardening antes:

1. **Isolamento multi-tenant é existencial** (docs/PROJETO.md). Hoje confiamos em RLS no DB + filtro explícito no server, mas não temos testes que provem que isso não regride. Subir para produção sem essa rede de segurança é apostar em revisão manual de PR.
2. **Formulário público em `/r/[slug]`** ([0005_public_form_functions.sql](supabase/migrations/0005_public_form_functions.sql)) é a única superfície chamável por `anon` — não tem rate limit nem captcha. Pré-produção é o momento para fechar isso.
3. **Race no `seq_id`**: a função/trigger atual (`opportunity_seq_trigger` em 0001_init.sql) pode colidir sob concorrência, gerando bug raro mas perigoso quando dois usuários criam ao mesmo tempo. Mais barato consertar antes do deploy do que diagnosticar em produção.
4. **Server Actions sem Zod centralizado**: existe `lib/opportunities/schema.ts` mas não cobre todos os mutadores. Mass Assignment + length limits ficam por conta de cada handler — risco de inconsistência.

## Escopo proposto (a refinar em `/gsd-plan-phase 7.5`)

### Bloco A — Testes de isolamento (RLS + IDOR)

- Setup de Vitest (ou test runner equivalente) com dois tenants seed (`fgcoop` + `acme-test`).
- Para cada tabela com `tenant_id` (`opportunities`, `opportunity_phases`, `users`), test cases:
  - tenant A logado **NÃO** consegue SELECT/UPDATE/DELETE registro de tenant B
  - Server Action com `tenant_id` forjado no payload **NÃO** bypassa filtro (deve derivar de `auth.uid()`)
- Integrar em `npm run test` e bloquear deploy se falhar.

### Bloco B — Validação centralizada com Zod

- Auditar Server Actions em `lib/opportunities/actions.ts` (e qualquer outro mutador).
- Garantir schema Zod por action, com:
  - Whitelist explícita de campos (sem spread de `req.body`)
  - `tenant_id`, `created_by`, `seq_id` **NUNCA** vindo do cliente
  - Limites: `processo` (max 2000 chars), `escopo_automacao[]` (max 20 items, cada um max 200 chars), `formulario_extras` (jsonb com schema definido)
- Schema único compartilhado entre form client + server action (já tem `lib/opportunities/schema.ts` — completar).

### Bloco C — Atomicidade na criação

- Inspecionar o trigger atual de `seq_id` em [0001_init.sql](supabase/migrations/0001_init.sql).
- Resolver race condition via:
  - `sequence` por tenant (preferido — barato e atômico), **ou**
  - `INSERT ... ON CONFLICT` com unique constraint `(tenant_id, seq_id)` + função que retry no conflito.
- Aplicar via nova migration (`0006_seq_id_atomic.sql`).
- Teste de carga sintético: 50 inserts simultâneos no mesmo tenant não geram `seq_id` duplicado.

### Bloco D — Hardening do formulário público

- **Anti-abuse layered defense** (rate-limit por janela fixa fica para pós-MVP):
  - **Vercel BotID** — classificação de bot nativa da plataforma (retorna 403 em tráfego automatizado classificado).
  - **Cloudflare Turnstile** — challenge invisível humano obrigatório antes da RPC.
  - **Payload limits na RPC** — bloqueia storage exhaustion mesmo se BotID + Turnstile forem bypassados.
- **Reforçar validações dentro da RPC** ([0005_public_form_functions.sql](supabase/migrations/0005_public_form_functions.sql)):
  - Limite de tamanho em `p_escopo_automacao` e `p_beneficios_esperados` (max 20 items, cada um max 200 chars)
  - Limite de tamanho em `p_formulario_extras::text` (max 8KB)
  - Validar que `p_processo`, `p_solicitante` não excedem N chars (storage exhaustion)
- **CAPTCHA invisível** (Cloudflare Turnstile ou hCaptcha) no PublicForm — token validado server-side antes de chamar RPC.
- **Logging** de submissões públicas em `public_form_submissions` (timestamp, IP, slug, status code) para detectar abuso.

### Bloco E — Auditoria de segredos e headers

- Grep por `SUPABASE_SERVICE_ROLE_KEY` no projeto — confirmar que só aparece em arquivos server-side (`lib/supabase/server.ts`, server actions). Nunca em código `'use client'`.
- Confirmar `.env.local` no `.gitignore` (já está) e que segredos no Vercel estão configurados via `vercel env` (não hardcoded em `vercel.ts`).
- Auditar selects no client: nenhum `select('*')` em rotas que tocam `opportunities` (whitelist explícita de colunas).
- Adicionar headers de segurança no `proxy.ts` ou `next.config.ts`:
  - `Content-Security-Policy` (compatível com Next.js inline scripts)
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Strict-Transport-Security` (HSTS) — Vercel já força HTTPS, HSTS reforça no browser

## Must-haves

**Truths observáveis:**

- `npm run test` (ou equivalente) executa suite de isolamento de tenant e passa com 100% de aprovação.
- Tentar `update opportunities set tenant_id='<outro>' where id=$X` via Server Action de tenant A não bypassa — retorna erro / não persiste.
- 50 inserts simultâneos via script não geram `seq_id` duplicado.
- Submissão automatizada classificada como bot por Vercel BotID retorna 403 (verificável em deploy via teste com bot conhecido).
- Submissão sem token Turnstile válido retorna 4xx com mensagem genérica em pt-BR (verificável em teste de integração).
- RPC `create_public_opportunity` rejeita payload com array de 100+ itens ou jsonb > 8KB (verificável em teste de integração).
- Headers de resposta incluem `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` em todas as rotas (verificável via `curl -I`).
- Grep por `SUPABASE_SERVICE_ROLE_KEY` em arquivos `'use client'` retorna **vazio**.

**Artifacts:**

- `tests/security/tenant-isolation.test.ts` (ou estrutura equivalente)
- `tests/security/mass-assignment.test.ts`
- `tests/security/atomicity.test.ts`
- `lib/opportunities/schema.ts` — schemas Zod completos (estender existente)
- `supabase/migrations/0006_seq_id_atomic.sql` — fix de atomicidade
- `supabase/migrations/0007_public_form_hardening.sql` — validações + logging table
- `lib/security/captcha.ts` — validação de token Turnstile/hCaptcha
- `next.config.ts` ou `proxy.ts` — headers de segurança configurados

## Out of scope

Tudo já está documentado como fora do MVP em [docs/PROJETO.md](docs/PROJETO.md):

- **Painel admin / rotas super-admin** — pós-MVP.
- **Audit log de todas as ações** (não só formulário público) — pós-MVP.
- **Validação de uploads** — não há uploads no MVP.
- **Pepper / auth customizado** — Supabase Auth resolve. Não rolar nosso próprio.
- **Lockout/captcha em login** — Supabase Auth tem comportamento próprio; revisar só se cliente piloto reclamar.
- **WAF customizado / Vercel Firewall** — usar defaults da Vercel + BotID. Customização fica para v0.2 se precisar.
- **Rate limit por janela fixa** (Upstash Ratelimit ou equivalente, ex: 5/10min por IP, 50/hora por slug) — **deferred to backlog item 999.x** ("Upstash Ratelimit no formulário público"). MVP confia em BotID + Turnstile + payload limits. Revisitar pós-piloto se monitoring mostrar abuso real.

## Decisões prévias (docs/PROJETO.md)

- **Multi-tenancy via RLS** (não schema-per-tenant) — não muda.
- **Score nunca persistido** — não muda.
- **`tenant_id` derivado de `auth.uid()` no server** — formalizar com Zod + audit.
- **pt-BR** em UI e textos de erro visíveis ao cliente; **EN** em código.

## Dependências

- Phase 7 (Filtros + Busca + KPIs) — **concluída**.
- Phase 1 (Modelagem) — base do RLS e do trigger de `seq_id`.
- Phase 6 (Wizard CRUD) — Server Actions de criação/edição que vão ganhar Zod.

## Após esta fase

Phase 8 (Polish + Deploy) executa com:
- Rede de segurança de testes que rodam em CI
- Headers de segurança aplicados
- RPC pública hardening
- Server Actions blindadas contra Mass Assignment

Deploy de produção com cliente piloto **com risco reduzido** de incidente de vazamento entre tenants ou abuso do formulário público.

---

*Phase 7.5 aberta em 2026-05-21 a partir de revisão de segurança ad-hoc. Próximo: `/gsd-plan-phase 7.5` (ou `/gsd-discuss-phase 7.5` primeiro para refinar decisões).*
