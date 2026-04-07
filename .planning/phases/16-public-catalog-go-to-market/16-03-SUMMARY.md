---
phase: 16-public-catalog-go-to-market
plan: "03"
subsystem: ui
tags: [next.js, react, server-actions, isr, server-components, admin]

requires:
  - phase: 13-report-engine-core
    provides: report_jobs table, ReportJob/PublishedReport types, /api/reports/generate endpoint
  - phase: 14-recurring-reports
    provides: cron auth pattern for generate route

provides:
  - /admin/reports page with job table, status/type filters, publish and retry actions
  - publishReport server action (inserts to published_reports + revalidatePath ISR)
  - retryReport server action (re-creates pending job for failed jobs)
  - ReportControls client component with inline generation buttons and job status poller
  - Reports link in admin sidebar under Content group

affects: [16-public-catalog-go-to-market, 15-premium-products]

tech-stack:
  added: []
  patterns:
    - "Server action void wrapping: inline async arrow with 'use server' inside form action to satisfy TypeScript void constraint"
    - "GenState discriminated union for tracking per-button generation lifecycle (idle/picking_state/generating/complete/failed)"
    - "JobPoller useEffect/setInterval pattern: 3s polling, clears on terminal state"

key-files:
  created:
    - src/app/admin/reports/page.tsx
    - src/app/admin/reports/actions.ts
    - src/app/admin/reports/report-controls.tsx
  modified:
    - src/app/admin/admin-nav.tsx
    - src/app/api/reports/generate/route.ts

key-decisions:
  - "Form actions use inline 'use server' async wrappers rather than .bind() to satisfy TypeScript void return constraint"
  - "publishReport handles slug collision via ON CONFLICT DO NOTHING + timestamp fallback"
  - "retryReport fires Modal trigger non-blocking (same pattern as generate route)"
  - "ReportControls handles only generation buttons; publish/retry actions remain in server component as form actions"

patterns-established:
  - "Admin report page pattern: server component fetches jobs + publishedJobIds, passes to client controls component"
  - "Inline server action wrapping: async () => { 'use server'; await action(args); } for typed form actions"

requirements-completed: [METH-02, PUB-01, PUB-02, PUB-03]

duration: 25min
completed: 2026-04-06
---

# Phase 16 Plan 03: Admin Report Management Page Summary

**Admin control center at /admin/reports with one-click generation buttons, 4-step inline polling stepper, server-action publish/retry forms, and ISR revalidation wired to /reports catalog**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-06T00:00:00Z
- **Completed:** 2026-04-06T00:25:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `/admin/reports` server component renders all `report_jobs` rows with filterable status/type dropdowns and an empty-state message
- Three generation buttons (National Quarterly, State Index with state picker, Monthly Pulse) trigger POST to `/api/reports/generate` with inline `JobPoller` stepper showing pending → assembling → rendering → complete
- `publishReport` server action inserts into `published_reports` and calls `revalidatePath` for both `/reports` and `/reports/[slug]`, wiring the admin UI to the public ISR catalog
- `retryReport` server action re-creates a `pending` job from a failed one and fires Modal trigger non-blocking
- Reports link added to admin sidebar under new "Content" nav group

## Task Commits

1. **Task 1: Admin reports page, server actions, nav link** - `59b10aa` (feat)
2. **Task 2: ReportControls client component with inline polling** - `ed23f0a` (feat)

## Files Created/Modified

- `src/app/admin/reports/page.tsx` - Server component: job table with status/type filters, Publish and Retry form actions
- `src/app/admin/reports/actions.ts` - `publishReport` + `retryReport` server actions with `requireAuth`
- `src/app/admin/reports/report-controls.tsx` - Client component: generation buttons, state picker, `JobPoller` stepper
- `src/app/admin/admin-nav.tsx` - Added "Content" group with Reports link
- `src/app/api/reports/generate/route.ts` - Resolved pre-existing merge conflict markers (kept cron auth version)

## Decisions Made

- Used inline `async () => { "use server"; await action(args); }` form action wrappers instead of `.bind()` — TypeScript requires form actions to return `void | Promise<void>`, not the typed return of `publishReport`/`retryReport`
- `publishReport` uses `ON CONFLICT (slug) DO NOTHING` with timestamp fallback to handle slug collisions gracefully
- `ReportControls` owns only generation UI; publish/retry are server-side form actions in the page server component, avoiding hydration complexity
- `retryReport` fires a non-blocking Modal trigger matching the same pattern as the generate route

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Resolved merge conflict markers in generate/route.ts**
- **Found during:** Task 1 (TypeScript verification)
- **Issue:** `src/app/api/reports/generate/route.ts` had unresolved `<<<<<<< HEAD` / `>>>>>>> worktree-agent-a6da4c7b` markers causing `TS1185` errors that blocked clean TypeScript output
- **Fix:** Resolved by keeping the more complete worktree version (cron auth support, T-14-07 mitigation)
- **Files modified:** `src/app/api/reports/generate/route.ts`
- **Verification:** `npx tsc --noEmit` shows no errors in target files after fix
- **Committed in:** `59b10aa` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed TypeScript void constraint on form actions**
- **Found during:** Task 1 TypeScript verification
- **Issue:** `publishReport.bind(null, ...)` and `retryReport.bind(null, ...)` produce `() => Promise<{ success: boolean; ... }>` which is not assignable to `form action`'s expected `(formData: FormData) => void | Promise<void>`
- **Fix:** Wrapped in inline `async () => { "use server"; await action(args); }` pattern which satisfies the void constraint
- **Files modified:** `src/app/admin/reports/page.tsx`
- **Verification:** `npx tsc --noEmit` reports no errors in `admin/reports`
- **Committed in:** `59b10aa` (Task 1 commit, same pass)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for compilation and correct behavior. No scope changes.

## Issues Encountered

Pre-existing TypeScript errors in unrelated files (vitest imports, hamilton/types, report-templates missing state-fee-index module) — all pre-existing, out of scope, not fixed per deviation scope boundary rule.

## Known Stubs

None — all wired to real data sources (`report_jobs` and `published_reports` tables).

## Threat Flags

None — all threat mitigations from plan applied: `requireAuth("trigger_jobs")` on both actions, slug sanitization in `generateSlug()`, `WHERE status = 'failed'` constraint in `retryReport`, type filter validated against explicit allowlist in page.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Admin report management is fully operational; admins can generate, preview, publish, and retry all three report types
- `publishReport` action wires to `/reports/[slug]` ISR — public catalog pages (16-01, 16-02) can now be populated from the admin UI
- The `published_reports` table is populated via this page; any public report landing page plan reads from that table

---
*Phase: 16-public-catalog-go-to-market*
*Completed: 2026-04-06*
