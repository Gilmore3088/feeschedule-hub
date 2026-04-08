---
phase: 26-national-data-admin-portal
reviewed: 2026-04-07T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - src/app/admin/national/page.tsx
  - src/app/admin/national/tab-nav.tsx
  - src/app/admin/national/overview-panel.tsx
  - src/app/admin/national/call-reports-panel.tsx
  - src/app/admin/national/revenue-trend-chart.tsx
  - src/app/admin/national/economic-panel.tsx
  - src/app/admin/national/health-panel.tsx
  - src/app/admin/national/growth-chart.tsx
  - src/app/admin/national/intelligence-panel.tsx
  - src/app/admin/national/intelligence-add-form.tsx
  - src/app/admin/national/intelligence-delete-button.tsx
  - src/app/admin/national/intelligence-actions.ts
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 26: Code Review Report

**Reviewed:** 2026-04-07
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

This set of files implements the National Data admin portal: a tabbed interface showing Call Report revenue trends, FRED economic indicators, industry health metrics, Beige Book summaries, and a curated external intelligence feed.

The intelligence CRUD flow (add/delete) is well-structured — auth is enforced server-side, category values are validated against an allowlist, and revalidation is triggered correctly. The chart components handle empty data cleanly.

The two critical issues are import-time build failures: `overview-panel.tsx` and `health-panel.tsx` both import from `@/lib/crawler-db/health`, and `economic-panel.tsx` imports `getNationalEconomicSummary` and `getDistrictBeigeBookSummaries` from `@/lib/crawler-db/fed` — none of these functions exist in those modules. These are not runtime degradations; they are hard TypeScript/module-resolution errors that will prevent the entire National Data portal from building.

---

## Critical Issues

### CR-01: Missing module — `@/lib/crawler-db/health` does not exist

**Files:**
- `src/app/admin/national/overview-panel.tsx:3`
- `src/app/admin/national/health-panel.tsx:1-8`

**Issue:** Both files import functions and types from `@/lib/crawler-db/health`:

```
// overview-panel.tsx:3
import { getIndustryHealthMetrics } from "@/lib/crawler-db/health";

// health-panel.tsx:1-8
import {
  getIndustryHealthMetrics,
  getDepositGrowthTrend,
  getLoanGrowthTrend,
  getHealthMetricsByCharter,
  type IndustryHealthMetrics,
  type RichIndicator,
} from "@/lib/crawler-db/health";
```

The file `src/lib/crawler-db/health.ts` does not exist in the repository. This is a hard build failure — neither `tsc --noEmit` nor `next build` will succeed. All five tabs of the National Data portal are unreachable as a result.

**Fix:** Create `src/lib/crawler-db/health.ts` exporting the four required functions and two types, drawing data from the `institution_financials` or equivalent table. Alternatively, if the data already lives in `financial.ts` or another module, re-export it from a `health.ts` barrel or update the import paths in both panel files.

---

### CR-02: Missing exports — `getNationalEconomicSummary` and `getDistrictBeigeBookSummaries` not exported from `fed.ts`

**Files:**
- `src/app/admin/national/overview-panel.tsx:2`
- `src/app/admin/national/economic-panel.tsx:2-3`

**Issue:** Both files import these two functions from `@/lib/crawler-db/fed`:

```
// overview-panel.tsx:2
import { getNationalEconomicSummary, type RichIndicator } from "@/lib/crawler-db/fed";

// economic-panel.tsx:2-3
import {
  getNationalEconomicSummary,
  getDistrictBeigeBookSummaries,
  getBeigeBookHeadlines,
  type RichIndicator,
} from "@/lib/crawler-db/fed";
```

`fed.ts` exports `getBeigeBookHeadlines`, `getDistrictIndicators`, `getFredSummary`, and others — but neither `getNationalEconomicSummary` nor `getDistrictBeigeBookSummaries` exists in that file. The `RichIndicator` type is also absent from `fed.ts` (it is defined only in the non-existent `health.ts`). This is a second hard build failure compounding CR-01.

**Fix:** Add `getNationalEconomicSummary` to `fed.ts` (wrapping the existing `getFredSummary` and shaping it into the expected `{ fed_funds_rate, unemployment_rate, cpi_yoy_pct, consumer_sentiment }` structure with `RichIndicator` values). Add `getDistrictBeigeBookSummaries` by querying the `fed_beige_book` table per district. Export `RichIndicator` from `fed.ts` (or from `health.ts` once created) and import it consistently.

---

## Warnings

### WR-01: `source_url` is rendered as a raw `href` without protocol validation

**File:** `src/app/admin/national/intelligence-panel.tsx:43-47`

**Issue:** A stored `source_url` value is placed directly into an anchor's `href`:

```tsx
<a
  href={item.source_url}
  target="_blank"
  rel="noopener noreferrer"
```

The browser input type is `url`, and the HTML form field enforces URL format client-side. However, there is no server-side URL protocol check in `intelligence-actions.ts`. A value such as `javascript:alert(1)` would pass the non-empty check and be stored, then rendered as a live XSS vector. The `rel="noopener noreferrer"` only mitigates window opener attacks, not `javascript:` protocol injection.

**Fix:** In `addIntelligenceAction`, validate the URL starts with `https://` or `http://` before insertion:

```typescript
if (source_url) {
  try {
    const parsed = new URL(source_url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { ok: false, error: "Source URL must use http or https." };
    }
  } catch {
    return { ok: false, error: "Source URL is not a valid URL." };
  }
}
```

---

### WR-02: Delete action result is silently discarded — no UI feedback on failure

**File:** `src/app/admin/national/intelligence-delete-button.tsx:11-13`

**Issue:** The delete action's return value is awaited but never inspected:

```typescript
startTransition(async () => {
  await deleteIntelligenceAction(id);
});
```

If `deleteIntelligenceAction` returns `{ ok: false, error: "..." }` (e.g., record not found, DB error), the error is silently swallowed. The user sees the row disappear optimistically (via revalidation on success), but on failure there is no indication anything went wrong.

**Fix:** Check the result and surface the error:

```typescript
startTransition(async () => {
  const result = await deleteIntelligenceAction(id);
  if (!result.ok) {
    // use a state variable or toast notification
    console.error("Delete failed:", result.error);
  }
});
```

The component should hold an error string in `useState` and render it adjacent to the button.

---

### WR-03: `mostRecentAsOf` uses lexicographic sort on date strings — format-dependent correctness

**File:** `src/app/admin/national/overview-panel.tsx:65-66`

**Issue:**

```typescript
return dates.sort().reverse()[0];
```

This works correctly only when all `asOf` values are ISO-8601 dates in `YYYY-MM-DD` format, since those sort lexicographically. If any `asOf` value is in a locale-formatted string (e.g., `"Apr 7, 2026"` or `"2026-Q1"`), the sort will return an incorrect result — and the freshness badge will show the wrong staleness indicator. The `RichIndicator.asOf` type is `string`, so the format is not enforced at compile time.

**Fix:** Parse to timestamps before comparing:

```typescript
return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
```

---

### WR-04: `getRevenueTrend` swallows errors internally, masking them in `CallReportsPanel`

**File:** `src/lib/crawler-db/call-reports.ts:84-87` (consumed by `call-reports-panel.tsx:37-47`)

**Issue:** `getRevenueTrend` has an internal `try/catch` that logs via `console.warn` and returns `{ quarters: [], latest: null }` on any error. `CallReportsPanel` wraps the `Promise.all` in its own `try/catch` expecting an exception to be thrown on DB failure — but `getRevenueTrend` will never throw. The result is that a DB connection error renders as "No revenue data available" / empty chart instead of the error fallback card.

This is a silent failure masking real infrastructure problems from the operator.

**Fix:** Remove the internal try/catch from `getRevenueTrend` so errors propagate to the caller, which already handles them correctly with a user-facing error card. If internal error handling is intentional, document why and align `CallReportsPanel`'s error-handling expectations accordingly.

---

## Info

### IN-01: `TrendArrow` and `HealthMetricCard`/`IndicatorCard` are duplicated across files

**Files:**
- `src/app/admin/national/overview-panel.tsx:40-48`
- `src/app/admin/national/economic-panel.tsx:9-17`
- `src/app/admin/national/health-panel.tsx:12-20`

**Issue:** `TrendArrow` is defined identically in three separate files. `HealthMetricCard` (health-panel) and `IndicatorCard` (economic-panel) are structurally identical components differing only in name. This violates the single-responsibility principle and means future changes (e.g., dark mode token updates) must be applied in multiple places.

**Fix:** Extract shared components to a `src/app/admin/national/shared.tsx` (or `src/components/trend-arrow.tsx`) and import from there.

---

### IN-02: `console.warn` left in production path

**File:** `src/lib/crawler-db/call-reports.ts:85`

**Issue:**

```typescript
console.warn('[getRevenueTrend]', e);
```

Per project coding standards, `console.log`/`warn` statements should not be committed to production code. This will emit to Vercel/Docker stdout on every DB failure in production.

**Fix:** Remove the statement, or replace it with a structured error log if observability is needed (per the project's logging approach of capturing stdout).

---

### IN-03: Magic number `50` hardcoded in `IntelligencePanel`

**File:** `src/app/admin/national/intelligence-panel.tsx:88`

**Issue:**

```typescript
data = await listIntelligence(50, 0);
```

The page size of `50` is an unexplained magic number. As the intelligence record count grows, this silent limit will truncate the list without any indication to the user that more records exist (there is no pagination UI, even though `data.total` is available).

**Fix:** Define a named constant (`const PAGE_SIZE = 50`) and add a "Showing X of Y" indicator or a load-more control when `data.total > data.items.length`.

---

_Reviewed: 2026-04-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
