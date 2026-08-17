---
phase: 15-seed-dados-workshop
reviewed: 2026-06-05T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - supabase/migrations/0013_seed_unidasul_opportunities.sql
  - tests/security/unidasul-isolation.test.ts
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-06-05T00:00:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found (2 info-only; no Critical/Warning)

## Summary

Reviewed the write-only data-seed migration `0013_seed_unidasul_opportunities.sql` (tenant + admin + 64 Workshop I opportunities) and the cross-tenant isolation test `unidasul-isolation.test.ts`. Both files are correct and high quality. No bugs, no security defects, no constraint violations found.

Verification performed against the live v0.2 schema (migrations 0001 and 0011):

- **SQL escaping / injection:** Parsed all 64 VALUES rows with a quote/bracket-aware splitter. Every row has exactly 25 top-level values matching the 25-column list, balanced single-quotes and balanced `array[...]` brackets. No unescaped apostrophe inside any free-text word. The 4 `''` tokens in the file are the empty-string columns of the `auth.users` insert (confirmation_token etc.), not text-escaping artifacts. No interpolation/dynamic SQL anywhere.
- **Enum/cast correctness:** Every cast value is a legal member of its enum — `frequency_bucket` (diario/semanal/quinzenal/mensal/anual), `fte_bucket` (muito_baixo/baixo/medio/alto/muito_alto), `opportunity_source` (formulario), `automation_tool` (rpa/ambos), `opportunity_status` (novo), `effort_level`, `complexity_level`. All confirmed against `0001_init.sql` / `0011_schema_evolution_v02.sql`.
- **jsonb CHECK-constraint compliance:** `criterios` carries all 8 required keys (`?&` constraint) with values only in {sim,nao,parcial}; `beneficios` carries all 8 keys with values only in 1–5. Both match `opportunities_criterios_chk` / `opportunities_beneficios_chk` exactly.
- **Forbidden columns (docs/PROJETO.md §3):** `seq_id`, `rpa_score`, `score`, `priority_level` are NOT in the column list — correctly left to the trigger / GENERATED column / view.
- **NOT NULL / FK / CHECK:** All NOT NULL columns (tenant_id, source, solicitante, area, processo) populated in every row. `objetivo` values are all 2–5 (passes `check between 1 and 5`). `created_by` FK to `profiles(id)` is satisfiable because block 2c guarantees the admin profile exists before the opportunities insert (correct ordering). `opportunities_extras_match_source` is satisfied (source='formulario', persona_extras null).
- **Idempotency (D-06):** tenant via `on conflict (slug) do nothing`; auth user / identity via `if not exists`; profile via if-not-exists insert + role-fixup update; 64 opps via count-guard. Re-running cannot duplicate. Sound.
- **PII:** Real names/emails present — accepted documented decision D-05, NOT flagged.
- **Test correctness:** All imports resolve (`asAcme`, `asService`, `serviceRoleClient`, `seedTestTenants`). `tenants.status='active'` is valid (check in active/suspended). RLS-cross-tenant assertion is correct semantics: USING filters silently → `data === []` / `count === 0`, not an error. Service-role sanity check correctly guards against false-negatives. `skipIf(!HAS_DB)` + lazy init mirrors the established pattern.

## Info

### IN-01: Test `afterAll` cleans opportunities but leaves the Unidasul tenant row behind

**File:** `tests/security/unidasul-isolation.test.ts:90-97`
**Issue:** `beforeAll` upserts a `tenants` row for Unidasul (lines 54-63), but `afterAll` only deletes the seeded opportunities, not the tenant row. The orphaned tenant persists in the test DB across runs. This is harmless (the next run re-upserts by id, and no opps remain), but it is an asymmetric setup/teardown — the helper seeds two things and tears down one.
**Fix:** Optional. Either leave as-is (the upsert is idempotent by `id`, so subsequent runs are unaffected) or add tenant cleanup for symmetry, guarding against FK issues from other suites that may reference the same tenant:
```ts
afterAll(async () => {
  if (!sb) return;
  await sb.from('opportunities').delete().eq('tenant_id', UNIDASUL_TENANT_ID);
  // optional symmetry — only if no other suite depends on this tenant:
  // await sb.from('tenants').delete().eq('id', UNIDASUL_TENANT_ID);
});
```

### IN-02: UUID literal kept in sync by comment-only contract between migration and test

**File:** `tests/security/unidasul-isolation.test.ts:35-37`
**Issue:** `UNIDASUL_TENANT_ID = '55551da5-0000-0000-0000-000000000001'` is duplicated from the migration and kept in sync only by a comment ("Manter em sincronia"). If the migration's tenant UUID ever changes, the test would silently exercise a different (possibly empty) tenant and could pass vacuously.
**Fix:** Low priority for a one-off seed. If a shared test-constants module already exists (e.g. `tests/setup/seed-test-tenants.ts` exports `FGCOOP_TEST_ID`/`ACME_TEST_ID`), consider exporting a `UNIDASUL_TENANT_ID` there and importing it in both the test and any future TS consumer, so the literal has a single source of truth. The migration itself (SQL) will still hold its own copy, which is unavoidable.

---

_Reviewed: 2026-06-05T00:00:00Z_
_Reviewer: agente gsd-code-reviewer_
_Depth: standard_
