# Pipeline Visual Dashboard

## Overview

Enhance the existing `/admin/pipeline`, `/admin/ops`, and `/admin/quality` pages into a unified visual pipeline experience. You already have 90% of the infrastructure -- the data, queries, job runner, and page structures exist. This plan connects them into a cohesive visual flow.

## What Already Exists

| Page | URL | What It Shows | Status |
|------|-----|---------------|--------|
| Pipeline | `/admin/pipeline` | Coverage funnel, gaps table, recent crawls | Working |
| Ops Center | `/admin/ops` | Job trigger, active jobs, recent jobs, 29 commands | Working (730-line client component) |
| Quality | `/admin/quality` | Funnel, tier/district coverage, failures, uncategorized, revenue validation | Working but **not in nav** |
| Dashboard | `/admin` | Review queue, crawl health, health tiles, activity feeds | Working |

**Problem:** These 4 pages exist separately. Quality isn't even in the nav. There's no visual flow showing the pipeline stages. No historical trends. No way to see "what happened last night."

## Proposed Changes

### 1. Add Quality and Ops to Admin Nav

Currently missing from the sidebar. Add them under the "Data" group:

```
Data
  Pipeline      (existing)
  Quality       (exists, not in nav)
  Ops Center    (exists, not in nav)
  Review        (existing)
  Leads         (existing)
```

**File:** `src/app/admin/admin-nav.tsx`

### 2. Enhance Pipeline Page with Visual Flow

Add a **pipeline stages visualization** at the top of `/admin/pipeline`:

```
[Seed] → [Discover] → [Crawl] → [Extract] → [Categorize] → [Validate] → [Enrich]
 8,750     6,234        2,854      2,112       58,445         46,955       8,750
  100%      71.2%        32.6%      24.1%         ▼              ▼          100%
                                              65,287 fees    71.9% approved
```

Each stage shows:
- Stage name
- Count at that stage
- Percentage of total
- Color: green (>80%), yellow (50-80%), red (<50%)
- Click → filters the coverage table below to that stage's gaps

**Data source:** `getPipelineStats()` already returns most of this. Need to add discovery count and categorization count.

**New file:** `src/app/admin/pipeline/pipeline-flow.tsx` (client component)

### 3. Add Recent Jobs Section to Pipeline Page

Show the last 5 pipeline-related jobs (run-pipeline, crawl, discover, categorize) with:
- Status badge (running/completed/failed)
- Command + params
- Duration
- Fees extracted (from result_summary)
- Expandable log tail

**Data source:** Query `ops_jobs` table filtered to pipeline commands.

### 4. Add Historical Trends to Quality Page

Add a simple coverage trend chart showing weekly progress:

```
Coverage Over Time (Last 8 Weeks)
  ─── Institutions with fees
  ─── Approval rate
  ─── Total fees
```

**Data source:** `crawl_runs` table has 16 runs with timestamps and aggregate stats. Combine with `ops_jobs` for daily counts.

**New file:** `src/app/admin/quality/coverage-trend.tsx` (Recharts line chart)

### 5. Add Data Refresh Status to Pipeline Page

Show when each data source was last refreshed:

```
Data Sources                Last Refresh      Status
FRED Economic Indicators    2 hours ago        ✓
BLS CPI                     2 hours ago        ✓
NY Fed Rates                2 hours ago        ✓
OFR Stress Index            2 hours ago        ✓
CFPB Complaints             6 days ago         ⚠ Weekly
FDIC Financials             14 days ago        ⚠ Quarterly
NCUA Financials             14 days ago        ⚠ Quarterly
SOD Branch Deposits         30 days ago        ○ Annual
Census ACS                  90+ days ago       ○ Annual
```

**Data source:** Query `fed_economic_indicators`, `institution_complaints`, `institution_financials`, etc. for MAX(fetched_at).

**New file:** `src/app/admin/pipeline/data-sources-status.tsx`

## Implementation Plan

### Phase 1: Nav + Quick Wins
1. Add Quality and Ops to admin nav
2. Add data source refresh status to pipeline page

### Phase 2: Visual Pipeline Flow
3. Build pipeline stages visualization component
4. Add recent jobs section to pipeline page

### Phase 3: Historical Trends
5. Add coverage trend chart to quality page

## Acceptance Criteria

- [ ] Quality and Ops appear in admin sidebar nav
- [ ] Pipeline page shows visual stage flow with counts and percentages
- [ ] Pipeline page shows data source refresh status
- [ ] Pipeline page shows recent pipeline jobs with status/duration
- [ ] Quality page shows coverage trend chart (last 8 weeks)
- [ ] All visualizations use admin design system (gray/blue, Geist font, tabular-nums)

## What NOT to Build

- Real-time streaming logs (ops page already has log tail)
- Job scheduling UI (GitHub Actions handles this)
- Alert configuration (premature)
- Cost tracking (nice to have, not now)
- Job retry button (just re-trigger from ops)

## Files to Create

- `src/app/admin/pipeline/pipeline-flow.tsx` -- visual stage flow
- `src/app/admin/pipeline/data-sources-status.tsx` -- refresh timestamps
- `src/app/admin/pipeline/recent-jobs.tsx` -- recent pipeline jobs
- `src/app/admin/quality/coverage-trend.tsx` -- trend chart
- `src/lib/crawler-db/pipeline.ts` -- add queries for stage counts and refresh timestamps (extend existing)

## Files to Modify

- `src/app/admin/admin-nav.tsx` -- add Quality + Ops nav items
- `src/app/admin/pipeline/page.tsx` -- add new components above existing content
- `src/app/admin/quality/page.tsx` -- add trend chart

## References

- Pipeline page: `src/app/admin/pipeline/page.tsx`
- Quality page: `src/app/admin/quality/page.tsx`
- Ops page: `src/app/admin/ops/ops-client.tsx`
- Pipeline queries: `src/lib/crawler-db/pipeline.ts`
- Quality queries: `src/lib/crawler-db/quality.ts`
- Job runner: `src/lib/job-runner.ts`
- Recharts (already installed): used in admin for sparklines and histograms
