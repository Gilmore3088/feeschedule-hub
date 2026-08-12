# Fee Catalog UX Improvements: Filters, Sorting, Rich Reports

## Problem

The fee catalog pages (`/admin/fees/catalog` and `/admin/fees/catalog/[category]`) show too much data at once with no way to filter, sort, or focus. All 9 families render simultaneously as 10-column tables creating a "wall of data." The detail page dumps every institution in a single unsorted, unpaginated table. There are no charts or visual summaries.

The goal: make it **easy to use** with filters, sorting, and **rich reports** (charts, highlights, export).

## Current State

- Catalog page: 9 family sections, each with a full table (Fee Type, Institutions, Min, P25, Median, P75, Max, Spread, Banks, CUs). All expanded, no collapse/filter/sort.
- Detail page: 6 stat cards + bank/CU split + 4 breakdown tables (2x2) + change events + full institution list. No tabs, no pagination, no sort.
- No charting library installed. shadcn/ui is set up with Card, Button, Badge, Input, Select components.
- Existing client patterns: `fee-search.tsx` (review page) uses `useRouter` + `useState` for URL-based search. Peers page uses server `<Link>` for filter params.

---

## Phase 1: Catalog Page - Reduce Visual Noise

### 1a. Collapsible family sections

**New file: `src/components/collapsible-section.tsx`** (`"use client"`)

Simple expand/collapse wrapper using `useState`. Each family section is collapsed by default, showing only: family name, fee type count, median range, institution count on the summary line.

```
[>] Overdraft & NSF     5 fee types | Median $25.00 - $39.00 | 42 institutions
[>] ATM & Card          6 fee types | Median $2.50 - $25.00 | 38 institutions
[v] Wire Transfers      4 fee types (expanded, showing table below)
```

Uses `lucide-react` ChevronRight/ChevronDown icons (already installed).

- [ ] Create `src/components/collapsible-section.tsx`
- [ ] Wrap each family section in catalog page with `<CollapsibleSection>`
- [ ] Compute summary line per family (count, median range, total institutions)
- [ ] Default: all collapsed. First family with data optionally expanded.

### 1b. Compact column mode

Reduce default visible columns from 10 to 4: **Fee Type, Institutions, Median, Spread**.

Add a "Show all columns" toggle button that reveals Min, P25, P75, Max, Banks, CUs.

- [ ] Add `columns` state ("compact" | "full") to catalog page
- [ ] Default to "compact" (4 columns)
- [ ] Add toggle button in page header: "Show details" / "Show compact"
- [ ] Conditionally render extra `<th>`/`<td>` based on mode

### 1c. Search bar

Add a text input at the top of the catalog page that filters fee types by display name across all families. Uses `searchParams` for server-side filtering (shareable URL).

**New file: `src/components/catalog-filters.tsx`** (`"use client"`)

- [ ] Create client component with text input + family dropdown
- [ ] Use `useRouter` + `useSearchParams` to update URL params (matches existing `fee-search.tsx` pattern)
- [ ] Server component reads `searchParams.search` and filters `summaries` before rendering
- [ ] Server component reads `searchParams.family` to show only one family when selected

### 1d. Sort controls

Add sort dropdown: "Most Institutions" (default), "Highest Median", "Widest Spread", "Alphabetical".

- [ ] Add `searchParams.sort` and `searchParams.order` to page
- [ ] Server-side sort the summaries array before grouping by family
- [ ] When sorted by a metric (not alphabetical), show flat list instead of family groups

### 1e. Highlight cards

Replace the current 3 generic stat cards with insight-driven highlights:

| Most Common Fee | Highest Median Fee | Widest Spread |
|---|---|---|
| Overdraft (OD) | Wire Transfer (Int'l Out) | Safe Deposit Box |
| 42 institutions | $45.00 median | $150.00 spread |

- [ ] Compute `highestMedian` and `widestSpread` from summaries
- [ ] Replace current stat cards with insight cards linking to detail pages

---

## Phase 2: Detail Page - Tabs + Interactive Table

### 2a. Tab navigation

Split the detail page into 3 tabs using `searchParams.tab`:

| Tab | Contents |
|-----|----------|
| **Overview** | Stat cards + bank/CU split + distribution chart (Phase 3) |
| **Breakdowns** | By Charter Type, Asset Tier, Fed District, State tables |
| **Institutions** | Full sortable/filterable institution table |

Tabs are server-rendered `<Link>` elements (no client JS needed for tab switching). Each tab only renders its content, reducing visible data by ~2/3.

- [ ] Add `searchParams.tab` to detail page (default: "overview")
- [ ] Render tab bar with `<Link>` elements styled as tabs
- [ ] Conditionally render content based on active tab
- [ ] Move breakdown tables to "breakdowns" tab
- [ ] Move institution table to "institutions" tab

### 2b. Sortable institution table

**New file: `src/app/admin/fees/catalog/[category]/institution-table.tsx`** (`"use client"`)

Client component receiving `fees[]` and `median` as props. Features:
- Click column headers to sort (amount, institution name, state, charter type, asset tier)
- Sort indicator arrows on active column
- Search input to filter by institution name
- Charter type filter chips (All, Banks, CUs)
- Show 25 rows initially with "Show more" button (client-side pagination)

- [ ] Create `institution-table.tsx` with `useState` for sort/filter/pagination
- [ ] Extract institution table from detail page into this component
- [ ] Pass `fees` and `median` as serializable props from server component
- [ ] Add column header click handlers with sort state
- [ ] Add text search for institution name
- [ ] Add charter type filter chips
- [ ] Add "Show 25 / Show all" pagination

---

## Phase 3: Rich Reports - Charts

### 3a. Install Recharts via shadcn

```bash
npx shadcn@latest add chart
npm install recharts
```

This adds `src/components/ui/chart.tsx` (shadcn wrapper for Recharts with consistent theming).

- [x] Install recharts and shadcn chart component
- [x] Verify build passes

### 3b. Fee range chart on catalog page

**New file: `src/components/fee-range-chart.tsx`** (`"use client"`)

Horizontal bar chart showing P25-P75 range for each fee type within an expanded family. Uses stacked bars: transparent bar for offset (0 to P25), colored bar for IQR (P25 to P75), with median marker.

- [x] Create `fee-range-chart.tsx` using Recharts BarChart (layout="vertical")
- [x] Render inside each expanded family section, above the table
- [x] Use family color from `FAMILY_COLORS` for the bar fill
- [x] Tooltip shows full distribution: Min, P25, Median, P75, Max

### 3c. Fee distribution histogram on detail page

**New file: `src/components/fee-histogram.tsx`** (`"use client"`)

For the Overview tab: histogram of fee amounts across all institutions for this fee type. X-axis = amount buckets, Y-axis = institution count.

- [x] Create `fee-histogram.tsx` using Recharts BarChart
- [x] Compute ~10 equal-width buckets from min to max
- [x] Add vertical reference line at median
- [x] Color bars by charter type (bank blue, CU green) as stacked

### 3d. Breakdown comparison charts on detail page

**New file: `src/components/breakdown-chart.tsx`** (`"use client"`)

For the Breakdowns tab: horizontal grouped bar chart showing median amounts by dimension (charter type, asset tier). More visual than the raw tables.

- [x] Create `breakdown-chart.tsx` using Recharts
- [x] Render above each breakdown table as a visual summary
- [x] Charter type: side-by-side bars (Bank vs CU)
- [x] Asset tier: bars ordered by tier size

---

## Phase 4: Export + Print

### 4a. CSV export

**New file: `src/app/admin/fees/catalog/actions.ts`** (Server Action)

Export catalog summaries as CSV. Returns CSV string for client-side download.

- [x] Create server action `exportCatalogCsv()`
- [x] Add "Export CSV" button to catalog page header (client component)
- [x] Create blob URL and trigger download on client

### 4b. Print styles

Add Tailwind `print:` utilities for a clean printable version.

- [x] Add `print:hidden` to nav, filters, buttons
- [x] Add `print:break-inside-avoid` to each family section
- [x] Add "Print" button next to "Export CSV"
- [x] Force all families expanded in print mode

---

## Phase 5: Polish

### 5a. Sticky first column on tables

Make the "Fee Type" column sticky on horizontal scroll for all catalog tables.

- [ ] Add `sticky left-0 bg-white z-10` to first `<td>` in each table
- [ ] Add `sticky left-0 bg-gray-50 z-10` to first `<th>`

### 5b. Mobile card layout

Below `md` breakpoint, convert table rows to cards showing: Fee Type, Median, Institution Count.

- [ ] Add `hidden md:block` to desktop table
- [ ] Add `md:hidden` card grid for mobile
- [ ] Cards link to detail page

### 5c. Extract shared `formatAmount` utility

Currently duplicated in 5+ files with slight variations.

**New file: `src/lib/format.ts`**

- [ ] Create `formatAmount()`, `formatAssets()` in shared utility
- [ ] Update all admin pages to import from `@/lib/format`

---

## Implementation Order

1. **Phase 1a-b**: Collapsible sections + compact columns (biggest impact on "too much stuff")
2. **Phase 1c-d**: Search + sort (usability)
3. **Phase 1e**: Highlight cards (rich insights)
4. **Phase 2a-b**: Detail page tabs + interactive table
5. **Phase 3a-b**: Recharts install + range chart on catalog
6. **Phase 3c-d**: Histogram + breakdown charts on detail
7. **Phase 4**: Export/print
8. **Phase 5**: Polish (sticky columns, mobile, shared utils)

## Files Summary

**New files (9):**
- `src/components/collapsible-section.tsx` - expand/collapse wrapper
- `src/components/catalog-filters.tsx` - search + family filter + sort controls
- `src/app/admin/fees/catalog/[category]/institution-table.tsx` - sortable/filterable table
- `src/components/ui/chart.tsx` - shadcn chart component (auto-generated)
- `src/components/fee-range-chart.tsx` - P25-P75 range bar chart
- `src/components/fee-histogram.tsx` - fee distribution histogram
- `src/components/breakdown-chart.tsx` - dimension comparison chart
- `src/app/admin/fees/catalog/actions.ts` - CSV export server action
- `src/lib/format.ts` - shared formatting utilities

**Modified files (3):**
- `src/app/admin/fees/catalog/page.tsx` - collapsible families, compact mode, filters, highlights
- `src/app/admin/fees/catalog/[category]/page.tsx` - tab navigation, chart integration
- `package.json` - add recharts dependency

## Acceptance Criteria

- [ ] Catalog page loads with families collapsed by default (compact summary visible)
- [ ] Expanding a family shows a 4-column table (compact mode) with toggle for full columns
- [ ] Search input filters fee types across all families in real time
- [ ] Sort dropdown changes ordering (most institutions, highest median, widest spread, alphabetical)
- [ ] Detail page has 3 tabs: Overview, Breakdowns, Institutions
- [ ] Institution table is sortable by any column with client-side click-to-sort
- [ ] Institution table has search and charter type filter
- [ ] Recharts bar chart shows fee range (P25-P75) in each expanded family
- [ ] Detail Overview tab shows fee distribution histogram
- [ ] CSV export downloads catalog data
- [ ] Print mode produces clean output
- [ ] No new pages break the Next.js build
