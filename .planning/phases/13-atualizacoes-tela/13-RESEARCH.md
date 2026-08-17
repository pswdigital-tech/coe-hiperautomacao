# Phase 13: Atualizações de Tela (KPI / Tabela / Kanban / Modal) - Research

**Researched:** 2026-06-05
**Domain:** Next.js 16 App Router — client edit state over a Server-Component-fed modal; wizard component reuse; derived-field recompute
**Confidence:** HIGH (all findings verified by reading the actual codebase; `database.types.ts` is the hand-maintained source of truth per docs/PROJETO.md)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01** KPI bar = 9 KPIs exatos (`_giba:296-305`): Total · Alta(≥70) · Média(40-69) · Baixa(<40) · Score Médio · FTE Total/mês · Novos · Produção · Concluídos.
- **D-02** Removidos da barra: `personas`/`formularios` e `byTool` (rpa/n8n/ambos) e granularidade extra de status (só Novos/Produção/Concluídos).
- **D-03** `OpportunityKpis` + `computeKpis` reduzidos: drop `personas`/`formularios`/`byTool`; add `fteTotal = Math.round(Σ fte_horas)`.
- **D-04** Coluna **"Fonte"** PERMANECE na tabela (divergência consciente do mockup — distinguir 29 personas legadas FGCoop).
- **D-05** Tabela ganha colunas FTE/mês (`Xh` de `fte_horas`) e RPA Fit (badges por faixa de `rpa_score`: `⭐ RPA Ideal (n/6)` ≥5, `✓ RPA+n8n (n/6)` ≥3, `n8n (n/6)` resto — `_giba:520-525`).
- **D-06** Sort: FTE/mês e RPA Fit sortáveis (além de score). Estender `SortKey`/`SortableColumn`.
- **D-07** Conjunto ÚNICO de 8 abas (`MODAL_TABS`, `_giba:959-968`): 📋 Processo · ✅ Critérios · 🤖 Automação · 📈 Benefícios · 📊 Score · 📅 Fases · ⚠️ Risco · 💬 Observação. Sem ramificação por `source`.
- **D-08** Personas legadas usam as mesmas 8 abas; campos first-class vazios → empty state pt-BR.
- **D-09** Abas só-persona (Perfil/Desafios/CoE) SAEM da exibição (dados preservados em `persona_extras`).
- **D-10** Campo legado texto-livre `risco` → aba **Observação** (junto de `observacao`). Aba **Risco** 100% dedicada à tabela estruturada (`RiscoTab`, Phase 12).
- **D-11** Abas Processo/Critérios/Automação/Benefícios/Score leem os campos **first-class v0.2** (criterios camelCase sim/nao/parcial, beneficios 1–5, `fte_horas`, `ferramenta`, `rpa_score`, score 5 fatores via `score.ts`).
- **D-12** Modal **editável** em **modo global**: botão Editar no header destrava TODAS as abas; Salvar persiste tudo; Cancelar descarta. NÃO é por-aba.
- **D-13** Reuso: edição usa `updateOpportunity` + `opportunityInputSchema` (Phase 10) e os componentes de campo do wizard (`steps/*`, `fields.tsx`). Zero backend novo.
- **D-14** Rota `/edit` (wizard) MANTIDA — coexiste. Não remover/redirecionar.
- **D-15** Derivados read-only que recalculam, nunca input manual: `score`/`priority_level` (4 fatores + bucket FTE via `score.ts`); `prioridade.fte` bucket (de `fte_horas` via `deriveFteBucket`); `rpa_score` 0–6 (dos 8 criterios). Editar persona legada grava nos campos first-class.
- **D-16** Kanban: header de cada coluna mostra FTE somado (`⏱️ {Σ fte_horas}h FTE/mês`, `_giba:734`) ao lado do contador; cada card ganha chip FTE (`⏱️ Xh/mês`) + badge RPA (faixas de D-05).

### Executor's Discretion
- Microcópia dos empty states pt-BR por aba (D-08), ícones, espaçamentos finos — mantendo paridade estrutural com `_giba`.
- Mecânica fina do estado de edição global (form state no client, dirty-checking, exibição de `fieldErrors`) — seguir o padrão do wizard.
- Layout da aba Observação acomodando `observacao` + `risco` legado (D-10).
- Reuso vs. cópia dos componentes do wizard por aba — o executor decide conforme acoplamento.

### Deferred Ideas (OUT OF SCOPE)
- Aposentar rota `/edit` (wizard) — rejeitado (D-14 coexistem).
- Remover coluna "Fonte" — rejeitado enquanto houver legado FGCoop.
- Riscos/prioridade de risco na KPI bar / tabela — fora de escopo.
- Dados de persona (Perfil/Desafios/CoE) em alguma visualização v0.2 — removidos da exibição (D-09).
- View "Relatório" (Phase 14); Seed Unidasul (Phase 15); qualquer mudança de backend/schema.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VIEW-01 | KPI bar inclui FTE Total/mês + Novos/Produção/Concluídos | `computeKpis` (`queries.ts:243`) + `OpportunityKpis` (`types.ts:54`) + `kpi-bar.tsx` — drop legados, add `fteTotal`. `fte_horas` confirmado na view Row (`database.types.ts:245`). |
| VIEW-02 | Tabela: colunas Frequência, Pessoas, Complexidade, FTE/mês, RPA Fit | `table.tsx` já tem Freq/Pessoas/Complex.; faltam FTE/mês + RPA Fit. `fte_horas`/`rpa_score` na Row (`database.types.ts:245,248`). Add `FteCell`/`RpaFitBadge` em `cells.tsx`. |
| VIEW-03 | Ordenação por FTE e pelo novo score | `filters.ts` `SortKey` + `queries.ts:82-111` switch + `table.tsx` `SORTABLE_COLS`. Score já sortável; add `fte_asc`/`fte_desc` e `rpa_*`. |
| VIEW-04 | Kanban soma e exibe FTE por coluna | `kanban/Column.tsx` (FTE somado no header) + `kanban/Card.tsx` (chip FTE + badge RPA). `fte_horas`/`rpa_score`/`score` na Row. |
| VIEW-05 | Modal 8 abas alinhadas ao novo modelo | `OpportunityDetail.tsx` colapsar 2 conjuntos em 1 de 8 (D-07); realinhar tabs ao first-class (D-11); **+ edição global** (D-12, expansão PO opt-in). |
</phase_requirements>

## Summary

Phase 13 splits cleanly into two work blocks of very different risk profiles. The **three "surface" updates (KPI / tabela / kanban)** are low-risk display reshapes: the data fields they need (`fte_horas`, `rpa_score`, `score`, `priority_level`, `frequencia`, `num_pessoas`, `complexidade`) are already present on the `opportunities_with_score` view row — verified directly in `lib/database.types.ts:245-249`. These reduce to: reshaping the `OpportunityKpis` type + `computeKpis` reducer, adding two `cells.tsx` badges + two table columns + two sort keys (one switch case each in `filters.ts`/`queries.ts`/`table.tsx`), and adding a per-column FTE sum + two card chips in the kanban. No new backend, no schema, no new patterns.

The **editable modal (D-12) is the real risk** and where the budget belongs. The good news, confirmed by reading the code: the wizard architecture is **already decoupled in exactly the way edit-mode needs**. Every wizard step (`CriteriosStep`, `BeneficiosStep`, `PriorizacaoStep`, `ProcessoStep`, etc.) is a pure presentational component driven by `(data, onChange, errors)` — none of them touch wizard navigation, `useRouter`, or the action. `WizardShell` owns the `useState<WizardFormData>` + a `patch()` reducer + `useTransition` submit to `updateOpportunity`, and the steps just render against that. The modal edit mode can reuse **the exact same recipe**: hold `WizardFormData` in `OpportunityDetail` (already `'use client'`), seed it from the row via the existing `opportunityToFormData(opp)` helper, render the wizard step bodies inside the 8 tabs while `editMode === true`, and submit the single payload to `updateOpportunity` — the same action `WizardShell` already calls in `mode='edit'`. Derived fields recompute live via `calcScore`/`priorityLevel`/`deriveFteBucket`, and `rpa_score` can be mirrored client-side from the GENERATED SQL expression (documented below).

**Primary recommendation:** Build the editable modal by lifting the proven `WizardShell` state recipe into `OpportunityDetail` — `useState<WizardFormData>` seeded by `opportunityToFormData`, a `patch` reducer, `useTransition` → `updateOpportunity` → `router.refresh()`. Render wizard step *bodies* inside the new 8-tab set (they only need `data`/`onChange`/`errors`). Keep derived fields read-only and recompute them on the client with the existing helpers + a new small `deriveRpaScore(criterios)` TS mirror of the SQL GENERATED expression.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| KPI aggregation (`computeKpis`) | Frontend Server (RSC) | — | Pure reduce over the already-fetched `Opportunity[]` in `app/(app)/opportunities/page.tsx`. No DB round-trip; `fte_horas` already on each row. |
| Table columns + RPA/FTE badges | Browser / Client (`table.tsx` is `'use client'`) | — | Display of fields already on the row; client because sort is querystring-driven via `router.replace`. |
| Sort (FTE/score/RPA) | API / DB (`order()` in `queries.ts`) | Browser (toggle UI) | DB-side `.order()` is the source of truth; the client only writes the `?sort=` param. RPA-fit/FTE sort must be DB columns (`rpa_score`, `fte_horas`) — both exist. |
| Kanban FTE sum + card chips | Browser / Client (kanban is `'use client'`, dnd-kit) | — | Per-column reduce over `opportunities` prop + per-card display. No new data. |
| Modal **display** (8 tabs) | Browser / Client (`OpportunityDetail` is `'use client'`) | Frontend Server (route fetches row) | Route Server Components fetch row/phases/risks; the client component renders tabs. |
| Modal **edit state** | Browser / Client | — | Form state, dirty tracking, live derived recompute all live in `OpportunityDetail`. |
| Modal **edit persistence** | API / Server Action (`updateOpportunity`) | DB (RLS + GENERATED) | Validation (Zod), tenant scoping, mass-assignment defense, and `rpa_score`/`score` derivation all server/DB-side. Client never writes derived fields. |
| Live derived recompute (score/priority/bucket/rpa) | Browser / Client (display only) | DB (authoritative on save) | `score.ts`/`fte.ts` are client-safe; client recompute is preview-only. After save, `router.refresh()` re-fetches the DB-authoritative values. |

## Standard Stack

No new dependencies. Everything needed is already installed and in use.

### Core (existing, reuse verbatim)
| Module | Purpose | Why Reuse |
|--------|---------|-----------|
| `lib/opportunities/actions.ts` → `updateOpportunity(id, input)` | Persist all 8-tab edits | D-13. Already accepts the full first-class model. Returns `{ok}` or `{ok:false, error, fieldErrors}`. |
| `lib/opportunities/schema.ts` → `opportunityInputSchema` | Validation contract | Discriminated union persona/formulario; accepts `criterios`/`beneficios`/`fte_horas`/`prioridade_fte`/`ferramenta` first-class. |
| `lib/opportunities/score.ts` → `calcScore`, `priorityLevel` | Live score/priority recompute (read-only) | D-15. Client-safe, SCORE-04 parity-tested. |
| `lib/opportunities/fte.ts` → `deriveFteBucket` | Live FTE bucket (5th factor, read-only) | D-15. `fte_horas → bucket`, single source. |
| `components/opportunities/wizard/state.ts` → `opportunityToFormData`, `WizardFormData`, `validateStep` | Seed + type + validate edit form | `opportunityToFormData(opp)` already converts a row → editable form data. |
| `components/opportunities/wizard/steps/*` + `fields.tsx` | Editable inputs per tab | Pure `(data, onChange, errors)` components — see Pattern 2. |
| `components/opportunities/wizard/ScorePreview.tsx` | Live score badge during edit | Takes flat `Prioridade` props; already consumes `calcScore`. |

### Supporting (existing display helpers to extend)
| Module | Add | Note |
|--------|-----|------|
| `components/opportunities/cells.tsx` | `FteCell` (number `Xh`), `RpaFitBadge` (3-tier from `rpa_score`) | Same style as existing `ComplexityBadge`/`ToolBadge`. |
| `lib/opportunities/filters.ts` | `fte_asc`/`fte_desc` (+ optionally `rpa_asc`/`rpa_desc`) in `SortKey` + `SORT_VALUES` + `SORT_LABELS` | D-06. |
| `lib/opportunities/queries.ts` | `case 'fte_asc'/'fte_desc'` in the sort switch (`.order('fte_horas', ...)`) | DB-side. `fte_horas` is a real view column. |
| `lib/opportunities/types.ts` | New `OpportunityKpis` shape (drop legacy buckets, add `fteTotal`) | D-03. |

### New (small, to create)
| Module | Purpose | Why |
|--------|---------|-----|
| `lib/opportunities/rpa.ts` → `deriveRpaScore(criterios)` | Client mirror of the SQL GENERATED `rpa_score` for live read-only recompute during edit | No TS helper exists today (verified). See Pitfall 1 + Code Examples. Mirror the exact 6-term SQL formula. |

**Installation:** none.

**Version verification:** N/A — no package installs. Vitest 3.2.x already present (`package.json:45`); React/Next versions unchanged this phase.

## Architecture Patterns

### System Architecture Diagram — Editable Modal (the non-trivial part)

```
                    list page (RSC: app/(app)/opportunities/page.tsx)
                                    │ <Link href="/opportunities/[id]">
                                    ▼
        ┌───────────── intercepting route (RSC, @modal/(.)…/[id]/page.tsx) ─────────────┐
        │  fetchOpportunityById(id) ─┐                                                   │
        │  fetchPhases / fetchRisks ─┴─► props ─► <ModalShell><OpportunityDetail …/></…> │
        └───────────────────────────────────────────────────────────────────────────────┘
                                    │ (also: fullscreen fallback app/(app)/…/[id]/page.tsx,
                                    │  same OpportunityDetail — edit works in BOTH, see Q1)
                                    ▼
        ┌─────────────────── OpportunityDetail ('use client') ───────────────────────────┐
        │  state: editMode (bool), form = useState<WizardFormData>(                       │
        │           opportunityToFormData(opportunity)), errors, submitError, pending     │
        │                                                                                 │
        │  ┌── Header ──────────────────────────────────────────────────────────────┐    │
        │  │  read mode:  [✏️ Editar]                                                 │    │
        │  │  edit mode:  [💾 Salvar] [✕ Cancelar]   (score circle = live calcScore) │    │
        │  └────────────────────────────────────────────────────────────────────────┘    │
        │                                                                                 │
        │  8-tab nav (MODAL_TABS, D-07) — all tabs share ONE form payload                 │
        │   ├ read mode  → existing display tabs (realigned to first-class, D-11)         │
        │   └ edit mode  → wizard step BODIES rendered with (form, patch, errors)         │
        │        Processo→ProcessoStep · Critérios→CriteriosStep · Benefícios→BeneficiosStep
        │        Score→ScorePreview+PriorizacaoStep inputs (derived read-only)            │
        │                                                                                 │
        │  derived (read-only, recompute on every patch):                                 │
        │    calcScore(form) · priorityLevel(score) · deriveFteBucket(form.fte_horas)     │
        │    deriveRpaScore(form.criterios)  ◄── NEW client mirror                        │
        └─────────────────────────────────────────────────────────────────────────────────┘
                                    │ Salvar: startTransition(async () => {
                                    │   r = await updateOpportunity(id, form)   ◄── Server Action (Phase 10)
                                    │   if(!r.ok){ setErrors(r.fieldErrors); setSubmitError(r.error) }
                                    │   else { setEditMode(false); router.refresh() }  // re-fetch DB-authoritative
                                    │ })
                                    ▼
        updateOpportunity → opportunityInputSchema.safeParse → auth.getUser → profiles.tenant_id
                          → .update({…enumerated…}).eq('id').eq('tenant_id')   (RLS + GENERATED rpa_score/score)
                          → revalidatePath('/opportunities') + revalidatePath('/opportunities/[id]')
```

### Recommended Structure (files touched / added)
```
components/opportunities/
├── modal/
│   ├── OpportunityDetail.tsx     # collapse 2 tab sets → 1 (D-07); add editMode + form state + submit
│   ├── Header.tsx                # Editar / Salvar / Cancelar buttons (replace static EditButton link in edit ctx)
│   └── tabs/
│       ├── ProcessoTab|CriteriosTab|AutomacaoTab|BeneficiosTab|ScoreTab|FasesTab|ObservacaoTab.tsx
│       │                         # read-mode display realigned to first-class (D-11) + edit-mode renders wizard bodies
│       ├── RiscoTab.tsx          # UNCHANGED (Phase 12)
│       └── {Perfil,Desafios,Coe}Tab.tsx   # removed from display (D-09) — files may stay, just unwired
├── cells.tsx                     # + FteCell, RpaFitBadge
├── kpi-bar.tsx                   # rebuild to 9 KPIs
├── table.tsx                     # + FTE/mês, RPA Fit columns + sort wiring
└── kanban/{Column,Card}.tsx      # + FTE sum / chips
lib/opportunities/
├── types.ts                      # OpportunityKpis reshape
├── queries.ts                    # computeKpis reshape + fte sort case
├── filters.ts                    # SortKey + labels for fte (+ rpa)
└── rpa.ts                        # NEW deriveRpaScore mirror
```

### Pattern 1: Server Action from client component (already proven in-repo)
**What:** Call `updateOpportunity` from the client modal, with pending state + returned `fieldErrors`.
**When:** Modal "Salvar".
**This is NOT new** — `WizardShell.tsx:106-150` already does exactly this. Copy the recipe:
```typescript
// Source: components/opportunities/wizard/WizardShell.tsx:106-150 (mode='edit' branch)
const [pending, startTransition] = useTransition();
async function onSave() {
  setSubmitError(null);
  startTransition(async () => {
    const result = await updateOpportunity(id, form as OpportunityInput);
    if (!result.ok) {
      setSubmitError(result.error);
      if (result.fieldErrors) setErrors(result.fieldErrors);
      return;
    }
    setEditMode(false);
    router.refresh();   // re-fetch DB-authoritative score/priority/rpa_score (the modal stays open)
  });
}
```
> NOTE on FTE bucket: `WizardShell.onSubmit` (create path) derives `prioridade_fte` from `fte_horas` before submitting (`WizardShell.tsx:120-127`). The modal edit MUST do the same so the 5th score factor persists — otherwise `updateOpportunity` writes `fte: data.prioridade_fte` as `null` (`actions.ts:482`). Apply `deriveFteBucket(Number(form.fte_horas))` into `prioridade_fte` in the save payload.

### Pattern 2: Reusing wizard steps as inline tab editors (HIGH reuse, low coupling)
**What:** Wizard steps are pure `(data, onChange, errors)` renderers. They have **zero** coupling to wizard navigation, routing, or the action.
**Evidence (verified):**
- `CriteriosStep` (`steps/CriteriosStep.tsx:51`): `({ data, onChange, errors })` — reads `data.criterios`, calls `onChange({ criterios: {...} })`. First-class camelCase, lowercase `sim/nao/parcial`. Drop-in.
- `BeneficiosStep` (`steps/BeneficiosStep.tsx:34`): `({ data, onChange })` — reads `data.beneficios` + `data.fte_horas`. Drop-in.
- `PriorizacaoStep` (`steps/PriorizacaoStep.tsx:40`): `({ data, onChange, errors })` — the 4 manual factors + already shows FTE bucket + `ScorePreview` read-only. Drop-in for the Score tab editor.
- `fields.tsx`: `TextField`/`TextareaField`/`SelectField` — pure `(label, value, onChange, error)`. Drop-in for Processo/Identificação inputs.

**Recommendation:** **Reuse the step components directly** for Critérios, Benefícios, and the Score/Priorização inputs (they are already first-class-aligned and parity-correct). For Processo, compose `fields.tsx` primitives (the existing `ProcessoStep` mixes Identificação + Processo; a lighter per-tab composition may read cleaner, but reuse is viable). Only the *plumbing* changes: instead of `WizardShell` owning `(data, patch, errors)`, `OpportunityDetail` owns them and passes the same props.

**Coupling that does NOT block reuse:** steps import `WizardFormData` (a type) and `../state` helpers — all client-safe, no server/router imports. The only step that imports anything heavier is `PriorizacaoStep` → `ScorePreview` + `fte.ts` (both client-safe, desired).

### Pattern 3: Live derived recompute (read-only) during edit
**What:** As the 4 factors / `fte_horas` / `criterios` change, recompute display-only derived values.
```typescript
// All client-safe, already imported by wizard steps:
const fteBucket = form.fte_horas != null ? deriveFteBucket(Number(form.fte_horas)) : undefined;
const score = calcScore({ esforco: form.esforco, complexidade: form.complexidade,
                          tempo: form.tempo, objetivo: form.objetivo, fte: fteBucket });
const priority = priorityLevel(score);
const rpaScore = deriveRpaScore(form.criterios);   // NEW — see Code Examples
```
These feed the read-only Score-circle in `Header`, the `ScorePreview`, the FTE-bucket pill, and the RPA-fit badge — never editable inputs (D-15 / docs/PROJETO.md principle 3).

### Anti-Patterns to Avoid
- **Per-tab Save buttons.** D-12 is a single global Editar/Salvar/Cancelar over ONE payload. Do not add per-tab persistence.
- **Editing derived fields.** Never render `score`/`priority_level`/`rpa_score`/`fte` bucket as inputs. They are computed/GENERATED (D-15, docs/PROJETO.md §3). Persisting any of them is a defect.
- **Duplicating the score/fte/rpa formulas.** Use `calcScore`/`deriveFteBucket` as-is; the one new helper (`deriveRpaScore`) must mirror the SQL expression exactly and be parity-tested.
- **Building a second validation layer.** `updateOpportunity` already runs `opportunityInputSchema`. Client `validateStep` is for UX feedback only; the server is authoritative.
- **Spreading `data` into the action payload blindly past the schema.** `opportunityInputSchema` is `.strict()` per variant — extra keys (e.g. `score`, `rpa_score`, `seq_id`) cause `unrecognized_keys` parse failure. Submit only the `WizardFormData` shape (which `opportunityToFormData` already produces).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persist modal edits | New action / route handler | `updateOpportunity` (Phase 10) | Has tenant scoping, mass-assignment defense, Zod, revalidate. |
| Validate edit input | New zod schema | `opportunityInputSchema` | Already covers first-class model + persona/formulario union. |
| Score / priority recompute | Inline arithmetic | `calcScore` / `priorityLevel` | SCORE-04 parity-tested vs SQL; docs/PROJETO.md formula is authoritative. |
| FTE bucket | Inline thresholds | `deriveFteBucket` | Single source, same fn as wizard submit → display === persistence. |
| Row → editable form | Manual field mapping | `opportunityToFormData(opp)` (`state.ts:144`) | Already handles null→''/[] coercion for inputs. |
| Form state machine | New reducer lib | `useState<WizardFormData>` + `patch` | Exactly what `WizardShell` does; trivial, proven. |
| Pending/submit UX | Manual loading flags | `useTransition` | In-repo pattern (`WizardShell.tsx:45`). |

**Key insight:** Phase 10 + Phase 11 already built every backend and form-component primitive this phase needs. Phase 13's modal-edit work is **wiring**, not new infrastructure — the risk is in correctly *reassembling* existing pieces (state lift + derived read-only discipline), not in building anything.

## Common Pitfalls

### Pitfall 1: `rpa_score` has NO client recompute helper today — only the DB GENERATED column
**What goes wrong:** During edit, the user changes `criterios`; the RPA-fit badge shows a stale `rpa_score` because it's GENERATED in the DB and only updates on save.
**Why it happens:** `rpa_score` is `GENERATED ALWAYS ... STORED` (`migration 0011:127-136`). No TS mirror exists — grep for `rpaScore`/`deriveRpa`/`calcRpa` in `lib/`/`components/` returns nothing but the column read. The mockup's `d.rpaScore` is precomputed seed data, not derived live.
**How to avoid:** Create `lib/opportunities/rpa.ts` `deriveRpaScore(criterios)` that mirrors the SQL expression EXACTLY (see Code Examples), and parity-test it the same way `score-rule.test.ts` tests `calcScore`. Then the badge recomputes live during edit. **If the planner chooses not to mirror it**, the only honest alternative is: show `rpa_score` read-only from the row and let it refresh after save (`router.refresh()`) — flag to user that RPA-fit updates on save. The mirror is strongly recommended (formula is tiny, deterministic, 6 terms).
**Warning signs:** RPA badge doesn't move when toggling criteria in edit mode.

### Pitfall 2: The 8 `criterios` partial vs. the CHECK constraint (all-8-or-null)
**What goes wrong:** Saving a persona/legacy record with a partially-filled `criterios` object → Zod `.refine` rejects ("Responda todos os 8 critérios…", `schema.ts:263-278`) OR, if it slipped past, the DB CHECK `opportunities_criterios_chk` rejects (`migration 0011:146-159`).
**Why it happens:** `criterios` must be `null` OR have all 8 camelCase keys present. Legacy personas have `criterios = null`. The moment the user answers one criterion in edit, they must answer all 8 before save can succeed.
**How to avoid:** Reuse `CriteriosStep` (it cycles all 8) + reuse the wizard's completeness check (`validateStep('criterios', form)` from `state.ts:218-227`) before allowing Save, surfacing the same pt-BR message. Empty `criterios` (untouched legacy persona) must remain `undefined`/`null`, not `{}`.
**Warning signs:** "violates check constraint opportunities_criterios_chk" in the action error.

### Pitfall 3: Legacy display tabs read the WRONG model (jsonb legado vs first-class)
**What goes wrong:** `CriteriosTab.tsx` and `BeneficiosTab.tsx` currently read `o.formulario_extras?.criterios` (legacy **uppercase** `SIM/NAO/PARCIAL`, 10 criteria) and `o.formulario_extras?.beneficios` — NOT the first-class `o.criterios` (8 **lowercase** camelCase) / `o.beneficios` columns. `ScoreTab.tsx` is a 4-factor *approximation* (`EFFORT_VALUES` etc.) and does NOT use `calcScore` or include the FTE 5th factor.
**Why it happens:** These tabs predate the v0.2 first-class columns; D-11 explicitly calls for realignment.
**How to avoid (D-11):**
- `CriteriosTab` → read `o.criterios` (first-class, 8 lowercase camelCase), map `sim/nao/parcial`. The wizard's `CriteriosStep` visual map (`steps/CriteriosStep.tsx:44-49`) is the correct rendering for the new domain.
- `BeneficiosTab` → read `o.beneficios` (first-class camelCase). `BeneficiosStep` labels (`steps/BeneficiosStep.tsx:23-32`) are the correct set.
- `ScoreTab` → show the real 5-factor breakdown using `calcScore`/the documented weights; surface the FTE factor. Remove the "Edição dos pesos virá na Phase 6" placeholder text.
- `ProcessoTab` reads mostly first-class already (`o.frequencia`, `o.area`, etc.) but pulls `tipo_processo`/`sistemas` from `formulario_extras` — for v0.2, `tipo_processo` is a first-class `string[]` column (`database.types.ts:247`); decide which to display.
- Personas with null first-class fields → empty state pt-BR (D-08).
**Warning signs:** Edit a record's criteria, save, reopen → display tab shows different/empty values because it's reading the legacy jsonb path.

### Pitfall 4: `router.refresh()` vs `router.back()` after save (modal must stay open)
**What goes wrong:** `WizardShell` (the `/edit` route) calls `router.back()` after save because it's a full route that should close. The **modal** edit should stay open and just exit edit mode, so it needs `router.refresh()` (re-fetch the intercepting RSC's data) — not `router.back()`.
**Why it happens:** Copy-pasting the WizardShell submit verbatim would navigate away.
**How to avoid:** After a successful `updateOpportunity`, do `setEditMode(false); router.refresh();`. `router.refresh()` re-runs the Server Components feeding the modal (the intercepting route re-fetches via `fetchOpportunityById`), so the read-mode tabs and the score circle show DB-authoritative values. The `revalidatePath` calls in `updateOpportunity` (`actions.ts:497-498`) also refresh the underlying list.
**Warning signs:** After save the modal closes unexpectedly, or read-mode shows stale derived values.

### Pitfall 5: `ferramenta` enum casing (`rpa` not `RPA`)
**What goes wrong:** Making `ferramenta` editable with a value like `'RPA'` fails `toolEnum` (`schema.ts:43` — lowercase `rpa|n8n|ambos`).
**How to avoid:** Use lowercase enum values; map to pt-BR labels in the UI (existing `TOOL_MAP` in `cells.tsx:30` already does label mapping).

## Code Examples

### `deriveRpaScore` — client mirror of the SQL GENERATED expression (NEW)
```typescript
// Source: supabase/migrations/0011_schema_evolution_v02.sql:127-136 (GENERATED ALWAYS)
// lib/opportunities/rpa.ts — mirror EXACTLY; parity-test like score-rule.test.ts.
// criterios null/incomplete → null (matches DB: criterios is null → rpa_score null).
type CriterioValor = 'sim' | 'nao' | 'parcial';
type Criterios = Partial<Record<
  'causaReclamacoes'|'totalmenteManual'|'regrasClaras'|'decisaoHumana'|
  'padronizacaoDocs'|'validacaoDados'|'schedulable'|'temDocumentacao', CriterioValor>>;

export function deriveRpaScore(c: Criterios | null | undefined): number | null {
  if (!c) return null;
  return (
    (['sim','parcial'].includes(c.totalmenteManual ?? '') ? 1 : 0) +
    (c.regrasClaras     === 'sim' ? 1 : 0) +
    (c.decisaoHumana    === 'nao' ? 1 : 0) +   // NOTE: 'nao' is the favorable answer here
    (c.padronizacaoDocs === 'sim' ? 1 : 0) +
    (c.validacaoDados   === 'sim' ? 1 : 0) +
    (c.schedulable      === 'sim' ? 1 : 0)
  ); // 0–6
}
```

### RPA Fit badge tiers (D-05 / D-16) — mirror `_giba:520-525`
```typescript
// Source: _giba_wsi-dashboard.html:520-525 (rpaBadge)
// rs >= 5 → ⭐ RPA Ideal (n/6) ; rs >= 3 → ✓ RPA+n8n (n/6) ; else → n8n (n/6)
function rpaTier(rs: number) {
  if (rs >= 5) return { icon: '⭐', label: `RPA Ideal (${rs}/6)`, bg: '#fef3c7', fg: '#92400e' };
  if (rs >= 3) return { icon: '✓',  label: `RPA+n8n (${rs}/6)`,  bg: '#e0e7ff', fg: '#3730a3' };
  return        { icon: '',  label: `n8n (${rs}/6)`,            bg: '#f1f5f9', fg: '#64748b' };
}
```

### KPI reshape (D-01/D-02/D-03)
```typescript
// lib/opportunities/types.ts — new shape
export type OpportunityKpis = {
  total: number;
  scoreMedio: number;
  fteTotal: number;                              // Math.round(Σ fte_horas)
  byPriority: { alta: number; media: number; baixa: number };
  byStatus: { novo: number; producao: number; concluido: number };  // only these 3 (D-02)
};
// lib/opportunities/queries.ts computeKpis — drop personas/formularios/byTool loops;
// add: let fteTotal = 0; ... fteTotal += o.fte_horas ?? 0; return { ..., fteTotal: Math.round(fteTotal) }
```

### Sort extension (D-06)
```typescript
// lib/opportunities/filters.ts: add 'fte_asc' | 'fte_desc' to SortKey, SORT_VALUES, SORT_LABELS.
// lib/opportunities/queries.ts switch (queries.ts:82): add
case 'fte_desc': q = q.order('fte_horas', { ascending: false, nullsFirst: false }); break;
case 'fte_asc':  q = q.order('fte_horas', { ascending: true,  nullsFirst: false }); break;
// table.tsx SORTABLE_COLS: add fte: { asc: 'fte_asc', desc: 'fte_desc' } and a ThSort header.
// (RPA Fit sort optional: order('rpa_score', ...) — rpa_score is a real view column.)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Modal split by `source` (`TABS_PERSONA`/`TABS_FORMULARIO`) | Single 8-tab set for all (`MODAL_TABS`) | Phase 13 / D-07 | `OpportunityDetail.tsx:24-44` collapses to one array. |
| Criterios/Beneficios read legacy jsonb (`formulario_extras`, uppercase) | Read first-class `o.criterios`/`o.beneficios` (lowercase camelCase) | Phase 13 / D-11 | Tab realignment; see Pitfall 3. |
| Modal read-only; editing only via `/edit` wizard | Modal editable (global mode) + `/edit` coexists | Phase 13 / D-12, D-14 | First time the modal writes. |
| `ScoreTab` 4-factor approximation | 5-factor via `calcScore` (incl. FTE) | Phase 13 / D-11 | Aligns to SCORE-04. |
| KPI bar legacy buckets (personas/formularios/byTool) | 9 KPIs incl. FTE Total | Phase 13 / D-01..03 | `kpi-bar.tsx` rebuild. |

**Deprecated/outdated:**
- Legacy uppercase criterios (`CriterioValor = 'SIM'|'NAO'|'PARCIAL'`, `database.types.ts:106`) is `@deprecated` — v0.2 first-class uses lowercase.
- `EditButton.tsx` (static `<Link href=…/edit>`): keep for the `/edit` path (D-14), but the in-modal Editar toggle in edit-mode is a new button in `Header.tsx`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 8-tab `MODAL_TABS` order and labels (D-07) are exactly `_giba:959-968` — verified against the mockup. | D-07 | Low — read directly from mockup. |
| A2 | `router.refresh()` re-runs the intercepting route's Server Components and updates the open modal's read-mode display. This is standard App Router behavior but not re-verified against Next 16 docs this session (in-repo `StatusSelector`/wizard rely on it). | Pitfall 4 | Medium — if `refresh()` doesn't repaint the modal, may need a local optimistic merge of the saved form into display state until next open. Mitigation: also update local read-mode state from `form` on successful save. |
| A3 | `ProcessoTab`'s `tipo_processo`/`sistemas` should move to first-class (`o.tipo_processo` column) vs. legacy `formulario_extras`. CONTEXT D-11 implies first-class but doesn't enumerate every field; the exact display source per field is executor's discretion. | Pitfall 3 | Low — display-only; either source renders. |
| A4 | RPA Fit *sort* (not just badge) is optional — VIEW-03 names "FTE e novo score"; D-06 adds FTE+RPA Fit sortable. Treated RPA sort as in-scope per D-06 but score+FTE as the must-haves. | Sort extension | Low. |

## Open Questions

1. **Does modal edit need to work in the fullscreen fallback route too?**
   - What we know: `OpportunityDetail` is the SAME component in both the intercepting modal (`@modal/(.)…/[id]/page.tsx`) and the fullscreen fallback (`…/[id]/page.tsx`). Editing logic lives entirely inside `OpportunityDetail`, so it works in both for free.
   - What's unclear: After save, `router.refresh()` works in both contexts; there is no "close" semantics difference because edit stays in-place (not `router.back()`). The fullscreen route has a "← Voltar" link, unaffected.
   - Recommendation: Build edit once in `OpportunityDetail`; it works in both. No route-specific branching needed.

2. **`rpa_score` live recompute: mirror in TS, or refresh-after-save?**
   - What we know: SQL formula is tiny and deterministic (6 terms, documented above). No TS helper exists.
   - Recommendation: Create `lib/opportunities/rpa.ts` `deriveRpaScore` + a parity test mirroring `tests/schema/score-rule.test.ts`. Falls back gracefully to read-only-from-row if the planner descopes it.

3. **Score tab editor surface in edit mode:** reuse `PriorizacaoStep` wholesale (it bundles the 4 factors + FTE bucket display + `ScorePreview`) vs. compose. `PriorizacaoStep` is already first-class and read-only-derived-correct — recommend reusing it as the Score tab's edit body.

## Environment Availability

Step 2.6: SKIPPED for runtime tools — this phase is pure frontend code (no new external dependencies, no new services). The only "dependency" is the Supabase view `opportunities_with_score`, already in production and reflected in `lib/database.types.ts` (the hand-maintained source of truth; `gen:types` is blocked per MEMORY — do NOT rely on regen). All needed fields verified present:

| Field | View Row line (`database.types.ts`) | Present |
|-------|-------------------------------------|---------|
| `fte_horas` | 241 / 245 | ✓ (`number \| null`) |
| `rpa_score` | 248 | ✓ (`number \| null`, GENERATED) |
| `criterios` | 245/249 | ✓ (`Json \| null`, first-class) |
| `beneficios` | 246/250 | ✓ (`Json \| null`, first-class) |
| `fte` (bucket) | 251 | ✓ (`FteBucket \| null`) |
| `score` / `priority_level` | (view computed) | ✓ (per `types.ts:7-13`) |

## Validation Architecture

> No `.planning/config.json` exists; `workflow.nyquist_validation` is therefore not explicitly `false` → treat as ENABLED. Test infra present: Vitest 3.2.x.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.x (`package.json:45`) |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run tests/<area>/<file>.test.ts` |
| Full suite command | `npm run test` (`vitest run`) |

Test dirs present: `tests/{schema,security,wizard,modal,opportunities,public-form,ai,helpers,setup}`. Pattern: pure unit specs run without DB; integration specs `skipIf(!NEXT_PUBLIC_SUPABASE_URL)`. The new edit work is UI + pure-function — favor pure unit tests (no DB needed).

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|--------------|
| VIEW-01 | `computeKpis` returns `fteTotal = Math.round(Σ fte_horas)`, drops legacy buckets | unit | `npx vitest run tests/opportunities/kpis.test.ts` | ❌ Wave 0 |
| VIEW-03 | `parseFilters`/sort switch accept `fte_asc/fte_desc` | unit | `npx vitest run tests/opportunities/filters.test.ts` | ❌ Wave 0 (extend if exists) |
| D-05/D-16 | `rpaTier` thresholds (≥5/≥3/else) | unit | `npx vitest run tests/opportunities/rpa-badge.test.ts` | ❌ Wave 0 |
| D-15 | `deriveRpaScore` parity vs SQL GENERATED expr | unit | `npx vitest run tests/schema/rpa-score-rule.test.ts` | ❌ Wave 0 (mirror `score-rule.test.ts`) |
| D-12/D-13 | Modal edit submits full first-class payload → `opportunityInputSchema` passes (round-trip `opportunityToFormData`) | unit | `npx vitest run tests/wizard/state.test.ts` (extend) | partial (`tests/wizard/state.test.ts` exists) |
| D-15 | Live `calcScore`/`deriveFteBucket` recompute correctness | unit (already covered) | `npx vitest run tests/schema/score-rule.test.ts` | ✅ exists |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/opportunities tests/schema/rpa-score-rule.test.ts` (quick, pure units).
- **Per wave merge:** `npm run test`.
- **Phase gate:** full suite green + `npm run typecheck` (TS strict) before `/gsd-verify-work`. Manual UAT for the modal edit interaction (open → Editar → change criterios → score/RPA recompute → Salvar → reopen shows persisted first-class values).

### Wave 0 Gaps
- [ ] `lib/opportunities/rpa.ts` + `tests/schema/rpa-score-rule.test.ts` — `deriveRpaScore` parity with SQL (D-15).
- [ ] `tests/opportunities/kpis.test.ts` — `computeKpis` new shape (VIEW-01).
- [ ] `tests/opportunities/rpa-badge.test.ts` — tier thresholds (D-05/D-16).
- [ ] Extend `tests/wizard/state.test.ts` — `opportunityToFormData` round-trip → schema parse for a legacy persona (D-08/D-15: writes first-class).
- [ ] (If absent) `tests/opportunities/filters.test.ts` — fte sort keys (VIEW-03).

## Security Domain

> `security_enforcement` not explicitly `false` → included. This phase is frontend display + a client→action edit path; the security-relevant surface is the edit submission.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | `updateOpportunity` re-derives `tenant_id` from `auth.uid()`→`profiles` and scopes `.eq('tenant_id', …)` + RLS (`actions.ts:439-491`). The modal edit MUST NOT send tenant_id/id/seq_id (mass-assignment defense). |
| V5 Input Validation | yes | `opportunityInputSchema` (`.strict()` per variant) — reuse, do not bypass. Client `validateStep` is UX-only. |
| V6 Cryptography | no | none new. |
| V2/V3 (auth/session) | no | unchanged; existing Supabase SSR session. |

### Known Threat Patterns for Next.js client→Server Action
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Mass assignment (client injects `tenant_id`/`score`/`rpa_score`/`seq_id`) | Elevation/Tampering | `opportunityInputSchema.strict()` rejects `unrecognized_keys`; action enumerates `.update({…})` explicitly; derived fields are GENERATED/computed in DB. Submit only `WizardFormData` keys. |
| Cross-tenant write | Elevation | `.eq('id').eq('tenant_id', profile.tenant_id)` + RLS `WITH CHECK` (defense in depth). No change needed; do not weaken. |
| Persisting derived score (docs/PROJETO.md §3) | Tampering/Integrity | Never include `score`/`priority_level`/`rpa_score`/`fte` bucket as editable inputs; recompute client-side for display only. |

## Sources

### Primary (HIGH confidence — codebase, the authoritative source per docs/PROJETO.md)
- `lib/opportunities/actions.ts` (`updateOpportunity` `:422-500`; mass-assignment notes `:404-417`).
- `lib/opportunities/schema.ts` (`opportunityInputSchema` discriminatedUnion `:308-321`; first-class criterios/beneficios/fte `:224-294`).
- `lib/opportunities/score.ts` (`calcScore`/`priorityLevel`), `lib/opportunities/fte.ts` (`deriveFteBucket`).
- `components/opportunities/wizard/WizardShell.tsx` (state recipe + `mode='edit'` submit `:106-150`), `state.ts` (`opportunityToFormData` `:144`, `validateStep` `:184`), `steps/{Criterios,Beneficios,Priorizacao}Step.tsx`, `fields.tsx`, `ScorePreview.tsx`.
- `components/opportunities/modal/{OpportunityDetail,Header,EditButton}.tsx` + `tabs/{Processo,Criterios,Beneficios,Score,Observacao,Automacao}Tab.tsx`.
- `components/opportunities/{table,cells,kpi-bar}.tsx`, `kanban/{Column,Card}.tsx`.
- `lib/opportunities/{types,filters,queries}.ts`.
- `lib/database.types.ts:104-122,236-291` (legacy vs first-class shapes; view Row).
- `supabase/migrations/0011_schema_evolution_v02.sql:127-171` (`rpa_score` GENERATED expr + CHECK constraints).
- `app/(app)/@modal/(.)opportunities/[id]/page.tsx` + `app/(app)/opportunities/[id]/page.tsx` (intercepting + fullscreen routes).
- `_giba_wsi-dashboard.html:296-305, 346-359, 483-490, 515-525, 698-741, 959-1005` (visual contract).

### Secondary (MEDIUM)
- Next.js App Router skill (RSC boundaries, parallel/intercepting routes, Server Action from client) — auto-injected; the in-repo `WizardShell` already embodies the verified pattern, so it serves as the concrete reference.

### Tertiary (LOW)
- None relied upon.

## Metadata

**Confidence breakdown:**
- Standard stack / reuse map: HIGH — read every referenced file; reuse targets confirmed decoupled.
- Editable-modal architecture: HIGH — the pattern is a direct lift of the existing `WizardShell.mode='edit'` recipe; only `router.refresh()` vs `router.back()` differs (A2 flagged Medium).
- Derived recompute incl. `deriveRpaScore`: HIGH for score/fte (existing helpers, parity-tested); MEDIUM-HIGH for `rpa_score` mirror (formula read from migration verbatim; needs its own parity test).
- Display surfaces (KPI/table/kanban): HIGH — data fields verified present on the view Row.

**Research date:** 2026-06-05
**Valid until:** ~2026-07-05 (codebase-internal findings; stable unless wizard/action/schema refactored).
