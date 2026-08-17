---
phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o
plan: 08
subsystem: auth
tags: [rbac, multi-tenant, invites, assignees, psw-staff, next.js, supabase]

# Dependency graph
requires:
  - phase: 17-07
    provides: "Listagem unificada cross-tenant com coluna/filtro Empresa; isPswStaff/getCurrentProfile em lib/security/role.ts; fetchTenantsByIds em lib/tenants/queries.ts"
  - phase: 17-04
    provides: "Migration 0041 — CHECK de invited_emails aceitando 'psw_staff', policy invited_emails_insert_tenant_admin barrando o tenant_admin, e check_task_tenant_coherence() aceitando psw_staff atribuído como responsável de tarefa"
provides:
  - "fetchTaskAssignableProfiles / fetchAssignableProfilesForPlatformAdmin em lib/opportunities/assignees.ts"
  - "Os 5 pontos de resolução de responsável de tarefa usando a listagem por oportunidade"
  - "Painel de atribuição de [id]/page.tsx com lista ampliada só para platform_admin"
  - "Sinalização de empresa no cabeçalho da oportunidade para o staff PSW (Header.tsx/OpportunityDetail.tsx)"
  - "createInvite aceitando 'psw_staff' com tenant_id server-derived; InviteForm.tsx com a opção; page.tsx rotulando"
  - "lib/database.types.ts (hand-maintained) com invited_emails.role incluindo 'psw_staff' — fecha WINDOWS.md #14"
affects: [ship-gate, gsd-verify-work, "próxima fase que toque convites/atribuição/responsável de tarefa"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Listas de 'quem pode ser X' compostas por UNION+dedupe sobre a função base (fetchAssignableProfiles), nunca reimplementando a query nem a degradação de cargo (42703)"
    - "Papel novo (psw_staff) só entra em allowlists explícitas citadas por comentário — cargo.ts e team/actions.ts continuam sem menção (D-05), reforçado por grep no verify"
    - "Tenant do papel privilegiado derivado do ator logado (platform_admin), nunca do formulário — mesma premissa documentada em 2 lugares (assignees.ts e invites/actions.ts)"

key-files:
  created: []
  modified:
    - "lib/opportunities/assignees.ts"
    - "app/(app)/opportunities/[id]/page.tsx"
    - "app/(app)/opportunities/[id]/tarefas/page.tsx"
    - "app/(app)/opportunities/[id]/tarefas/new/page.tsx"
    - "app/(app)/opportunities/[id]/tarefas/[taskId]/new/page.tsx"
    - "app/(app)/opportunities/[id]/tarefas/[taskId]/edit/page.tsx"
    - "components/opportunities/modal/Header.tsx"
    - "components/opportunities/modal/OpportunityDetail.tsx"
    - "app/(app)/admin/invites/actions.ts"
    - "app/(app)/admin/invites/InviteForm.tsx"
    - "app/(app)/admin/invites/page.tsx"
    - "lib/database.types.ts"
    - "tests/security/psw-staff-isolation.test.ts"

key-decisions:
  - "page.tsx (painel de atribuição) usa fetchAssignableProfilesForPlatformAdmin — NÃO fetchTaskAssignableProfiles — porque monta candidatos a RECEBER atribuição, não candidatos já atribuídos; os outros 4 call sites de responsável de tarefa usam fetchTaskAssignableProfiles direto"
  - "Cabeçalho da oportunidade: sinalização de empresa implementada em Header.tsx/OpportunityDetail.tsx (fora dos files_modified do frontmatter) porque page.tsx delega todo o markup do cabeçalho a esses dois componentes — sem tocá-los a truth do plano (sinalização visível no cabeçalho) seria inalcançável"
  - "Convite de psw_staff: quando o papel é o novo, tenant_mode/tenant_id/new_company do formulário são todos ignorados; tenant_id gravado = profile do platform_admin logado (mesma premissa de assignees.ts)"
  - "lib/database.types.ts (hand-maintained) widened para invited_emails.role incluir 'psw_staff' + @ts-expect-error removido em tests/security/psw-staff-isolation.test.ts — fecha WINDOWS.md item #14 (achado do Plan 17-05), marcado 'fixed' no ledger"

patterns-established:
  - "Grep de proibição bidirecional (cargo.ts E team/actions.ts sem 'psw_staff') como verify automatizado de D-05, reusável em fases futuras que adicionem papéis privilegiados"

requirements-completed: [ACCESS-09, ACCESS-11]

coverage:
  - id: D1
    description: "psw_staff atribuído a uma oportunidade aparece como responsável possível nas tarefas dessa oportunidade (e só dela) — fetchTaskAssignableProfiles nos 5 call sites"
    requirement: "ACCESS-11"
    verification:
      - kind: other
        ref: "grep automatizado do <verify> da Task 1 (fetchTaskAssignableProfiles presente nos 5 arquivos, consulta opportunity_assignees, cargo.ts/team actions.ts sem o papel novo) + npm run typecheck + npm run build"
        status: pass
      - kind: e2e
        ref: "Roteiro E do gate visual (Task 3) — NÃO executado nesta sessão (sem browser)"
        status: unknown
    human_judgment: true
    rationale: "A lógica de filtragem (papel + vínculo em opportunity_assignees) foi provada por grep/build/typecheck, mas nenhum teste automatizado abre o select de responsável na tela e confirma visualmente que o staff PSW aparece só na oportunidade certa — isso é exatamente o roteiro E do checkpoint humano (Task 3), ainda pendente."
  - id: D2
    description: "platform_admin convida alguém como psw_staff pela tela existente de convites, com tenant_id server-derived; tenant_admin de cliente não vê a opção nem consegue forçá-la"
    requirement: "ACCESS-09"
    verification:
      - kind: other
        ref: "grep automatizado do <verify> da Task 2 (createInvite/InviteForm com psw_staff, guard isPlatformAdmin mantido, cargo.ts/team actions.ts sem o papel, nenhum arquivo novo em app/(app)/admin) + npm run typecheck + npm run build + npx vitest run"
        status: pass
      - kind: e2e
        ref: "Roteiro G do gate visual (Task 3) — NÃO executado nesta sessão (sem browser)"
        status: unknown
    human_judgment: true
    rationale: "O guard server-side e a allowlist foram provados por grep/build, mas só o roteiro G do checkpoint humano confirma visualmente que o seletor de empresa some ao escolher o papel novo e que o tenant_admin não enxerga a opção — sem browser este agente não pode reproduzir isso."

# Metrics
duration: ~55min de execução ativa
completed: 2026-08-07
status: awaiting_human_verification   # Tasks 1-2 commitadas; Task 3 (checkpoint:human-verify, roteiros A-G) NAO executada nesta sessao — sem acesso a browser
---

# Phase 17 Plan 08: Staff PSW como responsável de tarefa + convite pelo platform_admin Summary

**`fetchTaskAssignableProfiles`/`fetchAssignableProfilesForPlatformAdmin` levam o staff PSW atribuído à lista de responsável de tarefa e ao painel de atribuição do `platform_admin`; `createInvite` aceita o papel `psw_staff` com tenant server-derived pela tela de convites já existente — a fase fica pronta para uso humano, faltando apenas o fecho visual dos 7 roteiros A–G.**

## Performance

- **Duration:** ~55min de execução ativa
- **Started:** 2026-08-07T06:50:00Z (aprox.)
- **Completed (Tasks 1-2):** 2026-08-07T10:00:00Z (aprox.)
- **Tasks:** 2 de 3 (`auto` completas); Task 3 (`checkpoint:human-verify`, BLOCKING) pendente
- **Files modified:** 13

## Accomplishments

- `lib/opportunities/assignees.ts` ganhou `fetchTaskAssignableProfiles` (responsável de tarefa: pessoas do tenant + `psw_staff` atribuído àquela oportunidade específica — espelha `check_task_tenant_coherence()`, 0041) e `fetchAssignableProfilesForPlatformAdmin` (candidatos a atribuição, quando quem opera é `platform_admin`: pessoas do tenant + `psw_staff` do tenant da PSW). Ambas compostas sobre `fetchAssignableProfiles`, preservando a degradação de `cargo` ausente (42703).
- Os 5 pontos que resolvem responsável de tarefa (`tarefas/page.tsx`, `tarefas/new/page.tsx`, `tarefas/[taskId]/new/page.tsx`, `tarefas/[taskId]/edit/page.tsx` via `fetchTaskAssignableProfiles`; `[id]/page.tsx` via `fetchAssignableProfilesForPlatformAdmin` condicionado a `platform_admin`) passaram a oferecer exatamente quem o banco aceitaria.
- Cabeçalho da oportunidade (`Header.tsx`) sinaliza a empresa dona da oportunidade — 🏢 badge — só para o staff PSW; para os demais papéis o markup é idêntico ao de antes.
- `createInvite` (`app/(app)/admin/invites/actions.ts`) aceita `psw_staff` na allowlist server-side; quando esse é o papel, ignora a empresa do formulário (`tenant_mode`/`tenant_id`/`new_company`) e grava o convite no tenant do `platform_admin` logado. `InviteForm.tsx` ganhou a opção "Staff PSW" que, ao ser escolhida, esconde o seletor de empresa e mostra uma nota explicativa; `page.tsx` rotula o papel na listagem.
- Fechada a lacuna registrada em `WINDOWS.md` item #14 (achado do Plan 17-05): `lib/database.types.ts` (hand-maintained) agora inclui `'psw_staff'` no tipo de `invited_emails.role`, e o `@ts-expect-error` que contornava isso em `tests/security/psw-staff-isolation.test.ts` foi removido (ficaria como erro de compilação — directive não usada). Item marcado `fixed` no ledger via `gsd-tools windows fixed 14`.
- `npm run typecheck`, `npm run build` e `npx vitest run` confirmados limpos além da baseline pré-existente documentada pelo orquestrador (1 erro de tipo em `report-strategic.test.ts` e 7 falhas pré-existentes em 3 arquivos, ambos fora de escopo desta fase).

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: `assignees.ts` — pessoas atribuíveis incluindo staff PSW** - `4a06bd2` (feat)
2. **Task 2: Convite de `psw_staff` pela tela do `platform_admin` (ACCESS-09)** - `e4ac497` (feat, inclui o fechamento do gap `lib/database.types.ts`/teste)
3. **Task 3: [BLOCKING] Verificação visual de fechamento da fase** - NÃO executada nesta sessão (sem browser) — ver "Checkpoint Status" abaixo.

**Plan metadata:** commit deste SUMMARY + STATE/ROADMAP/WINDOWS — ver mensagem de commit seguinte a este arquivo.

## Files Created/Modified

- `lib/opportunities/assignees.ts` — `fetchTaskAssignableProfiles`, `fetchAssignableProfilesForPlatformAdmin`
- `app/(app)/opportunities/[id]/page.tsx` — painel de atribuição por papel + sinalização de empresa (busca `companyTenant` via `fetchTenantsByIds` só para `psw_staff`)
- `app/(app)/opportunities/[id]/tarefas/page.tsx`, `.../tarefas/new/page.tsx`, `.../tarefas/[taskId]/new/page.tsx`, `.../tarefas/[taskId]/edit/page.tsx` — listagem de responsável por oportunidade
- `components/opportunities/modal/Header.tsx`, `components/opportunities/modal/OpportunityDetail.tsx` — prop `companyName`/`tenantName` threading até o badge do cabeçalho
- `app/(app)/admin/invites/actions.ts` — `createInvite` com o papel novo e tenant server-derived
- `app/(app)/admin/invites/InviteForm.tsx` — seletor de papel controlado + opção "Staff PSW" + nota explicativa
- `app/(app)/admin/invites/page.tsx` — `ROLE_LABEL`/`InviteRow['role']` com `psw_staff`
- `lib/database.types.ts` — `invited_emails.{Row,Insert,Update}.role` inclui `'psw_staff'`
- `tests/security/psw-staff-isolation.test.ts` — remoção dos 2 `@ts-expect-error` agora obsoletos

## Decisions Made

- `page.tsx` usa `fetchAssignableProfilesForPlatformAdmin` (não `fetchTaskAssignableProfiles`) para o painel de atribuição — são listas com propósito diferente: candidatos a RECEBER atribuição vs. quem JÁ está atribuído e pode ser responsável de tarefa.
- Sinalização de empresa implementada em `Header.tsx`/`OpportunityDetail.tsx`, fora do `files_modified` original do plano — necessário porque `page.tsx` delega o markup do cabeçalho a esses componentes; sem tocá-los a truth "sinalização visível no cabeçalho" seria inalcançável (Rule 2 — funcionalidade crítica faltante para cumprir o must-have do plano).
- Fechamento do gap `lib/database.types.ts`/`@ts-expect-error` (instrução explícita do orquestrador, não do PLAN.md original) incluído no commit da Task 2, por estar no mesmo domínio (`invited_emails.role`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Sinalização de empresa exigiu tocar `Header.tsx` e `OpportunityDetail.tsx`, não listados em `files_modified`**
- **Found during:** Task 1
- **Issue:** O must-have "cabeçalho da oportunidade sinaliza de qual empresa é" não é implementável só em `[id]/page.tsx` — o cabeçalho (badges, avatar, score) é renderizado por `ModalHeader` (`Header.tsx`), chamado de dentro de `OpportunityDetail.tsx`. `page.tsx` não tem acesso a esse JSX.
- **Fix:** Adicionada prop opcional `companyName`/`tenantName` (default `null`, sem mudança de comportamento para quem não a passa) threading de `page.tsx` → `OpportunityDetail` → `ModalHeader`, renderizando um badge 🏢 no mesmo estilo dos badges existentes (`AiEnrichmentBadge`).
- **Files modified:** `components/opportunities/modal/Header.tsx`, `components/opportunities/modal/OpportunityDetail.tsx`
- **Verification:** `npm run build` limpo; único call site de `OpportunityDetail` é `[id]/page.tsx` (grep confirmado) — sem regressão de outros consumidores.
- **Committed in:** `4a06bd2` (Task 1 commit)

**2. [Instrução explícita do orquestrador, não deviation espontânea] `lib/database.types.ts` + remoção de `@ts-expect-error`**
- **Found during:** Task 2 (mesmo domínio: `invited_emails.role`)
- **Issue:** WINDOWS.md #14 (achado do Plan 17-05) — o tipo hand-maintained não refletia o CHECK ampliado pela 0041, exigindo `@ts-expect-error` no teste de isolamento.
- **Fix:** Ampliado `'member' | 'tenant_admin' | 'viewer'` → `+ 'psw_staff'` nas 3 formas (`Row`/`Insert`/`Update`) de `invited_emails`; removidos os 2 `@ts-expect-error` agora obsoletos (ficariam como erro TS "unused directive" assim que o tipo widened).
- **Files modified:** `lib/database.types.ts`, `tests/security/psw-staff-isolation.test.ts`
- **Verification:** `npm run typecheck` mostra só o 1 erro pré-existente documentado (`report-strategic.test.ts`); `gsd-tools windows fixed 14` marca o item resolvido no ledger.
- **Committed in:** `e4ac497` (Task 2 commit)

---

**Total deviations:** 1 auto-fix (Rule 2) + 1 fechamento de gap instruído explicitamente pelo orquestrador.
**Impact on plan:** Ambos necessários para que os must-haves do plano fossem de fato alcançáveis; nenhum escopo além do estritamente necessário (nenhuma dependência nova, nenhuma rota/tela nova).

## Issues Encountered

Nenhum imprevisto técnico. O trabalho de código do plano (Tasks 1 e 2) já estava presente na working tree no início desta sessão (commits WIP não finalizados de uma execução anterior) — verificado linha a linha contra o PLAN.md antes de prosseguir; nenhuma reescrita foi necessária, só a conclusão dos call sites e arquivos restantes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**A fase 17 NÃO está fechada.** Código, testes automatizados e build estão prontos; falta o **checkpoint:human-verify (Task 3, BLOCKING)** — este agente não tem acesso a browser e não pode executá-lo. Ver "Checkpoint Status" abaixo para o roteiro exato que o PO precisa seguir.

## Checkpoint Status

**Task 3 é `checkpoint:human-verify` (BLOCKING) — NÃO EXECUTADA NESTA SESSÃO.** Nenhum dos 7 roteiros (A–G) foi verificado visualmente; nenhum critério visual é reivindicado como confirmado por este SUMMARY.

**Conta de QA já provisionada em produção** (não modificar/apagar): `qa.pswstaff@pswdigital.com.br` / `QaPswStaff!2026`, papel `psw_staff`, atribuída a exatamente 2 oportunidades — Natura (`seq_id 9`) e Unidasul (`seq_id 50`, de 43 no tenant).

Roteiro para o PO (URLs relativas ao domínio de produção do app):

**A. Listagem unificada (SC-7/ACCESS-08)** — logar como `qa.pswstaff@pswdigital.com.br`, abrir `/opportunities`.
Esperado: 2 linhas exatas (Natura seq 9, Unidasul seq 50) — **NÃO** as outras 42 oportunidades da Unidasul; coluna "Empresa" visível; filtro "Empresa" restringe corretamente; Sidebar sem seletor de empresa do `platform_admin`.

**B. Abas populadas (SC-4/ACCESS-05)** — abrir a oportunidade da Unidasul (seq 50) ou da Natura (seq 9) em `/opportunities/{id}`.
Esperado: cabeçalho mostra o badge 🏢 com o nome da empresa; abas de tarefas/riscos/notas/documentos/responsáveis populadas (não vazias); nomes de responsáveis (não ids/espaços em branco).

**C. Download de anexo (SC-4/D-12)** — na mesma oportunidade, baixar um documento anexado.
Esperado: download sem 403.

**D. Escrita (SC-5/ACCESS-06)** — criar uma tarefa, mudar status, adicionar nota, editar um campo; **recarregar a página** (F5, não só olhar a mensagem de sucesso).
Esperado: todas as alterações persistem após o reload. Se algo voltar ao valor antigo após reload, é o bug de escrita silenciosa — relatar imediatamente.

**E. Responsável de tarefa (SC-11/ACCESS-11)** — abrir o select de responsável de uma tarefa da oportunidade atribuída ao `qa.pswstaff`.
Esperado: `qa.pswstaff` aparece na lista junto das pessoas da empresa; selecionar e salvar funciona. Numa OUTRA oportunidade da mesma empresa à qual ele NÃO está atribuído, ele NÃO deve aparecer.

**F. Isolamento do cliente (SC-6/ACCESS-07)** — logar como um `member` comum de uma empresa (ex.: FGCoop ou Unidasul).
Esperado: listagem exatamente como antes da fase — sem coluna/filtro de empresa, só as demandas da própria empresa.

**G. Convite e atribuição (SC-9/ACCESS-09)** — logar como `platform_admin`, abrir `/admin/invites`, escolher papel "Staff PSW" (o seletor de empresa deve sumir e mostrar a nota explicativa), convidar um e-mail de teste; depois abrir uma oportunidade de qualquer empresa e, no painel de atribuição, confirmar que uma pessoa da PSW aparece como candidata e a atribuição cross-tenant é aceita. Em seguida, logar como `tenant_admin` de um cliente e abrir a tela de Equipe: a opção "Staff PSW" **não** deve existir, e o painel de atribuição dele **não** deve oferecer pessoas de fora da própria empresa.

**A fase só é considerada fechada quando os 7 roteiros forem confirmados** (ou as divergências registradas com o critério do ROADMAP afetado e a camada da falha) e um SUMMARY revisado marcar `status: complete`.

## Self-Check: PASSED

- FOUND: `lib/opportunities/assignees.ts` — `fetchTaskAssignableProfiles`, `fetchAssignableProfilesForPlatformAdmin`
- FOUND: `app/(app)/opportunities/[id]/page.tsx`, `.../tarefas/page.tsx`, `.../tarefas/new/page.tsx`, `.../tarefas/[taskId]/new/page.tsx`, `.../tarefas/[taskId]/edit/page.tsx`
- FOUND: `components/opportunities/modal/Header.tsx`, `components/opportunities/modal/OpportunityDetail.tsx`
- FOUND: `app/(app)/admin/invites/actions.ts`, `InviteForm.tsx`, `page.tsx`
- FOUND: `lib/database.types.ts`, `tests/security/psw-staff-isolation.test.ts`
- FOUND commits: `4a06bd2` (Task 1), `e4ac497` (Task 2)
- CONFIRMED: `npm run typecheck` → só o erro pré-existente documentado; `npm run build` → limpo; `npx vitest run` → `7 failed | 296 passed | 121 skipped` (idêntico à baseline do orquestrador, sem regressão)
- CONFIRMED: `scripts/qa/` continua untracked, não tocado (`git status --short` confirma `?? scripts/qa/`)

---
*Phase: 17-acesso-multi-tenant-do-staff-psw-por-atribui-o*
*Completed (Tasks 1-2): 2026-08-07 — Task 3 (checkpoint visual) pendente*
