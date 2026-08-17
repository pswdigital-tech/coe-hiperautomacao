---
status: issues_found
phase: 11-wizard-fluxo-unico
depth: standard
files_reviewed: 9
diff_base: 68ad5c1ec6130bf003110f69c7ff13a947d73d46
reviewed: 2026-06-05
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
resolved:
  - WR-01
---

> **Update 2026-06-05:** WR-01 fixed — deselect now removes the benefit key
> (`update(key, null)` → `delete`) instead of writing `0`. tsc clean, 113/113
> tests pass. IN-01 and IN-02 left as-is (Info, server-guarded / latent).

# Code Review — Phase 11 (wizard-fluxo-unico)

Standard-depth review of the 7 source files (+2 test files) changed in Phase 11.
Reviewed against project invariants in `docs/PROJETO.md` (score never persisted; `fte`
bucket IS persisted via `deriveFteBucket`; `criterios`/`beneficios` first-class
top-level; `.strict()` mass-assignment guard; UI pt-BR / code English).

Files:
- lib/opportunities/fte.ts
- components/opportunities/wizard/state.ts
- components/opportunities/wizard/WizardShell.tsx
- components/opportunities/wizard/steps/CriteriosStep.tsx
- components/opportunities/wizard/steps/BeneficiosStep.tsx
- components/opportunities/wizard/steps/ProcessoStep.tsx
- components/opportunities/wizard/steps/PriorizacaoStep.tsx
- tests/opportunities/fte.test.ts
- tests/wizard/state.test.ts

Overall: clean implementation. FTE single-source (`deriveFteBucket`) wiring is
correct end-to-end (display in Priorização === persisted `fte` at submit, both
via the same fn). One real correctness bug on the benefit-deselect path.

---

## Findings

### WR-01 — BeneficiosStep writes `0` to deselect, but schema requires `min(1)` → submit rejected
**Severity:** Warning
**File:** components/opportunities/wizard/steps/BeneficiosStep.tsx:97

The benefit buttons toggle off by writing `0`:
```tsx
onClick={() => update(b.key, active ? 0 : n)}
```
`update` sets `data.beneficios[key] = 0`. The server schema constrains each
benefit to `z.number().int().min(1).max(5)` (lib/opportunities/schema.ts:262-269),
under `.strict()`. So once a user clicks an already-active benefit to deselect it,
the key remains present with value `0`, and `createOpportunity` fails Zod
validation at submit — the user is blocked with a (cryptic) `submitError`, for a
plausible interaction (accidental double-click / changing one's mind).

The happy path (set each benefit once, never deselect) works, which is why the
suite stays green — there is no test exercising deselect→submit.

**Fix:** deselect should remove the key (or set `undefined`), not `0`. e.g.:
```tsx
function update(key, value) {
  const next = { ...beneficios };
  if (value == null) delete next[key]; else next[key] = value;
  onChange({ beneficios: next });
}
// onClick={() => update(b.key, active ? null : n)}
```
The `v ?? '—'` display and `active = v === n` logic already handle absent keys.

---

### IN-01 — `fte_horas` manual entry accepts negatives client-side
**Severity:** Info
**File:** components/opportunities/wizard/steps/BeneficiosStep.tsx:44-52

`updateFteHoras` keeps any finite number (`Number.isFinite(n) ? n : undefined`),
so typing `-5` is accepted into state despite `min={0}` on the `<input>` (min is
not enforced on keyboard entry). Low impact — the server schema
(`fte_horas: z.number().min(0)`, schema.ts:226) rejects it, and `deriveFteBucket`
clamps non-positive to `'muito_baixo'`, so display is sane. Optional: clamp
`n < 0 → undefined` (or `0`) client-side for immediate feedback instead of a
submit-time error.

---

### IN-02 — create payload cast carries both `persona_extras` and `formulario_extras` shapes
**Severity:** Info
**File:** components/opportunities/wizard/WizardShell.tsx:122-128

`payload` spreads all of `WizardFormData` and is cast `as OpportunityInput`. In
the create flow this is currently safe: `source='formulario'` is fixed
(`defaultFormData`), and `ProcessoStep` only patches `formulario_extras` when
`isFormulario` (always true in create), so `persona_extras` is never populated and
the formulário variant's `.strict()` is satisfied. Noted only as a latent trap: if
a future step ever sets `persona_extras` in the create flow, the discriminated-union
`.strict()` would reject the submit. No action needed now.

---

## Notes (verified OK)
- FTE persistence gap closed: `WizardShell` derives `prioridade_fte` from
  `fte_horas` → `actions.ts:359` persists `fte: data.prioridade_fte ?? null`. Same
  `deriveFteBucket` used in Priorização preview → display === persistence (D-01).
- `criterios`/`beneficios` written top-level with the exact 8 camelCase keys each;
  `criterioEnum` lowercase values — matches schema (mass-assignment safe).
- Score is never persisted; `tempo` factor sourced once from Frequência select in
  ProcessoStep (no frequência×tempo redundancy).
- `state.ts` create flow is single 5-step, always `source='formulario'`;
  `mode='edit'` legacy paths untouched.
- UI strings pt-BR, identifiers English — consistent.
