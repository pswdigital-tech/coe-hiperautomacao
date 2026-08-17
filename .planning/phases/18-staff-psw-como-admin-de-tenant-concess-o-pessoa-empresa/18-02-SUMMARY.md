---
phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa
plan: 02
subsystem: database
tags: [supabase, postgres, rls, rbac, multi-tenant]

# Dependency graph
requires:
  - phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa (plan 18-01)
    provides: "decisão env-test-populado (revertida neste plano), lib/database.types.ts com o bloco psw_tenant_admins, tests/schema/psw-staff-restrictive-rule.test.ts, tests/security/psw-staff-admin-grant.test.ts"
provides:
  - "Migration 0045 aplicada em produção: tabela psw_tenant_admins (N:N pessoa x empresa), 3 helpers (current_admin_tenant_ids/effective_admin_tenant_ids/is_tenant_admin_of), trigger de coerência de papel, RLS completa da tabela nova"
  - "As DUAS metades da RLS em opportunities: permissivas novas (SELECT + UPDATE, este último desvio autorizado) e a restritiva opportunities_psw_staff_only_assigned reemitida com 3 disjuntos"
  - "tenants_select_psw_admin — SELECT do tenant concedido para o staff-admin"
  - "Prova end-to-end pelo app: staff-admin com concessão em FGCoop vê todas as 32 oportunidades do tenant; ao revogar, volta exatamente ao baseline atribuído"
  - "Modo de prova da fase revertido para prova-por-sql-no-handoff (supersede env-test-populado do 18-01)"
affects: [18-03, 18-04, 18-05, 18-06, 18-07, 18-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Duas metades da RLS (permissiva que concede + restritiva que não corta de volta) como padrão obrigatório sempre que uma RESTRICTIVE viva for reemitida com disjunto novo — nenhuma das duas funciona sozinha"
    - "Helper booleano por-linha (is_tenant_admin_of) deliberadamente SEM security definer/SET, delegando para um helper de conjunto SEM argumento que É definer — a forma que permite inlining do PostgreSQL sem perder a barreira de segurança"
    - "Prova de RLS por verificação estrutural via SQL no handoff (pg_policies/pg_proc/pg_trigger) + observação direta ponta-a-ponta pelo app, quando suíte automatizada não pode ser habilitada com segurança"

key-files:
  created:
    - supabase/migrations/0045_psw_tenant_admins_grant.sql
    - .planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-02-MIGRATION-HANDOFF.md
  modified:
    - .planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-01-SUMMARY.md
    - .planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/deferred-items.md

key-decisions:
  - "Task 2 (checkpoint:decision, gate=blocking): PO escolheu `aplicar-como-escrito` — concessão órfã sobrevive inerte (sem trigger de limpeza), leitura de psw_tenant_admins restrita a platform_admin + a própria pessoa"
  - "Cardinalidade (D-D / add-alongside), ratificada explicitamente pelo PO: profiles.tenant_id permanece singular e NOT NULL (lotação); a pluralidade 'admin de N empresas' vive AO LADO, em psw_tenant_admins, nunca dentro de profiles"
  - "Desvio autorizado do plano (checkpoint da Task 2): acréscimo de opportunities_update_psw_admin (UPDATE, is_tenant_admin_of(tenant_id) em using e with check) — nenhuma policy viva, nem nenhum plano futuro da fase (a lista de 11 policies do 18-05 não inclui opportunities_update), concederia esse verbo ao staff-admin; sem ele o spec decisivo c5 (escrita + releitura por service-role) casaria zero linhas com error===null"
  - "Modo de prova da fase revertido de env-test-populado (18-01) para prova-por-sql-no-handoff — a única URL de Supabase disponível era a de produção, e uma colisão de UUID entre fixtures de teste e um tenant real (FGCoop) tornaria a suíte destrutiva se rodada contra produção. Nota de supersessão acrescentada ao 18-01-SUMMARY.md"

requirements-completed: [GRANT-01, GRANT-02, GRANT-03, GRANT-06]

coverage:
  - id: D1
    description: "Tabela psw_tenant_admins (N:N pessoa x empresa) com id próprio, unique(profile_id,tenant_id), 3 FKs, aplicada em produção; profiles.tenant_id permanece singular/NOT NULL"
    requirement: GRANT-01
    verification:
      - kind: manual_procedural
        ref: "18-02-MIGRATION-HANDOFF.md verificação 1 — colunas/tipos/nulidade conferidos pelo PO no SQL Editor de produção"
        status: pass
    human_judgment: true
    rationale: "Prova via SQL no handoff (env-test-populado foi revertido — ver supersessão no 18-01-SUMMARY.md); é o PO quem executa e cola o resultado, não uma suíte automatizada."
  - id: D2
    description: "3 helpers (current_admin_tenant_ids/effective_admin_tenant_ids/is_tenant_admin_of) com as propriedades corretas de volatilidade/definer/search_path — is_tenant_admin_of sem definer e sem SET, provando que é inlineável (D-Q)"
    verification:
      - kind: manual_procedural
        ref: "18-02-MIGRATION-HANDOFF.md verificação 3 — pg_proc.prosecdef/proconfig conferidos pelo PO"
        status: pass
    human_judgment: true
    rationale: "Propriedade estrutural confirmada por SQL no handoff; a prova RUNTIME de que o planner de fato inlineou (EXPLAIN, verificação 12) não foi executada — ver Deviations/Issues abaixo."
  - id: D3
    description: "Restritiva opportunities_psw_staff_only_assigned reemitida com 3 disjuntos; os 2 disjuntos originais da 0044 (curto-circuito por papel + current_assigned_opportunity_ids) preservados literalmente"
    requirement: GRANT-02
    verification:
      - kind: manual_procedural
        ref: "18-02-MIGRATION-HANDOFF.md verificação 6 — checagem booleana dos disjuntos em qual/with_check retornou as 6 colunas true, colada pelo PO"
        status: pass
    human_judgment: true
    rationale: "tests/schema/psw-staff-restrictive-rule.test.ts (18-01) só cobre a 0044 imutável, não a 0045 reemitida; a prova desta reemissão é o SQL do handoff."
  - id: D4
    description: "RLS de psw_tenant_admins: exatamente 3 policies (select/insert/delete), nenhuma de UPDATE; escrita só via is_platform_admin(), nunca via is_tenant_admin_of()"
    requirement: GRANT-06
    verification:
      - kind: manual_procedural
        ref: "18-02-MIGRATION-HANDOFF.md verificação 5 — 3 policies confirmadas pelo PO, todas PERMISSIVE, nenhuma UPDATE"
        status: pass
    human_judgment: true
    rationale: "Os smokes comportamentais de D-B (INSERT do staff-admin dá erro / DELETE do staff-admin casa zero linhas — verificação 11) não foram executados isoladamente; só a estrutura da policy foi confirmada. Ver Deviations."
  - id: D5
    description: "POSITIVO/NEGATIVO DECISIVOS: staff-admin com concessão em FGCoop passa a ver as 32 oportunidades do tenant (incl. as não atribuídas); ao revogar, volta exatamente ao baseline atribuído — observado ponta-a-ponta pelo app, não por SQL"
    requirement: GRANT-03
    verification:
      - kind: manual_procedural
        ref: "PO logado como psw_staff (profile 8029d05c-1b7a-47aa-beea-2d11568b2ef6), observação direta em /opportunities antes/depois da concessão em FGCoop e após revogar"
        status: pass
    human_judgment: true
    rationale: "Esta é a evidência mais forte obtida nesta fase — exercita a cadeia inteira (RLS -> fetchOpportunities() -> /opportunities), mas é observação humana, não um assert automatizado; portanto roteada para julgamento humano por definição."
  - id: D6
    description: "Desvio autorizado: opportunities_update_psw_admin existe e concede UPDATE ao staff-admin sobre oportunidade não-atribuída do tenant concedido (fecha a lacuna que produziria falso-sucesso silencioso em c5)"
    verification:
      - kind: manual_procedural
        ref: "18-02-MIGRATION-HANDOFF.md verificação 7 — existência/verbo da policy confirmados pelo PO; verificação 13 (smoke de escrita efetiva com releitura) NÃO executada isoladamente"
        status: unknown
    human_judgment: true
    rationale: "A policy existe e está estruturalmente correta (verificada), mas o smoke comportamental que prova que o UPDATE realmente persiste (não apenas 'sem erro') não foi rodado nesta wave — dívida registrada, não bloqueante para o tracer porque a mesma is_tenant_admin_of(tenant_id) já foi exercitada indiretamente pela D5 (SELECT) e é a mesma fonte de verdade do predicado."
  - id: D7
    description: "Não-regressão: um member do tenant concedido não ganha nem perde nada com a concessão do staff-admin"
    requirement: GRANT-10
    verification:
      - kind: manual_procedural
        ref: "18-02-MIGRATION-HANDOFF.md verificação 10 — NÃO EXECUTADA (não existe profile com papel member no tenant FGCoop de produção)"
        status: unknown
    human_judgment: true
    rationale: "Dívida explícita: a medição de não-regressão de member não pôde ser feita por ausência de fixture adequada em produção. Registrar como pendência para a próxima oportunidade de verificação (ex.: quando um member real do FGCoop estiver disponível, ou via o handoff do 18-03)."
  - id: D8
    description: "D-B comportamental: staff-admin não consegue conceder (INSERT com erro) nem revogar (DELETE casa zero linhas) por conta própria"
    requirement: GRANT-06
    verification:
      - kind: manual_procedural
        ref: "18-02-MIGRATION-HANDOFF.md verificação 11 — NÃO EXECUTADA nesta wave"
        status: unknown
    human_judgment: true
    rationale: "Apenas a estrutura da RLS (D4) foi confirmada — with check (is_platform_admin()) no INSERT, using (is_platform_admin()) no DELETE. O comportamento de fato (erro explícito vs. zero linhas silenciosas) não foi exercitado. Dívida registrada, não bloqueante: a estrutura por si só já impede escalada lateral por construção (D-B), o smoke apenas confirmaria em runtime."
  - id: D9
    description: "EXPLAIN (analyze, buffers) confirma que is_tenant_admin_of() foi de fato inlineada pelo planner (SubPlan/InitPlan avaliado 1x, não Function Scan por linha)"
    verification:
      - kind: manual_procedural
        ref: "18-02-MIGRATION-HANDOFF.md verificação 12 — NÃO EXECUTADA nesta wave"
        status: unknown
    human_judgment: true
    rationale: "A propriedade que HABILITA o inlining (prosecdef=false, proconfig=NULL) foi confirmada (D2/verificação 3), mas o plano de execução real (EXPLAIN) não foi rodado. Dívida de performance documentada, não bloqueante para o tracer funcional."

# Metrics
duration: multi-sessão (checkpoint-gated — Task 1 e desvio autorizado numa sessão; Task 3 e Task 4 em sessões subsequentes após resolução humana dos checkpoints)
completed: 2026-08-07
status: complete
---

# Phase 18 Plan 02: TRACER — migration 0045, as duas metades da RLS, e o modo de prova revertido Summary

**Migration `0045_psw_tenant_admins_grant.sql` aplicada em produção: tabela `psw_tenant_admins` (N:N pessoa x empresa), 3 helpers com a forma que permite inlining (D-Q), trigger de coerência de papel, RLS completa, e as DUAS metades da fatia vertical em `opportunities`/`tenants` — incluindo um desvio autorizado (`opportunities_update_psw_admin`) sem o qual a fase ficaria sem nenhum verbo de escrita cross-tenant. Prova end-to-end obtida por observação direta no app (não por suíte automatizada): o modo de prova da fase foi revertido de `env-test-populado` para `prova-por-sql-no-handoff` após a descoberta de uma colisão de UUID entre fixtures de teste e um tenant real de produção.**

## Performance

- **Duration:** multi-sessão, checkpoint-gated (3 checkpoints: `checkpoint:decision` na Task 2, `checkpoint:human-action` na Task 3, e a mudança de modo de prova reportada entre a Task 3 e a Task 4)
- **Completed:** 2026-08-07
- **Tasks:** 4 (1 tracer + 1 decisão + 1 handoff/human-action + 1 fechamento), mais 1 desvio autorizado intercalado entre a Task 1 e a Task 2
- **Files modified:** 5 (1 migration criada, 1 handoff criado, 1 SUMMARY anterior emendado com supersessão, 1 deferred-items.md atualizado, este SUMMARY)

## Accomplishments

- Migration `0045` escrita, verificada estruturalmente (`<verify>` automatizado) e **aplicada em produção** pelo PO: tabela `psw_tenant_admins`, 2 índices, 3 helpers (`current_admin_tenant_ids`/`effective_admin_tenant_ids`/`is_tenant_admin_of`), trigger `psw_tenant_admins_role_guard`, RLS completa da tabela nova (3 policies, sem UPDATE).
- As duas metades da RLS em `opportunities`/`tenants`: as permissivas novas (`opportunities_select_psw_admin`, `tenants_select_psw_admin`, e o desvio autorizado `opportunities_update_psw_admin`) e a restritiva `opportunities_psw_staff_only_assigned` reemitida com o terceiro disjunto — os dois disjuntos originais da `0044` preservados literalmente (confirmado por checagem booleana no handoff: as 6 colunas de `qual`/`with_check` deram `true`).
- **Positivo e negativo decisivos obtidos pelo próprio app**, mais fortes que um teste automatizado porque exercitam a cadeia inteira (RLS → `fetchOpportunities()` → `/opportunities`): o `psw_staff` de teste, com concessão em FGCoop (32 oportunidades), passou a ver o tenant inteiro; ao revogar, voltou exatamente ao baseline atribuído.
- Desvio autorizado do escopo original (`opportunities_update_psw_admin`) fechando uma lacuna que nenhum plano futuro da fase resolveria — evitando um verbo de escrita permanentemente ausente para o staff-admin em `opportunities`.
- Modo de prova da fase revertido para `prova-por-sql-no-handoff`, com nota de supersessão no `18-01-SUMMARY.md` e a colisão de UUID (fixture de teste = tenant real de produção) registrada em `deferred-items.md`.

## Task Commits

Cada task com arquivo próprio foi commitada atomicamente:

1. **Task 1: [TRACER] Migration 0045 — a concessão e as duas metades da RLS em `opportunities`** — `3058c5c` (feat)
2. **Desvio autorizado (checkpoint da Task 2): acréscimo de `opportunities_update_psw_admin`** — `0c2adc6` (fix)
3. **Task 2: [DECISÃO one-way] Reemitir a restritiva viva de produção e abrir a concessão N:N** — sem arquivo próprio (`<files>` vazio no plano); decisão registrada nesta Summary, em "Decisions Made" abaixo.
4. **Task 3: [BLOCKING] Handoff e apply manual da 0045 no Supabase Cloud** — `449f513` (docs)
5. **Task 4: Fechar o tracer** — este commit (docs: SUMMARY + supersessão + deferred-items + STATE/ROADMAP)

## Files Created/Modified

- `supabase/migrations/0045_psw_tenant_admins_grant.sql` - tabela, índices, 3 helpers, trigger, RLS completa, as 2 metades da RLS de `opportunities`/`tenants` (incl. o desvio autorizado)
- `.planning/phases/18-.../18-02-MIGRATION-HANDOFF.md` - handoff write-only com 13 verificações numeradas, rollback, e o aviso de `.env.test` no topo
- `.planning/phases/18-.../18-01-SUMMARY.md` - nota de supersessão do modo de prova (`env-test-populado` → `prova-por-sql-no-handoff`)
- `.planning/phases/18-.../deferred-items.md` - item resolvido (typecheck, fora desta fase) marcado; novo item da colisão de UUID registrado

## Decisions Made

### Task 2 — checkpoint:decision, gate=blocking

**Opção escolhida pelo PO: `aplicar-como-escrito`.** Concessão órfã sobrevive inerte (sem trigger de limpeza — D-S); leitura de `psw_tenant_admins` restrita a `platform_admin` + a própria pessoa (o `tenant_admin` do tenant concedido não lê). Racional do PO: é o desenho já ratificado em D-B/D-S do CONTEXT; a tabela nasce vazia, então o apply não muda o que ninguém vê até a primeira concessão; o rollback está escrito e a restritiva volta reaplicando a `0044`.

**Decisão de cardinalidade (D-D / `add-alongside`), ratificada explicitamente:** `profiles.tenant_id` permanece singular e NOT NULL — continua significando lotação (de qual empresa a pessoa é funcionária; para o staff PSW, sempre a PSW). A pluralidade "é admin de N empresas" vive AO LADO, em `psw_tenant_admins`, nunca dentro de `profiles`. Confirmado estruturalmente: `select is_nullable from information_schema.columns where table_name='profiles' and column_name='tenant_id'` → `NO`, inalterado pelo apply.

### Desvio autorizado — `opportunities_update_psw_admin`

Ao preparar o handoff da Task 3, ficou confirmado que **nenhuma** policy viva de `opportunities` concederia UPDATE ao staff-admin sobre uma oportunidade do tenant concedido que não lhe foi atribuída nominalmente:
- `opportunities_update` (0015) exige `tenant_id = current_tenant_id()` — falso (o tenant do profile do staff é a PSW, não o concedido).
- `opportunities_update_platform_admin` (0025) exige `is_platform_admin()` — falso.
- `opportunities_update_psw_staff` (0041) exige atribuição nominal — falso, por construção do cenário decisivo.

E **nenhum plano futuro da fase fecharia isso**: a lista nominal das 11 policies do `18-05-PLAN.md` (`opportunity_assignees_insert/_update/_delete`, `invited_emails_select/_delete/_insert_tenant_admin`, `tenants_update_own_admin`, `tenant_branding_storage_insert/_update/_delete`, `audit_log_select`) **não inclui** `opportunities_update`. Sem correção, o verbo UPDATE em `opportunities` nunca chegaria ao staff-admin em toda a Phase 18 — contradizendo D-A (equivalência plena com `tenant_admin`) e deixando o spec decisivo `c5` (escrita + releitura por `serviceRoleClient()`) destinado a um falso-sucesso silencioso (`error === null` com zero linhas afetadas).

O PO autorizou o acréscimo de **um único objeto extra** — `opportunities_update_psw_admin`, `for update using (is_tenant_admin_of(tenant_id)) with check (is_tenant_admin_of(tenant_id))` — mantendo todo o resto do escopo original intacto (nenhum INSERT/DELETE novo em `opportunities`, nenhuma das 7 tabelas filhas tocada). O `<verify>` automatizado da Task 1 foi re-executado após a mudança e continuou passando. Verificado estruturalmente em produção (a policy existe, verbo UPDATE — verificação 7 do handoff); o smoke comportamental isolado (verificação 13, escrita real + releitura) não foi executado nesta wave (ver Deviations).

### Reversão do modo de prova da fase — `env-test-populado` → `prova-por-sql-no-handoff`

Ao tentar cumprir a ação pendente do `18-01-SUMMARY.md` (popular `.env.test`), descobriu-se que:
1. A única URL de Supabase disponível no ambiente era a de **produção** — `tests/setup/global-setup.ts:23-32` a rejeita por design (só aceita `http://127.0.0.1`, `http://localhost`, ou `*-test.supabase.co`), confirmando que a defesa funcionou como projetada.
2. **Colisão de UUID:** `FGCOOP_TEST_ID` (`11111111-1111-1111-1111-111111111111`) em `tests/setup/seed-test-tenants.ts` é o UUID de um tenant **real** de produção ("FGCoop", 32 oportunidades reais) — e `seed-test-tenants.ts:98` executa `delete().in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID, PSW_TEST_ID])` via **service-role** (bypassa RLS). Rodar a suíte contra produção **apagaria dados reais de cliente**.

Nenhum teste foi executado contra produção — o problema foi identificado antes de qualquer run. O PO reverteu a decisão do 18-01 para `prova-por-sql-no-handoff`: a prova de RLS passa a ser feita por verificação estrutural via SQL no handoff de cada migration, complementada por observação direta ponta-a-ponta pelo app quando o PO a executa (como nesta Task 4). Nota de supersessão acrescentada ao `18-01-SUMMARY.md` (sem reescrever o histórico daquela decisão — ela foi correta com a informação disponível em 2026-08-07). A colisão de UUID foi registrada como item deferido, fora do escopo desta fase.

**Consequência vinculante para os planos seguintes (18-03+):** `.env.test` não deve ser criado enquanto a colisão de UUID não for resolvida; `tests/security/*` continua em skip como estado estável, não como lacuna temporária; nenhum SUMMARY pode afirmar "testes verdes" para specs em skip — a evidência substituta é a verificação numerada do handoff (ou observação direta pelo app).

## Deviations from Plan

### Autorizadas pelo PO (fora das Regras 1-3, pois exigiram decisão explícita — Regra 4)

**1. [Rule 4 - Architectural, autorizada pelo PO] Acréscimo de `opportunities_update_psw_admin`, fora do escopo SELECT-only original da 0045**
- **Found during:** preparação do handoff da Task 3, ao verificar se o spec decisivo `c5` (escrita + releitura) poderia de fato passar contra a migration como originalmente escrita.
- **Issue:** o escopo original da `0045` (fixado no `<interfaces>` do plano, "não improvisar") era só-leitura em `opportunities`/`tenants`; nenhuma policy viva ou planejada concederia UPDATE ao staff-admin sobre uma oportunidade não atribuída do tenant concedido.
- **Fix:** acrescentada a policy `opportunities_update_psw_admin`, autorizada explicitamente pelo PO após eu ter reportado o achado num checkpoint.
- **Files modified:** `supabase/migrations/0045_psw_tenant_admins_grant.sql`
- **Verificação:** `<verify>` automatizado da Task 1 re-executado com sucesso; existência e verbo confirmados em produção (verificação 7 do handoff). Smoke de escrita efetiva (verificação 13) **não** executado nesta wave — ver Issues Encountered.
- **Committed in:** `0c2adc6`

### Auto-fixed Issues

Nenhuma. Todo o trabalho de Task 1 seguiu o `<action>` do plano sem necessidade de correção automática (Rules 1-3) — a única mudança de escopo foi a Regra 4 acima, que exigiu autorização explícita.

---

**Total deviations:** 1 (Rule 4, autorizada pelo PO — não auto-decidida)
**Impact on plan:** Necessária para que o tracer não deixasse a fase permanentemente sem nenhum verbo de escrita cross-tenant em `opportunities`. Sem impacto de escopo além do único objeto acrescentado; nenhuma tabela filha, nenhum outro verbo, tocados.

## Issues Encountered

1. **Modo de prova revertido (ver Decisions Made acima).** Consequência prática: `npm run test:security` roda limpo (exit 0) mas com **68 passed | 117 skipped | 1 todo (186)** — os 14 testes de `tests/security/psw-staff-admin-grant.test.ts` estão TODOS em skip, **não em verde**. Isso é o estado estável esperado desta fase a partir de agora, não uma falha a corrigir.
2. **Verificações do handoff não executadas nesta wave (dívidas explícitas, não bloqueantes):**
   - **V10 (não-regressão de `member`):** não executada — não existe profile com papel `member` no tenant FGCoop de produção no momento do apply.
   - **V11 (smokes de D-B — INSERT com erro / DELETE com zero linhas):** não executadas isoladamente.
   - **V12 (`EXPLAIN`, prova runtime de inlining):** não executada. A propriedade que a habilita (`is_tenant_admin_of` com `prosecdef=false`, `proconfig=NULL`) está confirmada estruturalmente.
   - **V13 (smoke do desvio autorizado — UPDATE efetivo com releitura):** não executada isoladamente; a policy existe e está correta estruturalmente (verificação 7), mas o smoke comportamental específico não foi rodado.
   - Nenhum destes itens bloqueia o tracer: a prova mais forte da fase (o positivo/negativo decisivos observados pelo app — D5 acima) já exercita a cadeia inteira via SELECT, e a estrutura das policies de escrita/D-B foi confirmada por inspeção de `pg_policies`, ainda que não pelo comportamento em runtime.
3. **Typecheck pré-existente (item herdado do 18-01) — RESOLVIDO fora desta fase.** O erro em `tests/opportunities/report-strategic.test.ts:107`, registrado como deferred no 18-01, foi corrigido pelo orquestrador no commit `69cd621`, anterior a esta execução. `npm run typecheck` confirmado saindo `0` nesta Task 4.

## User Setup Required

**`.env.test` continua sem existir, e agora por decisão explícita — não deve ser criado enquanto a colisão de UUID (ver Decisions Made / deferred-items.md) não for resolvida.** Nenhuma ação de ambiente pendente para o Plan 18-03: ele herda o mesmo modo de prova (`prova-por-sql-no-handoff`) e não depende de suíte automatizada habilitada.

## Next Phase Readiness

- `0045` aplicada e verificada em produção. `psw_tenant_admins`, os 3 helpers, o trigger de coerência, e a fatia vertical de `opportunities`/`tenants` (incl. o UPDATE autorizado) existem e estão corretos.
- **Os planos 18-03 em diante estão destravados** — o handoff declarava esse bloqueio explicitamente, e o apply foi confirmado pelo PO com as verificações estruturais e a prova end-to-end pelo app.
- O Plan 18-03 (propagação às 7 tabelas filhas + `profiles`) pode seguir o mesmo padrão de "duas metades" estabelecido aqui, e deve continuar tratando specs em skip como ausência de prova, nunca como sucesso.
- Dívidas explícitas para revisitar quando conveniente (não bloqueantes): V10/V11/V12/V13 do handoff (não-regressão de member, smokes de D-B, EXPLAIN de inlining, smoke do UPDATE autorizado) — nenhuma delas contradiz a evidência já obtida, apenas não foi exercitada nesta wave.
- Colisão de UUID entre fixtures de teste e tenant real de produção (FGCoop) registrada em `deferred-items.md` — bloqueia qualquer reabilitação futura de `env-test-populado` até ser resolvida (projeto Supabase de teste dedicado, ou troca dos UUIDs de fixture).

## Self-Check: PASSED

- FOUND: `supabase/migrations/0045_psw_tenant_admins_grant.sql`
- FOUND: `.planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-02-MIGRATION-HANDOFF.md`
- FOUND: commit `3058c5c` (Task 1)
- FOUND: commit `0c2adc6` (desvio autorizado)
- FOUND: commit `449f513` (Task 3)
- `npm run typecheck` → exit 0
- `npm run test:security` → exit 0, `68 passed | 117 skipped | 1 todo (186)` (confirmado; `psw-staff-admin-grant.test.ts` com 14/14 em skip, registrado como tal, não como verde)

---
*Phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa*
*Completed: 2026-08-07*
