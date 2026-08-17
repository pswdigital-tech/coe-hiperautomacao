# Deferred Items — Phase 11

Out-of-scope discoveries logged during execution (not fixed — per SCOPE BOUNDARY).

## 11-01

- **Pre-existing tsc error in `app/(app)/layout.tsx(7,4): TS2304: Cannot find name 'LayoutProps'`**
  - Present on base commit `68ad5c1` (file untouched by plan 11-01).
  - Cause: Next.js 16 generated `LayoutProps<'/'>` helper type resolves from `.next/types`
    (populated by `next dev`/`next build`); a bare `tsc --noEmit` without a prior build
    cannot see it. Not related to wizard/fte changes.
  - Action: defer. Resolved naturally by a build; not a code defect in this plan's scope.
