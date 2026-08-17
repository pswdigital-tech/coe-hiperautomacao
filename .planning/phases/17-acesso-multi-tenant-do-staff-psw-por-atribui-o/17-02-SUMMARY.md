---
phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o
plan: 02
subsystem: testing
tags: [vitest, rls, supabase, multi-tenant, tdd]

# Dependency graph
requires:
  - phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o
    plan: "17-01"
    provides: "Enum tenant_role com psw_staff (migration 0039, aplicada em produção); isPswStaff() em lib/security/role.ts"
provides:
  - "PSW_TEST_ID, PSW_STAFF_TEST_EMAIL e o seed idempotente do tenant/perfil da PSW promovido, em tests/setup/seed-test-tenants.ts"
  - "asPswStaff() em tests/helpers/auth-as.ts, no mesmo formato de asFgcoop/asAcme"
  - "tests/security/psw-staff-isolation.test.ts — fixture de 3 oportunidades (X atribuída, Y não atribuída no mesmo tenant, Z atribuída em outro tenant) + os 5 grupos de spec do contrato de nomes (17-VALIDATION.md)"
affects: ["17-03", "17-04", "17-05", "17-06", "17-07", "17-08"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixture escrita ANTES da policy (Wave 0 de validação): os specs do tracer existem e ficam RED até o Plan 17-03 aplicar a migration que os torna verdes — evita que a policy seja escrita para satisfazer um teste manco"
    - "IDs determinísticos com prefixo próprio por suíte (aaaa0000-...) para não colidir com outras suítes sob singleFork"
    - "Erro de INSERT esperado (cross-tenant pré-0040) tratado como log informativo no beforeAll, não como throw — preserva a execução dos demais specs em vez de abortar a suíte inteira"

key-files:
  created:
    - tests/security/psw-staff-isolation.test.ts
  modified:
    - tests/setup/seed-test-tenants.ts
    - tests/helpers/auth-as.ts
    - .planning/WINDOWS.md

key-decisions:
  - "Fixture usa três oportunidades com IDs determinísticos (prefixo aaaa0000, exclusivo desta suíte) em vez de IDs gerados pelo banco — necessário para que Y (a testemunha do teste negativo) seja referenciável nos specs sem depender de ordem de criação."
  - "O usuário de teste platform_admin (necessário só para o grupo 'psw_staff != platform_admin') foi recriado localmente neste arquivo, no mesmo padrão de tests/security/platform-admin-cross-tenant.test.ts, em vez de centralizado em seed-test-tenants.ts — o plano só pediu centralização para o papel novo (psw_staff); duplicar o padrão de 'cria e promove' para platform_admin segue o precedente já existente no próprio projeto."
  - "Os dois INSERTs de opportunity_assignees (X e Z) na fixture FALHAM nesta wave — o profile do staff PSW pertence ao tenant PSW e o trigger check_assignee_tenant() (0032) ainda exige que o tenant do profile atribuído coincida com o da oportunidade. Isto é o RED esperado e documentado, não um bug: o Plan 17-03 (TRACER) reescreve o trigger via migration 0040."

requirements-completed: []

coverage:
  - id: D1
    description: "Seed idempotente do tenant/perfil de teste da PSW, promovido a psw_staff via service-role, com asPswStaff() exportado no formato dos papéis existentes"
    requirement: ACCESS-01
    verification:
      - kind: other
        ref: "grep automatizado do plano (Task 1 <verify>): PSW_TEST_ID, PSW_STAFF_TEST_EMAIL, promoção a psw_staff em seed-test-tenants.ts; asPswStaff via authedClient em auth-as.ts; nenhum spec de isolamento existente editado"
        status: pass
    human_judgment: false
  - id: D2
    description: "tests/security/psw-staff-isolation.test.ts existe com fixture de 3 oportunidades e os 5 nomes de spec do contrato 17-VALIDATION.md, em skip mode sem .env.test"
    requirement: ACCESS-02
    verification:
      - kind: test
        ref: "npx vitest run tests/security/psw-staff-isolation.test.ts --reporter=basic — 7 tests, 7 skipped, exit 0 (sem .env.test); grep -F confirma as 5 descrições literais; grep -qi mock não encontra ocorrência"
        status: pass
    human_judgment: false
  - id: D3
    description: "Os specs decisivos de visibilidade (ACCESS-04) rodam de verdade contra Postgres real e ficam verdes"
    requirement: ACCESS-04
    verification: []
    human_judgment: true
    rationale: "Não executável nesta wave — .env.test continua ausente (débito herdado da Phase 7.5, registrado no 17-01-SUMMARY). Os specs estão escritos e logicamente verificados (a fixture força o INSERT cross-tenant a falhar no trigger atual, confirmando o RED esperado), mas o veredito real fica para quando .env.test for populado e a migration 0040 (Plan 17-03) for aplicada."

# Metrics
duration: ~15min
completed: 2026-08-06
status: complete
---

# Phase 17 Plan 02: Wave 0 de validação — seed PSW, `asPswStaff()` e o spec decisivo Summary

**Tenant/perfil de teste da PSW seedados de forma idempotente, `asPswStaff()` exportado, e `tests/security/psw-staff-isolation.test.ts` criado com a fixture de 3 oportunidades e os 5 specs do contrato — escritos e logicamente corretos, mas ainda em `describe.skipIf` (sem `.env.test`) e RED com banco real até a migration 0040 (Plan 17-03).**

## Performance

- **Duration:** ~15min
- **Started:** 2026-08-06T18:44:00Z (aprox., logo após a conclusão do 17-01)
- **Completed:** 2026-08-06T18:54:40Z
- **Tasks:** 2 (ambas `auto` com `tdd="true"`)
- **Files modified:** 4 (2 estendidos na Task 1, 1 criado + 1 ledger atualizado na Task 2)

## Accomplishments

- `tests/setup/seed-test-tenants.ts`: `PSW_TEST_ID`, `PSW_STAFF_TEST_EMAIL`, tenant PSW no `upsert` (3º elemento), `ensureUser` reusado sem variante nova, promoção a `psw_staff` via `serviceRoleClient()` com mensagem explícita citando a migration `0039` em caso de falha, `SeedResult` ampliado com `pswTenantId`/`pswStaffUserId`, `cleanupTestTenants()` incluindo o tenant PSW.
- `tests/helpers/auth-as.ts`: `asPswStaff()` exportado, mesma forma de `asFgcoop`/`asAcme`.
- `tests/security/psw-staff-isolation.test.ts` criado do zero: fixture `beforeAll` com 3 oportunidades de IDs determinísticos (X — tenant FGCoop, atribuída; Y — mesmo tenant de X, sem atribuição, testemunha do negativo; Z — tenant Acme, atribuída), mais um `platform_admin` de teste local (mesmo padrão de `platform-admin-cross-tenant.test.ts`) para o grupo de comparação. 5 grupos de spec com os nomes exatos do contrato: `loga sem erro`, `cadastro único`, `não vê oportunidade não atribuída do mesmo tenant`, `vê a oportunidade atribuída de outro tenant`, `psw_staff != platform_admin`, mais um `describe` de regressão explícito (FGCoop continua sem ver Acme).
- Comentário de bloco fixando a regra "toda escrita relê a linha via service-role" (Pitfall 1) e a lista reservada dos nomes de grupo dos planos 17-03 a 17-07, para que nenhum plano seguinte invente nome divergente.
- `.planning/WINDOWS.md` ganhou a entrada #7 (`unrun-verify`) documentando que esta suíte roda em skip mode até `.env.test` existir.

## Task Commits

Each task was committed atomically:

1. **Task 1: Seed do tenant/perfil de teste da PSW e `asPswStaff()`** - `66b69f4` (feat)
2. **Task 2: Spec `psw-staff-isolation.test.ts` — fixture de 3 oportunidades e os specs do tracer** - `f80ac5d` (test)

**Plan metadata:** (este commit — SUMMARY + STATE + ROADMAP)

## Files Created/Modified

- `tests/setup/seed-test-tenants.ts` - constantes/promoção/`SeedResult`/`cleanupTestTenants()` do tenant PSW
- `tests/helpers/auth-as.ts` - `asPswStaff()`
- `tests/security/psw-staff-isolation.test.ts` - fixture + 5 grupos de spec + describe de regressão (novo arquivo)
- `.planning/WINDOWS.md` - entrada #7 registrando o skip mode desta suíte

## Decisions Made

- **IDs determinísticos com prefixo próprio (`aaaa0000-...`)** para as 3 oportunidades da fixture — necessário para que a oportunidade Y (testemunha do teste negativo) seja referenciável de forma estável nos specs, e para não colidir com IDs de outras suítes sob `singleFork` (execução serializada, mesmo processo).
- **`platform_admin` de teste recriado localmente neste arquivo**, no mesmo padrão "cria e promove" de `platform-admin-cross-tenant.test.ts`, em vez de centralizado em `seed-test-tenants.ts`. O plano só pediu centralização explícita para o papel novo (`psw_staff`, para evitar uma terceira cópia do padrão) — duplicar o padrão já existente para `platform_admin` (usado só neste grupo de comparação) segue o precedente do próprio projeto sem introduzir acoplamento novo.
- **INSERTs de `opportunity_assignees` (X e Z) tratados como falha esperada, não como erro fatal do `beforeAll`**: o profile do staff PSW pertence ao tenant PSW, e o trigger `check_assignee_tenant()` (migration `0032`, ainda não reescrito) exige que o tenant do profile atribuído coincida com o da oportunidade. Lançar a partir desse erro abortaria o `beforeAll` e pularia todos os `it`s da suíte (mascarando o RED real); em vez disso, o erro é logado como informativo e a suíte segue — os specs de visibilidade então falham de verdade (RED), que é o estado documentado e esperado nesta wave.

## Deviations from Plan

### Auto-fixed Issues

Nenhuma — as duas tasks `auto`/`tdd="true"` foram executadas conforme escrito no plano, sem necessidade de correção de bug/funcionalidade faltante/bloqueio (Rules 1-3). Nenhuma mudança arquitetural foi necessária (Rule 4 não se aplicou).

**Total deviations:** 0 auto-fixed.
**Impact on plan:** Nenhum — plano executado como escrito nas Tasks 1 e 2.

## Known Stubs

Nenhum. Este plano não introduz UI nem dados renderizados — é infraestrutura de teste (seed + helper + spec).

## Issues Encountered

- **Os 5 specs decisivos desta suíte NÃO rodaram de verdade — estão escritos e logicamente corretos, mas em `describe.skipIf` porque `.env.test` continua ausente** (débito herdado da Phase 7.5, já registrado no `17-01-SUMMARY.md`). `npx vitest run tests/security/psw-staff-isolation.test.ts --reporter=basic` confirma: 7 tests, 7 skipped, exit 0. **Não afirmo que os specs "passam" ou estão "verificados"** — a prova real de isolamento (inclusive o teste negativo decisivo ACCESS-04) fica para quando `.env.test` for populado e a migration `0040` for aplicada (Plan 17-03, TRACER). A correção lógica da fixture foi verificada por leitura cuidadosa do trigger `check_assignee_tenant()` (migration `0032`): com o profile do staff PSW no tenant PSW, os INSERTs de `opportunity_assignees` para X (tenant FGCoop) e Z (tenant Acme) devem falhar nesse trigger até a `0040` reescrevê-lo — comportamento documentado em comentário no `beforeAll` e registrado como `unrun-verify` em `.planning/WINDOWS.md` (entrada #7).
- **`npm run typecheck` e `npx vitest run` (suíte completa) continuam com as mesmas falhas pré-existentes da baseline** (medida em `74306f8`, imediatamente antes deste plano), sem nenhuma nova falha: `tsc --noEmit` — 1 erro pré-existente em `tests/opportunities/report-strategic.test.ts:107` (TS2322); `npx vitest run` — 7 testes falhando em 3 arquivos pré-existentes (`v03-pure-logic.test.ts`, `public-form/steps.test.ts`, `wizard/state.test.ts`), 296 passando, 87 pulados (era 80; os +7 são exatamente os specs novos desta suíte em skip). Nenhum arquivo deste plano introduziu regressão.
- **Débito herdado confirmado, sem mudança de estado:** `.env.test` continua ausente (só existe `.env.test.example`). Isto importa diretamente para os planos `17-03` e `17-05`, cujos gates humanos de apply exigem que os specs decisivos rodem de verdade contra banco real antes de considerar a fase segura.

## User Setup Required

None — nenhuma configuração de serviço externo requerida por este plano. A pendência de `.env.test` é carryover da Phase 7.5, já sinalizada no `17-01-SUMMARY.md` e no `.planning/WINDOWS.md`.

## Next Phase Readiness

- `seedTestTenants()`, `asPswStaff()` e a fixture de 3 oportunidades estão prontos para o Plan 17-03 (TRACER) consumir — a migration `0040` deve tornar os 5 specs decisivos verdes sem precisar tocar em `tests/security/psw-staff-isolation.test.ts` além de, no máximo, remover os comentários "RED esperado".
- Nomes de grupo reservados no final do arquivo (`check_assignee_tenant`, `tabelas filhas`, `escrita escopada`, `invited_emails`, `assignee de tarefa`, `lista unificada`) fixam o contrato para os planos `17-03` a `17-08` — nenhum deve inventar nome divergente.
- Nenhum arquivo de `tests/security/` pré-existente foi editado (`git status --short tests/security` mostra apenas o arquivo novo) — ACCESS-07 preservado por construção.
- **Recomendação que se repete desde o `17-01`:** popular `.env.test` com um projeto Supabase Cloud de teste antes do apply da `0040` (Plan 17-03), para que o teste negativo decisivo (ACCESS-04) tenha veredito real na primeira oportunidade.

---
*Phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o*
*Completed: 2026-08-06*

## Self-Check: PASSED

Todos os arquivos declarados (`tests/setup/seed-test-tenants.ts`, `tests/helpers/auth-as.ts`, `tests/security/psw-staff-isolation.test.ts`, `.planning/WINDOWS.md`, `17-02-SUMMARY.md`) existem no disco. Todos os commits declarados (`66b69f4`, `f80ac5d`) existem em `git log --oneline --all`.
