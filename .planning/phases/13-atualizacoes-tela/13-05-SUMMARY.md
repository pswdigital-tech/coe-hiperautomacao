---
phase: 13-atualizacoes-tela
plan: 05
subsystem: modal-edit
tags: [modal, view-05, editable, wizard-recipe, updateOpportunity, derived-readonly, wave-2]

# Dependency graph
requires:
  - phase: 13-atualizacoes-tela
    plan: 01
    provides: "lib/opportunities/rpa.ts deriveRpaScore — recompute read-only ao vivo do RPA Fit"
  - phase: 13-atualizacoes-tela
    plan: 04
    provides: "Modal display de 8 abas unificadas lendo first-class v0.2 — base sobre a qual a edição é montada"
  - phase: 11-wizard-fluxo-unico
    provides: "WizardShell recipe (state machine mode='edit') + CriteriosStep/BeneficiosStep/PriorizacaoStep puros + opportunityToFormData + validateStep + fields.tsx"
  - phase: 10-backend-queries-validation-score
    provides: "updateOpportunity (opportunityInputSchema.strict() + tenant server-derived) + calcScore/priorityLevel + deriveFteBucket"
provides:
  - "Modal de detalhe EDITÁVEL em modo global (D-12/D-13/D-15): Editar destrava as 8 abas; Salvar persiste UM payload via updateOpportunity; Cancelar descarta"
  - "Derivados (score/priority/FTE bucket/rpa_score) recalculados ao vivo, read-only, NUNCA no payload"
  - "opportunityToFormData corrigido: semeia fte_horas + extras XOR por source (seed da edição global, sem mass-assignment leak)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lift da recipe do WizardShell para um componente que NÃO é rota (modal): submit faz setEditMode(false)+router.refresh() em vez de navegar — modal permanece aberto e repinta DB-authoritative (Pitfall 4)"
    - "renderTab ramifica leitura↔edição contra UM WizardFormData compartilhado; abas Fases/Risco permanecem read-only (mudam por StatusSelector / CRUD da Phase 12, fora do payload global)"
    - "Derivados read-only (Shared Pattern C): calcScore/priorityLevel/deriveFteBucket/deriveRpaScore recalculam para DISPLAY; nunca inputs, nunca no payload (D-15/docs/PROJETO.md §3)"

key-files:
  created:
    - .planning/phases/13-atualizacoes-tela/13-05-SUMMARY.md
  modified:
    - components/opportunities/modal/OpportunityDetail.tsx
    - components/opportunities/modal/Header.tsx
    - components/opportunities/wizard/state.ts
    - tests/wizard/state.test.ts

key-decisions:
  - "opportunityToFormData semeia APENAS o extras da variante (persona XOR formulário): o discriminatedUnion .strict() rejeita formulario_extras numa persona — semear ambos quebrava o save de persona legada (Rule 1)"
  - "opportunityToFormData semeia fte_horas (era omitido): sem isto o bucket FTE derivado nunca recalcula na edição e o submit perde a coluna fte (Rule 1)"
  - "Pitfall 4: o modal NÃO fecha após Salvar — setEditMode(false)+router.refresh() repinta com valores DB-authoritative; ≠ WizardShell que navega para trás"
  - "Edição vive DENTRO de OpportunityDetail (client component) → funciona idêntico no intercepting modal e no fullscreen route sem duplicar lógica; router.refresh() re-busca o RSC pai nos dois"
  - "Fases e Risco permanecem read-only mesmo em edição (D-12): não fazem parte do payload global; mudam por StatusSelector e pelo CRUD da Phase 12"

patterns-established:
  - "Lift de recipe de wizard-rota para modal não-rota: trocar router.back()→router.refresh() é o único delta (Pitfall 4)"

requirements-completed: [VIEW-05]

# Metrics
duration: ~18min
completed: 2026-06-05
---

# Phase 13 Plan 05: Modal Editável (modo global D-12) Summary

**Tornou o modal de 8 abas EDITÁVEL em modo global (D-12/D-13/D-15): um botão Editar no header destrava todas as abas, os bodies puros do wizard (CriteriosStep/BeneficiosStep/PriorizacaoStep + fields.tsx) editam UM `WizardFormData` compartilhado, Salvar submete o payload único ao `updateOpportunity` já existente e o modal permanece aberto repintando valores DB-authoritative (router.refresh, Pitfall 4), Cancelar descarta. Os derivados (score / priority_level / bucket FTE / rpa_score) recalculam ao vivo e ficam READ-ONLY — nunca inputs, nunca no payload (docs/PROJETO.md §3). A rota `/edit` do wizard coexiste (D-14). Funciona nas duas rotas (intercepting + fullscreen) sem duplicar lógica. Código completo; verificação humana (checkpoint Task 3) PENDENTE.**

## Performance

- **Duration:** ~18 min
- **Completed:** 2026-06-05 (código; human-verify pendente)
- **Tasks:** 2 de implementação concluídas + 1 checkpoint human-verify pendente
- **Files modified:** 4 (1 criado — este SUMMARY)

## Accomplishments

- **D-12/D-13 — fluxo global Editar/Salvar/Cancelar (Task 1+2):** `OpportunityDetail` ganhou o estado de edição lifted do `WizardShell` (`editMode` + `form: WizardFormData` + `patch` + `errors` + `submitError` + `useTransition`). `onSave` gateia os 8 critérios all-or-null com `validateStep('criterios', form)` (Pitfall 2), deriva `prioridade_fte` de `fte_horas` (fonte única), chama `updateOpportunity(opportunity.id, payload)` numa transition e — **Pitfall 4** — faz `setEditMode(false) + router.refresh()` (o modal NÃO fecha; repinta DB-authoritative) em vez do `router.back()` do WizardShell. `onCancel` re-semeia de `opportunityToFormData(opportunity)` e descarta erros.
- **D-15 — derivados read-only que recalculam ao vivo:** `fteBucket`/`liveScore`/`livePriority`/`liveRpaScore` computados no topo do componente via `deriveFteBucket`/`calcScore`/`priorityLevel`/`deriveRpaScore`. São **display-only**: o score circle do header recalcula ao vivo em edição; o RPA Fit recalcula nos critérios; **nenhum** é input nem entra no payload (grep confirma 0 inputs ligados a `score`/`rpa_score`/`prioridade_fte`).
- **renderTab ramifica leitura↔edição (Task 2):** em leitura, as abas de display do Plan 04 (inalteradas). Em edição: Processo/Automação via primitivos `fields.tsx` (incl. `ferramenta` lowercase — Pitfall 5); Critérios via `CriteriosStep`; Benefícios via `BeneficiosStep` (inclui `fte_horas`); Score via `PriorizacaoStep` (4 fatores manuais + bucket FTE read-only + ScorePreview); Observação via dois `TextareaField` (`observacao` + `risco`, D-10). **Fases e Risco permanecem read-only** mesmo em edição — fora do payload global (mudam por StatusSelector / CRUD da Phase 12).
- **Header dirige o fluxo (Task 2):** props `editMode`/`pending`/`onEdit`/`onSave`/`onCancel` + `liveScore`/`livePriority`/`submitError`. Leitura → `✏️ Editar`. Edição → `💾 Salvar` (disabled + `Salvando...` quando pending) + `✕ Cancelar`. Score circle ao vivo em edição, DB-authoritative em leitura. `EditButton.tsx` (rota `/edit`, D-14) preservado e visível só em modo leitura.
- **Round-trip + dois bugs de seed corrigidos (Task 1):** o spec `13-EDIT-01` provou que `opportunityToFormData` (1) **omitia `fte_horas`** — o bucket FTE derivado nunca recalcularia na edição e o submit perderia a coluna `fte`; e (2) **semeava AMBOS `persona_extras` e `formulario_extras`** — a variante `persona` do `discriminatedUnion .strict()` rejeitava `formulario_extras` como `unrecognized_keys` ao salvar uma persona legada. Ambos corrigidos (semeia `fte_horas` + extras XOR por `source` + `criterios`/`beneficios` first-class). O guard de mass-assignment confirma que o payload não carrega `tenant_id`/`id`/`seq_id`/`score`/`rpa_score`/`priority_level`.

## Task Commits

1. **Task 1: seed fix (fte_horas + extras XOR) + round-trip test** — `15f4f28` (fix)
2. **Task 2: modal editável global — Editar/Salvar/Cancelar + derivados read-only** — `86bb78c` (feat)

**Plan metadata:** commit docs final (SUMMARY/STATE/ROADMAP) — após este SUMMARY.

## Files Created/Modified

- `components/opportunities/wizard/state.ts` (modificado) — `opportunityToFormData` semeia `fte_horas` + `criterios`/`beneficios` first-class + extras XOR por `source` (não mais ambos).
- `tests/wizard/state.test.ts` (modificado) — bloco `13-EDIT-01`: round-trip persona legada → safeParse success; `prioridade_fte === deriveFteBucket(fte_horas)`; guard de mass-assignment.
- `components/opportunities/modal/OpportunityDetail.tsx` (modificado) — estado de edição lifted; `onSave`/`onCancel`/`onEdit`; derivados read-only ao vivo; `renderTab` ramifica leitura↔edição; passa props ao Header.
- `components/opportunities/modal/Header.tsx` (modificado) — props de edição; botões Editar/Salvar/Cancelar (`Salvando...`); score circle ao vivo; linha de `submitError` pt-BR; `EditButton` (/edit) só em leitura.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `opportunityToFormData` omitia `fte_horas`**
- **Found during:** Task 1 (spec 13-EDIT-01 falhou RED — `prioridade_fte` resultava `undefined`)
- **Issue:** o seed da edição não copiava `fte_horas` da row, então o bucket FTE derivado nunca recalcularia ao editar e o submit gravaria `fte = null`.
- **Fix:** semeia `fte_horas: opp.fte_horas ?? undefined`.
- **Files modified:** `components/opportunities/wizard/state.ts`
- **Commit:** `15f4f28`

**2. [Rule 1 - Bug] `opportunityToFormData` semeava ambos os extras → save de persona legada quebrava**
- **Found during:** Task 1 (spec 13-EDIT-01 falhou RED — `safeParse` retornava `unrecognized_keys: formulario_extras`)
- **Issue:** semear `persona_extras` E `formulario_extras` ao mesmo tempo viola o `discriminatedUnion .strict()`: a variante `persona` recusa a chave `formulario_extras`. Editar+salvar uma persona legada (D-08) era impossível.
- **Fix:** inclui APENAS o extras correspondente ao `source` (persona XOR formulário). Também semeia `criterios`/`beneficios` first-class (cast tipado sobre `Json|null` da view).
- **Files modified:** `components/opportunities/wizard/state.ts`
- **Commit:** `15f4f28`

Estes dois bugs estavam latentes no seed herdado da Phase 11 (o WizardShell em `mode='edit'` passava pelos steps e nunca submetia o seed cru); a edição global do modal é o primeiro consumidor a submeter `opportunityToFormData(row)` diretamente, expondo-os. Mitigam T-13-05-01 (mass assignment) e T-13-05-04 (CHECK bypass).

## Threat Surface

- **T-13-05-01 (mass assignment) — mitigate:** atendido. Payload = só a shape `WizardFormData` + `prioridade_fte`; `opportunityInputSchema.strict()` rejeita chaves server-derived; round-trip test assere ausência de `tenant_id`/`id`/`seq_id`/`score`/`rpa_score`/`priority_level`.
- **T-13-05-02 (cross-tenant write) — mitigate:** inalterado. `updateOpportunity` re-deriva tenant de `auth.uid()` e escopa `.eq('id').eq('tenant_id')`; o modal não envia `tenant_id`.
- **T-13-05-03 (persistir derivado) — mitigate:** atendido. score/priority/rpa_score/bucket FTE são recomputados client-side só para DISPLAY, nunca inputs, nunca no payload; `router.refresh()` re-lê os valores autoritativos do DB após salvar.
- **T-13-05-04 (CHECK bypass de critérios parciais) — mitigate:** atendido. `validateStep('criterios', form)` gateia antes do submit; Zod `.refine` + DB CHECK são os backstops server-side.

Nenhuma superfície nova fora do threat model do plano.

## Known Stubs

None — o modo edição renderiza os bodies puros do wizard contra dados reais; o save persiste via `updateOpportunity` real.

## Verification

- `npx tsc --noEmit` — exit 0 (clean).
- `npm run test` — **151 passed / 32 skipped / 0 failed**. Os 2 RED intencionais de `kpis.test.ts` (baseline do 13-01) já foram resolvidos pelo 13-02; zero novas falhas introduzidas por este plano. `tests/wizard/state.test.ts` 17 passed (3 novos do 13-EDIT-01).
- Greps de acceptance: `OpportunityDetail` contém `updateOpportunity`/`editMode`/`opportunityToFormData`/`deriveFteBucket`/`deriveRpaScore`/`router.refresh()`/`validateStep('criterios', form)`; ZERO `router.back()` no save path; ZERO inputs ligados a `score`/`rpa_score`/`prioridade_fte`. `Header` contém `Editar`/`Salvar`/`Cancelar`/`Salvando...`. `EditButton` ainda linka `/edit` (D-14).
- **UAT manual (checkpoint Task 3, blocking) — PENDENTE de aprovação humana.** Passos no checkpoint retornado ao orquestrador.

## Next Phase Readiness

- Aguarda aprovação do checkpoint human-verify (Task 3). Após "approved", o orquestrador roda a verificação de fase. Se o humano reportar problema (RPA não recalcula / modal fecha ao salvar / derivado editável / persona não grava first-class), o ponto de continuação é a Task 3 com o feedback.

## Self-Check: PASSED

- `components/opportunities/modal/OpportunityDetail.tsx` — FOUND
- `components/opportunities/modal/Header.tsx` — FOUND
- `components/opportunities/wizard/state.ts` — FOUND
- `tests/wizard/state.test.ts` — FOUND
- `.planning/phases/13-atualizacoes-tela/13-05-SUMMARY.md` — FOUND
- Commit `15f4f28` — FOUND
- Commit `86bb78c` — FOUND

---
*Phase: 13-atualizacoes-tela*
*Completed (código): 2026-06-05 — human-verify pendente*
