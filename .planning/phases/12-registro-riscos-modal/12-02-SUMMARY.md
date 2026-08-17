---
phase: 12-registro-riscos-modal
plan: 02
subsystem: ui
tags: [nextjs, react, client-components, intercepting-routes, risk-register, modal]

# Dependency graph
requires:
  - phase: 12-registro-riscos-modal
    plan: 01
    provides: "fetchRisksForOpportunity/fetchRiskById, createRisk/updateRisk/deleteRisk, OpportunityRisk + enums, risk-labels.ts"
provides:
  - "Aba Risco do modal renderiza tabela estruturada (9 colunas, badges, ID Rxxx) — substitui campo legado de texto livre"
  - "RiskForm reusavel (dialog + pagina) + RiskFormDialog empilhado (z-[60], ?risco) + RiskFormPage fullscreen"
  - "DeleteRiskButton com confirmacao (D-06); refresh sem fechar o modal (D-05)"
  - "Rotas fullscreen reais riscos/new e riscos/[riskId]/edit (deep-link, D-02)"
affects: [phase-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Soft-path = dialog client empilhado dirigido por search param (?risco) — overlay z-[60] sobre o modal z-50 (modela DeleteButton); deep-link = rotas fullscreen reais nao-interceptadas (RESEARCH opcao c)"
    - "RSC pai busca dados de tab-client por props (risks espelha phases) — Pitfall 5: RiscoTab nao pode ser async RSC dentro de OpportunityDetail 'use client'"
    - "Helpers null-safe priorityLabel/priorityBadgeClass centralizam o branch de priority (Row e RiskPriority|null embora trigger sempre defina)"

key-files:
  created:
    - components/opportunities/modal/risk/RiskTable.tsx
    - components/opportunities/modal/risk/RiskForm.tsx
    - components/opportunities/modal/risk/RiskFormDialog.tsx
    - components/opportunities/modal/risk/RiskFormPage.tsx
    - components/opportunities/modal/risk/DeleteRiskButton.tsx
    - app/(app)/opportunities/[id]/riscos/new/page.tsx
    - app/(app)/opportunities/[id]/riscos/[riskId]/edit/page.tsx
  modified:
    - components/opportunities/modal/tabs/RiscoTab.tsx
    - components/opportunities/modal/OpportunityDetail.tsx
    - app/(app)/@modal/(.)opportunities/[id]/page.tsx
    - app/(app)/opportunities/[id]/page.tsx
    - lib/opportunities/risk-labels.ts

key-decisions:
  - "Helpers priorityLabel/priorityBadgeClass adicionados a risk-labels.ts (12-01) para tratar priority nullable de forma centralizada — additivo, sem mudar exports existentes (Rule 3)"
  - "Dialog fechado via router.replace(pathname) (remove ?risco) preservando o modal subjacente — aba/scroll mantidos (mesma arvore React)"
  - "RiskFormDialog montado uma vez dentro da RiscoTab, resolvendo `initial` da lista `risks` em memoria (sem fetch extra no client)"

requirements-completed: [RISK-01, RISK-02, RISK-03, RISK-05]

# Metrics
duration: 7min
completed: 2026-06-05
---

# Phase 12 Plan 02: UI da Aba Risco (CRUD no modal) Summary

**CRUD de riscos na aba Risco do modal — tabela estruturada (substitui o campo legado de texto livre), dialog de criacao/edicao empilhado (overlay z-[60] dirigido por ?risco), prioridade auto read-only (so apos salvar), exclusao com confirmacao e rotas fullscreen reais para deep-link — tudo wiring da camada do 12-01.**

> ⚠️ **STATUS: AGUARDANDO VERIFICACAO HUMANA.** Este plano termina num checkpoint `human-verify` (blocking). As 3 tasks de implementacao foram entregues, commitadas e passam tsc + suite verde, MAS a verificacao visual/funcional no navegador (CRUD + matriz de prioridade ao vivo + deep-link fullscreen + isolamento) ainda nao foi feita pelo usuario. NAO marcar a fase como completa ate o "approved".

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-05T12:29:35Z
- **Completed (impl):** 2026-06-05T12:36:55Z
- **Tasks:** 3 de implementacao (+ 1 checkpoint pendente)
- **Files:** 12 (7 criados, 5 modificados)

## Accomplishments
- **Aba Risco em tabela (RISK-05, D-03):** `RiscoTab` reescrito como client component recebendo `risks` por props do RSC pai; campo legado de texto livre `o.risco` REMOVIDO. Cabecalho "⚠️ Registro de Riscos — N registro(s)" + botao "+ Adicionar Risco".
- **RiskTable (D-01):** 9 colunas (`_giba:1198-1232`); ID = `R` + indice 1-based zero-padded; badges de tipo (emoji) e prioridade (cor); responsavel como chip; acoes ✏️/🗑️; vazio = "Nenhum risco registrado".
- **Fluxo de dados (Pitfall 5):** as duas `page.tsx` RSC (modal interceptado + fullscreen) buscam `fetchRisksForOpportunity` via `Promise.all` com `phases` e passam `risks` por props ate `RiscoTab`.
- **RiskForm reusavel (RISK-01):** campos `_giba:1242-1259`; `useTransition` -> `createRisk`/`updateRisk`; payload SEM `priority`/`tenant_id`/`opportunity_id` (T-12-06); prioridade READ-ONLY (D-04) — create "— (definida ao salvar)", edit badge da priority do trigger; responsavel texto livre + `<datalist>` (D-08).
- **RiskFormDialog (D-02 soft-path):** overlay empilhado `z-[60]` sobre o modal `z-50`, dirigido por `?risco=new|<id>`; fecha via `router.replace(pathname)` preservando o modal; ESC/click-outside; sucesso -> `router.refresh()` (D-05).
- **DeleteRiskButton (RISK-03, D-06):** overlay de confirmacao `z-[60]` (modela DeleteButton); confirm -> `deleteRisk` -> `router.refresh()`, NAO navega para fora (D-05).
- **Rotas fullscreen reais (D-02 deep-link):** `riscos/new/page.tsx` (RSC) e `riscos/[riskId]/edit/page.tsx` (RSC, `fetchRiskById` RLS-scoped -> `notFound()` cross-tenant, T-12-07). Zero intercept aninhada / zero slot `@riskModal` (anti-pattern travado).

## Task Commits

1. **Task 1: Aba Risco em tabela + risks via props do RSC pai** — `1308715` (feat)
2. **Task 2: RiskForm + RiskFormDialog (z-[60], ?risco) + RiskFormPage** — `fadda43` (feat)
3. **Task 3: DeleteRiskButton (confirmacao) + 2 rotas fullscreen reais** — `5f940cd` (feat)

## Decisions Made
- **Helpers null-safe de prioridade** (`priorityLabel`/`priorityBadgeClass` em `risk-labels.ts`): a coluna `priority` e `RiskPriority | null` no tipo Row (apesar do trigger sempre defini-la). Em vez de espalhar o branch por RiskTable e RiskForm, centralizei o fallback ("—" / classe slate). Adicao puramente aditiva ao modulo do 12-01.
- **Dialog por search param** (`?risco`) em vez de `useState` local: preserva back-button e deep-link parcial; fechar com `router.replace(pathname)` mantem a mesma arvore React montada (aba/scroll do modal preservados).
- **`initial` resolvido em memoria:** o `RiskFormDialog` montado na `RiscoTab` recebe `risks` por props e resolve o risco em edicao por `risks.find(...)` — sem fetch extra no client.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] priority nullable quebrava tsc**
- **Found during:** Task 1 (typecheck)
- **Issue:** `OpportunityRisk['priority']` e `RiskPriority | null` no tipo Row gerado; indexar `PRIORITY_BADGE_CLASS[r.priority]` / `PRIORITY_LABEL[r.priority]` dava `TS2538: Type 'null' cannot be used as an index type` em RiskTable e RiskForm (4 erros).
- **Fix:** adicionados helpers `priorityLabel(p)` e `priorityBadgeClass(p)` em `lib/opportunities/risk-labels.ts` (additivo, nao altera exports existentes) que tratam o `null` (exibe "—" / classe slate). RiskTable e RiskForm passam a usar os helpers.
- **Files modified:** `lib/opportunities/risk-labels.ts`, `components/opportunities/modal/risk/RiskTable.tsx`, `components/opportunities/modal/risk/RiskForm.tsx`
- **Commit:** `1308715` (helper + RiskTable), `fadda43` (RiskForm)

## Verification (impl gates — pre-checkpoint)
- `npx tsc --noEmit`: **clean** (0 erros).
- `npm run test`: **128 passed / 32 skipped (integracao skipIf) / 0 failed**.
- Acceptance greps das 3 tasks: todos passaram (ID Rxxx zero-padded, 10 `<th`, `z-[60]` em dialog+delete, `?risco`/`useSearchParams`, sem matriz no client, sem intercept aninhada/`@riskModal`, payload sem priority/tenant_id/opportunity_id).

## Out of scope / nao tocado
- `lib/ai/prompts.ts` (modificado pre-existente), `N8N/`, `_giba_wsi-dashboard.html` (untracked pre-existentes) — NAO commitados, fora do escopo deste plano.

## Threat Surface
Nenhuma superficie nova fora do `<threat_model>` do plano. Mitigacoes aplicadas:
- **T-12-06** (Tampering): RiskForm nao inclui `priority`/`tenant_id`/`opportunity_id` no payload; `riskInputSchema.strict()` (12-01) rejeitaria; prioridade read-only (D-04).
- **T-12-07** (Info Disclosure): rota edit fullscreen usa `fetchRiskById` (RLS) -> risco de outro tenant retorna null -> `notFound()`.
- **T-12-08** (Info Disclosure): rotas sob `(app)` ja protegidas pelo middleware de auth (Phase 3).

## Known Stubs
Nenhum. Toda a UI esta wired contra dados reais (`fetchRisksForOpportunity` -> props -> tabela; actions reais no submit/delete). A verificacao visual no navegador (checkpoint) confirma o round-trip.

## CHECKPOINT PENDENTE (human-verify, blocking)

Ver bloco "CHECKPOINT REACHED" retornado ao orquestrador. Resume-signal: usuario digita **"approved"** ou descreve os problemas. Apos approved, atualizar STATE/ROADMAP e marcar a fase 12 completa.

## Self-Check: PASSED

Todos os 12 arquivos (7 criados, 5 modificados) presentes em disco; os 3 commits de task (`1308715`, `fadda43`, `5f940cd`) presentes no git log. `tsc --noEmit` clean; suite 128 passed / 32 skipped / 0 failed.

---
*Phase: 12-registro-riscos-modal*
*Impl completed: 2026-06-05 — AGUARDANDO VERIFICACAO HUMANA*
