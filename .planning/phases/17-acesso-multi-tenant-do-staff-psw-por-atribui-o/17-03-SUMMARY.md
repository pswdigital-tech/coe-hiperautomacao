---
phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o
plan: 03
subsystem: database
tags: [postgres, rls, supabase, multi-tenant, security-definer, trigger]

# Dependency graph
requires:
  - phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o
    plan: "17-01"
    provides: "Enum tenant_role com psw_staff (migration 0039, aplicada e commitada em produção)"
  - phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o
    plan: "17-02"
    provides: "Fixture de 3 oportunidades + os 5 specs decisivos do tracer em tests/security/psw-staff-isolation.test.ts, aguardando a policy que os torna verdes"
provides:
  - "current_assigned_opportunity_ids() — SECURITY DEFINER stable, setof uuid, InitPlan via (select auth.uid()), aplicada em produção"
  - "check_assignee_tenant() reescrito: aceita vínculo cross-tenant SOMENTE para psw_staff, mantém rejeição para os demais papéis, e D-10 (tenant_id da linha = da oportunidade) vale para TODOS os papéis"
  - "opportunities_select_psw_staff e tenants_select_psw_staff — policies aditivas de SELECT, escopadas às oportunidades atribuídas, aplicadas em produção sem tocar nenhuma policy existente"
  - "Prova quantitativa em produção do teste negativo decisivo (ACCESS-04): psw_staff impersonado vê 1 oportunidade de 43 no tenant atribuído"
  - "Achado registrado: seed de teste do Vitest usa o mesmo projeto Supabase de produção — apontar .env.test para ele seria perigoso; a pendência de Phase 7.5 provavelmente exige projeto separado"
affects: ["17-04", "17-05", "17-06", "17-07", "17-08"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fatia tracer: uma migration write-only mínima (SELECT-only, 2 tabelas) provada por smoke SQL manual em produção antes de expandir mecanicamente o mesmo padrão às demais tabelas (Plan 17-04)"
    - "Promoção temporária de role dentro de begin/rollback para simular um papel novo em smoke test sem deixar rastro em produção — usado nos casos (c)/(d) do handoff"
    - "Impersonação via set local role authenticated + set_config('request.jwt.claims', ...) para rodar o teste negativo decisivo por SQL puro quando .env.test está ausente"

key-files:
  created:
    - supabase/migrations/0040_psw_staff_access_core.sql
    - .planning/phases/17-acesso-multi-tenant-do-staff-psw-por-atribui-o/17-03-MIGRATION-HANDOFF.md
  modified:
    - .planning/WINDOWS.md

key-decisions:
  - "checkpoint:decision (Task 2) resolvido pelo PO: `reescrever-in-place` (a opção já implementada na 0040, recomendada pelo RESEARCH). `gate-de-quem-insere` foi descartada por quebrar o seed de teste e qualquer script por service-role (sem auth.uid() de admin), tornando a suíte inexecutável, além de ser redundante com a policy de INSERT admin-only da 0032. `tenants-sem-abertura` foi descartada por não entregar SC-7/ACCESS-08 — o psw_staff veria demandas de empresas diferentes sem conseguir distinguir de quem é cada uma."
  - "Revisão independente do orquestrador sobre a 0040, registrada como evidência: aditividade confirmada por quatro caminhos concretos — (1) as duas policies novas são PERMISSIVE, combinadas por OR; (2) todo drop policy if exists nomeia exclusivamente policies _psw_staff criadas por esta migration; (3) ambos os predicados abrem com current_user_role() = 'psw_staff' como short-circuit; (4) no trigger, dos 4 casos apenas o (c) muda, com (a)/(b)/(d) preservados — (d) inclusive para psw_staff. Confirmado que o predicado de opportunities é `id in (...atribuídas)`, não a variante por tenant que o teste negativo do ACCESS-04 existe para pegar."
  - "Handoff escrito no formato copiável-e-colável (bloco SQL único + queries de verificação com output esperado ao lado), pedido explícito do orquestrador espelhando o sucesso do padrão do Plan 17-01."

requirements-completed: [ACCESS-03, ACCESS-04, ACCESS-10]

coverage:
  - id: D1
    description: "Migration 0040 escrita e commitada: helper current_assigned_opportunity_ids() (setof uuid, stable, security definer, search_path=public), índice de suporte, check_assignee_tenant() reescrito, e as 2 policies aditivas de SELECT (opportunities/tenants) — escopo deliberadamente SELECT-only em 2 tabelas"
    requirement: ACCESS-03
    verification:
      - kind: other
        ref: "grep automatizado do plano (Task 1 <verify>): estrutura completa do SQL presente; zero policy pré-existente dropada (D-09); zero referência a is_platform_admin (D-06); escopo sem for insert/update/delete, storage.objects, invited_emails, audit_log, opportunity_tasks, opportunity_notes"
        status: pass
    human_judgment: false
  - id: D2
    description: "check_assignee_tenant() aceita vínculo cross-tenant SOMENTE para psw_staff nos 4 casos exigidos (mesmo tenant OK / outro tenant não-psw REJEITA / psw_staff qualquer tenant OK / tenant_id da linha ≠ oportunidade REJEITA, D-10), aplicado e verificado em produção"
    requirement: ACCESS-03
    verification:
      - kind: manual_procedural
        ref: "17-03-MIGRATION-HANDOFF.md § Resultado do apply, smoke tests (a)/(b)/(c)/(d) — rodados pelo PO via SQL Editor em begin/rollback, contra o banco de produção, após o apply real da 0040"
        status: pass
    human_judgment: false
  - id: D3
    description: "psw_staff vê exatamente as oportunidades atribuídas — teste negativo decisivo (não vê oportunidade não atribuída do mesmo tenant), ACCESS-04"
    requirement: ACCESS-04
    verification:
      - kind: manual_procedural
        ref: "17-03-MIGRATION-HANDOFF.md § Resultado do apply, smoke 7: psw_staff impersonado vê 1 oportunidade de 43 existentes no tenant atribuído (não as 43) — prova quantitativa rodada pelo PO contra produção"
        status: pass
    human_judgment: true
    rationale: "A prova real e quantitativa (1 de 43) veio de uma execução manual via SQL Editor contra produção, não da suíte automatizada do repo — tests/security/psw-staff-isolation.test.ts continua em describe.skipIf porque .env.test está ausente (Phase 7.5, carryover). Não afirmo que a suíte validou o tracer; fica para um humano confirmar que a suíte roda de verdade e chega ao mesmo veredito assim que .env.test for populado com um projeto Supabase de teste SEPARADO (achado desta sessão: apontar para o mesmo projeto de produção seria perigoso)."
  - id: D4
    description: "psw_staff e platform_admin permanecem papéis independentes — o helper novo não consulta is_platform_admin() e vice-versa (D-06, ACCESS-10)"
    requirement: ACCESS-10
    verification:
      - kind: other
        ref: "grep automatizado do plano (Task 1 <verify>): '0040 nao deve referenciar is_platform_admin' — zero ocorrências no corpo do SQL não-comentário"
        status: pass
    human_judgment: false
  - id: D5
    description: "Fecho visual do tracer: login como psw_staff em /opportunities mostrando a união das oportunidades atribuídas de tenants distintos, ocultando a não atribuída"
    verification: []
    human_judgment: true
    rationale: "Não executado nesta sessão — o executor não tem acesso a browser interativo. A prova comportamental equivalente foi feita via SQL (smoke 7 do handoff: 1 de 43), mas o fecho visual explícito pedido pelo <human-check> da Task 4 do plano segue pendente de confirmação humana. Registrado em .planning/WINDOWS.md (entrada #9)."

# Metrics
duration: ~2h (incluindo as pausas dos dois checkpoints — decisão do PO e apply manual da migration em produção)
completed: 2026-08-06
status: complete
---

# Phase 17 Plan 03: TRACER — helper de acesso, trigger reescrito e 2 policies aditivas Summary

**Migration `0040` aplicada em produção: `current_assigned_opportunity_ids()` (helper SECURITY DEFINER), `check_assignee_tenant()` reescrito (cross-tenant só para `psw_staff`, D-10 preservado para todos) e as policies aditivas `opportunities_select_psw_staff`/`tenants_select_psw_staff` — provadas por 7 verificações manuais em produção, incluindo o teste negativo decisivo com resultado quantitativo (1 oportunidade visível de 43 no tenant atribuído).**

## Performance

- **Duration:** ~2h (incluindo as pausas dos dois checkpoints: `checkpoint:decision` da Task 2, aguardando o PO escolher a opção de reescrita, e `checkpoint:human-action` da Task 3, aguardando o apply manual da migration no SQL Editor)
- **Started:** 2026-08-06T16:01:00-03:00 (aprox.)
- **Completed:** 2026-08-06T21:03:00Z (aprox.)
- **Tasks:** 4 (1 `tracer`, 1 `checkpoint:decision`, 1 `checkpoint:human-action`, 1 `auto`)
- **Files modified:** 3 (2 criados, 1 ledger atualizado)

## Accomplishments

- `supabase/migrations/0040_psw_staff_access_core.sql`: helper `current_assigned_opportunity_ids()` (`setof uuid`, `stable`, `security definer`, `search_path=public`, InitPlan via `(select auth.uid())`), índice `opportunity_assignees_profile_only_idx`, `check_assignee_tenant()` reescrito com a branch do papel novo (D-10 preservado para todos os papéis), e as duas policies aditivas `opportunities_select_psw_staff`/`tenants_select_psw_staff`. Escopo deliberadamente SELECT-only em 2 tabelas — escrita/tabelas filhas ficam para a `0041` (Plan 17-04).
- `checkpoint:decision` (Task 2) resolvido pelo PO: `reescrever-in-place`, a opção já implementada e recomendada pelo RESEARCH.
- `checkpoint:human-action` (Task 3) satisfeito: PO aplicou a `0040` no SQL Editor (2 execuções, prova de idempotência) e confirmou as 7 verificações pós-apply, incluindo os 4 smoke tests do trigger e o smoke do teste negativo decisivo com resultado quantitativo.
- **Aditividade (D-09) confirmada empiricamente em produção**: `opportunities` passou de 8 para 9 policies — as 8 pré-existentes intactas + a nova. Nenhuma policy antiga foi removida.
- **Prova quantitativa do ACCESS-04 em produção**: `psw_staff` impersonado vê **1 oportunidade de 43** existentes no tenant onde tem exatamente uma atribuição — a evidência concreta de que o predicado é "esta oportunidade atribuída", não "tenant onde há alguma atribuição".
- `npm run test:security`, `npx vitest run tests/security/psw-staff-isolation.test.ts` e `npm run typecheck` rodados: zero regressão além da baseline pré-existente e documentada (1 erro de typecheck em `report-strategic.test.ts:107`).
- Planos **17-04 em diante estão destravados**.

## Task Commits

Each task was committed atomically:

1. **Task 1 [TRACER]: Migration 0040 — helper, trigger reescrito, 2 policies aditivas** - `d40b442` (feat)
2. **Task 2 [DECISÃO one-way]: reescrever-in-place + abrir tenants** - sem commit próprio (decisão registrada neste SUMMARY; a `action` da task explicitamente diz "nada é aplicado nesta task")
3. **Task 3 [BLOCKING]: Handoff da migration 0040** - `6089075` (docs), atualizado com o resultado do apply em `b1e873a` (docs)
4. **Task 4: Fechar o tracer — verificação de suíte/typecheck, sem alteração de código** - sem commit próprio (nenhum ajuste de fixture foi necessário; `git diff --name-only HEAD -- tests/security` confirma zero edição em specs de isolamento existentes)

**Plan metadata:** (este commit — SUMMARY + STATE + ROADMAP)

## Files Created/Modified

- `supabase/migrations/0040_psw_staff_access_core.sql` - helper, índice, trigger reescrito, 2 policies aditivas (aplicado em produção)
- `.planning/phases/17-acesso-multi-tenant-do-staff-psw-por-atribui-o/17-03-MIGRATION-HANDOFF.md` - handoff de apply manual + resultado das 7 verificações
- `.planning/WINDOWS.md` - entradas #8 (suíte ainda skipada — novo achado sobre `.env.test` precisar de projeto separado) e #9 (fecho visual do tracer não executado)

## Decisions Made

- **Task 2 — `reescrever-in-place` confirmado pelo PO.** `gate-de-quem-insere` descartada por quebrar o seed de teste e qualquer script por service-role (sem `auth.uid()` de admin), tornando a suíte inexecutável, além de redundante com a policy de INSERT admin-only da `0032`. `tenants-sem-abertura` descartada por não entregar SC-7/ACCESS-08.
- **Revisão independente do orquestrador sobre a `0040` (registrada como evidência de revisão, não como substituto da verificação automatizada)**: aditividade confirmada por quatro caminhos concretos — (1) as duas policies novas são PERMISSIVE, combinadas por OR; (2) todo `drop policy if exists` nomeia exclusivamente policies `_psw_staff` criadas por esta migration; (3) ambos os predicados abrem com `current_user_role() = 'psw_staff'` como short-circuit; (4) no trigger, dos 4 casos apenas o (c) muda, com (a)/(b)/(d) preservados — (d) inclusive para `psw_staff`. Confirmado que o predicado de `opportunities` é `id in (...atribuídas)`, não a variante por tenant.
- **Handoff no formato copiável-e-colável** (bloco SQL único + verificações com output esperado ao lado de cada uma, incluindo os 4 smoke tests em `begin/rollback` e a impersonação via SQL do teste negativo), espelhando explicitamente o que funcionou no Plan 17-01.
- **Promoção temporária de role dentro de `begin/rollback`** nos smokes (c)/(d) do handoff — evita exigir um profile `psw_staff` pré-existente em produção só para o smoke test; a promoção e o vínculo são desfeitos pelo `rollback`, nada persiste.

## Deviations from Plan

### Auto-fixed Issues

Nenhuma — a Task 1 (`tracer`) foi executada exatamente como escrito no plano (a versão do trigger e do helper foi copiada verbatim do RESEARCH.md, conforme instruído), sem necessidade de correção de bug/funcionalidade faltante/bloqueio (Rules 1-3). Nenhuma mudança arquitetural foi necessária além da já prevista no `checkpoint:decision` da própria Task 2 (Rule 4 não se aplicou fora do fluxo já desenhado no plano).

**Total deviations:** 0 auto-fixed.
**Impact on plan:** Nenhum — plano executado como escrito em todas as 4 tasks; Task 4 não precisou de nenhum ajuste de fixture (a suíte de `tests/security/psw-staff-isolation.test.ts` permanece byte-idêntica à escrita no Plan 17-02).

## Issues Encountered

- **`tests/security/psw-staff-isolation.test.ts` continua em `describe.skipIf` — os 5 specs decisivos NÃO executaram nesta sessão.** `npx vitest run tests/security/psw-staff-isolation.test.ts --reporter=basic` confirma: 7 tests, 7 skipped, exit 0. **A migration `0040` já foi aplicada e provada em produção, mas isso NÃO torna a suíte verde** — o bloqueador é `.env.test` ausente, não mais o schema. **Não afirmo que a suíte validou o tracer.** A prova real e comportamental veio de sete verificações manuais rodadas pelo PO via SQL Editor contra produção (documentadas em `17-03-MIGRATION-HANDOFF.md § Resultado do apply`), com destaque para o resultado quantitativo do teste negativo decisivo: **1 oportunidade visível de 43 existentes** no tenant onde o `psw_staff` de teste tem exatamente uma atribuição — a prova concreta de que o predicado da policy é "esta oportunidade específica atribuída" e não "tenant onde há alguma atribuição" (o erro exato que o ACCESS-04 existe para pegar).
- **Achado novo desta sessão, relevante para o fechamento da fase** — *corrigido pelo orquestrador após inspeção do código; a primeira redação deste item estava errada no diagnóstico e subestimava a gravidade*: não é que o seed de teste "já exista em produção". É que as **fixtures colidem com UUIDs de produção**. `FGCOOP_TEST_ID` em `tests/setup/seed-test-tenants.ts` é `11111111-1111-1111-1111-111111111111`, o **mesmo UUID** do tenant FGCoop real criado pela migration `0002`; e `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` não é fixture, é o `admin.fgcoop@pswdigital.com.br` da mesma `0002`. Como o seed faz `upsert` com `onConflict: 'id'`, apontar `.env.test` para produção **renomearia o FGCoop real** para "FGCoop Test"/`fgcoop-test`, e `cleanupTestTenants()` **apagaria as oportunidades reais dele**. Ou seja: não é "perigoso", é destrutivo na primeira execução. A conclusão prática permanece (é preciso um projeto Supabase **separado**), mas a correção prioritária e barata é trocar os UUIDs das fixtures por uma faixa que não colida com dado real — isso transforma um apontamento errado de catástrofe em erro recuperável. Capturado em `.planning/todos/pending/fixtures-colidem-com-producao.md`. Os 33 vistos no smoke 7 eram oportunidades **reais do FGCoop**, o que não invalida o veredito: o 1-de-43 no tenant A segue sendo prova válida do ACCESS-04.
- **`npm run typecheck` e a suíte de segurança executável continuam com o mesmo baseline pré-existente, sem nenhuma nova falha**: `tsc --noEmit` — 1 erro pré-existente em `tests/opportunities/report-strategic.test.ts:107` (TS2322), documentado desde o Plan 17-01. `npm run test:security` — 5 arquivos executáveis passando (68 testes), 11 arquivos em skip (70 testes) — nenhuma regressão. `git diff --name-only HEAD -- tests/security` confirma que nenhum spec de isolamento existente, além do próprio `psw-staff-isolation.test.ts`, foi tocado; e o spec decisivo (`não vê oportunidade não atribuída do mesmo tenant`) continua no arquivo com a asserção original (`toEqual([])`), sem relaxamento.
- **O `<human-check>` visual da Task 4 (login como `psw_staff` em `/opportunities`) não foi executado** — o executor não tem acesso a browser interativo nesta sessão. A prova comportamental equivalente (SQL, 1 de 43) foi feita, mas o fecho visual explícito da UI fica pendente de confirmação humana (registrado em `.planning/WINDOWS.md` #9).

## User Setup Required

None — nenhuma configuração de serviço externo requerida por este plano. O apply da migration já foi feito pelo PO diretamente no Supabase Cloud SQL Editor, documentado no handoff.

## Next Phase Readiness

- `current_assigned_opportunity_ids()`, `check_assignee_tenant()` reescrito, e as 2 policies aditivas de SELECT estão em produção e provados por 7 verificações manuais — prontos para o Plan 17-04 expandir mecanicamente o mesmo padrão às tabelas filhas, Storage, `invited_emails` e `audit_log` (migration `0041`).
- **Bloqueador de qualidade de prova (não de código), agora mais preciso**: `.env.test` continua ausente, e o achado desta sessão sugere que a solução não é só popular o arquivo — é provisionar um projeto Supabase **separado** de teste, porque o projeto atual de produção já contém as fixtures do seed. Recomenda-se que isso seja resolvido antes do fechamento da fase (Plan 17-08 ou um plano dedicado), para que o teste negativo decisivo tenha veredito automatizado real, não apenas a prova manual pontual desta sessão.
- **Fecho visual do tracer pendente**: recomenda-se que o Plan 17-04 (ou uma verificação dedicada antes dele) inclua o login real como `psw_staff` em `/opportunities`, confirmando visualmente a união cross-tenant e a coluna/filtro de empresa quando esses existirem (SC-7, Plan 17-07).
- Nenhum arquivo de `tests/security/` pré-existente foi editado — ACCESS-07 preservado por construção.

---
*Phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o*
*Completed: 2026-08-06*

## Self-Check: PASSED

Todos os arquivos declarados (`supabase/migrations/0040_psw_staff_access_core.sql`, `17-03-MIGRATION-HANDOFF.md`, `.planning/WINDOWS.md`, `17-03-SUMMARY.md`) existem no disco. Todos os commits declarados (`d40b442`, `6089075`, `b1e873a`) existem em `git log --oneline --all`.
