---
phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa
plan: 03
subsystem: database
tags: [supabase, postgres, rls, rbac, multi-tenant]

# Dependency graph
requires:
  - phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa (plan 18-02)
    provides: "0045 aplicada: psw_tenant_admins, is_tenant_admin_of()/current_admin_tenant_ids()/effective_admin_tenant_ids(), as duas metades da RLS em opportunities/tenants"
provides:
  - "Migration 0046 aplicada em produção: 22 policies PERMISSIVAS novas nas 7 tabelas filhas (paridade de verbos com tenant_admin — 4/4/4/4/3/3/2), as 7 restritivas da 0044 reemitidas com o 3º disjunto, e profiles_select_psw_admin"
  - "Verificação estrutural em produção: inventário de verbos por tabela (V1) e ausência de restritiva em profiles (V4) CONFIRMADOS pelo PO — bate exatamente com o esperado, D-A satisfeito"
  - "Spec c4 (propagação às 7 filhas), c8 (escrita com releitura) e c9 (paridade de verbos) escritos em tests/security/psw-staff-admin-grant.test.ts — rede de regressão durável, permanece em SKIP (modo de prova prova-por-sql-no-handoff)"
  - "GAP EXPLÍCITO: a prova em runtime da propagação positiva (V5), do negativo cross-tenant (V6), da reemissão das restritivas com 3 disjuntos (V2), da não-perda de policies pré-existentes (V3), da não-regressão de member/tenant_admin (V7) e da idempotência dupla-execução NÃO foi obtida nesta wave — ver 'Known Gaps' abaixo"
affects: [18-04, 18-05, 18-06, 18-07, 18-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Laço com array de pares (tabela, verbos) em vez de blocos copiados à mão — a lista de verbos por tabela expressa paridade com tenant_admin (D-A: equivalência, nunca superconjunto), com raise exception (não raise notice) quando a coluna de escopo falta, divergindo de propósito do padrão de continuação silenciosa da 0044"
    - "Reemissão de RESTRICTIVE (drop+create) em vez de tentativa de ALTER POLICY — o único jeito idempotente de acrescentar um disjunto a uma policy viva"

key-files:
  created:
    - supabase/migrations/0046_psw_admin_child_tables.sql
    - .planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-03-MIGRATION-HANDOFF.md
  modified:
    - tests/security/psw-staff-admin-grant.test.ts

key-decisions:
  - "Fixture de teste: criado um profile de teste dentro do tenant de controle (CONTROL_PROFILE_TEST_EMAIL) só para popular opportunity_assignees da fixture de C sem violar check_assignee_tenant() (0040) e sem atribuir o staff de teste ao tenant de controle — o que contaminaria c3/c4-negativo. Decisão de implementação dentro da discrição normal de fixture design, não uma mudança de escopo do plano."
  - "c9 (paridade de verbos) assere erro explícito nos três casos (UPDATE/DELETE em opportunity_history, UPDATE em opportunity_notes) porque nenhuma das duas tabelas tem GRANT desses verbos para authenticated desde a 0018 — a negação é de PRIVILÉGIO, anterior à própria RLS, não o padrão 'using retorna zero linhas' de c7. Documentado inline no teste para não confundir os dois mecanismos."

requirements-completed: [GRANT-03, GRANT-10]

# Coverage metadata — mapeado 1:1 às truths do must_haves do plano.
coverage:
  - id: D1
    description: "As 7 tabelas filhas recebem policies PERMISSIVAS novas por concessão, criadas por LAÇO com is_tenant_admin_of(tenant_id) — não por 7 blocos à mão"
    requirement: GRANT-03
    verification:
      - kind: manual_procedural
        ref: "18-03-MIGRATION-HANDOFF.md Verificação 1 — inventário por tabela colado pelo PO, bate exatamente 4/4/4/4/3/3/2"
        status: pass
    human_judgment: true
    rationale: "Prova por SQL no handoff (modo de prova da fase); o PO executou e colou o resultado exato, sem arredondamento."
  - id: D2
    description: "O laço carrega a lista de VERBOS por tabela: opportunity_notes/opportunity_documents sem UPDATE, opportunity_history sem UPDATE nem DELETE — paridade com tenant_admin, nunca superconjunto"
    requirement: GRANT-10
    verification:
      - kind: manual_procedural
        ref: "18-03-MIGRATION-HANDOFF.md Verificação 1 — mesmo resultado do D1, confirma ausência de verbo extra em qualquer tabela"
        status: pass
    human_judgment: true
    rationale: "Mesma evidência de D1; o PO confirmou que nenhuma tabela recebeu verbo além do esperado."
  - id: D3
    description: "O laço levanta exceção (não segue em silêncio) se alguma das 7 tabelas não tiver a coluna tenant_id"
    verification:
      - kind: other
        ref: "Task 1 <verify> automatizado (grep -qi 'raise exception' no arquivo da migration) — passou na CI local desta sessão"
        status: pass
    human_judgment: true
    rationale: "Verificação apenas ESTRUTURAL (o texto 'raise exception' existe no arquivo) — o guard nunca foi exercitado em runtime porque as 7 tabelas de fato têm tenant_id em produção (não há como forçar o caminho de exceção sem uma tabela artificial). Roteado para julgamento humano por ser garantia de código, não comportamento observado."
  - id: D4
    description: "As 7 restritivas da 0044 são reemitidas com o terceiro disjunto tenant_id in (select current_admin_tenant_ids()), preservando literalmente os dois disjuntos originais"
    requirement: GRANT-02
    verification:
      - kind: manual_procedural
        ref: "18-03-MIGRATION-HANDOFF.md Verificação 2 (pg_policies.qual contendo current_admin_tenant_ids, esperado 7 linhas) — NÃO EXECUTADA"
        status: unknown
    human_judgment: true
    rationale: "GAP: o PO confirmou apenas V1 (inventário de verbos) e V4 (profiles). A Verificação 2 — que prova que a metade RESTRITIVA de fato recebeu o 3º disjunto — não foi executada nesta wave. Sem ela, a propagação não tem prova formal em runtime; a estrutura do arquivo (Task 1 <verify>) confirma que o texto foi ESCRITO corretamente, mas não que a policy viva em produção o contém."
  - id: D5
    description: "Existe profiles_select_psw_admin — sem ela a aba de Equipe do tenant concedido vem vazia sem erro"
    requirement: GRANT-04
    verification:
      - kind: manual_procedural
        ref: "18-03-MIGRATION-HANDOFF.md Verificação 4 — colada pelo PO: profiles_select_psw_admin presente (PERMISSIVE, SELECT), zero RESTRICTIVE em profiles"
        status: pass
    human_judgment: true
    rationale: "Prova por SQL no handoff; resultado colado literalmente pelo PO."
  - id: D6
    description: "PROPAGAÇÃO PROVADA: com concessão no tenant A, o psw_staff enxerga as linhas filhas de uma oportunidade de A que NÃO lhe foi atribuída — as 7 tabelas verificadas uma a uma"
    requirement: GRANT-03
    verification:
      - kind: manual_procedural
        ref: "18-03-MIGRATION-HANDOFF.md Verificação 5 (contagens > 0 nas 7 filhas via impersonação de sessão) — NÃO EXECUTADA"
        status: unknown
    human_judgment: true
    rationale: "GAP DECISIVO: esta é a alegação central do plano (o que a fase inteira existe para entregar) e ela NÃO tem prova de runtime nesta wave. O orquestrador registrou o caminho prático recomendado — conceder o FGCoop ao staff de teste e abrir uma oportunidade daquele tenant no app, verificando se as abas de anotações/tarefas/riscos deixam de vir vazias — como verificação PENDENTE, ainda não executada. Não presumir sucesso."
  - id: D7
    description: "NEGATIVO PRESERVADO: nas mesmas 7 tabelas, o staff continua sem enxergar nada do tenant de controle"
    requirement: GRANT-03
    verification:
      - kind: manual_procedural
        ref: "18-03-MIGRATION-HANDOFF.md Verificação 6 (as 7 contagens do tenant de controle, esperado todas zero) — NÃO EXECUTADA"
        status: unknown
    human_judgment: true
    rationale: "GAP: este é o detector de vazamento cross-tenant (T-18-22 do threat register). Sem executá-lo, a ausência de vazamento nas 7 filhas não tem prova formal — apenas a garantia estrutural do predicado (is_tenant_admin_of(tenant_id) sobre a coluna local, não subconsulta correlacionada com a oportunidade-pai)."
  - id: D8
    description: "Um psw_staff SEM concessão continua vendo, nas 7 filhas, exatamente o que via — o baseline medido em 18-01 é reconferido após esta migration"
    requirement: GRANT-02
    verification: []
    human_judgment: true
    rationale: "GAP: nenhuma das 8 verificações do handoff mediu especificamente este baseline em produção (o handoff cobre propagação COM concessão, não a ausência de concessão). A rede de regressão para isto é o spec a1b/c4-baseline, escrito nesta wave mas em SKIP (sem .env.test)."
  - id: D9
    description: "As contagens visíveis de um member e de um tenant_admin do tenant concedido permanecem idênticas às de antes desta migration"
    requirement: GRANT-10
    verification:
      - kind: manual_procedural
        ref: "18-03-MIGRATION-HANDOFF.md Verificação 7 (contagens de member/tenant_admin do FGCoop nas 7 filhas, antes/depois) — NÃO EXECUTADA"
        status: unknown
    human_judgment: true
    rationale: "GAP: não-regressão não confirmada em runtime nesta wave."
  - id: D10
    description: "A 0046 é idempotente: rodar o arquivo duas vezes no SQL Editor não gera erro"
    verification:
      - kind: manual_procedural
        ref: "18-03-MIGRATION-HANDOFF.md, seção 'Prova de idempotência' — resultado da segunda execução NÃO foi colado pelo PO nesta wave"
        status: unknown
    human_judgment: true
    rationale: "GAP: a evidência recebida do PO cobriu apenas V1 e V4; a confirmação explícita de que a segunda execução terminou 'Success. No rows returned' não foi reportada."
  - id: D11
    description: "Spec c4 (propagação às 7 filhas, positivo/negativo/baseline), c8 (escrita com releitura) e c9 (paridade de verbos) escritos como rede de regressão durável"
    verification:
      - kind: unit
        ref: "tests/security/psw-staff-admin-grant.test.ts — 31/31 specs em SKIP (npx vitest run tests/security/psw-staff-admin-grant.test.ts, exit 0)"
        status: unknown
    human_judgment: true
    rationale: "Os specs existem, tipam corretamente (npm run typecheck exit 0) e rodam sem erro de coleta, mas TODOS os 31 (incluindo c4/c8/c9 novos) estão em SKIP — .env.test não existe por decisão vinculante do Plan 18-02. Nunca reportar como 'verde'; status unknown reflete que a suíte não provou nada em runtime nesta wave."

# Metrics
duration: checkpoint-gated (Task 1 e Task 2/handoff numa sessão; PO aplicou a 0046 em produção entre sessões; Task 3 e fechamento nesta sessão)
completed: 2026-08-07
status: complete
---

# Phase 18 Plan 03: Migration 0046 — propagação às 7 tabelas filhas + profiles Summary

**Migration `0046_psw_admin_child_tables.sql` escrita, verificada estruturalmente e APLICADA EM PRODUÇÃO: 22 policies permissivas novas nas 7 tabelas filhas com paridade exata de verbos ao `tenant_admin` (4/4/4/4/3/3/2, confirmado pelo PO), as 7 restritivas da `0044` reemitidas com o terceiro disjunto, e `profiles_select_psw_admin`. Apenas 2 das 8 verificações do handoff foram confirmadas pelo PO (inventário de verbos e ausência de restritiva em `profiles`) — a propagação positiva, o negativo cross-tenant, a reemissão das restritivas e a não-regressão de `member`/`tenant_admin` NÃO têm prova de runtime nesta wave, e estão registradas como pendentes, não como concluídas.**

## Performance

- **Duration:** checkpoint-gated (bloqueio de apply manual entre Task 1/2 e Task 3)
- **Completed:** 2026-08-07
- **Tasks:** 3 (migration write-only + handoff/apply humano + spec de propagação)
- **Files modified:** 3 (1 migration criada, 1 handoff criado, 1 spec de teste estendido)

## Accomplishments

- Migration `0046` escrita, verificada estruturalmente (`<verify>` automatizado passou — laço com array de pares tabela/verbos, `raise exception` no guard de coluna, as duas metades, os dois disjuntos originais preservados textualmente, `profiles_select_psw_admin`, zero menção a convites/audit/Storage) e **aplicada em produção** pelo PO.
- **Confirmado pelo PO:** o inventário de verbos por tabela bate EXATAMENTE com `4/4/4/4/3/3/2` — nenhuma tabela recebeu verbo além do que um `tenant_admin` daquele tenant já tem (D-A satisfeito: equivalência, não superconjunto). `opportunity_history` com 2 verbos confirma que o append-only da `0018` foi preservado.
- **Confirmado pelo PO:** `profiles` tem exatamente 5 policies, todas PERMISSIVE, incluindo `profiles_select_psw_admin` — zero RESTRICTIVE, como o Bloco C previa.
- **NÃO confirmado nesta wave** (ver `coverage` D4/D6/D7/D9/D10 acima e "Known Gaps" abaixo): a reemissão das 7 restritivas com o 3º disjunto, a propagação positiva às 7 filhas, o negativo do tenant de controle, e a não-regressão de `member`/`tenant_admin`.
- Specs `c4-positivo`/`c4-negativo` (parametrizados sobre as 7 tabelas), `c4-baseline`, `c8` (INSERT com releitura por `serviceRoleClient()`) e `c9` (paridade de verbos: `opportunity_history` sem UPDATE/DELETE, `opportunity_notes` sem UPDATE) escritos em `tests/security/psw-staff-admin-grant.test.ts`, substituindo o `it.todo` original — a rede de regressão durável para quando existir ambiente de teste dedicado.
- `npm run typecheck` → exit 0. `npm run test:security` → exit 0, **68 passed | 135 skipped (203)** — `psw-staff-admin-grant.test.ts` com **31/31 em SKIP**, nenhum `it.todo` pendente, registrado como tal, **nunca como verde**.

## Task Commits

Cada task com arquivo próprio foi commitada atomicamente:

1. **Task 1: Migration 0046 — as duas metades nas 7 filhas, por laço com lista de verbos, mais `profiles`** — `461fdb0` (feat)
2. **Task 2: [BLOCKING] Handoff e apply manual da 0046** — `6ee0987` (docs, o handoff) + apply manual confirmado pelo PO (sem commit — a migration em si já foi commitada na Task 1; o apply é ação em produção, não em git)
3. **Task 3: Provar a propagação — spec `c4` nas 7 filhas, uma a uma** — `7906b8f` (test)

## Files Created/Modified

- `supabase/migrations/0046_psw_admin_child_tables.sql` - laço de permissivas por tabela+verbo nas 7 filhas (paridade com `tenant_admin`), laço de reemissão das 7 restritivas com o 3º disjunto, `profiles_select_psw_admin`, blocos de verificação e rollback comentados
- `.planning/phases/18-.../18-03-MIGRATION-HANDOFF.md` - handoff write-only com 8 verificações numeradas placeholder-free (ids concretos + subconsultas inline), rollback, bloqueio explícito do plano 18-05
- `tests/security/psw-staff-admin-grant.test.ts` - `CHILD_TABLES`, fixture das 7 filhas sob a oportunidade não atribuída de A e sob o tenant de controle, `a1b`/`c4-baseline` (baseline sem concessão), `c4-positivo`/`c4-negativo` (parametrizados), `c8` (escrita com releitura), `c9` (paridade de verbos)

## Decisions Made

### Fixture de teste — profile dentro do tenant de controle

Ao escrever a fixture de `opportunity_assignees` para o tenant de controle (necessária para que `c4-negativo` teste um cenário com DADO REAL, não apenas ausência de linha), descobri que nem o staff de teste (contaminaria `c3`/`c4-negativo`) nem o profile do FGCoop (rejeitado por `check_assignee_tenant()`, que exige profile do MESMO tenant da oportunidade ou `psw_staff`) serviam como assignee legítimo de uma oportunidade do tenant de controle. Criado um profile de teste dedicado dentro do próprio tenant de controle (`CONTROL_PROFILE_TEST_EMAIL`), espelhando o padrão já usado em `psw-staff-isolation.test.ts` (`controlUserId`). Decisão de discrição normal de design de fixture — não uma mudança de escopo do plano.

### `c9` — por que as três negações são erro explícito, não zero-linhas

`opportunity_history` só tem `grant select, insert` desde a `0018`; `opportunity_notes` só tem `grant select, insert, delete` — nenhuma das duas tem `update` concedido a `authenticated`, e histórico não tem `delete`. Isso significa que a negação de UPDATE/DELETE nessas tabelas é um erro de **privilégio** (anterior à própria avaliação de RLS), diferente do padrão "using retorna zero linhas" já exercitado em `c7` (que se aplica quando a tabela TEM o grant do verbo, mas a RLS filtra a linha). Documentado inline no teste para que a distinção não seja perdida numa refatoração futura.

## Deviations from Plan

### Auto-fixed Issues

Nenhuma. O `<action>` de cada task foi seguido; a única adição além do texto literal do plano foi a fixture do profile de controle (ver "Decisions Made" acima), dentro da discrição normal de implementação de testes — não uma correção de bug nem uma funcionalidade crítica ausente.

---

**Total deviations:** 0 (Rules 1-3) — 1 decisão de design de fixture documentada acima, sem necessidade de autorização (não architectural, não muda schema nem contrato de API).
**Impact on plan:** Nenhum impacto de escopo.

## Issues Encountered

1. **Verificação parcial no checkpoint da Task 2 — GAP EXPLÍCITO, não corrigido nesta wave.** O PO aplicou a `0046` em produção e confirmou **apenas 2 das 8 verificações do handoff** (V1/inventário de verbos e V4/`profiles`). As 6 restantes — V2 (restritivas com 3º disjunto), V3 (não-perda de policies pré-existentes), V5 (propagação positiva), V6 (negativo cross-tenant), V7 (não-regressão member/tenant_admin) e a prova de idempotência (dupla execução) — **não foram executadas** e ficam registradas como pendentes em `.planning/WINDOWS.md` (7 entradas: 6 `unrun-verify` + 1 `skipped-test`). O caminho prático recomendado pelo orquestrador para V5 (conceder FGCoop ao staff de teste e abrir uma oportunidade daquele tenant no app — se as abas de anotações/tarefas/riscos deixarem de vir vazias, a propagação funcionou pela cadeia real) está registrado como verificação pendente, ainda não executada.
2. **Modo de prova da fase inalterado.** `.env.test` continua sem existir por decisão vinculante do Plan 18-02 (colisão de UUID entre fixtures de teste e o tenant real FGCoop). `tests/security/psw-staff-admin-grant.test.ts` roda 31/31 em SKIP — incluindo os specs novos `c4`/`c8`/`c9` desta wave. Nenhuma alegação de "testes verdes" é feita neste SUMMARY para esses specs.
3. **`tests/security/psw-staff-isolation.test.ts` NÃO foi editado** (restrição do plano, confirmada por `git diff --name-only HEAD -- tests/security` retornando apenas `psw-staff-admin-grant.test.ts`).

## User Setup Required

Nenhuma ação de ambiente pendente. `.env.test` continua intencionalmente ausente (ver Issue 2). **Ação recomendada, não bloqueante, para o PO antes de considerar a Phase 18 encerrada:** rodar as 6 verificações pendentes do handoff (V2/V3/V5/V6/V7 + idempotência) e colar o resultado, atualizando este SUMMARY ou registrando em `.planning/WINDOWS.md` como resolvido.

## Next Phase Readiness

- A `0046` está aplicada em produção; o inventário de verbos e a ausência de restritiva em `profiles` estão confirmados.
- **O Plan 18-05 está formalmente destravado** (o handoff declarava esse bloqueio, e o PO confirmou o apply), mas o swap das 11 policies vivas de `tenant_admin` pela fonte única pressupõe que a propagação às 7 filhas FUNCIONA DE FATO — e isso não tem prova de runtime nesta wave (D6 em `coverage` acima). Recomenda-se rodar a verificação prática do app (conceder + abrir oportunidade + checar abas) antes ou durante o 18-05, não depois.
- A rede de regressão automatizada (`c4`/`c8`/`c9`) existe e está correta estruturalmente (`npm run typecheck` exit 0), mas continua em SKIP — sem valor probatório até `.env.test` existir.
- 7 itens registrados em `.planning/WINDOWS.md` (kind `unrun-verify` × 6, `skipped-test` × 1) — o ledger acumula e bloqueia `/gsd-ship` até resolvidos ou dispensados explicitamente.

## Self-Check: PASSED

- FOUND: `supabase/migrations/0046_psw_admin_child_tables.sql`
- FOUND: `.planning/phases/18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa/18-03-MIGRATION-HANDOFF.md`
- FOUND: commit `461fdb0` (Task 1)
- FOUND: commit `6ee0987` (Task 2, handoff)
- FOUND: commit `7906b8f` (Task 3)
- `npm run typecheck` → exit 0
- `npm run test:security` → exit 0, `68 passed | 135 skipped (203)` (confirmado; `psw-staff-admin-grant.test.ts` com 31/31 em skip, registrado como tal, não como verde)

---
*Phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa*
*Completed: 2026-08-07*
