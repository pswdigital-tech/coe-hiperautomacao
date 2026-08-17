---
phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa
plan: 04
subsystem: ui
tags: [nextjs, server-actions, rbac, multi-tenant, react]

# Dependency graph
requires:
  - phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa (plan 18-02)
    provides: "Migration 0045 aplicada em produção: tabela psw_tenant_admins, RLS completa (select/insert/delete, sem update), trigger de coerência de papel, helpers current_admin_tenant_ids/effective_admin_tenant_ids/is_tenant_admin_of, e a fatia vertical SELECT+UPDATE em opportunities/tenants"
provides:
  - "Rota /admin/staff (Server Component) sob o guard platform_admin herdado — lista os psw_staff filtrando só por papel, nunca por tenant"
  - "lib/staff-admin/origins.ts — módulo puro com as duas origens de acesso, marcação de redundância, impacto de revogação (diferença de conjuntos) e concordância singular/plural/zero, testado sem banco"
  - "app/(app)/admin/staff/actions.ts — três Server Actions guardadas por isPlatformAdmin: grantTenantAdmin, revokeTenantAdmin, countRevokeImpact (sob demanda, nunca persistida)"
  - "GrantForm.tsx + RevokeGrantButton.tsx — formulário de concessão e diálogo de revogação quantificada, ambos client components sem shadcn/ui e sem diálogo nativo do browser"
  - "Resolução de concessão órfã (pessoa que deixou de ser psw_staff): aparece sinalizada na tela em vez de omitida (D-S)"
affects: [18-05, 18-06, 18-07, 18-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Módulo de lógica de negócio puro (lib/staff-admin/origins.ts) separado do JSX — mesma disciplina de lib/opportunities/score.ts: calculado em runtime, nunca persistido, testável sem banco/browser"
    - "Server Action de leitura sob demanda (countRevokeImpact) chamada no momento em que um diálogo abre, nunca uma prop estática do componente pai — evita número desatualizado"
    - "Reuso de helper existente (fetchOpportunityIdsForAssignee) em vez de uma query nova, para que um arquivo de Server Action possa ficar estruturalmente impedido (nem mencionar o nome da tabela) de se tornar um segundo ponto de escrita/leitura ad-hoc de uma tabela sensível"
    - "Linha expansível via <details>/<summary> nativo do HTML — Server Component permanece 100% servidor (sem 'use client'), sem estado de carregamento client-side, com expand/collapse por pessoa sem nenhum JavaScript"

key-files:
  created:
    - lib/staff-admin/origins.ts
    - tests/opportunities/staff-access-origins.test.ts
    - app/(app)/admin/staff/page.tsx
    - app/(app)/admin/staff/actions.ts
    - app/(app)/admin/staff/GrantForm.tsx
    - app/(app)/admin/staff/RevokeGrantButton.tsx
  modified: []

key-decisions:
  - "Linha por pessoa expansível implementada com <details>/<summary> nativo (não <table>/<tr> literal) — permite manter page.tsx como Server Component puro (sem 'use client', sem componente extra fora do files_modified do plano) com expand/collapse sem nenhum JavaScript"
  - "countRevokeImpact não menciona a string 'opportunity_assignees' em nenhum lugar de actions.ts (T-18-31/D-C): reusa fetchOpportunityIdsForAssignee (lib/opportunities/assignees.ts, já existente) e calcula a diferença de conjuntos contra os ids visíveis do tenant — o resultado é idêntico ao de filtrar por tenant, porque ids atribuídos fora do tenant concedido não entram no conjunto 'visível' e são ignorados pela subtração de conjuntos"
  - "GrantForm só recebe pessoas ATIVAS (role psw_staff) na lista de 'Pessoa' — concessões órfãs aparecem na tabela de leitura (D-S) mas nunca como opção concedível no formulário"

requirements-completed: [GRANT-07, GRANT-08, GRANT-09]

coverage:
  - id: D1
    description: "lib/staff-admin/origins.ts — módulo puro com buildStaffAccessOrigins, countOpportunitiesLostOnRevoke, formatRevokeImpact e isOrphanGrant, testado sem banco e sem browser"
    requirement: GRANT-07
    verification:
      - kind: unit
        ref: "tests/opportunities/staff-access-origins.test.ts (16 testes: blocos vazios, só concessão, só atribuição, redundância presente/ausente, impacto por diferença de conjuntos, concordância singular/plural/zero, concessão órfã)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Rota /admin/staff (Server Component) lista os psw_staff só por papel, resolve concessões órfãs, compõe as duas origens por pessoa via módulo puro, e nunca escreve em opportunity_assignees"
    requirement: GRANT-09
    verification:
      - kind: other
        ref: "npm run typecheck && npm run build (exit 0) + greps do <verify> do plano: nenhum verbo de escrita junto de opportunity_assignees, nenhuma menção à tabela em actions.ts, nenhum select(*), guard não duplicado, filtro só por papel"
        status: pass
    human_judgment: true
    rationale: "O <human-check> do plano ('Abrir /admin/staff logado como platform_admin… expandir uma linha mostra os DOIS blocos…') não foi executado nesta sessão — sem acesso a browser/servidor rodando com sessão autenticada. A verificação automatizada (typecheck, build, greps estruturais) confirma a forma do código; a leitura visual/funcional real na tela renderizada requer o PO."
  - id: D3
    description: "GrantForm.tsx (concessão com os estados exigidos, incl. 'pessoa já admin de todas as empresas') e RevokeGrantButton.tsx (diálogo quantificado buscando o impacto sob demanda) — GRANT-07/GRANT-08"
    requirement: GRANT-08
    verification:
      - kind: other
        ref: "npm run typecheck && npm run build (exit 0) + greps do <verify> do plano: sem diálogo nativo, sem shadcn/ui, sem font-semibold, com role=\"alert\", useTransition, formatRevokeImpact e title= presentes"
        status: pass
    human_judgment: true
    rationale: "O <human-check> do plano (conceder, tentar duplicar, revogar com 0/1/N, cancelar, confirmar sobrevivência das atribuições) não foi executado nesta sessão — mesma limitação de ambiente do D2. A verificação automatizada confirma estrutura e contrato de estados; o comportamento fim-a-fim requer o PO com sessão de platform_admin."

# Metrics
duration: ~14min
completed: 2026-08-07
status: complete
---

# Phase 18 Plan 04: `/admin/staff` — diagnóstico de duas origens + concessão/revogação Summary

**Tela `/admin/staff` (Server Component, sem `"use client"`) que lista os `psw_staff` por papel, mostra as duas origens de acesso (concessão de tenant vs. atribuição individual) sempre separadas e com redundância calculada em runtime, e concede/revoga via três Server Actions guardadas por `isPlatformAdmin()` — com a regra de negócio isolada em `lib/staff-admin/origins.ts`, um módulo puro testado por 16 testes de unidade.**

## Performance

- **Duration:** ~14min
- **Completed:** 2026-08-07
- **Tasks:** 3
- **Files modified:** 6 (todos criados)

## Accomplishments

- `lib/staff-admin/origins.ts`: 4 funções puras (`buildStaffAccessOrigins`, `countOpportunitiesLostOnRevoke`, `formatRevokeImpact`, `isOrphanGrant`) cobrindo a lógica de negócio da tela inteira, sem client Supabase, sem marcador só-servidor, sem React — 16 testes de unidade escritos ANTES da implementação (RED confirmado antes do GREEN).
- `/admin/staff`: Server Component que busca `psw_staff` por papel (nunca por tenant), resolve concessões órfãs numa consulta extra (para não sumirem da tela, D-S), monta o agregado por pessoa via o módulo puro, e renderiza linha expansível por pessoa com `<details>/<summary>` nativo (sem JavaScript, sem estado de carregamento client-side).
- `actions.ts`: três Server Actions (`grantTenantAdmin`, `revokeTenantAdmin`, `countRevokeImpact`) guardadas por `isPlatformAdmin`, com `revalidatePath`, mensagens de erro pt-BR genéricas (nunca a mensagem crua do banco) e **nenhuma menção** à tabela de atribuição individual em nenhuma linha do arquivo.
- `GrantForm.tsx`: formulário de concessão com os dois selects, submit desabilitado até pessoa+empresa terem valor, e o caso "pessoa já é admin de todas as empresas" tratado com opção desabilitada explícita (nunca um seletor vazio silencioso).
- `RevokeGrantButton.tsx`: diálogo de revogação modelado literalmente em `DeleteRiskButton.tsx`, buscando a contagem de impacto sob demanda (nunca uma prop estática) e formatando a frase final com concordância singular/plural/zero via `formatRevokeImpact`.
- Todos os greps estruturais do `<verify>` do plano confirmados: nenhum verbo de escrita junto de `opportunity_assignees`, nenhuma menção a essa tabela em `actions.ts`, nenhum `select(*)`, nenhum `font-semibold` em elemento novo, nenhum diálogo nativo do browser, nenhum componente de biblioteca não instalada.

## Task Commits

Cada task com arquivo próprio foi commitada atomicamente (Task 1 seguiu TDD — RED depois GREEN):

1. **Task 1a [RED]: testes de unidade das duas origens/redundância/impacto** — `b07e00c` (test)
2. **Task 1b [GREEN]: lib/staff-admin/origins.ts** — `c651212` (feat)
3. **Task 2: Server Component `/admin/staff` + Server Actions** — `6d49e65` (feat)
4. **Task 3: GrantForm + RevokeGrantButton** — `5070747` (feat)
5. **Correção pós-Task-2/3: GrantForm nunca lista pessoa órfã como concedível** — `27ed9ac` (fix, Rule 1)
6. **Correção pós-Task-3: diálogo de revogação não trava em "Calculando impacto…" quando a busca de impacto falha** — `fa1df0f` (fix, Rule 1)

## Files Created/Modified

- `lib/staff-admin/origins.ts` — módulo puro: as duas origens, redundância, impacto de revogação (diferença de conjuntos), concordância pt-BR, concessão órfã
- `tests/opportunities/staff-access-origins.test.ts` — 16 testes de unidade, sem banco e sem browser
- `app/(app)/admin/staff/page.tsx` — Server Component da tela, com resolução de órfãos e composição via o módulo puro
- `app/(app)/admin/staff/actions.ts` — as três Server Actions guardadas por `isPlatformAdmin`
- `app/(app)/admin/staff/GrantForm.tsx` — formulário de concessão (client component)
- `app/(app)/admin/staff/RevokeGrantButton.tsx` — diálogo de revogação quantificada (client component)

## Decisions Made

- **Linha expansível via `<details>/<summary>` nativo, não `<table>`/`<tr>` literal.** O plano descreve "linha extra com `colSpan`" no mockup ASCII, mas isso exigiria estado de abertura/fechamento por linha — e ou (a) `page.tsx` vira client component (proibido pelo `<verify>`: `grep -q "use client" && exit 1`), ou (b) um componente client novo por linha (fora do `files_modified` do plano, fixo em 6 arquivos). `<details>/<summary>` resolve os dois: é HTML nativo, funciona sem nenhum JavaScript, e mantém `page.tsx` 100% Server Component. Visualmente equivalente (mesma casca `bg-wh rounded-xl border border-bdr overflow-hidden`, mesmas colunas via flex em vez de `<table>`), com o chevron de `Icon.Chevron` rotacionando via `group-open:rotate-180`.
- **`countRevokeImpact` nunca menciona `opportunity_assignees` em `actions.ts`.** O `<verify>` do plano bane essa string inteira do arquivo (linha dedicada: `grep -q "opportunity_assignees" "$a" && exit 1`), mas a ação precisa saber quais oportunidades estão atribuídas nominalmente à pessoa. Resolvido reusando `fetchOpportunityIdsForAssignee` (helper já existente em `lib/opportunities/assignees.ts`, que faz a query e não vive em `actions.ts`) e calculando a diferença de conjuntos contra os ids **visíveis do tenant concedido** — como `countOpportunitiesLostOnRevoke` é diferença de conjuntos (não subtração de contagens), ids atribuídos fora do tenant simplesmente não entram na conta, então não é preciso (nem desejável, pela mesma T-18-31) filtrar a query por tenant.
- **`GrantForm` só recebe pessoas com papel `psw_staff` ativo.** Descoberto e corrigido antes de finalizar o plano (Rule 1): o array `people` de `page.tsx` mistura staff ativo com concessões órfãs para exibição na tabela; sem o filtro, uma pessoa órfã apareceria como opção selecionável no formulário de concessão — o trigger do banco rejeitaria, mas a UI não deveria nem oferecer a opção.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] GrantForm listava pessoa órfã como opção concedível**
- **Found during:** revisão pós-Task-3, antes da finalização do plano.
- **Issue:** `page.tsx` passava o array `people` completo (staff ativo + órfãos) para `GrantForm`, permitindo selecionar uma pessoa que já não é `psw_staff` como alvo de concessão.
- **Fix:** `GrantForm` agora só recebe `people.filter(p => !p.isOrphan)`; o formulário inteiro some quando não sobra nenhuma pessoa ativa.
- **Files modified:** `app/(app)/admin/staff/page.tsx`
- **Verification:** `npm run typecheck && npm run build` sai 0; greps do `<verify>` da Task 2 re-confirmados.
- **Committed in:** `27ed9ac`

**2. [Rule 1 - Bug] Diálogo de revogação preso em "Calculando impacto…" quando a contagem falha**
- **Found during:** revisão final do `RevokeGrantButton.tsx`.
- **Issue:** se `countRevokeImpact` retornasse erro, `impact` permanecia `null` para sempre e o corpo do diálogo mostrava "Calculando impacto…" indefinidamente, ao mesmo tempo em que o banner de erro já aparecia abaixo — estado confuso.
- **Fix:** corpo do diálogo passa a mostrar "Impacto não pôde ser calculado." quando há erro, distinto do estado de carregamento.
- **Files modified:** `app/(app)/admin/staff/RevokeGrantButton.tsx`
- **Verification:** `npm run typecheck && npm run build` sai 0; greps do `<verify>` da Task 3 re-confirmados.
- **Committed in:** `fa1df0f`

**3. [Rule 1 - Formatação] Contagem de redundantes ajustada para o formato literal do Copywriting Contract**
- **Found during:** revisão do bloco "Atribuições individuais" contra o `18-UI-SPEC.md`.
- **Issue:** a implementação inicial produzia `"(3, 1 redundantes)"`; o Copywriting Contract especifica `"{N} ({M} redundantes)"` — N fora dos parênteses, só o M dentro — e só quando M > 0.
- **Fix:** ajustado para `"3 (1 redundante)"` (com concordância singular/plural do próprio "redundante"), omitindo o parêntese inteiro quando M = 0.
- **Files modified:** `app/(app)/admin/staff/page.tsx`
- **Verification:** conferido manualmente contra a linha literal do §Copywriting Contract.
- **Committed in:** `27ed9ac` (mesmo commit da correção 1, arquivo único)

---

**Total deviations:** 3 auto-fixed (Rule 1 — todos bugs/formatação encontrados em revisão própria antes de considerar o plano concluído, nenhum mudou escopo)
**Impact on plan:** Nenhum impacto de escopo. Todas as correções necessárias para que o comportamento bata com os `must_haves`/prohibitions do próprio plano.

## Issues Encountered

- **`<human-check>` das Tasks 2 e 3 não executado.** Ambas as tasks têm blocos `<human-check>` dentro do `<verify>` (não são `type="checkpoint"`) pedindo verificação visual/funcional em `/admin/staff` com uma sessão real de `platform_admin` (expandir linha, conceder, tentar duplicar, revogar com 0/1/N, confirmar sobrevivência das atribuições). Esta sessão não tem acesso a browser nem a um servidor de desenvolvimento com sessão autenticada — só a verificação automatizada (`typecheck`, `build`, os greps estruturais do próprio `<verify>`) foi executada, e todos passaram. A verificação visual/funcional real fica pendente para o PO, registrada nos itens `human_judgment: true` da tabela `coverage` acima (D2/D3).
- Nenhum outro problema — sem migration nesta fase (nenhum arquivo em `supabase/migrations/` tocado), sem bloqueio de ambiente além do acima.

## User Setup Required

None - nenhuma configuração de serviço externo. A verificação visual em `/admin/staff` (ver "Issues Encountered" acima) fica como UAT pendente do PO, não como setup de ambiente.

## Next Phase Readiness

- `lib/staff-admin/origins.ts` está pronto para ser reusado por qualquer tela futura que precise das mesmas duas origens (nenhuma outra tela da fase precisa disso hoje).
- A tela `/admin/staff` é funcionalmente completa quanto ao escopo do plano (conceder, revogar, diagnosticar as duas origens); a única pendência é a verificação visual humana documentada acima.
- Plans 18-05 em diante (as 11 policies vivas via fonte única + Storage, `isTenantAdminOf`/`resolveAdminTenantId`) não dependem de nenhum artefato deste plano além do que a `0045` já provê — este plano é uma folha da árvore de dependências da fase (só consome, não é consumido por planos futuros da Wave 3+).

## Self-Check: PASSED

- FOUND: `lib/staff-admin/origins.ts`
- FOUND: `tests/opportunities/staff-access-origins.test.ts`
- FOUND: `app/(app)/admin/staff/page.tsx`
- FOUND: `app/(app)/admin/staff/actions.ts`
- FOUND: `app/(app)/admin/staff/GrantForm.tsx`
- FOUND: `app/(app)/admin/staff/RevokeGrantButton.tsx`
- FOUND: commit `b07e00c` (RED)
- FOUND: commit `c651212` (GREEN)
- FOUND: commit `6d49e65` (Task 2)
- FOUND: commit `5070747` (Task 3)
- FOUND: commit `27ed9ac` (fix)
- FOUND: commit `fa1df0f` (fix)
- `npm run typecheck` → exit 0
- `npm run build` → exit 0
- `npx vitest run tests/opportunities/staff-access-origins.test.ts` → 16 passed, exit 0

---
*Phase: 18-staff-psw-como-admin-de-tenant-concess-o-pessoa-empresa*
*Completed: 2026-08-07*
