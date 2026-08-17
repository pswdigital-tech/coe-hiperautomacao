# Phase 13: Atualizações de Tela (KPI / Tabela / Kanban / Modal) - Pattern Map

**Mapped:** 2026-06-05
**Files analyzed:** 16 (14 modify, 2 create) + 4 test files
**Analogs found:** 16 / 16 (every file is brownfield with a strong in-repo analog)

> Brownfield phase: almost everything is "modify existing." The single new TS file (`lib/opportunities/rpa.ts`) has an *exact* formula analog already living inside a test file. The single new tier helper (`rpaTier`) sits beside existing `cells.tsx` badges. The editable modal is a **direct lift** of the proven `WizardShell` state recipe into `OpportunityDetail`.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/opportunities/types.ts` (`OpportunityKpis` reshape) | model/type | transform | self (`OpportunityKpis` :54-70) | exact (edit-in-place) |
| `lib/opportunities/queries.ts` (`computeKpis` reshape + fte sort case) | service | batch/transform | self (`computeKpis` :243, sort switch :82-111) | exact (edit-in-place) |
| `lib/opportunities/filters.ts` (`SortKey`/labels for fte) | utility | transform | self (`SortKey` :8-17, `SORT_VALUES` :47, `SORT_LABELS` :124) | exact (edit-in-place) |
| `components/opportunities/kpi-bar.tsx` (rebuild 9 KPIs) | component | request-response | self (`KpiBar` :31-55, `KpiCell`/`Divider`) | exact (edit-in-place) |
| `components/opportunities/cells.tsx` (+`FteCell`, +`RpaFitBadge`/`rpaTier`) | component | transform | `ComplexityBadge` :84-94, `ToolBadge` :36-46, `ScoreDisplay` :105-120 | exact (same module) |
| `components/opportunities/table.tsx` (+FTE/mês, +RPA Fit cols + sort) | component | request-response | self (`SORTABLE_COLS` :25-32, `ThSort` :211-234, body cells :161-185) | exact (edit-in-place) |
| `components/opportunities/kanban/Column.tsx` (+Σ FTE in header) | component | request-response | self (header :23-37) | exact (edit-in-place) |
| `components/opportunities/kanban/Card.tsx` (+FTE chip, +RPA badge) | component | request-response | self (footer :54-68) + new `RpaFitBadge` | exact (edit-in-place) |
| `components/opportunities/modal/OpportunityDetail.tsx` (collapse 2→1 tab set + edit state) | component (store/provider) | event-driven + request-response | `WizardShell.tsx` :36-150 (state recipe) | role+flow match |
| `components/opportunities/modal/Header.tsx` (Editar/Salvar/Cancelar) | component | event-driven | `EditButton.tsx` (current static link) + `WizardShell` footer :205-248 | role match |
| `components/opportunities/modal/tabs/CriteriosTab.tsx` (read first-class + editable) | component | transform | `CriteriosStep.tsx` :44-59 (display map + edit body) | exact (drop-in reuse) |
| `components/opportunities/modal/tabs/BeneficiosTab.tsx` (read first-class + editable) | component | transform | `BeneficiosStep.tsx` (labels + fte_horas) | exact (drop-in reuse) |
| `components/opportunities/modal/tabs/ScoreTab.tsx` (5-factor via score.ts + editable) | component | transform | `PriorizacaoStep.tsx` :40-55 + `ScorePreview.tsx` | exact (drop-in reuse) |
| `components/opportunities/modal/tabs/ProcessoTab.tsx` (first-class read + editable) | component | transform | `fields.tsx` (`TextField`/`SelectField`/`TextareaField`) | role match |
| `components/opportunities/modal/tabs/ObservacaoTab.tsx` (+`risco` legado + editable) | component | transform | self (:5-26) + `fields.tsx` TextareaField | exact (edit-in-place) |
| `lib/opportunities/rpa.ts` → `deriveRpaScore` | utility | transform | **`tests/schema/rpa-score-rule.test.ts` :26-37 (`rpaScore`)** — formula ALREADY written, just extract | exact (lift existing fn) |

**Unchanged (do not touch):** `RiscoTab.tsx` (Phase 12, structured). **Unwired from display (D-09):** `PerfilTab.tsx` / `DesafiosTab.tsx` / `CoeTab.tsx` (files stay; removed from `renderTab`/tab arrays). **Kept as-is (D-14):** `EditButton.tsx` (still routes to `/edit` wizard).

---

## Shared Patterns

### Shared Pattern A — Server Action from client (the editable-modal save)
**Source:** `components/opportunities/wizard/WizardShell.tsx:106-150` (`mode='edit'` branch)
**Apply to:** `OpportunityDetail.tsx` (new `onSave`)
**Copy this recipe, with ONE change** (`router.back()` → `setEditMode(false); router.refresh()` so the modal stays open — Pitfall 4):

```typescript
const [pending, startTransition] = useTransition();
async function onSave() {
  setSubmitError(null);
  startTransition(async () => {
    // Derive 5th factor (FTE bucket) from fte_horas BEFORE submit — same as create path
    // (WizardShell.tsx:119-127). Without it, actions.ts persists `fte` as null.
    const payload = {
      ...form,
      prioridade_fte:
        form.fte_horas != null ? deriveFteBucket(Number(form.fte_horas)) : undefined,
    };
    const result = await updateOpportunity(opportunityId, payload as OpportunityInput);
    if (!result.ok) {
      setSubmitError(result.error);
      if (result.fieldErrors) setErrors(result.fieldErrors);  // surface fieldErrors
      return;
    }
    setEditMode(false);
    router.refresh();   // re-fetch DB-authoritative score/priority/rpa_score; modal stays open
  });
}
```
**Critical:** submit ONLY the `WizardFormData` shape (via `opportunityToFormData`). `opportunityInputSchema` is `.strict()` per variant — never spread `score`/`rpa_score`/`seq_id`/`tenant_id`/`id` into the payload (mass-assignment + `unrecognized_keys` failure). `WizardShell.tsx:139-142` already submits `data as OpportunityInput` exactly this way.

### Shared Pattern B — Seed editable form from a DB row
**Source:** `components/opportunities/wizard/state.ts:144-178` (`opportunityToFormData`)
**Apply to:** `OpportunityDetail.tsx` initial state
```typescript
const [form, setForm] = useState<WizardFormData>(opportunityToFormData(opportunity));
function patch(p: Partial<WizardFormData>) { setForm((d) => ({ ...d, ...p })); }
```
This is the SAME `useState<WizardFormData>` + `patch` reducer `WizardShell.tsx:38-74` uses. `opportunityToFormData` already coerces `null → ''/[]/undefined` for inputs and seeds `risco`/`observacao` (`state.ts:172-174`) — so the Observação edit (D-10) is already wired through the form payload.

### Shared Pattern C — Live derived recompute (read-only, never an input)
**Source:** `score.ts` (`calcScore`/`priorityLevel`), `fte.ts` (`deriveFteBucket` :31), `PriorizacaoStep.tsx:42-44`
**Apply to:** Header score circle, ScoreTab, RPA-fit badge, FTE bucket pill — all in edit mode
```typescript
const fteBucket = form.fte_horas != null ? deriveFteBucket(Number(form.fte_horas)) : undefined;
const score = calcScore({ esforco: form.esforco, complexidade: form.complexidade,
                          tempo: form.tempo, objetivo: form.objetivo, fte: fteBucket });
const priority = priorityLevel(score);          // 'alta' | 'media' | 'baixa'
const rpaScore = deriveRpaScore(form.criterios); // NEW — see file below
```
**docs/PROJETO.md §3 / D-15:** these feed *display* only — never editable inputs, never in the save payload.

### Shared Pattern D — Wizard steps are pure `(data, onChange, errors)` renderers
**Source:** `CriteriosStep.tsx:5-9,51`, `PriorizacaoStep.tsx:8-12`, `fields.tsx` (`TextField`/`SelectField`/`TextareaField`)
**Apply to:** Critérios/Benefícios/Score/Processo tabs in edit mode
Steps have **zero** coupling to wizard nav/routing/action — they only read `data.*` and call `onChange({...})`. Reuse them verbatim; `OpportunityDetail` owns `(form, patch, errors)` the same way `WizardShell.renderStep` does (`WizardShell.tsx:254-283`).
```typescript
// edit-mode tab body — identical prop shape to WizardShell:
<CriteriosStep data={form} onChange={patch} errors={errors} />
<BeneficiosStep data={form} onChange={patch} />
<PriorizacaoStep data={form} onChange={patch} errors={errors} />   // Score tab edit body
```

### Shared Pattern E — Criterios completeness gate before Save
**Source:** `state.ts:218-227` (`validateStep('criterios', …)`)
**Apply to:** `OpportunityDetail.onSave` (block save + show pt-BR msg)
The 8 `criterios` are all-or-null (DB CHECK `opportunities_criterios_chk`, Zod `.refine` `schema.ts:263-278`). Reuse `validateStep('criterios', form)` for the same "Responda todos os 8 critérios (n faltando)." message. Untouched legacy persona → keep `criterios` `undefined`/`null`, not `{}`.

### Shared Pattern F — Badge cell convention (label-map + pill)
**Source:** `cells.tsx` — `ToolBadge` :30-46, `ComplexityBadge` :78-94, `ScoreDisplay` :99-120
**Apply to:** new `FteCell`, `RpaFitBadge` in the same module. Const label/style map at top, `if (!value) return <span className="text-mut text-xs">—</span>`, then a styled `<span>`/inline-flex pill. Match existing class idiom (`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold`).

---

## Pattern Assignments

### `lib/opportunities/rpa.ts` (utility, transform) — NEW

**Analog:** `tests/schema/rpa-score-rule.test.ts:26-37` — the EXACT formula already exists inline as `rpaScore`. **The new file lifts this verbatim** (rename → `deriveRpaScore`, export from `lib/`). The SQL source of truth is `supabase/migrations/0011_schema_evolution_v02.sql:127-136` (`GENERATED ALWAYS`).

**Formula to lift** (`rpa-score-rule.test.ts:26-37`):
```typescript
export function deriveRpaScore(criterios: Record<string,string> | null | undefined): number | null {
  if (criterios == null) return null;
  const v = (k: string) => criterios[k];
  return (
    (v('totalmenteManual') === 'sim' || v('totalmenteManual') === 'parcial' ? 1 : 0) +
    (v('regrasClaras')   === 'sim' ? 1 : 0) +
    (v('decisaoHumana')  === 'nao' ? 1 : 0) +   // 'nao' is the favorable answer
    (v('padronizacaoDocs')=== 'sim' ? 1 : 0) +
    (v('validacaoDados') === 'sim' ? 1 : 0) +
    (v('schedulable')    === 'sim' ? 1 : 0)
  ); // 0–6 ; causaReclamacoes + temDocumentacao do NOT count
}
```
**Test:** `tests/schema/rpa-score-rule.test.ts` already covers 64/64 parity. After extracting to `lib/`, the test should `import { deriveRpaScore }` from `lib/opportunities/rpa.ts` instead of redefining `rpaScore` inline (single source). Same fixtures (0/1/3/4/5/6 cases :75-104) stay.

---

### `lib/opportunities/types.ts` → `OpportunityKpis` reshape (model, transform)

**Analog:** self, `:54-70` (current shape).
**Current shape** (`:54-70`) has `personas`/`formularios`/`byTool` + full `byStatus: Record<OpportunityStatus,number>`. **New shape (D-03):**
```typescript
export type OpportunityKpis = {
  total: number;
  scoreMedio: number;
  fteTotal: number;                                              // Math.round(Σ fte_horas)
  byPriority: { alta: number; media: number; baixa: number };    // unchanged
  byStatus: { novo: number; producao: number; concluido: number }; // only these 3 (D-02)
};
```
Drop `personas`, `formularios`, `byTool`. Narrow `byStatus` to 3 keys.

---

### `lib/opportunities/queries.ts` → `computeKpis` reshape + FTE sort (service, batch/transform)

**Analog:** self.
**`computeKpis` `:243-291`** — drop the `byTool` (:254,268-270), `personas`/`formularios` (:259-264) loops; narrow `byStatus`; add an `fteTotal` accumulator:
```typescript
let fteTotal = 0;
for (const o of opps) { /* …priority/score… */ fteTotal += o.fte_horas ?? 0; }
return { total: opps.length, scoreMedio: …, fteTotal: Math.round(fteTotal),
         byPriority, byStatus: { novo, producao, concluido } };
```
**Sort switch `:82-111`** — add two cases mirroring the existing `case 'score_asc'` idiom (:84-86):
```typescript
case 'fte_desc': q = q.order('fte_horas', { ascending: false, nullsFirst: false }); break;
case 'fte_asc':  q = q.order('fte_horas', { ascending: true,  nullsFirst: false }); break;
// (optional D-06) case 'rpa_desc'/'rpa_asc': q.order('rpa_score', …)
```
`fte_horas` and `rpa_score` are real columns on the `opportunities_with_score` view (`database.types.ts:245,248`).

---

### `lib/opportunities/filters.ts` → SortKey extension (utility, transform)

**Analog:** self. Three edit-in-place spots, all parallel arrays/maps:
- `SortKey` union `:8-17` → add `'fte_asc' | 'fte_desc'` (+ optional `'rpa_asc'|'rpa_desc'`).
- `SORT_VALUES` `:47-57` → add the same literals (drives `pickEnum` validation `:80`).
- `SORT_LABELS` `:124-134` → add pt-BR labels, same idiom as `score_desc: '🏆 Score: Maior primeiro'`.

---

### `components/opportunities/kpi-bar.tsx` → rebuild to 9 KPIs (component, request-response)

**Analog:** self (`KpiBar` :31-55). Keep `KpiCell`/`Divider` primitives (:11-29) untouched — only the JSX list changes.
**Remove** (`:36-37` personas/formularios, `:45-53` extra status + byTool). **Keep/add** the 9 KPIs (D-01): Total · 🟢 Alta · 🟡 Média · 🔴 Baixa · Score Médio · **FTE Total/mês** (`{kpis.fteTotal}h`) · Novos (`byStatus.novo`) · Produção (`byStatus.producao`) · Concluídos (`byStatus.concluido`). Color idiom already in place (:41-43).

---

### `components/opportunities/cells.tsx` → +`FteCell`, +`RpaFitBadge` (component, transform)

**Analog (same module):** `ComplexityBadge` :84-94, `ToolBadge` :36-46.
- **`FteCell`** — number `Xh`; `if (fte == null) return <span className="text-mut text-xs">—</span>` then `{Math.round(fte)}h`. Follow `ComplexityBadge` null-guard idiom.
- **`RpaFitBadge`** — 3-tier pill from `rpa_score`, tiers mirror `_giba:520-525`:
```typescript
function rpaTier(rs: number) {
  if (rs >= 5) return { icon: '⭐', label: `RPA Ideal (${rs}/6)`, bg: '#fef3c7', fg: '#92400e' };
  if (rs >= 3) return { icon: '✓',  label: `RPA+n8n (${rs}/6)`,  bg: '#e0e7ff', fg: '#3730a3' };
  return        { icon: '',  label: `n8n (${rs}/6)`,            bg: '#f1f5f9', fg: '#64748b' };
}
```
Render with the existing inline-style pill idiom (`StatusBadge` :62-72 uses `style={{ backgroundColor, color }}`). Null `rpa_score` → `—` dash like `ToolBadge`/`ComplexityBadge`.

---

### `components/opportunities/table.tsx` → +columns +sort (component, request-response)

**Analog:** self. Three coordinated edits, all following existing idioms:
- `SORTABLE_COLS` `:25-32` → add `fte: { asc: 'fte_asc', desc: 'fte_desc' }` (and optional `rpa`). Same shape as `score: { asc: 'score_asc', desc: 'score_desc' }`.
- Header `<thead>` `:79-123` → add a `<ThSort active={isActive('fte')} onClick={() => toggleSort('fte')}>FTE/mês{arrowFor('fte')}</ThSort>` (copy the Score `ThSort` :115-120) and a plain `<Th>RPA Fit</Th>` (or `ThSort` if rpa sort in scope).
- Body `<tbody>` `:161-185` → add `<Td><FteCell fte={o.fte_horas} /></Td>` and `<Td><RpaFitBadge score={o.rpa_score} /></Td>`, matching the existing `<Td><ComplexityBadge value={o.complexidade} /></Td>` (:171-173) idiom.
- **D-04:** keep the existing `<Th>Fonte</Th>` (:86) + `<SourceBadge>` (:134-136) column — conscious divergence from the mockup.

---

### `components/opportunities/kanban/Column.tsx` → +Σ FTE in header (component, request-response)

**Analog:** self (header :23-37). Compute `const fteSum = Math.round(opportunities.reduce((s,o)=>s+(o.fte_horas??0),0))` and render `⏱️ {fteSum}h FTE/mês` next to the existing count pill (:31-36). Mirrors `_giba:734`.

---

### `components/opportunities/kanban/Card.tsx` → +FTE chip +RPA badge (component, request-response)

**Analog:** self (footer :54-68, which already renders `SourceBadge` + score dot). Add a `⏱️ {Math.round(o.fte_horas ?? 0)}h/mês` chip and `<RpaFitBadge score={o.rpa_score} />` (new cell), mirroring `_giba:718-721`. Keep the existing draggable/onClick wiring (:14-36) untouched.

---

### `components/opportunities/modal/OpportunityDetail.tsx` → collapse tabs + edit state (component, event-driven)

**Analog:** `WizardShell.tsx:36-150` (the entire state machine) + self (current tab plumbing).
**Display change (D-07/D-08/D-09):** collapse `TABS_PERSONA` (:24-33) + `TABS_FORMULARIO` (:35-44) into ONE `MODAL_TABS` array of 8 (`_giba:959-968`): 📋 Processo · ✅ Critérios · 🤖 Automação · 📈 Benefícios · 📊 Score · 📅 Fases · ⚠️ Risco · 💬 Observação. Remove the `isPersona` branch (:53-55). Drop `Perfil/Desafios/Coe` cases from `renderTab` (:86-91).
**Edit state (D-12):** add the WizardShell recipe — `useState<WizardFormData>(opportunityToFormData(opportunity))`, `patch`, `errors`, `submitError`, `useTransition`, `onSave` (Shared Pattern A). `editMode` boolean toggled by Header. `renderTab` branches: read mode → display tabs (realigned), edit mode → wizard step bodies (Shared Pattern D). Already `'use client'` (:1).

---

### `components/opportunities/modal/Header.tsx` → Editar/Salvar/Cancelar (component, event-driven)

**Analog:** current `EditButton.tsx` (static link — keep for `/edit`, D-14) + `WizardShell` footer buttons `:205-248` (button styling/disabled-while-pending idiom).
Add props `editMode`, `pending`, `onEdit`, `onSave`, `onCancel`. Read mode → `[✏️ Editar]` (toggles `editMode`, NOT a link — distinct from `EditButton`'s `/edit` route). Edit mode → `[💾 Salvar]` (disabled while `pending`, label `Salvando...` like `WizardShell.tsx:240-244`) + `[✕ Cancelar]` (discards: reset form to `opportunityToFormData(opportunity)`, `setEditMode(false)`). The live score circle (:53-63) shows `calcScore` result in edit mode (Shared Pattern C).

---

### `components/opportunities/modal/tabs/CriteriosTab.tsx` (component, transform)

**Analog:** `CriteriosStep.tsx:27-59` (correct first-class domain).
**Pitfall 3 — CURRENT tab reads the WRONG model:** `CriteriosTab.tsx:32` reads `o.formulario_extras?.criterios` (legacy **UPPERCASE** `SIM/NAO/PARCIAL`, 10 snake_case criteria :11-22). **Realign (D-11)** to first-class `o.criterios` (8 **lowercase camelCase**: `causaReclamacoes`…`temDocumentacao`). Use `CriteriosStep`'s `CRITERIOS` list (:27-36) + `visual()` map (:44-49) as the correct rendering. Edit mode → render `<CriteriosStep data={form} onChange={patch} errors={errors} />` (drop-in). Null `criterios` (legacy persona) → empty state pt-BR (D-08).

---

### `components/opportunities/modal/tabs/ScoreTab.tsx` (component, transform)

**Analog:** `PriorizacaoStep.tsx:14-55` (5-factor weights + FTE bucket) + `lib/opportunities/score.ts` (`calcScore`).
**Pitfall 3 — CURRENT tab is a 4-factor approximation** (`ScoreTab.tsx:11-13` `EFFORT_VALUES`/`COMPLEX_VALUES`, NOT `calcScore`, no FTE 5th factor; placeholder text :82 "Edição dos pesos virá na Phase 6"). **Realign (D-11):** show the real 5-factor breakdown using `score.ts` weights + surface the FTE factor (weights documented in `PriorizacaoStep` :15-38). Remove the placeholder text. Keep the score-bar visual (:58-79). Edit mode → render `PriorizacaoStep` body (the 4 manual factors + read-only FTE bucket + `ScorePreview`).

---

### `components/opportunities/modal/tabs/BeneficiosTab.tsx` (component, transform)

**Analog:** `BeneficiosStep.tsx` (first-class `data.beneficios` 1–5 labels + `data.fte_horas`).
**Pitfall 3:** current tab reads legacy `formulario_extras.beneficios`; realign to first-class `o.beneficios` (camelCase) + `o.fte_horas`. Edit mode → `<BeneficiosStep data={form} onChange={patch} />` drop-in. Empty first-class → empty state pt-BR (D-08).

---

### `components/opportunities/modal/tabs/ProcessoTab.tsx` (component, transform)

**Analog:** `fields.tsx` (`TextField`/`SelectField`/`TextareaField` :41+) for editable inputs; first-class columns for read (`o.frequencia`, `o.area`, `o.subarea`, `o.processo`, `o.num_pessoas`, `o.tipo_processo` :247). A3: `tipo_processo` is now a first-class `string[]` column — prefer it over `formulario_extras` (executor's discretion per field). Edit mode composes `fields.tsx` primitives (lighter than reusing the mixed `ProcessoStep`).

---

### `components/opportunities/modal/tabs/ObservacaoTab.tsx` (component, transform)

**Analog:** self (:5-26) + `fields.tsx` TextareaField.
**D-10:** in addition to `o.observacao` (current :6), render the legacy free-text `o.risco` field here (separate labeled block). Both are already seeded into the form by `opportunityToFormData` (`state.ts:172-174`: `observacao`, `risco`). Edit mode → two `TextareaField`s patching `observacao` and `risco`. Layout exact composition is executor's discretion (D-10).

---

## No Analog Found

None. Every file in scope is brownfield-modify or has an exact in-repo analog. The "new" `lib/opportunities/rpa.ts` is a lift of an existing inline function (`tests/schema/rpa-score-rule.test.ts:26-37`), and `rpaTier`/`FteCell` follow `cells.tsx` conventions.

---

## Metadata

**Analog search scope:** `components/opportunities/**` (modal, wizard, kanban, table/cells/kpi), `lib/opportunities/**` (types, queries, filters, score, fte, schema, actions), `tests/schema/**`, `app/(app)/**opportunities**` routes, `supabase/migrations/0011`.
**Files scanned (read):** 21
**Key correction vs RESEARCH.md:** RESEARCH said `tests/schema/rpa-score-rule.test.ts` and the `rpaScore` helper did not exist — they DO (formula at :26-37, 64/64 parity tests). The new `deriveRpaScore` should **extract** that existing function into `lib/opportunities/rpa.ts`, not re-derive it; then have the test import from `lib/`.
**Pattern extraction date:** 2026-06-05
