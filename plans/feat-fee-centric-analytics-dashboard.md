# Fee-Centric Analytics Dashboard

## Problem

The current admin UI is **institution-centric**: it lists institutions, and you drill into an institution to see its fees. There is no way to answer "How much does the average bank charge for an overdraft fee?" or "Which institutions have the most expensive wire transfer fees?"

The user wants a **fee-centric view** where each canonical fee type (47 categories, 9 families) is the primary entity. For each fee type, the user wants to see:
- How many institutions charge this fee
- The range (min, max, median, p25, p75)
- Breakdowns by: charter type (bank vs CU), asset size tier, Fed district, state/region, regulatory agency
- How often these fees change over time (from fee_change_events)

## Data Model (Already Exists)

Tables available:
- `extracted_fees` - fee_name, amount, frequency, fee_category, fee_family, crawl_target_id
- `crawl_targets` - charter_type, state_code, asset_size_tier, fed_district, source (fdic/ncua)
- `fee_snapshots` - historical fee amounts by institution + category
- `fee_change_events` - detected fee changes (previous_amount -> new_amount)
- `institution_financials` - quarterly financials (assets, deposits, income)

Key columns on `extracted_fees`: `fee_category` (canonical slug), `fee_family` (family group)

Python taxonomy in `fee_analysis.py`: 47 categories, 9 families, 142 aliases, `CANONICAL_DISPLAY_NAMES` dict.

---

## Phase 1: Backend Query Functions

### 1a. New query functions in `src/lib/crawler-db.ts`

**New interfaces:**

```typescript
interface FeeCategorySummary {
  fee_category: string;
  display_name: string;
  fee_family: string;
  institution_count: number;
  min_amount: number | null;
  max_amount: number | null;
  median_amount: number | null;
  avg_amount: number | null;
  p25_amount: number | null;
  p75_amount: number | null;
}

interface FeeCategoryDetail {
  fee_category: string;
  display_name: string;
  fee_family: string;
  fees: FeeInstance[];
  stats: FeeStats;
  by_charter_type: DimensionBreakdown[];
  by_asset_tier: DimensionBreakdown[];
  by_fed_district: DimensionBreakdown[];
  by_state: DimensionBreakdown[];
  change_events: FeeChangeEvent[];
}

interface FeeInstance {
  id: number;
  institution_name: string;
  amount: number | null;
  frequency: string | null;
  conditions: string | null;
  charter_type: string;
  state_code: string | null;
  asset_size_tier: string | null;
  asset_size: number | null;
  review_status: string;
}

interface FeeStats {
  count: number;
  min: number | null;
  max: number | null;
  median: number | null;
  avg: number | null;
  p25: number | null;
  p75: number | null;
  free_count: number;  // amount = 0 or null
  bank_count: number;
  cu_count: number;
}

interface DimensionBreakdown {
  dimension_value: string;
  count: number;
  min_amount: number | null;
  max_amount: number | null;
  avg_amount: number | null;
  median_amount: number | null;
}

interface FeeChangeEvent {
  institution_name: string;
  previous_amount: number | null;
  new_amount: number | null;
  change_type: string;
  detected_at: string;
}
```

**New functions:**

- [ ] `getFeeCategorySummaries()` - Returns all fee categories with aggregated stats (count, min, max, avg, median)
  - SQL: GROUP BY fee_category with aggregate functions
  - Joins to crawl_targets for institution count (COUNT DISTINCT crawl_target_id)
  - Ordered by institution_count DESC (most common fees first)

- [ ] `getFeeCategoryDetail(category: string)` - Full detail for a single fee type
  - Returns all individual fee instances for that category with institution details
  - Computes percentiles in JS (SQLite lacks percentile functions)
  - Groups by charter_type, asset_size_tier, fed_district, state_code for breakdowns
  - Pulls from fee_change_events for that category

- [ ] `getFeeFamilySummaries()` - Group categories by family for the overview
  - Returns: family name -> list of categories with counts

### 1b. Fee taxonomy constants for TypeScript

**New file: `src/lib/fee-taxonomy.ts`**

Port the Python FEE_FAMILIES and CANONICAL_DISPLAY_NAMES to TypeScript so the frontend can display proper names and group by family without additional DB queries.

```typescript
export const FEE_FAMILIES: Record<string, string[]> = {
  "Account Maintenance": ["monthly_maintenance", "minimum_balance", ...],
  "Overdraft & NSF": ["overdraft", "nsf", "continuous_od", ...],
  // ... all 9 families
};

export const DISPLAY_NAMES: Record<string, string> = {
  "monthly_maintenance": "Monthly Maintenance",
  "overdraft": "Overdraft (OD)",
  // ... all 47 categories
};

export function getDisplayName(category: string): string { ... }
export function getFeeFamily(category: string): string | null { ... }
```

---

## Phase 2: Fee Catalog Page (Overview)

### 2a. Route: `/admin/fees/catalog`

**New file: `src/app/admin/fees/catalog/page.tsx`**

Server component. Calls `requireAuth("view")`, then `getFeeCategorySummaries()`.

Layout:
- Breadcrumb: Dashboard / Fee Catalog
- Summary stats bar: Total Fee Types (47), With Data (N), Total Observations (N)
- Grouped by fee family, each family is a collapsible section
- Within each family, a table of fee categories:

| Fee Type | Institutions | Min | Median | Max | Spread | Banks | CUs |
|----------|-------------|-----|--------|-----|--------|-------|-----|
| Overdraft (OD) | 42 | $15.00 | $35.00 | $39.00 | $24.00 | 28 | 14 |
| NSF / Returned Item | 38 | $10.00 | $35.00 | $38.00 | $28.00 | 25 | 13 |

- Each fee type name is a link to `/admin/fees/catalog/[category]`
- Color coding: families get colored left border (blue for maintenance, red for OD/NSF, green for ATM, etc.)
- "Spread" = max - min (shows fee range width)
- Sort by: institution count, median amount, spread (client-side toggleable)

### 2b. Family color mapping

Map each of the 9 families to a Tailwind color for visual consistency:
- Account Maintenance: blue
- Overdraft & NSF: red
- ATM & Card: amber
- Wire Transfers: purple
- Check Services: slate
- Digital & Electronic: cyan
- Cash & Deposit: emerald
- Account Services: indigo
- Lending Fees: orange

---

## Phase 3: Fee Detail Page (Deep Dive)

### 3a. Route: `/admin/fees/catalog/[category]`

**New file: `src/app/admin/fees/catalog/[category]/page.tsx`**

Server component. Calls `getFeeCategoryDetail(category)`.

Layout:

**Header section:**
- Fee type display name + family badge
- Big stat cards: Institutions (N), Median ($X), Min ($X), Max ($X), Avg ($X)

**Breakdown cards (2x2 grid):**

Card 1: **By Charter Type**
- Simple two-row comparison: Banks vs Credit Unions
- Count, median, min, max for each

Card 2: **By Asset Size Tier**
- One row per tier: community_small, community_mid, community_large, regional, large_regional, super_regional
- Count, median, min, max for each

Card 3: **By Fed District**
- One row per district (1-12)
- Count, median, min, max for each

Card 4: **By State** (top 10 states by count)
- Count, median, min, max for each state

**Fee Change History section:**
- Table from fee_change_events: Institution, Previous Amount, New Amount, Change, Date
- Empty state: "No fee changes detected yet. Changes are tracked when fees are re-crawled."

**All Institutions with This Fee (full table):**
- Sortable table: Institution Name, Amount, Frequency, Charter Type, State, Asset Tier, Status
- Sorted by amount DESC by default
- Link institution name to `/admin/peers/[id]`
- Highlight highest/lowest amounts with subtle color (green for low, red for high relative to median)

---

## Phase 4: Navigation + Integration

### 4a. Update admin layout nav

**Modify: `src/app/admin/layout.tsx`**

Add "Fee Catalog" link in the nav bar between "Review Fees" and "Peer Groups":

```
Dashboard | Review Fees | Fee Catalog | Peer Groups | All Fees
```

### 4b. Update admin dashboard

**Modify: `src/app/admin/page.tsx`**

Add a "Top Fee Categories" section showing the 5 most common fee types with quick stats, linking to the catalog.

### 4c. Rename existing "All Fees" nav

**Modify: `src/app/admin/layout.tsx`**

Rename "All Fees" to "Fee Extracts" to distinguish it from the new catalog view. The existing page shows raw extractions per institution; the new catalog shows aggregated analytics per fee type.

---

## Phase 5: Percentile Computation

SQLite doesn't have `PERCENTILE_CONT`. Compute percentiles in JavaScript:

```typescript
function computePercentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}
```

Use this in `getFeeCategoryDetail()` and `getFeeCategorySummaries()` to compute p25, median, p75 from the raw amounts array.

---

## Implementation Order

1. Phase 1b: Fee taxonomy TS constants (`fee-taxonomy.ts`) - no DB queries, pure data
2. Phase 1a: Query functions in `crawler-db.ts` - `getFeeCategorySummaries()` + `getFeeCategoryDetail()`
3. Phase 5: Percentile helper (used by query functions)
4. Phase 2: Fee Catalog overview page (`/admin/fees/catalog`)
5. Phase 3: Fee Detail page (`/admin/fees/catalog/[category]`)
6. Phase 4: Nav updates + dashboard integration

## Files Summary

**New files (3):**
- `src/lib/fee-taxonomy.ts` - TS port of fee families + display names
- `src/app/admin/fees/catalog/page.tsx` - Fee catalog overview
- `src/app/admin/fees/catalog/[category]/page.tsx` - Fee type detail + breakdowns

**Modified files (3):**
- `src/lib/crawler-db.ts` - New query functions + interfaces
- `src/app/admin/layout.tsx` - Add "Fee Catalog" nav link, rename "All Fees" -> "Fee Extracts"
- `src/app/admin/page.tsx` - Add top fee categories section

## Acceptance Criteria

- [x] Fee Catalog page lists all 47 fee categories grouped by 9 families
- [x] Each category shows institution count, min, median, max, bank/CU split
- [x] Clicking a category opens detail page with full stats
- [x] Detail page shows breakdowns by charter type, asset tier, Fed district, state
- [x] Detail page shows all individual fee instances in a sortable table
- [x] Fee change events displayed when available
- [x] Percentiles (p25, p75) computed correctly
- [x] Navigation updated with "Fee Catalog" link
- [x] No new dependencies required (all server components with existing better-sqlite3)
