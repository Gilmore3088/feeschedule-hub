# feat: Coverage Drill-Downs, Index Redesign, Market Fix

## Overview

Three interconnected improvements to the admin data quality and benchmark pages:

1. **Quality page drill-downs** -- Make tier/district coverage rows clickable to see institutions (especially gap institutions without fee data)
2. **Fee Index page redesign** (`/admin/index`) -- Apply `/frontend-design` treatment, align filters with market page
3. **Market page fix** (`/admin/market`) -- Diagnose and fix layout/data issues ("messed up")

## Problem Statement

**Coverage is low and there's no systematic way to work through it:**

| Tier | Total | With Fees | Coverage |
|------|-------|-----------|----------|
| Super Regional ($250B+) | 12 | 4 | 33.3% |
| Large Regional ($50-250B) | 37 | 6 | 16.2% |
| Regional ($10-50B) | 106 | 21 | 19.8% |
| Community Large ($1-10B) | 884 | 159 | 18.0% |
| Community Mid ($300M-1B) | 1,427 | 228 | 16.0% |
| Community Small (<$300M) | 6,285 | 1,697 | 27.0% |

The quality page shows these numbers but offers no way to **click into a tier and see which institutions need attention**. Users must manually navigate to the peers explore page and guess at filter combinations.

**Additional issues:**
- Fee Index page (`/admin/index`) has single-select peer filters while Market page has multi-select -- inconsistent UX
- Market page has layout/functional issues that need diagnosis
- Quality page has a **TIER_LABELS bug** -- local copy at `quality/page.tsx:16-24` has different asset thresholds than canonical `TIER_LABELS` in `fed-districts.ts:16-23`
- `getInstitutionsByFilter()` has hardcoded `LIMIT 200` that silently truncates large tiers

## Proposed Solution

### Phase 1: Quality Page Drill-Downs + Gap View

**Make coverage tables actionable.**

#### 1a. Clickable tier/district rows

Convert static `<tr>` rows in the quality page to `<Link>` elements:
- Tier row click → `/admin/peers/explore?tier=community_small`
- District row click → `/admin/peers/explore?district=3`
- Add right-arrow affordance icon on each row

```tsx
// src/app/admin/quality/page.tsx — tier row becomes a link
<Link
  href={`/admin/peers/explore?tier=${t.asset_size_tier}`}
  className="contents"  // or wrap <tr> in clickable container
>
  <tr className="border-b hover:bg-blue-50/30 cursor-pointer transition-colors">
    <td>{TIER_LABELS[t.asset_size_tier]}</td>
    <td>{t.total}</td>
    <td>{t.with_fees}</td>
    <td><CoverageBadge pct={t.coverage_pct} /></td>
    <td><ArrowRight className="w-3 h-3 text-gray-300" /></td>
  </tr>
</Link>
```

#### 1b. Gap filter on explore page

Add `?gap=1` URL param to `/admin/peers/explore` that filters to institutions with `fee_count = 0`:

```sql
-- src/lib/crawler-db/core.ts — getInstitutionsByFilter
-- Add HAVING clause when gap=true:
HAVING fee_count = 0
```

Quality page rows get a secondary "View gaps" link:
- `/admin/peers/explore?tier=community_small&gap=1`

#### 1c. Fix LIMIT 200

Replace hardcoded `LIMIT 200` in `getInstitutionsByFilter()` with server-side pagination:
- Accept `page` and `pageSize` params (default 50)
- Return `{ rows, total }` tuple
- Add `Pagination` component to explore page (already exists at `src/components/pagination.tsx`)

#### 1d. Coverage summary bar

When navigating from quality page drill-down, show a summary bar at top of explore page:
```
Community Small | 6,285 total | 1,697 with fees | 4,588 gaps | 27% coverage
```

#### 1e. Fix TIER_LABELS bug

Remove local `TIER_LABELS` from `quality/page.tsx:16-24` and import from `fed-districts.ts`.

**Files to modify:**
- `src/app/admin/quality/page.tsx` — clickable rows, import canonical TIER_LABELS
- `src/app/admin/peers/explore/page.tsx` — gap filter, pagination, summary bar
- `src/lib/crawler-db/core.ts` — pagination in `getInstitutionsByFilter`, gap filter

### Phase 2: Fee Index Page Redesign (`/admin/index`)

**Apply `/frontend-design` treatment.** Key changes:

#### 2a. Upgrade peer filters to multi-select

Replace `PeerIndexFilters` (single-select dropdowns) with the same components Market uses:
- `TierMultiSelect` from `src/components/tier-multi-select.tsx`
- `DistrictMapSelect` from `src/components/district-map-select.tsx`
- `CharterToggle` from `src/components/charter-toggle.tsx`

This aligns the two pages and enables multi-tier/district benchmarking.

#### 2b. Redesign page layout

Current: 3 insight cards → family-grouped collapsible tables (10 columns)

Proposed:
- Sticky filter bar (match market page pattern, `top-[57px]`)
- Reduce default table columns to 7: Category, Median, P25-P75, Institutions, Banks/CUs, Maturity
- Expand to full 10 columns via "More columns" toggle
- Sortable column headers (click to sort, arrow indicators)
- Remove `CollapsibleSection` per family — use flat table with family column instead (simpler, more scannable)
- Keep insight cards but redesign per `/frontend-design` spec

#### 2c. CSV export

Add export button (Market page already has `exportMarketCsv` server action as reference pattern).

**Files to modify:**
- `src/app/admin/index/page.tsx` — full page redesign
- `src/app/admin/index/index-filters.tsx` — merge with peer-index-filters
- `src/app/admin/index/peer-index-filters.tsx` — replace with shared filter components
- `src/app/admin/index/loading.tsx` — update skeleton to match new layout

### Phase 3: Market Page Fix (`/admin/market`)

**Diagnose and fix issues.** Suspected problems from code review:

#### 3a. Layout/z-index issues

- Sticky control bar at `top-[57px] z-30` may conflict with admin header at `z-40`
- `DistrictDropdown` overlay at `fixed inset-0 z-40` can block the sticky bar
- Hero cards grid `grid-cols-2 lg:grid-cols-3` for 6 items = unbalanced on large screens
- Mobile: right panel renders first (`order-first lg:order-last`) — users see district map before benchmark data

#### 3b. State consistency

- `showAll` toggle in `CategoryExplorer` is client state (lost on refresh) vs Index page which uses URL param `?show=all`
- Fix: Move to URL param for shareability

#### 3c. Visual diagnosis

- Run the page in dev, screenshot at multiple viewports
- Identify specific broken elements
- Apply `/frontend-design` treatment to match dashboard redesign

**Files to modify:**
- `src/app/admin/market/page.tsx` — layout fixes
- `src/app/admin/market/segment-control-bar.tsx` — z-index, dropdown fixes
- `src/app/admin/market/category-explorer.tsx` — URL-based showAll state
- `src/app/admin/market/hero-cards.tsx` — grid balance
- `src/app/admin/market/distribution-panel.tsx` — styling alignment

## Acceptance Criteria

### Phase 1: Quality Drill-Downs
- [x] Clicking a tier row on quality page navigates to `/admin/peers/explore?tier=X`
- [x] Clicking a district row navigates to `/admin/peers/explore?district=X`
- [x] `?gap=1` param filters to institutions with zero extracted fees
- [x] Explore page has server-side pagination (no more LIMIT 200 truncation)
- [x] Summary bar shows tier/district context when navigating from quality page
- [x] Local `TIER_LABELS` removed from quality page; imports canonical version
- [x] Coverage counts exclude rejected fees (match index page behavior)

### Phase 2: Index Redesign
- [x] Multi-select tier/district filters (matching Market page components)
- [x] `/frontend-design` applied — distinctive, polished visual treatment
- [x] Sortable column headers with visual indicators
- [x] CSV export action
- [x] Responsive layout works on mobile
- [x] Dark mode support via existing `.admin-content` CSS system

### Phase 3: Market Fix
- [x] Layout issues identified and fixed (screenshots before/after)
- [x] No z-index conflicts between sticky bar, header, and dropdowns
- [x] `showAll` toggle persists via URL param
- [x] Mobile layout shows benchmark data before map/stats
- [x] `/frontend-design` treatment aligned with dashboard and index redesigns

## Dependencies & Risks

- **Shared filter components** (`TierMultiSelect`, `DistrictMapSelect`, `CharterToggle`) already exist and are used by Market — minimal risk for Phase 2
- **Pagination component** already exists at `src/components/pagination.tsx` — used by Review page
- **Performance**: Community Small tier has 6,285 institutions; pagination is required, not optional
- **TIER_LABELS mismatch**: Must verify canonical labels in `fed-districts.ts` match actual DB tier boundaries before removing quality page's local copy

## Key References

| File | Purpose |
|------|---------|
| `src/app/admin/quality/page.tsx:96-151` | Coverage tables (drill-down source) |
| `src/app/admin/peers/explore/page.tsx` | Institution explore (drill-down target) |
| `src/lib/crawler-db/core.ts:104-146` | `getInstitutionsByFilter` with LIMIT 200 |
| `src/lib/crawler-db/quality.ts:163-258` | `getTierCoverage`, `getDistrictCoverage` |
| `src/app/admin/index/page.tsx` | Fee Index (redesign target) |
| `src/app/admin/index/peer-index-filters.tsx` | Single-select filters (replace) |
| `src/app/admin/market/page.tsx` | Market page (fix target) |
| `src/app/admin/market/segment-control-bar.tsx` | Sticky bar with z-index issues |
| `src/components/tier-multi-select.tsx` | Reusable multi-select (for Index) |
| `src/components/pagination.tsx` | Reusable pagination (for explore) |
| `src/lib/fed-districts.ts:16-32` | Canonical TIER_LABELS, TIER_ORDER |
