---
phase: 16-tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt
plan: 03
subsystem: testing
tags: [supabase, rls, postgres-trigger, vitest, multi-tenant, rbac]

# Dependency graph
requires:
  - phase: 16-tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt
    provides: "migration 0037_opportunity_tasks.sql aplicada e verificada em produção (16-01) — tabela, enum task_status, triggers de guarda, RLS"
provides:
  - "Prova automatizada de que o trigger check_task_depth() rejeita 3º nível de hierarquia via INSERT e via UPDATE de re-parentamento (Pitfall 1)"
  - "Prova automatizada de que o trigger check_task_tenant_coherence() rejeita assignee/tenant/parent de outro tenant ou outra oportunidade"
  - "Prova automatizada de isolamento RLS cross-tenant de opportunity_tasks nos 4 verbos + cascade da oportunidade"
  - "Prova automatizada do gate de escrita D-11 (todos os papéis exceto viewer)"
affects: [16-04, 16-05, 16-06, 16-07, gsd-ship]

tech-stack:
  added: []
  patterns:
    - "Testes de trigger via serviceRoleClient() de propósito (bypassa RLS, exercita o trigger que vale pra todo mundo)"
    - "Testes de RLS via cliente autenticado com JWT (asFgcoop()), nunca service-role, com releituras via service-role para confirmar 'o outro tenant continua intacto'"
    - "Promoção/reversão temporária de role em describe aninhado (fixture no beforeAll do bloco, não spec própria) para não inflar a contagem de it() além do especificado"

key-files:
  created:
    - tests/schema/task-depth-guard.test.ts
    - tests/schema/task-tenant-coherence.test.ts
    - tests/security/opportunity-tasks-isolation.test.ts
    - tests/security/opportunity-tasks-viewer-write.test.ts
  modified: []

key-decisions:
  - "Testes dos dois triggers usam serviceRoleClient() deliberadamente — o alvo é o trigger (security definer, roda para qualquer chamador), não a policy de RLS."
  - "Isolamento RLS ganhou uma 6ª spec (cascade da oportunidade) além das 5 do espelho de riscos — prova o on delete cascade de opportunity_id que sustenta a limpeza de fixtures das outras suítes."
  - "A promoção a viewer no teste de autorização de escrita virou fixture (beforeAll de describe aninhado 'papel viewer'), não um it() próprio, para bater exatamente com os 7 blocos it() pedidos pelo plano (3 member + 1 leitura viewer + 3 escrita bloqueada viewer)."

patterns-established:
  - "Suíte de guarda de trigger (2 níveis + coerência de tenant) como par de arquivos em tests/schema/, espelhando risk-priority-matrix.test.ts na forma mas testando comportamento de trigger contra o banco vivo, não uma função pura."

requirements-completed: [TASK-02, TASK-03, TASK-04]

coverage:
  - id: D1
    description: "Trigger check_task_depth() rejeita 3º nível de hierarquia (INSERT de subtarefa-de-subtarefa e UPDATE de re-parentamento de tarefa com filhos), aceita re-parentamento legítimo entre raízes e rejeita auto-referência"
    requirement: "TASK-02"
    verification:
      - kind: integration
        ref: "tests/schema/task-depth-guard.test.ts (6 specs)"
        status: unknown
    human_judgment: true
    rationale: "Suíte depende de credenciais Supabase Cloud de teste (.env.test) não disponíveis neste ambiente de execução — typecheck e a suíte completa rodaram e passaram, mas os 6 it() ficaram 'skipped' (comportamento correto do guard skipIf), não 'pass'. Um humano com acesso ao projeto de teste precisa rodar `npx vitest run tests/schema/task-depth-guard.test.ts` com .env.test preenchido para confirmar verde."
  - id: D2
    description: "Trigger check_task_tenant_coherence() rejeita assignee_id de outro tenant, tenant_id divergente da oportunidade e parent_task_id de outra oportunidade; aceita caminho feliz e assignee nulo"
    requirement: "TASK-03"
    verification:
      - kind: integration
        ref: "tests/schema/task-tenant-coherence.test.ts (6 specs)"
        status: unknown
    human_judgment: true
    rationale: "Mesma dependência de credenciais Supabase Cloud de teste do D1 — suíte skipada localmente, precisa rodar com .env.test preenchido."
  - id: D3
    description: "RLS de opportunity_tasks isola tenants nos 4 verbos (SELECT/UPDATE/DELETE silenciosos, INSERT com tenant_id forjado rejeitado) e cascade de opportunity_id remove as tarefas"
    requirement: "TASK-04"
    verification:
      - kind: integration
        ref: "tests/security/opportunity-tasks-isolation.test.ts (6 specs)"
        status: unknown
    human_judgment: true
    rationale: "Mesma dependência de credenciais Supabase Cloud de teste — suíte skipada localmente, precisa rodar com .env.test preenchido para confirmar verde contra o projeto de teste real."
  - id: D4
    description: "Gate de escrita D-11: member cria/edita/remove tarefas; viewer só lê (SELECT livre, INSERT/UPDATE/DELETE bloqueados e confirmados por releitura/contagem via service-role)"
    verification:
      - kind: integration
        ref: "tests/security/opportunity-tasks-viewer-write.test.ts (7 specs)"
        status: unknown
    human_judgment: true
    rationale: "Mesma dependência de credenciais Supabase Cloud de teste — suíte skipada localmente. `npm test` completo confirmou 239 passing / 7 failing (baseline pré-existente, documentado) / 80 skipped — sem regressão, mas o veredito verde das 25 specs novas (6+6+6+7) só é obtido com .env.test preenchido."

duration: 20min
completed: 2026-08-05
status: complete
---

# Phase 16 Plan 03: Testes automatizados dos triggers e RLS de opportunity_tasks Summary

**Quatro arquivos de spec (25 testes) que provam no banco — não na UI — a hierarquia de 2 níveis, a coerência de tenant do responsável, o isolamento multi-tenant e o gate de escrita por papel de `opportunity_tasks`.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-05T13:53:55Z
- **Tasks:** 3 (agrupando os 4 arquivos de spec pedidos pelo plano)
- **Files modified:** 4 (todos novos)

## Accomplishments
- `tests/schema/task-depth-guard.test.ts` — 6 specs do trigger `check_task_depth()`, incluindo o caso de re-parentamento (Pitfall 1) e auto-referência, via `serviceRoleClient()` de propósito.
- `tests/schema/task-tenant-coherence.test.ts` — 6 specs do trigger `check_task_tenant_coherence()`, incluindo assignee de outro tenant, tenant divergente e pai de outra oportunidade.
- `tests/security/opportunity-tasks-isolation.test.ts` — 6 specs de RLS cross-tenant (SELECT/UPDATE/DELETE/INSERT forjado/sanidade) + cascade da oportunidade, espelhando `opportunity-risks-isolation.test.ts`.
- `tests/security/opportunity-tasks-viewer-write.test.ts` — 7 specs do gate D-11 (member escreve, viewer só lê), espelhando `viewer-role-write-block.test.ts`, com reversão de role garantida no `afterAll`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Testes dos dois triggers de guarda — profundidade de 2 níveis e coerência de tenant** - `00d28ee` (test)
2. **Task 2: Isolamento RLS cross-tenant de opportunity_tasks** - `d675cf3` (test)
3. **Task 3: Autorização de escrita — viewer bloqueado, member liberado** - `833a066` (test)

**Plan metadata:** commit pendente (docs: complete plan) — ver commit seguinte a este arquivo.

## Files Created/Modified
- `tests/schema/task-depth-guard.test.ts` - 6 specs do trigger de 2 níveis (INSERT + UPDATE de re-parentamento + auto-referência)
- `tests/schema/task-tenant-coherence.test.ts` - 6 specs do trigger de coerência de tenant (assignee/tenant/parent)
- `tests/security/opportunity-tasks-isolation.test.ts` - 6 specs de RLS cross-tenant (4 verbos + sanidade + cascade)
- `tests/security/opportunity-tasks-viewer-write.test.ts` - 7 specs do gate de escrita por papel (D-11)

## Decisions Made
- Reusar `serviceRoleClient()` deliberadamente nos testes de trigger (Task 1) — o alvo é o comportamento do trigger `security definer`, que vale para qualquer chamador incluindo backend/service-role; testar só via RLS deixaria essa garantia sem prova.
- Adicionar uma 6ª spec de cascade em `opportunity-tasks-isolation.test.ts` que não existe no espelho de riscos, porque a limpeza de fixtures de todas as outras suítes desta fase depende do `on delete cascade` de `opportunity_id` funcionar de verdade.
- Estruturar o bloco `viewer` de `opportunity-tasks-viewer-write.test.ts` como `describe` aninhado com a promoção de role no `beforeAll` (fixture do bloco), não como `it()` próprio — mantém a contagem exata de 7 specs pedida pelo plano em vez de 8.

## Deviations from Plan

None - plan executado exatamente como escrito. Os 4 arquivos, a estrutura de fixtures, as assertions (`toEqual([])`, `error.not.toBeNull()`, releituras/contagens via service-role) e os cabeçalhos em pt-BR seguem os `read_first` e `acceptance_criteria` de cada task.

## Issues Encountered
None. `npm run typecheck` e `npm test` rodaram limpos contra o baseline pré-existente conhecido (1 erro de typecheck em `tests/opportunities/report-strategic.test.ts:107`; 7 testes falhando em `tests/public-form/steps.test.ts`, `tests/wizard/state.test.ts` e `tests/opportunities/v03-pure-logic.test.ts`, todos documentados como não relacionados a esta fase). Contagem final: 239 passing / 7 failing / 80 skipped (55 do baseline + 25 novos desta plan, todos pulados por falta de `.env.test` neste ambiente — comportamento correto do guard `skipIf`).

## User Setup Required

None - nenhuma configuração de serviço externo é necessária para os arquivos em si. **Porém**, para obter o veredito verde real (não apenas "pulado") das 25 specs novas, é preciso um projeto Supabase Cloud **de teste** com as migrations 0001..0037 aplicadas e `.env.test` preenchido com `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` — o mesmo pré-requisito que já vale para todas as suítes irmãs em `tests/schema/` e `tests/security/`. Isso é responsabilidade do PO/verificador (ver memória "Supabase type-gen blocked" — MCP não tem acesso a este projeto).

## Next Phase Readiness
- As verificações não-negociáveis 1, 2, 3 e 5 do `16-VALIDATION.md` agora têm cada uma pelo menos um comando automatizado associado.
- 16-04 (rollup + Lista completa), 16-05 (Kanban), 16-06 (Gantt) e 16-07 podem prosseguir sem depender desta plan (era paralela ao tracer 16-02, não bloqueante).
- Pendência explícita para `/gsd-ship` ou verificação humana: rodar as 4 suítes novas contra um projeto Supabase Cloud de teste real para confirmar o veredito verde (hoje confirmado apenas "pulado, nunca vermelho, sem credenciais").

## Self-Check: PASSED

- FOUND: tests/schema/task-depth-guard.test.ts
- FOUND: tests/schema/task-tenant-coherence.test.ts
- FOUND: tests/security/opportunity-tasks-isolation.test.ts
- FOUND: tests/security/opportunity-tasks-viewer-write.test.ts
- FOUND: .planning/phases/16-tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt/16-03-SUMMARY.md
- FOUND commit 00d28ee (Task 1)
- FOUND commit d675cf3 (Task 2)
- FOUND commit 833a066 (Task 3)

---
*Phase: 16-tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt*
*Completed: 2026-08-05*
