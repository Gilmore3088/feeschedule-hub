---
phase: 26-national-data-admin-portal
fixed_at: 2026-04-07T00:00:00Z
review_path: .planning/phases/26-national-data-admin-portal/26-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 4
skipped: 2
status: partial
---

# Phase 26: Code Review Fix Report

**Fixed at:** 2026-04-07
**Source review:** .planning/phases/26-national-data-admin-portal/26-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (CR-01, CR-02, WR-01, WR-02, WR-03, WR-04)
- Fixed: 4 (WR-01 through WR-04)
- Skipped: 2 (CR-01, CR-02 — already resolved prior to this run)

## Fixed Issues

### WR-01: `source_url` rendered as raw href without protocol validation

**Files modified:** `src/app/admin/national/intelligence-actions.ts`
**Commit:** 21f59e1
**Applied fix:** Added URL protocol validation block in `addIntelligenceAction` before the tags extraction. Uses `new URL()` to parse the value and rejects anything whose `parsed.protocol` is not `"http:"` or `"https:"`, returning a typed `{ ok: false, error }` response in both the invalid-protocol and unparseable-URL cases.

---

### WR-02: Delete action result silently discarded — no UI feedback on failure

**Files modified:** `src/app/admin/national/intelligence-delete-button.tsx`
**Commit:** 1c57b4a
**Applied fix:** Added `useState<string | null>` for `error`, clears it on each attempt, inspects the `ActionResult` from `deleteIntelligenceAction`, and sets `error` when `result.ok` is false. Renders the error string in a small red `<span>` below the Delete button inside a wrapper `<div>`.

---

### WR-03: `mostRecentAsOf` uses lexicographic sort — format-dependent correctness

**Files modified:** `src/app/admin/national/overview-panel.tsx`
**Commit:** f6c0087
**Applied fix:** Replaced `dates.sort().reverse()[0]` with `dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]`. The comparator parses both strings to timestamps before comparing, making the sort correct for any date format that `Date` can parse (ISO-8601, locale strings, quarter approximations).

---

### WR-04: `getRevenueTrend` swallows errors internally, masking them in `CallReportsPanel`

**Files modified:** `src/lib/crawler-db/call-reports.ts`
**Commit:** e67cc86
**Applied fix:** Removed the wrapping `try/catch` block (including the `console.warn`) from `getRevenueTrend`. The function body is now unwrapped — DB errors propagate as thrown exceptions to the caller. `CallReportsPanel` already has its own `try/catch` that renders a user-facing error card, and `OverviewPanel` uses `.catch(() => null)` for graceful degradation. Both callers now receive real errors instead of a silent empty-data fallback.

---

## Skipped Issues

### CR-01: Missing module — `@/lib/crawler-db/health` does not exist

**File:** `src/app/admin/national/overview-panel.tsx:3`, `src/app/admin/national/health-panel.tsx:1-8`
**Reason:** Already resolved in a prior commit (a6be3d1) before this fixer run. Code was not in the broken state described by the reviewer at time of fix execution.
**Original issue:** Both files imported from `@/lib/crawler-db/health` which did not exist, causing a hard build failure.

---

### CR-02: Missing exports — `getNationalEconomicSummary` and `getDistrictBeigeBookSummaries` not in `fed.ts`

**File:** `src/app/admin/national/overview-panel.tsx:2`, `src/app/admin/national/economic-panel.tsx:2-3`
**Reason:** Already resolved in a prior commit (a6be3d1) before this fixer run. Code was not in the broken state described by the reviewer at time of fix execution.
**Original issue:** Both functions were imported from `@/lib/crawler-db/fed` but did not exist there, compounding the CR-01 build failure.

---

_Fixed: 2026-04-07_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
