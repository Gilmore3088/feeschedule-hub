# Admin Pipeline Visibility & Manual URL Ingestion

## Overview

The admin portal only shows institutions that already have extracted fees (2,112 of 8,750 = 24%). The remaining 76% are invisible — no way to see which large institutions are missing, why crawls fail, or manually submit fee schedule URLs for extraction. This creates a blind spot where $1.8T Citibank and $8.9B Space Coast CU are absent with no visibility.

## Problem Statement

1. **No coverage gap visibility** — can't see which institutions lack fee data, sorted by importance (asset size)
2. **No pipeline status** — can't see crawl failures, stale data, or the ingestion funnel
3. **No manual URL submission** — can't paste a fee schedule URL for an institution and trigger extraction
4. **No data quality dashboard** — hygiene metrics (uncategorized fees, null amounts, duplicates) buried in code

### Current Pipeline Funnel (as of 2026-03-14)

| Stage | Count | % |
|-------|-------|---|
| Total institutions | 8,750 | 100% |
| With website URL | 8,116 | 93% |
| With fee schedule URL | 2,575 | 29% |
| With extracted fees | 2,112 | 24% |
| Stale (>90d or never crawled) | 634 | 7% |
| Failing (>3 consecutive) | 245 | 3% |

## Phase 1: Pipeline Dashboard Page (`/admin/pipeline`)

### 1a. Coverage Funnel Visualization

Display the funnel from `getCoverageFunnel()` in `quality.ts` as a horizontal bar/funnel chart:
- Total institutions -> With website -> With fee URL -> With fees -> Approved fees
- Each step shows count, percentage, and drop-off

### 1b. Coverage Gaps Table

Sortable table of institutions **missing fee data**, sorted by asset size descending (biggest gaps first):

| Column | Source |
|--------|--------|
| Institution | `institution_name` |
| State | `state_code` |
| Charter | `charter_type` |
| Assets | `asset_size` (formatted) |
| Website | `website_url` (link) |
| Fee URL | `fee_schedule_url` (link or "Missing") |
| Last Crawl | `last_crawl_at` (timeAgo) |
| Failures | `consecutive_failures` |
| Status | Computed: "No URL" / "Not crawled" / "Failed" / "No fees" |
| Action | "Add URL" button |

**Filters:**
- Status: All / No fee URL / No fees / Failing / Stale
- Charter: All / Bank / Credit Union
- State: dropdown
- Search: institution name
- Sort: asset size (default desc), name, state, failures

**DB query** (`src/lib/crawler-db/pipeline.ts`):

```typescript
export function getCoverageGaps(opts: {
  status?: 'no_url' | 'no_fees' | 'failing' | 'stale';
  charter?: 'bank' | 'credit_union';
  state?: string;
  search?: string;
  sort?: string;
  dir?: string;
  limit?: number;
  offset?: number;
}): { institutions: CoverageGap[]; total: number }
```

### 1c. Data Quality Summary Cards

Row of cards at top showing hygiene metrics from `getDataQualityReport()`:
- Invalid state codes (should be 0)
- Uncategorized fees (count + trend)
- Null amounts (count)
- Duplicate fees (count)
- Stale institutions (count)

Link each card to the relevant admin page or filtered view.

### 1d. Recent Crawl Activity Feed

Last 20 crawl runs with status, institution name, fees extracted, timestamp.
Shows pipeline health at a glance.

## Phase 2: Manual URL Submission

### 2a. "Add URL" Action on Coverage Gaps Table

Each row in the gaps table gets an "Add URL" button that opens an inline form or modal:
- Input: Fee schedule URL (validated as URL)
- On submit: server action updates `fee_schedule_url` on `crawl_targets`
- Optionally triggers immediate crawl

**Server action** (`src/app/admin/pipeline/actions.ts`):

```typescript
"use server";

export async function setFeeScheduleUrl(
  institutionId: number,
  url: string
): Promise<{ success: boolean; error?: string }>

export async function triggerCrawl(
  institutionId: number
): Promise<{ success: boolean; fees_extracted?: number; error?: string }>
```

### 2b. Bulk URL Import

For batch operations, a simple form that accepts CSV/TSV:
```
institution_id, fee_schedule_url
8109, https://www.sccu.com/fee-schedule
1234, https://example.com/fees.pdf
```

Server action parses and updates all rows in a transaction.

### 2c. "Submit URL" from Institution Detail

On the existing institution detail page (`/admin/peers/[id]`), add a section showing:
- Current fee schedule URL (or "Not set")
- Input to set/update it
- "Crawl Now" button if URL is set but no fees extracted

## Phase 3: Pipeline Status Indicators in Existing Pages

### 3a. Dashboard Integration

Add a "Pipeline Health" card to the main dashboard (Row 1 or new Row 7):
- Funnel mini-chart (4 bars: total -> website -> fee url -> fees)
- "X institutions need attention" link to `/admin/pipeline`
- Top 3 largest uncovered institutions

### 3b. Nav Badge

Add a badge to the nav item showing count of actionable items (failing + no URL for large institutions).

## Files to Create

| File | Purpose |
|------|---------|
| `src/app/admin/pipeline/page.tsx` | Pipeline dashboard page |
| `src/app/admin/pipeline/loading.tsx` | Loading skeleton |
| `src/app/admin/pipeline/actions.ts` | Server actions (setFeeScheduleUrl, triggerCrawl, bulkImport) |
| `src/app/admin/pipeline/coverage-table.tsx` | Client component: sortable/filterable gaps table |
| `src/app/admin/pipeline/url-form.tsx` | Client component: inline URL submission form |
| `src/lib/crawler-db/pipeline.ts` | DB queries: getCoverageGaps, getPipelineStats, getRecentCrawls |

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/crawler-db/index.ts` | Export pipeline module |
| `src/components/admin-nav.tsx` | Add "Pipeline" nav item with badge |
| `src/app/admin/page.tsx` | Add pipeline health card to dashboard |
| `src/app/admin/peers/[id]/page.tsx` | Add URL submission section |

## Acceptance Criteria

- [x] `/admin/pipeline` page shows coverage funnel, gaps table, and quality cards
- [x] Gaps table sortable by asset size, searchable by name, filterable by status/charter/state
- [x] Can paste a fee schedule URL for any institution and save it
- [ ] Can trigger a crawl for an institution with a fee URL but no extracted fees (deferred — requires Python subprocess)
- [x] Bulk CSV import works for batch URL submission
- [x] Pipeline nav item in admin nav
- [ ] Dashboard has pipeline health summary card (deferred — separate PR)
- [ ] Institution detail page shows fee URL status and submission form (deferred — separate PR)

## References

- `src/lib/crawler-db/quality.ts` — `getCoverageFunnel()`, `getTierCoverage()`, `getCharterCoverage()`
- `src/lib/crawler-db/hygiene.ts` — `getDataQualityReport()` (created this session)
- `src/lib/crawler-db/core.ts` — `getStats()`, `getDataFreshness()`
- `src/app/admin/page.tsx` — Dashboard layout (6-row grid)
- `fee_crawler/commands/crawl.py` — Crawl pipeline entry point
- `fee_crawler/commands/discover.py` — Fee URL discovery logic
