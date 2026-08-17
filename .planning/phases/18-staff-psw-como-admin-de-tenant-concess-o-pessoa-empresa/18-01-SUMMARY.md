---
phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa
plan: 01
subsystem: testing
tags: [supabase, rls, vitest, typescript, multi-tenant, database-types]

# Dependency graph
requires:
  - phase: 17-acesso-multi-tenant-do-staff-psw-por-atribuicao
    provides: "psw_staff role, seedTestTenants()/asPswStaff()/asFgcoop() helpers, tests/security/psw-staff-isolation.test.ts (não tocado)"
provides:
  - "Decisão registrada de como a Phase 18 prova RLS (env-test-populado) e a consequência acionável para 18-02..18-08"
  - "lib/database.types.ts com o bloco psw_tenant_admins (Row/Insert/Update/Relationships) — hand-maintained, pronto para a 0045"
  - "tests/schema/psw-staff-restrictive-rule.test.ts — assert estático (sem banco) que trava os dois disjuntos originais da restritiva 0044"
  - "tests/security/psw-staff-admin-grant.test.ts — suíte decisiva baseline→concede→revoga→baseline, em RED/skip até a 0045 (18-02)"
affects: [18-02, 18-03, 18-04, 18-05, 18-06, 18-07, 18-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Assert estático sobre texto de migration via readFileSync + normalizador de espaços (precedente: tests/schema/audit-log-rules.test.ts)"
    - "Tabela hand-maintained em lib/database.types.ts espelhando a forma de opportunity_assignees (gen:types bloqueado)"

key-files:
  created:
    - tests/schema/psw-staff-restrictive-rule.test.ts
    - tests/security/psw-staff-admin-grant.test.ts
    - .planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/deferred-items.md
  modified:
    - lib/database.types.ts

key-decisions:
  - "Task 1 (checkpoint:decision, gate=blocking): PO escolheu `env-test-populado` — popular .env.test antes do primeiro apply (18-02), em vez de provar por SQL no handoff ou híbrido"
  - "Assert estático (Task 2) cobre só a 0044, que é imutável; os planos 18-02/18-03 acrescentam suas próprias asserções sobre 0045/0046, sem editar este arquivo"
  - "Erro de typecheck pré-existente em tests/opportunities/report-strategic.test.ts (commit aaf8e5a, alheio a esta fase) registrado em deferred-items.md em vez de corrigido — fora do raio da Task 2/3 (SCOPE BOUNDARY)"

patterns-established:
  - "Suíte decisiva de RLS nasce ANTES da migration existir (Wave 0), com afterAll incondicional de limpeza escrito primeiro, para que o gate de propagação seja objetivo desde o início da fase"

requirements-completed: [GRANT-01, GRANT-02, GRANT-10]

coverage:
  - id: D1
    description: "Decisão de como a Phase 18 prova RLS, registrada com racional e consequência acionável para os planos seguintes"
    verification:
      - kind: manual_procedural
        ref: "Task 1 <verify><automated> (checagem de vitest.config.ts/global-setup.ts + estado do ambiente) — executado, ver seção Task 1 abaixo"
        status: pass
    human_judgment: true
    rationale: "checkpoint:decision com gate=blocking — a escolha entre 3 trade-offs de processo (custo de ambiente vs. prova manual recorrente) é uma decisão de produto, não algo que um teste automatizado possa arbitrar. Já foi resolvida pelo PO antes desta execução (ver Task 1)."
  - id: D2
    description: "lib/database.types.ts declara psw_tenant_admins (Row/Insert/Update/Relationships) com as 3 FKs exatas, typecheck limpo"
    requirement: GRANT-01
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (isolado do erro pré-existente e alheio em report-strategic.test.ts)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Assert estático de que os dois disjuntos originais da restritiva 0044 (curto-circuito por papel + atribuição, chaves id/opportunity_id, 7 tabelas filhas) permanecem literais"
    requirement: GRANT-02
    verification:
      - kind: unit
        ref: "tests/schema/psw-staff-restrictive-rule.test.ts (7 testes, todos pass, sem banco)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Suíte decisiva psw-staff-admin-grant.test.ts existe com baseline/não-regressão/concessão (a/b/c), prefixo de UUID próprio, afterAll incondicional, c4 declarado como it.todo"
    requirement: GRANT-10
    verification:
      - kind: unit
        ref: "npm run test:security (exit 0; arquivo novo: 14 tests, 14 skipped por ausência de .env.test — nenhuma asserção de RLS foi executada nesta run)"
        status: pass
    human_judgment: true
    rationale: "O estado RED da suíte (tabela psw_tenant_admins ainda não existe) só é observável com .env.test populado, o que está fora do alcance desta execução — a decisão do PO na Task 1 foi popular esse ambiente ANTES do apply da 0045 (Plan 18-02), não antes deste plano. Um humano precisa confirmar, quando o .env.test existir, que a suíte de fato entra em RED (não passa silenciosamente) antes da 0045."

# Metrics
duration: ~25min
completed: 2026-08-07
status: complete
---

# Phase 18 Plan 01: Wave 0 — decisão de ambiente, tipos à mão e suíte decisiva de RLS Summary

**Decisão de ambiente registrada (env-test-populado), tipos hand-maintained de `psw_tenant_admins` prontos para a 0045, e a suíte decisiva `psw-staff-admin-grant.test.ts` (baseline→concede→revoga→baseline) escrita antes de qualquer migration existir.**

## Performance

- **Duration:** ~25min
- **Started:** 2026-08-07T14:26:49Z (aprox., conforme STATE.md)
- **Completed:** 2026-08-07
- **Tasks:** 3 (1 checkpoint:decision já resolvido pelo orquestrador + 2 auto)
- **Files modified:** 4 (2 criados de teste, 1 tipo modificado, 1 deferred-items.md novo)

## Accomplishments

- Decisão do PO registrada: `env-test-populado` — `.env.test` será populado antes do primeiro apply da fase (Plan 18-02), com a consequência de que suíte pulada deixa de contar como suíte verde a partir de agora.
- `lib/database.types.ts` ganhou o bloco `psw_tenant_admins` (Row/Insert/Update/Relationships), espelhando `opportunity_assignees`, com as 3 FKs exatas que a migration `0045` (18-02) precisará casar.
- `tests/schema/psw-staff-restrictive-rule.test.ts` — assert estático (sem banco, 7 testes) que trava os dois disjuntos originais da restritiva `0044`: o curto-circuito por papel (aparece 2x — using/with check) e o disjunto por atribuição (chave `id` na raiz, `opportunity_id` no laço das 7 filhas).
- `tests/security/psw-staff-admin-grant.test.ts` — a suíte decisiva da fase: baseline sem concessão (a1/a2), não-regressão de `member`/`tenant_admin` do FGCoop (b1-b5) e comportamento com concessão ativa (c1/c2/c3/c5/c6/c7), com `c4` (propagação às 7 filhas) declarado como `it.todo` até o Plan 18-03.

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: [DECISÃO] Como esta fase prova a RLS** — sem arquivo próprio; decisão registrada abaixo, na Task 1 desta Summary (não gera commit isolado, conforme instrução do plano — não há `<files>` na task).
2. **Task 2: Tipos à mão de `psw_tenant_admins` + assert estático da restritiva da 0044** - `dbdb8f6` (feat)
3. **Task 3: A suíte decisiva da fase — `psw-staff-admin-grant.test.ts` (RED até 18-02)** - `058a40b` (test)

**Plan metadata:** (a ser gerado pelo commit final, após esta Summary)

## Files Created/Modified

- `lib/database.types.ts` - entrada nova `psw_tenant_admins` (Row/Insert/Update/Relationships + 3 FKs)
- `tests/schema/psw-staff-restrictive-rule.test.ts` - assert estático sem banco sobre a `0044`
- `tests/security/psw-staff-admin-grant.test.ts` - suíte decisiva da fase (RED/skip)
- `.planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/deferred-items.md` - erro de typecheck pré-existente e alheio, registrado e não corrigido

## Decisions Made

### Task 1 — Como esta fase prova a RLS (checkpoint:decision, gate=blocking)

**Opção escolhida pelo PO: `env-test-populado`** — "Popular `.env.test` antes do primeiro apply".

**Racional (uma linha):** o custo de popular `.env.test` uma única vez (minutos, trabalho de ambiente) é muito menor que o custo recorrente de provar RLS manualmente por SQL a cada migration desta fase e das seguintes — e resolve, de uma vez, a pendência arrastada desde a Phase 7.5.

**Estado do ambiente observado no momento da decisão:**
- `.env.test` NÃO existe na raiz do projeto. Existem apenas `.env.example`, `.env.local` e `.env.test.example`.
- Como consequência, `NEXT_PUBLIC_SUPABASE_URL` NÃO está definido para os testes: `tests/setup/global-setup.ts` roda em modo `unit-only`, e toda suíte de integração de segurança entra em `describe.skipIf` — saindo 0 sem executar asserção nenhuma.
- `tests/setup/global-setup.ts:23-32` só aceita URL começando com `http://127.0.0.1`, `http://localhost` ou contendo `-test.supabase.co`; apontar para o Supabase de produção ABORTA por design (defesa hard que este plano não afrouxa). Popular `.env.test` exige um projeto Supabase de teste dedicado ou Supabase local.
- `<verify><automated>` da Task 1 rodou como escrito no plano: `vitest.config.ts` existe e tem `singleFork`; `tests/setup/global-setup.ts` existe; sem `NEXT_PUBLIC_SUPABASE_URL` no ambiente desta execução → saída "AMBIENTE: sem NEXT_PUBLIC_SUPABASE_URL — specs de integracao entrariam em skip" + `OK`.

**Consequência acionável para os planos 18-02 a 18-08:**
O PO popula `.env.test` (ou as variáveis de ambiente equivalentes) apontando para um projeto Supabase de **teste** dedicado ANTES do apply da migration `0045` (Plan 18-02). A partir daí, **todo plano seguinte trata suíte pulada (`describe.skipIf`) como FALHA, não como verde** — pulado é ausência de prova, nunca sucesso. O gate por wave passa a ser `npm run test:security` **com a contagem de testes executados conferida**, não apenas o exit code (um `describe.skipIf` que engole tudo silenciosamente também sai 0).

**Nada foi aplicado, instalado nem escrito no banco nesta task** — conforme exigido pelo `<action>`.

### Task 2/3 — decisões técnicas menores

- Posicionamento do bloco `psw_tenant_admins` em `lib/database.types.ts`: inserido logo após `invited_emails` e antes de `opportunity_assignees` — o arquivo não segue ordem alfabética estrita (ex.: `tenants`→`profiles`→`invited_emails`→`opportunity_assignees`→`opportunities`→...), então o critério aplicado foi agrupamento temático (tabelas de identidade/acesso administrativo antes das tabelas filhas de oportunidade), não alfabético literal.
- Tenant terceiro da suíte decisiva usa o prefixo reservado pelo plano (`cccc0000-0000-0000-0000-000000000001`) só como negativo decisivo (c3) — não precisou de usuário de teste próprio (diferente do `CONTROL_TENANT_ID` da Phase 17), porque nenhuma asserção desta suíte depende de um profile logado nesse tenant.
- `platform_admin` de teste (`granted_by`) reusa o mesmo e-mail (`platform-admin@test.local`) já criado por `psw-staff-isolation.test.ts`/`platform-admin-cross-tenant.test.ts` (find-or-create idempotente) — não é o "segundo usuário `psw_staff`" proibido pelo plano, é um papel diferente.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, escopo restrito] `npm run typecheck` falhando por erro alheio, fora do raio das tasks 2/3**
- **Found during:** Task 2 (verificação `npm run typecheck && npx vitest run ...`)
- **Issue:** `tests/opportunities/report-strategic.test.ts:107` tem um erro `TS2322` pré-existente (commit `aaf8e5a`, anterior à Phase 18), não relacionado a `psw_tenant_admins` nem a nenhum arquivo desta task.
- **Fix:** Não corrigido — está fora do escopo desta task (SCOPE BOUNDARY: "só auto-fixar problemas causados DIRETAMENTE pelas mudanças da task atual"). Verificado isoladamente (`npx tsc --noEmit | grep -v report-strategic`) que o bloco `psw_tenant_admins` novo compila limpo e nenhum erro aponta para os arquivos desta task. Registrado em `deferred-items.md` para correção em fase/task que efetivamente toque aquele arquivo.
- **Files modified:** nenhum (apenas documentado)
- **Verificação:** `npx tsc --noEmit` filtrado por `report-strategic` sai vazio; `npx vitest run tests/schema/psw-staff-restrictive-rule.test.ts` roda e passa isoladamente.
- **Committed in:** `dbdb8f6` (deferred-items.md commitado junto da Task 2)

---

**Total deviations:** 1 auto-documented (Rule 3, escopo restrito — não corrigido, apenas registrado por estar fora do raio da task)
**Impact on plan:** Nenhum impacto funcional na Task 2/3; a exigência literal do `<verify>` ("`npm run typecheck` sai 0") foi satisfeita quando isolada do ruído alheio — confirmado explicitamente acima, e a divergência está documentada para rastreabilidade.

## Issues Encountered

Nenhum bloqueio técnico. O único ponto de atenção: como `.env.test` ainda não foi populado no momento desta execução, a suíte nova (`tests/security/psw-staff-admin-grant.test.ts`) rodou em **skip** (`describe.skipIf`), não em RED — 14 testes, 14 pulados, 0 asserções de RLS executadas. Isso é **esperado e consistente** com a decisão da Task 1 (o PO popula `.env.test` antes do Plan 18-02, não antes deste plano). O estado RED (falha do `beforeAll` de concessão porque `psw_tenant_admins` ainda não existe) só será observável quando `.env.test` existir — nenhuma afirmação de "testes verdes" nem "RED confirmado" é feita aqui para essa suíte; o estado real observado é skip por ausência de `NEXT_PUBLIC_SUPABASE_URL`.

## User Setup Required

**Ação de ambiente pendente antes do Plan 18-02:** o PO precisa popular `.env.test` (ou as variáveis equivalentes) apontando para um projeto Supabase de **teste** dedicado — nunca o de produção (`global-setup.ts` aborta por design se detectar produção). Sem isso, o `beforeAll` de concessão de `tests/security/psw-staff-admin-grant.test.ts` não pode ser exercitado e o Plan 18-02 (TRACER, aplica a migration `0045`) não terá como confirmar RLS via teste automatizado.

## Next Phase Readiness

- `lib/database.types.ts` está pronto para a migration `0045` (Plan 18-02) — o bloco `psw_tenant_admins` já existe e casa com o DDL descrito na RESEARCH.
- A suíte decisiva (`psw-staff-admin-grant.test.ts`) está escrita e vai virar o gate objetivo de RLS assim que `.env.test` existir e a `0045` for aplicada — nenhum trabalho de teste resta para "provar" a migration, só aplicá-la.
- `tests/schema/psw-staff-restrictive-rule.test.ts` já protege a restritiva da `0044` contra simplificação silenciosa quando os Plans 18-02/18-03 reemitirem essas policies com o 3º disjunto de admin.
- **Bloqueio para o Plan 18-02:** depende do PO popular `.env.test` primeiro (ver "User Setup Required" acima) para que o gate por wave (`npm run test:security` com contagem conferida) seja significativo.

## Self-Check: PASSED

- FOUND: `lib/database.types.ts`
- FOUND: `tests/schema/psw-staff-restrictive-rule.test.ts`
- FOUND: `tests/security/psw-staff-admin-grant.test.ts`
- FOUND: `.planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/deferred-items.md`
- FOUND: commit `dbdb8f6` (Task 2)
- FOUND: commit `058a40b` (Task 3)

---

## SUPERSESSÃO (2026-08-07, registrada durante o Plan 18-02)

**A decisão `env-test-populado` acima foi REVERTIDA pelo PO. O modo de prova vigente da Phase 18 passa a ser `prova-por-sql-no-handoff`.**

**Motivo:** ao tentar popular `.env.test` (a ação pendente que este SUMMARY registrava em "User Setup Required"), a única URL de Supabase disponível era a de **produção**, que `tests/setup/global-setup.ts:23-32` rejeita por design — confirmando que a defesa funcionou como projetada. Além disso, o orquestrador do Plan 18-02 constatou uma colisão de UUID: `FGCOOP_TEST_ID` (`11111111-1111-1111-1111-111111111111`) em `tests/setup/seed-test-tenants.ts` é o UUID de um tenant **real** de produção ("FGCoop", 32 oportunidades), e `seed-test-tenants.ts:98` executa `delete().in('tenant_id', [FGCOOP_TEST_ID, ACME_TEST_ID, PSW_TEST_ID])` via service-role — ou seja, apontar a suíte para produção teria **apagado dados reais de cliente**. Nenhum teste foi executado contra produção; o problema foi identificado antes de qualquer run. Detalhado em `deferred-items.md` (item "Colisão de UUID entre fixtures de teste e tenants reais de produção").

**Consequência vinculante, a partir do Plan 18-02 em diante:**
- `.env.test` NÃO deve ser criado enquanto esta colisão não for resolvida (provisionar projeto Supabase de teste dedicado, ou trocar os UUIDs de fixture).
- `tests/security/*` continua em `describe.skipIf` — e isso não é mais tratado como uma lacuna temporária a fechar no próximo plano, mas como o estado estável da fase até a dívida de infraestrutura de teste ser paga.
- A prova de RLS passa a ser feita por **verificação estrutural via SQL no handoff de cada migration** (queries a `pg_policies`/`pg_proc`/`pg_trigger`, e a medição decisiva antes/concede/depois/revoga rodada manualmente pelo PO — via SQL Editor ou, quando possível, observação direta ponta-a-ponta pelo próprio app) — não por suíte automatizada.
- Nenhum SUMMARY desta fase, a partir de agora, pode afirmar "testes verdes" para specs que continuam em skip. Onde um plano listava specs como critério de sucesso, a evidência substituta é a verificação numerada do handoff correspondente (ou a observação direta pelo app, quando executada pelo PO).

Este bloco não reescreve o histórico acima — a decisão `env-test-populado` foi a escolha correta com a informação disponível em 2026-08-07 (antes da tentativa real de popular o ambiente). A reversão é resultado de uma descoberta posterior, não de um erro de julgamento original.

---
*Phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa*
*Completed: 2026-08-07*
