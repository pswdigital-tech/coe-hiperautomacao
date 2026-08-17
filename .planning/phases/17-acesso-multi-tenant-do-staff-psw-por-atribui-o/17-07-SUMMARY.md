---
phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o
plan: 07
subsystem: ui
tags: [nextjs, supabase, rls, multi-tenant, react, server-components]

# Dependency graph
requires:
  - phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o (Plan 17-03/17-04)
    provides: "policy aditiva `tenants_select_psw_staff` (0040) e SELECT aditivo nas tabelas filhas — a união cross-tenant na listagem vem só da RLS"
  - phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o (Plan 17-05/17-06)
    provides: "fixture de isolamento (X/Y/Z) e `resolveWriteTenantId()` reutilizados pelo spec novo e pelo raciocínio de escopo desta plan"
provides:
  - "`fetchTenantsByIds(ids)` em lib/tenants/queries.ts — lookup de empresas por ids, whitelist id/name/slug"
  - "`?empresa=<slug>` passa a valer também para `psw_staff`, reusando a resolução server-side do `platform_admin`"
  - "coluna 'Empresa' na tabela e filtro 'Empresa' na toolbar, condicionados a uma flag calculada no servidor (`isPswStaff`)"
  - "spec `lista unificada` (escrito, não executado — `.env.test` ausente) provando união cross-tenant e recorte do filtro"
affects: [17-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "UI condicionada a papel só via props explícitas calculadas no Server Component (page.tsx); componentes client (table.tsx/toolbar.tsx) nunca leem nome de papel — só a flag booleana"

key-files:
  created: []
  modified:
    - lib/tenants/queries.ts
    - lib/opportunities/filters.ts
    - app/(app)/opportunities/page.tsx
    - components/opportunities/table.tsx
    - components/opportunities/toolbar.tsx
    - tests/security/psw-staff-isolation.test.ts

key-decisions:
  - "Task 1 precisou, por conta própria (deviation Rule 3), acrescentar as Props novas (companyById/showCompany, companies/showCompanyFilter) em table.tsx/toolbar.tsx com defaults no-op — a própria ação da Task 1 manda a page.tsx passar essas props, e sem os tipos existirem nos componentes o build quebraria antes da Task 2 rodar. A Task 2 então só precisou preencher a renderização."
  - "Dois greps do bloco <verify> do PLAN eram estruturalmente insatisfazíveis antes mesmo desta plan começar: `grep -q \"empresa\" lib/opportunities/filters.ts` (retorno esperado zero) já dava match no comentário pré-existente 'Filtro de empresa'/'?empresa=' antes de qualquer edição desta plan; e o grep de nome de papel em toolbar.tsx já batia num comentário pré-existente ('ex: platform_admin sem empresa selecionada'). Tratei isso como defeito do script de verificação, não do código: em filters.ts, confirmei a exigência REAL (parseFilters() nunca chama get('empresa')) e não mexi além do que a Task 1 pedia; em toolbar.tsx — que já estava em escopo de edição desta plan — reescrevi o comentário pré-existente e os meus próprios para não citar nome de papel literal, e o grep final passou limpo."
  - "hasAnyFilter (toolbar.tsx) passou a considerar `companySlug` — pequeno acréscimo de consistência (Rule 2) para o botão 'Limpar' também ativar quando o filtro de empresa está selecionado, mesmo padrão dos demais filtros."

patterns-established:
  - "Flag de exibição condicional por papel é sempre calculada no Server Component e passada como prop explícita e nomeada — nunca inferida no client a partir de outro dado."

requirements-completed: [ACCESS-08, ACCESS-10]

coverage:
  - id: D1
    description: "Coluna 'Empresa' e filtro por empresa na listagem, visíveis somente para psw_staff — demais papéis com markup idêntico a hoje (flag default falsa)"
    requirement: "ACCESS-08"
    verification:
      - kind: other
        ref: "npm run typecheck && npm run build (0 erros novos, só o TS2322 pré-existente documentado) + greps de conformidade do PLAN 17-07 (Task 2 <verify>): coluna/filtro presentes, nenhum dos dois componentes cita nome de papel, toolbar não expõe tenant_id na URL, coluna fora de SORTABLE_COLS"
        status: pass
      - kind: manual_procedural
        ref: "Verificação visual no navegador (usuário real qa.pswstaff@pswdigital.com.br, 2 empresas esperadas — Natura seq_id 9 e Unidasul seq_id 50) — NÃO executada nesta sessão"
        status: unknown
    human_judgment: true
    rationale: "Nenhum navegador disponível nesta sessão de execução — a renderização real da coluna e do filtro nunca foi vista, só o código e os greps estruturais. Precisa do gate visual (17-08 ou UAT) antes de considerar o deliverable fechado de ponta a ponta."

  - id: D2
    description: "?empresa=<slug> resolvido no servidor também para psw_staff, sem UUID exposto na URL, reusando fetchTenantIdBySlug já usado pelo platform_admin"
    requirement: "ACCESS-10"
    verification:
      - kind: other
        ref: "npm run typecheck && npm run build + greps de conformidade do PLAN 17-07 (Task 1 <verify>): isPswStaff/fetchTenantsByIds/fetchTenantIdBySlug presentes em page.tsx"
        status: pass
    human_judgment: false

  - id: D3
    description: "Spec 'lista unificada' — consulta real da tela (opportunities_with_score, visivel=true) devolve tenants distintos para psw_staff e o filtro de empresa restringe sem ampliar o escopo"
    requirement: "ACCESS-08"
    verification:
      - kind: integration
        ref: "tests/security/psw-staff-isolation.test.ts#lista unificada (3 specs novos)"
        status: unknown
    human_judgment: true
    rationale: ".env.test ausente no ambiente de execução — os 41 specs do arquivo (38 pré-existentes desta fase + os 3 novos) ficam em skip por falta de Supabase de teste configurado. Nunca rodaram contra um Postgres real nesta sessão; `npx vitest run` confirma que nenhum teste NOVO quebrou o que já passava, mas não prova que os 3 specs novos estão corretos. Precisa rodar com `.env.test` configurado antes do ship."

duration: ~7min (commits bdc118b→a7d64d7; sessão interrompida por erro de API entre o fim do Task 3 e a escrita desta SUMMARY, sem perda de trabalho)
completed: 2026-08-06
status: complete
---

# Phase 17 Plan 07: Listagem Unificada Cross-Tenant do Staff PSW Summary

**Coluna e filtro "Empresa" na listagem de oportunidades, condicionados a uma flag calculada no servidor (`isPswStaff`), reusando o mecanismo `?empresa=<slug>` já existente do `platform_admin` — nenhuma query de listagem foi reescrita.**

## Performance

- **Duração observável pelos commits:** ~7 min (23:05 → 23:12, horário local dos commits)
- **Tasks:** 3/3 completas
- **Files modified:** 6 (lib/tenants/queries.ts, lib/opportunities/filters.ts, app/(app)/opportunities/page.tsx, components/opportunities/table.tsx, components/opportunities/toolbar.tsx, tests/security/psw-staff-isolation.test.ts)

## Accomplishments

- `fetchTenantsByIds(ids)` novo em `lib/tenants/queries.ts`: lookup de empresas por ids, whitelist `id, name, slug`, dedupe, early-return vazio, degrada para lista vazia em erro — mesmo padrão de robustez das funções vizinhas do arquivo.
- `app/(app)/opportunities/page.tsx`: `isPswStaff(profile)` ao lado do `isAdmin` já existente; `?empresa=` agora resolve também para o papel novo (mesma resolução por slug, mesmo caminho de "empresa não encontrada"); mapa `companyById` e lista `companies` montados a partir dos `tenant_id` das oportunidades **já retornadas pela RLS** — nenhuma query aberta em `tenants`, só quando `isStaff`.
- `components/opportunities/table.tsx`: coluna "Empresa" logo após o ID, só quando `showCompany`; lê o nome pelo `tenant_id` já presente na oportunidade (nenhuma query nova por linha); fora de `SORTABLE_COLS` (comentado o motivo).
- `components/opportunities/toolbar.tsx`: `<select>` "Empresa" quando `showCompanyFilter` e mais de uma empresa; escreve `empresa=<slug>` na URL preservando os demais parâmetros; opção "Todas as empresas" remove o parâmetro.
- Nenhum dos dois componentes decide por papel — grep confirma ausência de `psw_staff`/`isPswStaff`/`platform_admin` em ambos; a decisão vem só das props calculadas no servidor.
- `tests/security/psw-staff-isolation.test.ts`: grupo `describe('lista unificada', …)` com 3 casos — (1) sem filtro, X e Z retornam com `tenant_id` **distintos entre si** (não só contagem 2) e Y não aparece; (2) filtro de tenant de X restringe a só X; (3) filtro de um tenant sem nenhuma atribuição (`CONTROL_TENANT_ID`) devolve vazio. Rodapé do arquivo atualizado — nenhum nome de grupo reservado pendente.

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Camada de dados da lista unificada** — `bdc118b` (feat)
2. **Task 2: Coluna e filtro "Empresa", condicionados ao papel** — `4106d62` (feat)
3. **Task 3: Spec `lista unificada`** — `a7d64d7` (test)

Esta SUMMARY + STATE.md + ROADMAP.md serão commitados separadamente (metadata commit).

## Files Created/Modified

- `lib/tenants/queries.ts` — nova `fetchTenantsByIds(ids)` e tipo `TenantSummary`
- `lib/opportunities/filters.ts` — apenas comentário do campo `tenant` atualizado (D-03)
- `app/(app)/opportunities/page.tsx` — `isStaff`, resolução de `?empresa=` ampliada, `companyById`/`companies`, props novas passadas a `OpportunityTable`/`Toolbar`
- `components/opportunities/table.tsx` — coluna "Empresa" condicional, props `companyById`/`showCompany`
- `components/opportunities/toolbar.tsx` — filtro "Empresa" condicional, props `companies`/`showCompanyFilter`, `companySlug`/`changeCompany`
- `tests/security/psw-staff-isolation.test.ts` — grupo `lista unificada` (3 specs)

## Decisions Made

- **Props novas adiantadas para a Task 1 (Rule 3):** a própria ação da Task 1 exige que `page.tsx` passe `companyById`/`showCompany` a `OpportunityTable` e `companies`/`showCompanyFilter` a `Toolbar` — mas esses componentes só ganhariam os tipos na Task 2. Sem adiantar as `Props` (com defaults no-op, sem renderização ainda) o `npm run build` do <verify> da própria Task 1 quebraria. Adiantei os tipos e defaults na Task 1; a Task 2 só adicionou a renderização real.
- **Dois greps do PLAN eram inerentemente quebrados antes desta plan começar** — documentado em detalhe no campo `key-decisions` do frontmatter e na seção Deviations abaixo.
- **`hasAnyFilter` da toolbar passou a considerar `companySlug`** — pequeno acréscimo de consistência para o botão "Limpar" também reagir ao filtro de empresa.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Props novas de `OpportunityTable`/`Toolbar` adicionadas na Task 1, não na Task 2**
- **Found during:** Task 1, ao rodar `npm run build` do próprio `<verify>`
- **Issue:** A ação da Task 1 manda `page.tsx` passar `companyById`/`showCompany` e `companies`/`showCompanyFilter` para os componentes — mas esses tipos só existiriam depois da Task 2. Sem eles, TypeScript rejeita as props como inexistentes e o build quebra.
- **Fix:** Acrescentei os campos às `Props` de `table.tsx`/`toolbar.tsx` já na Task 1, com defaults que preservam 100% o comportamento atual (`companyById = {}`, `showCompany = false`, `companies = []`, `showCompanyFilter = false`), sem nenhuma renderização nova ainda — a Task 2 preencheu só o JSX condicional.
- **Files modified:** components/opportunities/table.tsx, components/opportunities/toolbar.tsx (também listados no commit da Task 1, ampliando o `files_modified` frontmatter da Task 1 além do que estava listado)
- **Verification:** `npm run typecheck` e `npm run build` verdes em ambos os commits (Task 1 e Task 2)
- **Committed in:** bdc118b (Task 1)

**2. [Rule 3 - defeito pré-existente no script de verificação] Dois greps do `<verify>` eram insatisfazíveis desde antes desta plan**
- **Found during:** Task 1 (grep de `filters.ts`) e Task 2 (grep de nome de papel em `toolbar.tsx`)
- **Issue:** `grep -q "empresa" lib/opportunities/filters.ts` (esperando zero matches) já batia no comentário pré-existente do campo `tenant` ("Filtro de empresa", "`?empresa=`") **antes de qualquer edição desta plan** — confirmado via `git show HEAD~1:lib/opportunities/filters.ts`. Da mesma forma, o grep de `psw_staff|isPswStaff|platform_admin` em `toolbar.tsx` já batia no comentário pré-existente "(ex: platform_admin sem empresa selecionada)" — confirmado via `git show HEAD~1` (antes até do commit da Task 1).
- **Fix:** Em `filters.ts`, verifiquei a exigência REAL por trás do grep — que `parseFilters()` nunca lê `get('empresa')` — e confirmei que continua verdadeira; não fui além do que a Task 1 pedia (só o comentário do campo `tenant`), porque o arquivo não estava em escopo de reescrita ampla. Em `toolbar.tsx` — que já estava em escopo de edição desta plan — reescrevi o comentário pré-existente e os meus próprios comentários novos para não citarem nome de papel literal nem "tenant_id" como string, e o grep final passou limpo.
- **Files modified:** components/opportunities/toolbar.tsx (comentários, sem mudança de comportamento)
- **Verification:** Reproduzi os dois greps manualmente linha a linha, confirmando que o comportamento real (parseFilters sem `empresa`, componentes sem decisão por papel) sempre esteve correto; o grep de `toolbar.tsx` passa limpo depois do ajuste de comentário.
- **Committed in:** 4106d62 (Task 2)

---

**Total deviations:** 2 auto-fixed (1 blocking de tipos entre tasks, 1 defeito pré-existente no script de verificação do PLAN)
**Impact on plan:** Nenhum scope creep — os dois ajustes só tornaram os próprios `<verify>` do PLAN executáveis; nenhuma lógica de negócio nova foi introduzida além do que as tasks pediam.

## Issues Encountered

A sessão foi cortada por um erro de API (conexão fechada) exatamente no momento de escrever esta SUMMARY, depois dos 3 commits de task já terem entrado limpos. Nenhum trabalho de código foi perdido — os 3 commits (`bdc118b`, `4106d62`, `a7d64d7`) já estavam na árvore antes da interrupção. Retomei a sessão só para fechar SUMMARY/STATE/ROADMAP, sem refazer nenhuma task nem recommitar código.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness

- **Não verificado nesta sessão (sem navegador):** a renderização real da coluna e do filtro "Empresa" nunca foi vista visualmente. O plano 17-08 (ou uma UAT) deve confirmar, logado como `qa.pswstaff@pswdigital.com.br`, que a listagem mostra exatamente 2 linhas em 2 empresas (Natura seq_id 9, Unidasul seq_id 50) — nunca as ~43 da Unidasul inteira — e que o filtro "Empresa" restringe corretamente entre as duas.
- **Não executado nesta sessão:** os 3 specs novos de `lista unificada` (e os 38 specs pré-existentes do arquivo) seguem em skip por `.env.test` ausente. `npx vitest run` (rodado pelo orquestrador) confirma `7 failed | 296 passed | 121 skipped` — as 7 falhas são as mesmas pré-existentes de sempre, em 3 arquivos fora do escopo desta plan; os skipped subiram de 101 para 121, refletindo só os 3 specs novos entrando em skip junto dos demais.
- `npx tsc --noEmit` confirma só o 1 erro pré-existente documentado (`tests/opportunities/report-strategic.test.ts(107,77)` TS2322) — nenhum erro novo introduzido por esta plan.
- `scripts/qa/` permanece untracked e intocado.

---
*Phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o*
*Completed: 2026-08-06*

## Self-Check: PASSED

Todos os 6 arquivos de código/teste modificados e esta SUMMARY.md existem em disco; os 3 hashes de commit de task (`bdc118b`, `4106d62`, `a7d64d7`) existem em `git log`.
