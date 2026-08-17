---
phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o
plan: 01
subsystem: auth
tags: [postgres, enum, rls, rbac, supabase, typescript]

# Dependency graph
requires:
  - phase: 16-tarefas-e-subtarefas-por-oportunidade-lista-kanban-gantt
    provides: "migration 0037 (opportunity_tasks) aplicada; padrão write-only mode consolidado"
provides:
  - "Valor `psw_staff` no enum `tenant_role` (migration 0039, isolada, aplicada em produção)"
  - "`TenantRole` (hand-maintained) com 5 valores"
  - "`isPswStaff()` em lib/security/role.ts — espelho TypeScript do predicado SQL futuro"
  - "Rótulos pt-BR do papel novo nos dois `Record<TenantRole, string>` exaustivos"
  - "Decisão de timing do apply registrada (aplicar-agora) e apply confirmado pelo PO"
affects: ["17-02", "17-03", "17-04", "17-05", "17-06", "17-08"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Migration de enum isolada (par N → N+1, precedente 0020→0021): valor novo sozinho, sem nenhum objeto SQL que o referencie no mesmo arquivo"
    - "lib/database.types.ts hand-maintained: TenantRole editado manualmente, gen:types bloqueado"

key-files:
  created:
    - supabase/migrations/0039_psw_staff_role.sql
    - .planning/phases/17-acesso-multi-tenant-do-staff-psw-por-atribui-o/17-01-MIGRATION-HANDOFF.md
    - .planning/phases/17-acesso-multi-tenant-do-staff-psw-por-atribui-o/deferred-items.md
  modified:
    - lib/database.types.ts
    - lib/security/role.ts
    - components/shell/Sidebar.tsx
    - app/(app)/team/page.tsx

key-decisions:
  - "checkpoint:decision (Task 3) resolvido pelo PO com a opção `aplicar-agora`: aplicar a 0039 sem esperar `.env.test` — o ALTER TYPE ADD VALUE é aditivo e não muda comportamento de nenhum papel existente enquanto nada o referencia; a prova real de isolamento (specs de RLS) fica adiada para os gates das migrations 0040+."
  - "psw_staff fica deliberadamente fora da allowlist de convite do tenant_admin (lib/security/cargo.ts AccessRole) — D-05, verificado por grep."
  - "isPswStaff() colocado imediatamente abaixo de isPlatformAdmin em lib/security/role.ts, mesma forma de assinatura (Pick<CurrentProfile,'role'>|null), para virar o espelho direto do predicado SQL current_user_role() = 'psw_staff' que os planos 17-03+ vão introduzir."

requirements-completed: [ACCESS-01, ACCESS-02]

coverage:
  - id: D1
    description: "Migration 0039 isolada adiciona psw_staff ao enum tenant_role, sem nenhum objeto SQL que o referencie"
    requirement: ACCESS-01
    verification:
      - kind: other
        ref: "grep automatizado do plano (Task 1 <verify>): 1 alter type, zero create policy/function/constraint/table, cabeçalho com WRITE-ONLY MODE + IDEMPOTENTE"
        status: pass
    human_judgment: false
  - id: D2
    description: "TenantRole (hand-maintained), isPswStaff() e rótulos pt-BR nos dois Record<TenantRole,string> exaustivos"
    requirement: ACCESS-01
    verification:
      - kind: other
        ref: "grep automatizado do plano (Task 2 <verify>): psw_staff em database.types.ts/Sidebar.tsx/team/page.tsx, isPswStaff exportado, cargo.ts sem o papel novo, gate platform_admin preservado"
        status: pass
    human_judgment: false
  - id: D3
    description: "Apply da 0039 em produção (banco): enum com 5 valores, sem CHECK adicional em profiles.role, profile promovido autentica sem erro"
    requirement: ACCESS-02
    verification: []
    human_judgment: true
    rationale: "Apply é ação humana no SQL Editor do Supabase Cloud (write-only mode); PO confirmou sucesso verbalmente ('acabei de aplicar, pode seguir') mas não colou de volta os outputs query-a-query das 4 verificações do handoff (contagem exata do enum, ausência de CHECK, smoke de promoção+login, contagem de profiles promovidos). Fica como item de acompanhamento — ver 'Issues Encountered'."

# Metrics
duration: ~21min
completed: 2026-08-06
status: complete
---

# Phase 17 Plan 01: Migration isolada `psw_staff` + tipos + gate de apply Summary

**Enum `tenant_role` ganha o valor `psw_staff` numa migration isolada (0039, já aplicada em produção), com `isPswStaff()` como espelho TypeScript do predicado de RLS que as migrations seguintes vão introduzir.**

## Performance

- **Duration:** ~21 min (incluindo a pausa do checkpoint:decision, resolvida pelo PO)
- **Started:** 2026-08-06T15:20:00-03:00 (aprox.)
- **Completed:** 2026-08-06T15:41:37-03:00
- **Tasks:** 4 (2 `auto` + 1 `checkpoint:decision` + 1 `checkpoint:human-action`)
- **Files modified:** 7 (2 criados na Task 1/4, 4 modificados na Task 2, 1 criado de acompanhamento)

## Accomplishments
- `supabase/migrations/0039_psw_staff_role.sql` — um único `alter type tenant_role add value if not exists 'psw_staff'`, write-only, idempotente, sem nenhum objeto que o referencie (D-08). **Aplicada pelo PO em produção.**
- `lib/database.types.ts`: `TenantRole` ganha o 5º valor, comentado explicando que o multi-tenant do `psw_staff` vem de `opportunity_assignees`, nunca de `profiles`.
- `lib/security/role.ts`: `isPswStaff()` exportado, espelhando `isPlatformAdmin()` em forma, com JSDoc explicando a distinção de `platform_admin` (D-06).
- `components/shell/Sidebar.tsx` / `app/(app)/team/page.tsx`: rótulos pt-BR (`Staff PSW` / `Staff PSW (externo)`) nos dois `Record<TenantRole, string>` exaustivos, sem alterar o gate do seletor de empresa (continua exclusivo de `platform_admin`, D-03).
- `checkpoint:decision` (Task 3) resolvido: PO escolheu `aplicar-agora`.
- `checkpoint:human-action` (Task 4) satisfeito: PO aplicou a migration no SQL Editor e confirmou sucesso. `17-01-MIGRATION-HANDOFF.md` redigido no passado, registrando o apply.
- Planos **17-02 em diante estão destravados**.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 0039 — valor `psw_staff` no enum `tenant_role`, sozinho** - `7be4102` (feat)
2. **Task 2: Tipos hand-maintained, rótulos pt-BR e `isPswStaff()`** - `ba7a8d7` (feat)
3. **Task 3: [DECISÃO one-way] Aplicar `ALTER TYPE` em produção** - sem commit próprio; decisão registrada neste SUMMARY (não produz artefato de código — a `action` da task explicitamente diz "não aplicar nada aqui")
4. **Task 4: Handoff e apply manual da 0039** - `75a085b` (docs)

**Plan metadata:** (este commit — SUMMARY + STATE + ROADMAP)

## Files Created/Modified
- `supabase/migrations/0039_psw_staff_role.sql` - migration isolada do valor de enum, aplicada em produção
- `lib/database.types.ts` - `TenantRole` com `psw_staff`
- `lib/security/role.ts` - `isPswStaff()` exportado
- `components/shell/Sidebar.tsx` - rótulo `Staff PSW` em `roleLabel`
- `app/(app)/team/page.tsx` - rótulo `Staff PSW (externo)` em `ROLE_LABEL`
- `.planning/phases/17-acesso-multi-tenant-do-staff-psw-por-atribui-o/17-01-MIGRATION-HANDOFF.md` - handoff redigido no passado, registrando o apply confirmado pelo PO
- `.planning/phases/17-acesso-multi-tenant-do-staff-psw-por-atribui-o/deferred-items.md` - registro de falhas pré-existentes fora de escopo (typecheck/test)

## Decisions Made

- **Task 3 — timing do apply: `aplicar-agora`.** Racional do PO/orquestrador: destrava imediatamente os planos 17-02 em diante; o `alter type` é aditivo e não muda comportamento de nenhum papel existente enquanto nada o referenciar; a suíte de testes roda em skip mode e `npm run test` continua com o mesmo resultado de antes (nenhuma regressão introduzida). Em troca, os specs de RLS decisivos desta fase (inclusive o teste negativo que é a razão de a fase existir) ficam em `describe.skipIf` até `.env.test` ser populado — a prova real de isolamento fica adiada para os gates das migrations `0040`/`0041` (planos 17-03+).
- **`isPswStaff()` colocado imediatamente abaixo de `isPlatformAdmin()`**, mesma assinatura, para deixar explícito que os dois papéis são distintos e não hierárquicos (D-06) — decisão de forma, não de arquitetura.
- **`lib/security/cargo.ts` intocado** — `AccessRole` permanece com 3 valores; `psw_staff` fica fora da allowlist de convite do `tenant_admin` por construção (D-05), verificado por grep negativo.

## Deviations from Plan

### Auto-fixed Issues

Nenhuma — as duas tasks `auto` foram executadas exatamente como escrito no plano, sem necessidade de correção de bug/funcionalidade faltante/bloqueio (Rules 1-3). Nenhuma mudança arquitetural foi necessária (Rule 4 não se aplicou).

**Total deviations:** 0 auto-fixed.
**Impact on plan:** Nenhum — plano executado como escrito nas Tasks 1 e 2.

## Issues Encountered

- **`npm run typecheck` e `npm run test` têm falhas pré-existentes, não relacionadas a este plano.** `tests/opportunities/report-strategic.test.ts:107` (TS2322, `null` não atribuível a `number | undefined`) e 2 specs de `tests/wizard/state.test.ts` (mensagens de erro divergentes) falham igualmente **com ou sem** as mudanças deste plano — confirmado com `git stash` antes de cada commit. Introduzidas no commit `aaf8e5a` (redesign da aba Relatório), fora do escopo dos arquivos deste plano (`SCOPE BOUNDARY`). Registradas em `deferred-items.md` e em `.planning/WINDOWS.md` (entrada #6; a entrada #1, da Phase 16, já cobria o mesmo erro de typecheck). Todos os greps de verificação específicos deste plano (`psw_staff` em `TenantRole`, `isPswStaff`, rótulos pt-BR, ausência em `cargo.ts`, gate `platform_admin` preservado) passam isoladamente.
- **Verificação pós-apply não devolvida query-a-query.** O PO confirmou o sucesso do apply da `0039` de forma geral ("acabei de aplicar, pode seguir") mas não colou de volta os resultados das 4 queries de verificação do handoff (contagem exata de valores do enum, ausência de CHECK adicional em `profiles.role`, smoke de promoção + login, contagem de profiles promovidos). Isto não bloqueou a continuação da fase — o PO confirmou explicitamente e autorizou seguir — mas fica como item de acompanhamento: rodar as 4 queries de `17-01-MIGRATION-HANDOFF.md` na próxima janela de acesso ao SQL Editor, para fechar o registro com evidência concreta.
- **Débito herdado: `.env.test` continua ausente.** Só existe `.env.test.example` no repo. Sem um `.env.test` apontando para um Supabase Cloud de **teste**, os specs de segurança desta fase (`describe.skipIf(!process.env.NEXT_PUBLIC_SUPABASE_URL)`) continuarão em skip mode e passando sem verificar nada — pendência aberta desde a Phase 7.5. **Isto importa diretamente para os planos 17-02, 17-03 e 17-05**, cujos specs decisivos (incluindo o teste negativo que é a razão de a fase existir) só terão veredito real depois que `.env.test` for populado.

## User Setup Required

None - nenhuma configuração de serviço externo requerida por este plano (o apply da migration já foi feito pelo PO diretamente no Supabase Cloud SQL Editor, documentado no handoff).

## Next Phase Readiness

- Enum `tenant_role` com `psw_staff` já em produção; `lib/database.types.ts`, `isPswStaff()` e os dois mapas de rótulo prontos para os planos seguintes consumirem.
- Planos **17-02 em diante destravados**.
- **Bloqueador de qualidade de prova (não de código):** `.env.test` ausente — os planos 17-02/17-03/17-05 vão escrever specs de RLS que rodarão em skip mode até essa pendência (Phase 7.5) ser resolvida. Recomenda-se popular `.env.test` com um projeto Supabase Cloud de teste antes do apply da `0040` (Plan 17-03, TRACER), para que o teste negativo decisivo daquele plano seja verificação real.
- Verificação query-a-query do apply da `0039` (4 queries do handoff) ainda não devolvida pelo PO — recomenda-se rodar e colar o resultado na próxima interação com o SQL Editor, para fechar o registro com evidência.

---
*Phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o*
*Completed: 2026-08-06*

## Self-Check: PASSED

Todos os arquivos declarados (`0039_psw_staff_role.sql`, `17-01-MIGRATION-HANDOFF.md`, `17-01-SUMMARY.md`, `deferred-items.md`, `lib/database.types.ts`, `lib/security/role.ts`, `components/shell/Sidebar.tsx`, `app/(app)/team/page.tsx`) existem no disco. Todos os commits declarados (`7be4102`, `ba7a8d7`, `75a085b`, `2353c8b`) existem em `git log --oneline --all`.
