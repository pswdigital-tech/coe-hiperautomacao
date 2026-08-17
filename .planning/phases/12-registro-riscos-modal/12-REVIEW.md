---
phase: 12-registro-riscos-modal
reviewed: 2026-06-05T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - lib/opportunities/queries.ts
  - lib/opportunities/risk-actions.ts
  - lib/opportunities/risk-labels.ts
  - lib/opportunities/types.ts
  - components/opportunities/modal/tabs/RiscoTab.tsx
  - components/opportunities/modal/risk/RiskTable.tsx
  - components/opportunities/modal/risk/RiskForm.tsx
  - components/opportunities/modal/risk/RiskFormDialog.tsx
  - components/opportunities/modal/risk/RiskFormPage.tsx
  - components/opportunities/modal/risk/DeleteRiskButton.tsx
  - components/opportunities/modal/OpportunityDetail.tsx
  - app/(app)/@modal/(.)opportunities/[id]/page.tsx
  - app/(app)/opportunities/[id]/page.tsx
  - app/(app)/opportunities/[id]/riscos/new/page.tsx
  - app/(app)/opportunities/[id]/riscos/[riskId]/edit/page.tsx
  - tests/security/risk-mass-assignment.test.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-06-05
**Depth:** standard
**Files Reviewed:** 17 (16 in scope + `risk-schema.ts` read for cross-reference; `0011_schema_evolution_v02.sql` consulted for RLS/trigger behavior)
**Status:** issues_found

## Summary

The risk-register CRUD is well-built and the headline security controls are solid. Mass-assignment defense is genuinely defense-in-depth: `riskInputSchema.strict()` rejects forged keys (verified by `tests/security/risk-mass-assignment.test.ts`), the server actions enumerate columns explicitly with no blind spread, `tenant_id` is server-derived from the profile, `opportunity_id` comes from the route arg, and `priority` is never in the payload — the DB trigger `set_risk_priority()` is the sole authority (confirmed in migration 0011:259-291, and the matrix is exhaustive across all valid enum combinations, so no NULL priority results from valid input). Cross-tenant read isolation on the fullscreen edit route relies correctly on RLS → `notFound()`.

The findings below are not leaks of another tenant's data — RLS holds throughout. They are **same-tenant integrity / correctness gaps** where the `opportunity_id` in the URL is never cross-checked against the risk being mutated, plus a few minor quality items. None are blockers, but WR-01 and WR-02 are worth addressing because they let a tenant produce inconsistent/orphaned risk data within their own space.

## Warnings

### WR-01: `createRisk` never verifies `opportunityId` belongs to the caller's tenant

**File:** `lib/opportunities/risk-actions.ts:65-82`
**Issue:** `createRisk` inserts with `opportunity_id: opportunityId` (from the route) and `tenant_id: profile.tenant_id` (server-derived). The RLS insert policy only checks `tenant_id = current_tenant_id()` (0011:251) — it does **not** validate that `opportunity_id` belongs to that tenant. The FK `references opportunities(id)` (0011:220) only checks the opportunity exists, not its owner. So a tenant-A user who calls `createRisk('<tenant-B-opportunity-id>', validInput)` (e.g. via a crafted deep-link `/opportunities/<B-opp>/riscos/new` — the `new` page does `fetchOpportunityById(id)` which RLS-filters to `notFound`, but the server action itself is independently callable) creates a row owned by tenant A pointing at tenant B's opportunity. This does not leak B's data (the row's `tenant_id` is A, so B never sees it), but it produces an orphaned/garbage risk in A's space referencing a foreign opportunity. The companion route `riscos/new/page.tsx:17` does guard the page render via RLS, but the action has no equivalent check.
**Fix:** Validate ownership inside the action before insert, mirroring the RLS-scoped read the page already does:
```ts
const { data: opp } = await supabase
  .from('opportunities')
  .select('id')
  .eq('id', opportunityId)
  .maybeSingle();
if (!opp) return { ok: false, error: 'Oportunidade não encontrada.' };
// RLS filters opportunities by tenant → maybeSingle returns null cross-tenant
```

### WR-02: `updateRisk`/`deleteRisk` and the edit route don't tie the risk to `opportunityId`

**File:** `lib/opportunities/risk-actions.ts:131-146` (update), `178-182` (delete); `app/(app)/opportunities/[id]/riscos/[riskId]/edit/page.tsx:15-17`
**Issue:** `updateRisk`/`deleteRisk` scope only by `.eq('id', riskId).eq('tenant_id', ...)`; `opportunityId` is used solely for `revalidatePath`. The fullscreen edit page fetches `fetchRiskById(riskId)` but never asserts `risk.opportunity_id === id`. Within one tenant, a user can hit `/opportunities/<oppA>/riscos/<riskB-from-oppB>/edit` (same tenant) and successfully edit/delete risk B while the page header, the "← Voltar" link, and `RiskFormPage.onDone` (`RiskFormPage.tsx:30`) all navigate back to opp A. The mutation succeeds against the wrong-labeled context and `revalidatePath` refreshes the wrong opportunity path, so opp B's view can look stale. Correctness/UX bug rather than a security leak.
**Fix:** In `EditRiskPage`, after fetching, verify the parent matches and 404 otherwise:
```ts
const risk = await fetchRiskById(riskId);
if (!risk || risk.opportunity_id !== id) notFound();
```
Optionally pass `opportunityId` through `updateRisk`/`deleteRisk` as an additional `.eq('opportunity_id', opportunityId)` guard so the action and the `revalidatePath` target can never diverge.

### WR-03: `close()` in `RiskFormDialog` discards all query params, not just `?risco`

**File:** `components/opportunities/modal/risk/RiskFormDialog.tsx:30-32`
**Issue:** `close()` calls `router.replace(pathname)`, dropping the entire query string. If the underlying opportunities list/modal URL ever carries other params (filters, sort, search — `lib/opportunities/filters.ts` is consumed by `fetchOpportunities`), closing the risk dialog silently wipes them. The doc comment on line 20 claims it "preserva o modal subjacente," but only the path is preserved, not sibling params. Today the modal route may not carry extra params, but this is fragile against the existing toolbar-filter feature.
**Fix:** Strip only the `risco` key:
```ts
function close() {
  const next = new URLSearchParams(searchParams);
  next.delete('risco');
  const qs = next.toString();
  router.replace(qs ? `${pathname}?${qs}` : pathname);
}
```

## Info

### IN-01: ESC handler effect omits `close` from deps via eslint-disable

**File:** `components/opportunities/modal/risk/RiskFormDialog.tsx:35-43`
**Issue:** The keydown effect depends on `isOpen` only and disables `react-hooks/exhaustive-deps`. `close` closes over `router`/`pathname`/`searchParams`; if `searchParams` changes while the dialog is open, the stale closure would `replace(pathname)` with the params as they were at mount. Low risk in practice (the dialog is short-lived), but the disable hides a real staleness path that compounds with WR-03.
**Fix:** Wrap `close` in `useCallback([pathname, searchParams, router])` and add it to the effect deps, or inline the handler logic so the lint rule is satisfied without a disable.

### IN-02: `RiskForm` has no client-side required-field guard for `descricao`

**File:** `components/opportunities/modal/risk/RiskForm.tsx:69-100`, `118-124`
**Issue:** `descricao` is required (`risk-schema.ts:23`) but the `<input>` has no `required` attribute and submit always fires the transition; the empty-string case is only caught server-side, costing a round-trip and showing the error after the action returns. The label shows `*` but nothing enforces it locally.
**Fix:** Add `required` to the `rf-desc` input (and/or short-circuit `onSubmit` when `descricao.trim() === ''`) for immediate feedback. Server validation stays as the authority.

### IN-03: `responsavel` empty-string handling is duplicated across layers

**File:** `lib/opportunities/risk-actions.ts:72,76,77` and `136,140,141`
**Issue:** `data.responsavel || null` (and same for `resposta`/`descricao_impacto`) is repeated in both `createRisk` and `updateRisk`. The schema already allows `''`; the `|| null` normalization is identical in two places and easy to let drift. Minor duplication, not a bug.
**Fix:** Optionally normalize once (e.g. a small `nullIfEmpty` helper or a Zod `.transform(v => v || null)` on those fields) so insert and update share one source of truth.

### IN-04: `RiskFormDialog` and `RiskFormPage` largely duplicate the form chrome

**File:** `components/opportunities/modal/risk/RiskFormDialog.tsx:65-88` vs `components/opportunities/modal/risk/RiskFormPage.tsx:33-60`
**Issue:** Both wrap `RiskForm` with near-identical header markup ("➕ Novo Risco" / "✏️ Editar Risco") and card styling, differing only in overlay-vs-page container. Acceptable given the deliberate soft-path/deep-link split documented in the comments, but the header title logic is copy-pasted. Flagging only for future maintenance; no action required this phase.
**Fix:** If a third surface appears, extract a shared `<RiskFormCard title>` wrapper. Not worth refactoring now.

---

_Reviewed: 2026-06-05_
_Reviewer: agente gsd-code-reviewer_
_Depth: standard_
