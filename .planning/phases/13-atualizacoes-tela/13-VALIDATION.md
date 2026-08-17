---
phase: 13
slug: atualizacoes-tela
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-05
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `13-RESEARCH.md` → Validation Architecture. Frontend display + a client→Server Action edit path; favor pure unit tests (no DB).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.x (`package.json:45`) |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npx vitest run tests/opportunities tests/schema/rpa-score-rule.test.ts` |
| **Full suite command** | `npm run test` (`vitest run`) |
| **Estimated runtime** | ~quick units <5s; full suite ~30–60s |

Test dirs present: `tests/{schema,security,wizard,modal,opportunities,public-form,ai,helpers,setup}`. Pure unit specs run without DB; integration specs `skipIf(!NEXT_PUBLIC_SUPABASE_URL)`.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/opportunities tests/schema/rpa-score-rule.test.ts` (quick, pure units)
- **After every plan wave:** Run `npm run test`
- **Before `/gsd-verify-work`:** Full suite green + `npm run typecheck` (TS strict)
- **Max feedback latency:** ~5 seconds (quick units)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-W0-01 | W0 | 0 | D-15 | — | `deriveRpaScore` parity vs SQL GENERATED expr | unit | `npx vitest run tests/schema/rpa-score-rule.test.ts` | ❌ W0 | ⬜ pending |
| 13-W0-02 | W0 | 0 | VIEW-01 | — | `computeKpis` new shape (fteTotal, drops legacy buckets) | unit | `npx vitest run tests/opportunities/kpis.test.ts` | ❌ W0 | ⬜ pending |
| 13-W0-03 | W0 | 0 | D-05/D-16 | — | `rpaTier` thresholds (≥5/≥3/else) | unit | `npx vitest run tests/opportunities/rpa-badge.test.ts` | ❌ W0 | ⬜ pending |
| 13-W0-04 | W0 | 0 | VIEW-03 | — | sort switch accepts `fte_asc/fte_desc` | unit | `npx vitest run tests/opportunities/filters.test.ts` | ❌ W0 | ⬜ pending |
| 13-EDIT-01 | edit | — | D-12/D-13 | T-mass-assign | `opportunityToFormData` round-trip → `opportunityInputSchema` passes; payload excludes tenant_id/id/seq_id/score/rpa_score | unit | `npx vitest run tests/wizard/state.test.ts` | ✅ exists (extend) | ⬜ pending |
| 13-EDIT-02 | edit | — | D-15 | T-persist-derived | live `calcScore`/`deriveFteBucket` recompute correct | unit | `npx vitest run tests/schema/score-rule.test.ts` | ✅ exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/opportunities/rpa.ts` + `tests/schema/rpa-score-rule.test.ts` — `deriveRpaScore` parity with the SQL `GENERATED` expr (`0011:127-136`); mirror `score-rule.test.ts` (D-15)
- [ ] `tests/opportunities/kpis.test.ts` — `computeKpis` new shape: `fteTotal = Math.round(Σ fte_horas)`, drops `personas`/`formularios`/`byTool` (VIEW-01)
- [ ] `tests/opportunities/rpa-badge.test.ts` — tier thresholds ⭐≥5 / ✓≥3 / else (D-05/D-16)
- [ ] `tests/opportunities/filters.test.ts` (extend or create) — `fte_asc`/`fte_desc` sort keys (VIEW-03)
- [ ] Extend `tests/wizard/state.test.ts` — `opportunityToFormData` round-trip → schema parse for a legacy persona (D-08/D-15: edit writes first-class)

*Existing infra (Vitest + dirs + `score-rule.test.ts`) covers the derived-recompute parity for score/fte.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Modal edit interaction round-trip | VIEW-05 / D-12 | Interactive UI state (global edit toggle, live recompute, persist) — not unit-coverable end-to-end | Open modal → Editar → alterar critérios → ver score + RPA Fit recalcularem ao vivo → Salvar → reabrir modal e confirmar valores first-class persistidos; Cancelar descarta |
| KPI bar / tabela / kanban visual parity w/ `_giba` | VIEW-01..04 | Visual parity is a human judgment vs the mockup | `npm run dev` → comparar KPI bar (9 KPIs), colunas FTE/RPA Fit + sort, FTE somado por coluna do kanban + chips nos cards contra `_giba_wsi-dashboard.html` |
| Legacy persona renders 8 tabs w/ empty states | D-08 | Requires a legacy FGCoop persona row in DB | Abrir uma das 29 personas FGCoop → confirmar 8 abas, empty states pt-BR onde first-class é null |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s (quick units)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
