# Refactor: Consolidate Admin Data Section (6 pages -> 3)

## Overview

Consolidate the admin Data section from 6 overlapping pages into 3 focused pages organized around the operator's actual workflow: procure data, review data, investigate problems.

## Problem Statement

The current Data section has 6 pages (Pipeline, Quality, Ops Center, Review, Query, Institutions) that overlap heavily and force context-switching for simple workflows:

- **Coverage funnel** appears on both Pipeline and Quality
- **Recent jobs** appear on both Pipeline and Ops Center
- **Discovery stats** appear on both Pipeline and Quality (different queries, same data)
- **Job triggering** exists on both Pipeline (10 quick actions) and Ops Center (26-command form)
- **Failing/stale institution data** appears on Pipeline, Quality, AND Query presets

The operator's daily workflow bounces between 3-4 pages to answer one question: "Is the pipeline healthy and what needs my attention?"

## Proposed Solution

### 3 Pages, 3 Questions

| Page | Route | Question it answers |
|------|-------|-------------------|
| **Pipeline** | `/admin/pipeline` | "Can we procure the data?" |
| **Review** | `/admin/review` | "Is the data correct?" |
| **Explorer** | `/admin/explorer` | "Let me investigate this" |

### What merges where

| Current Page | Merges Into | What moves |
|---|---|---|
| Pipeline | **Pipeline** | Stays (coverage funnel, gaps table, quick actions) |
| Quality | **Pipeline** | Health metrics, failure reasons, tier/district coverage (as expandable) |
| Ops Center | **Pipeline** | Job trigger form, active jobs with live logs, recent jobs |
| Review | **Review** | Stays (fee queue, keyboard nav, outlier view, category review) |
| Query | **Explorer** | SQL query tool with presets |
| Institutions | **Explorer** | Institution lookup (search-first, not browse-all) |

### Old routes redirect

| Old Route | Redirects To |
|---|---|
| `/admin/quality` | `/admin/pipeline` |
| `/admin/ops` | `/admin/pipeline?tab=ops` |
| `/admin/query` | `/admin/explorer` |
| `/admin/institutions` | `/admin/explorer?tab=institutions` |

### Nav changes (admin-nav.tsx)

**Before (8 items under Data):**
Pipeline, Quality, Ops Center, Review, By Category, Query, Institutions

**After (3 items under Data):**
Pipeline, Review, Explorer

## Technical Approach

### Page 1: Pipeline (the control room)

**Layout: Tabs, not scroll.**

Three tabs within one page, each focused:

```
[Health]  [Operations]  [Coverage]
```

#### Tab: Health (default)
What it shows (top to bottom):
- **KPI strip** (1 row): Last crawl time, success rate, fees extracted (last run), pending review count, active jobs count. 5 compact numbers. No cards, no borders — just numbers in a row.
- **Problems only** (conditional): Red/amber alerts for failing institutions, stale data, uncategorized fees, duplicates. Each alert is one line with a count and a "Fix" link. **Hidden when values are 0.** Not a grid of 6 cards showing zeros.
- **Coverage funnel** (compact): 5 horizontal progress bars. Same as current but tighter.
- **Failure reasons** (if any): Top 5 failure reasons with counts. Collapsible.

#### Tab: Operations
What it shows:
- **Job trigger form** (left): Command selector with limit/state/charter filters. Command preview. Submit button. Simplified from 26 commands — group into: Pipeline, Hygiene, Ingest. No need to show every ingest command individually.
- **Active jobs** (right): Live-polling section with status, elapsed time, log tail toggle. Compact — no 200px log divs by default.
- **Recent jobs** (below): Last 15 jobs, expandable rows. Same as current Ops Center table.

#### Tab: Coverage
What it shows:
- **Coverage gaps table** (full width): The existing filterable/sortable/paginated table with status tabs (All/No URL/No Fees/Failing/Stale), charter filter, state dropdown, search.
- **Tier coverage** (sidebar or below): Compact table from Quality page, clickable rows.
- **District coverage** (below tier): Same.

**What's removed:**
- PipelineRunsPanel (9-stage visual tracker) — too much visual clutter for the info it provides. The run status is a line in the KPI strip or recent jobs.
- IndexCacheCard (spotlight medians) — belongs on the Benchmarks section, not Pipeline.
- PipelineDashboard component — replaced by the KPI strip.
- CoverageTrend chart — rarely useful for daily operations.
- RecentPriceChanges — belongs on Dashboard or Market page.
- CategoryCoverageDashboard — replaced by tier/district coverage on Coverage tab.
- DataSourcesStatus — moved to Operations tab as a collapsible section.
- DiscoveryStats — moved to Coverage tab as a collapsible section.

**Implementation:**

```
src/app/admin/pipeline/
  page.tsx              -- Server component, fetches data for active tab
  pipeline-tabs.tsx     -- Client component, tab switching (URL param ?tab=)
  health-tab.tsx        -- KPI strip + problems + funnel
  operations-tab.tsx    -- Trigger form + active jobs + recent jobs (migrated from ops-client.tsx)
  coverage-tab.tsx      -- Gaps table + tier/district coverage
  actions.ts            -- Existing + migrated from ops/actions.ts
```

#### Permissions
- Page requires `requireAuth("view")`
- Operations tab trigger form: conditionally rendered for `trigger_jobs` permission
- Cancel button: conditionally rendered for `cancel_jobs` permission

#### Polling
- Keep `/admin/ops/api` route for live job status polling
- Operations tab client component polls when active jobs > 0

### Page 2: Review (the workbench)

**Keep existing structure.** The Review page is already well-designed with keyboard nav, status tabs, and outlier triage. Enhance, don't restructure.

#### Enhancements:

**A. Multi-select + batch action bar**
- `Space` toggles selection on focused row
- `Shift+j`/`Shift+k` extends selection range
- Selection action bar appears at top when 1+ rows selected: "{N} selected: [Approve] [Reject] [Clear]"
- `Shift+a` approves all selected, `Shift+x` rejects all selected

**B. Auto-advance after approve/reject**
- After pressing `a` or `x`, focus auto-advances to next row
- Currently requires manual `j` press after every action

**C. Outlier "likely cause" column**
- New column in OutlierView showing probable cause:
  - Amount > 10x median → "Extraction error?"
  - Amount 3-10x median → "Genuine outlier?"
  - Institution has 3+ outliers → "Source issue?"
  - Amount < 0.1x median → "Miscategorization?"
- Helps operator triage faster without investigating each one

**D. Confidence distribution above bulk approve**
- Small histogram: "423 at 95%+, 89 at 90-95%, 234 at 80-90%, 112 below 80%"
- Click a stratum to approve that layer: "Approve 423 fees at 95%+ confidence"

**E. Uncategorized/miscategorized sub-view**
- New tab or filter: "uncategorized" showing fees with `fee_category IS NULL`
- Grouped by raw fee name with count
- Bulk reject (non-fee items) or flag for alias addition
- Potential miscategorizations: fees where amount is >5x or <0.1x category median

**F. New keyboard shortcuts**

| Key | Action |
|-----|--------|
| `Space` | Toggle selection |
| `Shift+a` | Approve all selected |
| `Shift+x` | Reject all selected |
| `e` | Edit fee amount inline |
| `c` | Change category |
| `n` / `p` | Next/previous page |
| `?` | Show shortcut overlay |

**Implementation:**

```
src/app/admin/review/
  page.tsx              -- Add "uncategorized" tab to existing status tabs
  review-table.tsx      -- Add multi-select, selection bar, auto-advance
  keyboard-nav.tsx      -- Add Space, Shift+a/x, e, c, n, p, ? shortcuts
  outlier-view.tsx      -- Add "likely cause" column
  review-actions.tsx    -- Add confidence histogram above bulk button
  miscat-view.tsx       -- NEW: uncategorized/miscategorized fee triage
```

### Page 3: Explorer (the investigation tool)

**Layout: Two panels, side by side.**

```
[Institution Lookup (left 40%)]  [Query Results / Fee Detail (right 60%)]
```

#### Left panel: Institution search
- Search box at top (search-first, no browse-all table)
- Results: compact list showing institution name, state, charter, fee count
- Click an institution → right panel shows its fees
- Deep link: `/admin/explorer?institution=123` pre-loads that institution

#### Right panel: Context-dependent
- **Default**: SQL query tool with preset buttons + code editor + results table
- **When institution selected**: Fee detail for that institution — all fees with amounts, categories, status, source URL. Includes a "Run Query" button that pre-fills SQL for that institution.
- **When arriving from Review outlier**: Pre-loads the institution + highlights the flagged fee

#### SQL presets (carried from current Query page)
Keep the 21 presets in 4 groups. Add:
- "Fees for institution X" (dynamic, appears when institution selected)
- "Outlier investigation: compare fee to peers" (dynamic)

**Implementation:**

```
src/app/admin/explorer/
  page.tsx              -- Two-panel layout, URL param routing
  institution-search.tsx -- Search-first institution lookup
  institution-detail.tsx -- Fee list for selected institution
  query-panel.tsx       -- Migrated from query-client.tsx
  actions.ts            -- Migrated from query/actions.ts
```

## Acceptance Criteria

### Pipeline page
- [ ] 3 tabs: Health, Operations, Coverage
- [ ] KPI strip shows 5 numbers without card borders
- [ ] Problems section only shows non-zero issues with "Fix" links
- [ ] Operations tab has full job trigger + live monitoring
- [ ] Coverage tab has gaps table with all existing filters
- [ ] `/admin/quality` redirects to `/admin/pipeline`
- [ ] `/admin/ops` redirects to `/admin/pipeline?tab=ops`
- [ ] Permissions: viewers see Health + Coverage, trigger_jobs sees Operations

### Review page
- [ ] Multi-select with Space, batch action bar
- [ ] Auto-advance after approve/reject
- [ ] Outlier "likely cause" column
- [ ] Confidence distribution above bulk approve
- [ ] Uncategorized fee triage tab
- [ ] New keyboard shortcuts (Space, Shift+a/x, e, c, n, p, ?)

### Explorer page
- [ ] Two-panel layout (institution search + query/detail)
- [ ] Search-first institution lookup (no browse-all)
- [ ] Deep link from Review outliers
- [ ] SQL query tool with presets
- [ ] `/admin/query` redirects to `/admin/explorer`
- [ ] `/admin/institutions` redirects to `/admin/explorer`

### Nav
- [ ] Data group reduced from 7 items to 3: Pipeline, Review, Explorer
- [ ] Old routes redirect to new

## Implementation Phases

### Phase 1: Pipeline consolidation (biggest impact)

| Task | Files | Effort |
|------|-------|--------|
| Create pipeline-tabs.tsx client component | New | Medium |
| Build health-tab.tsx (KPI strip + problems + funnel) | New | Medium |
| Migrate ops-client.tsx into operations-tab.tsx | Migrate | Medium |
| Build coverage-tab.tsx (gaps table + tier/district) | Migrate | Medium |
| Update page.tsx to use tab layout | Rewrite | Small |
| Add redirects for /admin/quality and /admin/ops | New middleware | Small |
| Update admin-nav.tsx (remove Quality, Ops Center) | Edit | Small |
| Update revalidatePath calls in actions.ts | Edit | Small |

### Phase 2: Review enhancements

| Task | Files | Effort |
|------|-------|--------|
| Add multi-select + selection action bar | review-table.tsx | Medium |
| Add auto-advance after approve/reject | keyboard-nav.tsx | Small |
| Add "likely cause" column to outlier view | outlier-view.tsx | Small |
| Add confidence distribution histogram | review-actions.tsx | Medium |
| Build uncategorized/miscategorized view | New miscat-view.tsx | Medium |
| Add new keyboard shortcuts | keyboard-nav.tsx | Small |

### Phase 3: Explorer page

| Task | Files | Effort |
|------|-------|--------|
| Create explorer page with two-panel layout | New page.tsx | Medium |
| Build institution-search.tsx (search-first) | New | Medium |
| Build institution-detail.tsx (fee list) | New | Medium |
| Migrate query-client.tsx into query-panel.tsx | Migrate | Small |
| Add deep link from Review outlier rows | outlier-view.tsx | Small |
| Add redirects for /admin/query and /admin/institutions | New middleware | Small |
| Update admin-nav.tsx (replace Query, Institutions with Explorer) | Edit | Small |

## Risk Analysis

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing bookmarks/links | Medium | Redirects for all old routes |
| Ops polling endpoint needs to work from Pipeline | High | Keep /admin/ops/api route, reference from operations-tab |
| Permission model mismatch (view vs trigger_jobs) | Medium | Conditional rendering per section |
| Pipeline page becomes too dense | Medium | Tab layout prevents scroll overload |
| Lost Quality page features | Low | Tier/district coverage moved to Coverage tab; revenue validation accessible via Explorer SQL |

## References

### Files to modify
- `src/app/admin/admin-nav.tsx` — nav item list (remove 4, keep 3)
- `src/app/admin/pipeline/page.tsx` — full rewrite with tabs
- `src/app/admin/ops/ops-client.tsx` (834 lines) — migrate to operations-tab
- `src/app/admin/review/review-table.tsx` — multi-select
- `src/app/admin/review/keyboard-nav.tsx` — new shortcuts + auto-advance
- `src/app/admin/review/outlier-view.tsx` — likely cause column + deep links
- `src/app/admin/query/query-client.tsx` — migrate to explorer/query-panel
- `src/lib/fee-actions.ts` — update revalidatePath calls
- `src/app/admin/pipeline/actions.ts` — merge with ops/actions.ts
- 17+ files with hardcoded admin route references

### External patterns referenced
- Dagster asset-centric monitoring (group by domain, health dot per group)
- Labelbox multi-select + batch action bar
- Monte Carlo anomaly grouping (by probable cause)
- Gmail/Vim keyboard navigation model
