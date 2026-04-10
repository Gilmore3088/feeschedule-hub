---
phase: 25-derived-analytics-hamilton-tools
reviewed: 2026-04-07T12:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/lib/crawler-db/derived-analytics.ts
  - src/lib/crawler-db/derived-analytics.test.ts
  - src/lib/research/tools-internal.ts
  - src/lib/research/tools-internal.test.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 25: Code Review Report

**Reviewed:** 2026-04-07T12:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Four files reviewed: two new modules (derived analytics DB queries and their tests) and two updated modules (internal research tools and their tests). The derived analytics module is well-structured with proper error handling, typed interfaces, and a clean separation of concerns. The tools-internal integration is clean. No critical security issues found. Three warnings identified around edge-case correctness and silent error swallowing; two minor info items.

## Warnings

### WR-01: YoY calculation assumes exactly quarterly data with index-based lookup

**File:** `src/lib/crawler-db/derived-analytics.ts:58-63`
**Issue:** `computeTrendSignals` uses `values[4]` as the year-ago value, which assumes the input array contains exactly quarterly data points in chronological descending order. If the data has gaps (e.g., a missing quarter) or is not quarterly (e.g., monthly data fed in), the YoY comparison will silently compare against the wrong period. The function name and interface suggest generic trend signals, but the implementation is tightly coupled to quarterly cadence.
**Fix:** Either document the quarterly assumption clearly in a JSDoc comment and rename to `computeQuarterlyTrendSignals`, or compute YoY by finding the entry closest to 12 months prior:
```typescript
// Option A: Rename + document
/** Expects values sorted by date DESC at quarterly intervals. values[1] = QoQ base, values[4] = YoY base. */
export function computeQuarterlyTrendSignals(...)

// Option B: Date-aware lookup
const yearAgoTarget = new Date(values[0].date);
yearAgoTarget.setFullYear(yearAgoTarget.getFullYear() - 1);
const yearAgo = values.find(v => Math.abs(new Date(v.date).getTime() - yearAgoTarget.getTime()) < 45 * 86400000);
```

### WR-02: Silent error swallowing in all three DB functions hides operational issues

**File:** `src/lib/crawler-db/derived-analytics.ts:167-169, 211-212, 299-301`
**Issue:** All three async functions (`getRevenueConcentration`, `getFeeDependencyTrend`, `getRevenuePerInstitutionTrend`) catch all errors and silently return empty results. While this prevents tool crashes, it makes it impossible to distinguish "no data exists" from "database is down" from the caller's perspective. The Hamilton research agent will generate reports stating zero concentration or no trends when the DB is unreachable, producing misleading analysis.
**Fix:** Log the error before returning the fallback, so operational issues surface in logs:
```typescript
} catch (err) {
  console.error("[derived-analytics] getRevenueConcentration failed:", err);
  return { ...EMPTY_CONCENTRATION, summary: { ...EMPTY_CONCENTRATION.summary, top_n: topN } };
}
```

### WR-03: `prevalence_pct` in summary only reflects the single most prevalent category, not top-N coverage

**File:** `src/lib/crawler-db/derived-analytics.ts:153-154`
**Issue:** The `prevalence_pct` summary field is set to `topPrevalence[0].pct_of_total`, which is just the percentage of the single most prevalent category. For the `dollar_volume_pct`, the code correctly sums the top-N categories' dollar values. The asymmetry is confusing -- one metric aggregates top-N while the other reports only the top-1. The test acknowledges this ambiguity with an extended comment block (lines 76-84) trying to reason about what this field means.
**Fix:** Either rename to `top_category_prevalence_pct` for clarity, or document the intentional asymmetry (institutions overlap across categories, so summing prevalence would overcount). A comment explaining the design choice would suffice:
```typescript
// prevalence_pct: top-1 category only (can't sum -- institutions overlap across categories)
const prevalencePct =
  topPrevalence.length > 0 ? topPrevalence[0].pct_of_total : 0;
```

## Info

### IN-01: `handleCallReports` defaults `district` to 1 when not provided

**File:** `src/lib/research/tools-internal.ts:491`
**Issue:** When `view === "by_district"` and no district parameter is provided, the code defaults to district 1 via `district ?? 1`. This silently returns Boston district data when the user may not have intended a specific district. Other handlers (complaints, economic) correctly return an error when district is missing.
**Fix:** Match the pattern used by other handlers:
```typescript
case "by_district":
  if (!district) return { error: "district parameter required for by_district view" };
  return { district_revenue: await getDistrictFeeRevenue(district) };
```

### IN-02: Unused `VALID_SOURCES` constant

**File:** `src/lib/research/tools-internal.ts:426`
**Issue:** The `VALID_SOURCES` array is declared but only referenced in the `default` case of the switch statement (line 464), which is actually unreachable because the Zod schema already validates the `source` enum. The constant serves no runtime purpose.
**Fix:** Remove the constant or, if kept for documentation, add a comment noting it mirrors the Zod enum for reference only.

---

_Reviewed: 2026-04-07T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
