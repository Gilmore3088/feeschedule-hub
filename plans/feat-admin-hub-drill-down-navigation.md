# feat: Make Admin Hub Actionable with Drill-Down Navigation

## Overview

The admin dashboard shows 12 stat cards, a top fee categories table, and a full institutions table -- but nearly all of it is read-only with no way to drill into the data. Stat cards are not clickable, tables have no search/filter/pagination, there are no loading or error states, nav has no active indicators, and several sections are isolated from each other with no cross-links.

This plan transforms the admin hub from a "report page" into a true navigation hub where every metric is a door to the underlying data.

## Problem Statement

Users opening `/admin` see summary numbers ("Total Institutions: 5,432", "Fees Extracted: 4,231") but cannot click, filter, sort, or explore any of it. The experience is a dead-end dashboard -- the data is visible but inaccessible. Specific symptoms:

- All 12 `StatCard` components are plain `<div>` elements with no links or click handlers (`src/app/admin/page.tsx:250-266`)
- The institutions table renders ALL rows with no search, filter, sort, or pagination (`getInstitutionsWithFees()` has no LIMIT)
- No `loading.tsx` or `error.tsx` files exist anywhere in the admin route tree
- Nav links have no active state (all gray except hardcoded blue for "Review Fees")
- No breadcrumbs component -- each page manually implements its own
- No cross-links between sections (Fee Extracts rows don't link to peer profiles or review pages)
- No review queue summary on the dashboard
- Fee Categories stat card hardcodes `"47"` instead of computing from data (`page.tsx:82`)
- `formatAssets` and `formatAmount` are duplicated across 4+ files with subtle behavioral differences

## Proposed Solution

A phased approach targeting the highest-impact, lowest-effort improvements first. No new pages required -- this focuses on making existing data accessible.

## Technical Approach

### Phase 1: Dashboard Stat Cards Become Navigation Links

**Goal:** Every stat card links to a filtered view of the data it summarizes.

**Changes to `src/app/admin/page.tsx`:**

Update the `StatCard` component to accept an optional `href` prop. When provided, wrap the card content in a `<Link>` with hover state.

```tsx
// src/app/admin/page.tsx - Updated StatCard
function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
}) {
  const content = (
    <div className={`rounded-lg border bg-white px-4 py-3 ${href ? "hover:shadow-sm hover:border-gray-300 transition-all" : ""}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}
```

**Stat card destination mapping:**

| Card | Destination | Notes |
|---|---|---|
| Total Institutions | `/admin/peers` | Shows all institutions |
| With Fee URL | `/admin/peers?has_fees=true` | New filter param |
| Fees Extracted | `/admin/fees` | All extracted fees |
| Crawl Runs | No link (add last run timestamp as subtitle) | No crawl page exists |
| Banks (FDIC) | `/admin/peers?type=bank` | Existing filter |
| Credit Unions (NCUA) | `/admin/peers?type=credit_union` | Existing filter |
| With Website | No link | Low-value navigation |
| Financial Records | No link (informational) | No financials list page |
| FDIC Financials | No link (informational) | Subset of above |
| NCUA Financials | No link (informational) | Subset of above |
| CFPB Complaints | No link (informational) | No complaints list page |
| Fee Categories | `/admin/fees/catalog` | Existing page |

**Fix hardcoded "47":** Replace line 82's hardcoded `"47"` with `getFeeCategorySummaries().length.toString()`.

**Files changed:**
- `src/app/admin/page.tsx` -- StatCard component, stat card instances

### Phase 2: Dashboard Institutions Table Gets Search, Filter, and Pagination

**Goal:** Users can find specific institutions without scrolling through thousands of rows.

**Approach:** Extract the institutions table into a client component using the same pattern as `institution-table.tsx` from the fee catalog detail page. Server component passes all data as props; client handles interactive state.

**New file: `src/app/admin/institution-table.tsx`**

```tsx
// "use client" component
// Props: institutions array from getInstitutionsWithFees()
// Features:
// - Text search on institution name (debounced, 300ms)
// - Charter type filter chips: All | Banks | Credit Unions
// - Column sort: Name, State, Assets, Fee Count (click headers)
// - Pagination: PAGE_SIZE=25, "Show more" button
// - Row links: institution name -> /admin/peers/[id], fee count -> /admin/fees?id=[id]
```

**Changes to `src/app/admin/page.tsx`:**
- Import and render `<InstitutionTable institutions={institutions} />` instead of the inline table (lines 167-245)
- Remove the inline `formatAssets` function, import from `src/lib/format.ts`

**Changes to `src/lib/format.ts`:**
- Ensure `formatAssets` is exported and matches the most complete version (the one in `peers/[id]/page.tsx` with `.toFixed(1)` for billions)

**Files changed:**
- `src/app/admin/page.tsx` -- replace inline table with component
- `src/app/admin/institution-table.tsx` -- new client component
- `src/lib/format.ts` -- ensure `formatAssets` is exported

### Phase 3: Loading and Error States

**Goal:** No more blank pages during load or unhandled crashes.

**New files (loading skeletons):**

```
src/app/admin/loading.tsx                        -- Dashboard skeleton (stat card grid + table placeholder)
src/app/admin/fees/catalog/loading.tsx            -- Catalog skeleton (filter bar + table rows)
src/app/admin/fees/catalog/[category]/loading.tsx -- Detail skeleton (stat cards + chart placeholder)
src/app/admin/peers/loading.tsx                   -- Peers skeleton (tier cards + filter pills)
src/app/admin/peers/[id]/loading.tsx              -- Peer detail skeleton (header + data sections)
src/app/admin/review/loading.tsx                  -- Review skeleton (tabs + table rows)
```

Each skeleton uses `animate-pulse` divs matching the layout of the real page.

**New file (error boundary):**

```
src/app/admin/error.tsx   -- "use client" error boundary
```

```tsx
// src/app/admin/error.tsx
"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDbError = error.message?.includes("unable to open database") ||
                    error.message?.includes("no such table");

  return (
    <div className="text-center py-16">
      <h2 className="text-lg font-semibold text-gray-900">
        {isDbError ? "Database Not Available" : "Something went wrong"}
      </h2>
      <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
        {isDbError
          ? "The crawler database could not be loaded. Make sure the data pipeline has been run."
          : error.message}
      </p>
      <button
        onClick={() => reset()}
        className="mt-6 rounded-md bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700"
      >
        Try again
      </button>
    </div>
  );
}
```

**Files changed:**
- 6 new `loading.tsx` files
- 1 new `error.tsx` file

### Phase 4: Active Nav State and Breadcrumbs

**Goal:** Users always know where they are in the admin hub.

**4a. Active nav state in layout:**

The nav in `src/app/admin/layout.tsx` needs to be extracted into a client component that uses `usePathname()`.

**New file: `src/app/admin/admin-nav.tsx`**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/review", label: "Review Fees" },
  { href: "/admin/fees/catalog", label: "Fee Catalog" },
  { href: "/admin/peers", label: "Peer Groups" },
  { href: "/admin/fees", label: "Fee Extracts", exact: true },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex items-center gap-1">
      {NAV_ITEMS.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
              isActive
                ? "bg-gray-100 text-gray-900"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

Note: `Fee Extracts` needs `exact: true` because `/admin/fees` is a prefix of `/admin/fees/catalog`. The nav items must be ordered so that `/admin/fees/catalog` is checked before `/admin/fees`.

**4b. Shared breadcrumbs component:**

**New file: `src/components/breadcrumbs.tsx`**

```tsx
import Link from "next/link";

export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-gray-300">/</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-gray-900">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-700 font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
```

Replace ad-hoc breadcrumbs in each page with this component.

**Files changed:**
- `src/app/admin/layout.tsx` -- import and use `AdminNav`
- `src/app/admin/admin-nav.tsx` -- new client component
- `src/components/breadcrumbs.tsx` -- new server component
- `src/app/admin/fees/catalog/page.tsx` -- use `Breadcrumbs` component
- `src/app/admin/fees/catalog/[category]/page.tsx` -- use `Breadcrumbs` component
- `src/app/admin/fees/page.tsx` -- use `Breadcrumbs` component
- `src/app/admin/peers/page.tsx` -- use `Breadcrumbs` component
- `src/app/admin/peers/[id]/page.tsx` -- use `Breadcrumbs` component
- `src/app/admin/review/page.tsx` -- use `Breadcrumbs` component
- `src/app/admin/review/[id]/page.tsx` -- use `Breadcrumbs` component

### Phase 5: Review Queue Summary on Dashboard

**Goal:** Admin/analyst users see pending review counts without navigating away.

**Changes to `src/app/admin/page.tsx`:**

Import `getReviewStats()` from `crawler-db.ts` (already exists) and render a small section between the stat cards and the top fees table.

```tsx
// After the financial stats grid, before the top fees table
const reviewStats = getReviewStats();
const needsAttention = reviewStats.staged + reviewStats.flagged;

// Render a "Review Queue" card:
// - "X fees need review" with link to /admin/review?status=staged
// - Inline counts: Staged (N) | Flagged (N) | Pending (N) | Approved (N)
// - Each count links to the corresponding status tab
```

**Files changed:**
- `src/app/admin/page.tsx` -- add review summary section

### Phase 6: Cross-Links Between Sections

**Goal:** Users can navigate between related data without manual URL construction.

**6a. Fee Extracts page (`src/app/admin/fees/page.tsx`):**
- Institution names link to `/admin/peers/[id]`
- Fee names link to `/admin/review/[id]` (if fee has a review record)
- Add search input for fee name filtering
- Add charter type filter (Bank/CU/All)
- Add pagination (PAGE_SIZE=50)

**6b. Review page (`src/app/admin/review/page.tsx`):**
- Institution names link to `/admin/peers/[id]`

**6c. Dashboard institutions table:**
- Already handled by Phase 2 -- institution names link to `/admin/peers/[id]`, fee counts link to `/admin/fees?id=[id]`

**6d. Peer detail page (`src/app/admin/peers/[id]/page.tsx`):**
- Add link to `/admin/fees/catalog/[category]` from fee comparison table rows (the fee name column)

**Files changed:**
- `src/app/admin/fees/page.tsx` -- add links, search, filter, pagination
- `src/app/admin/review/page.tsx` -- add institution links
- `src/app/admin/peers/[id]/page.tsx` -- add fee category links

### Phase 7: Consolidate Duplicated Utilities

**Goal:** Single source of truth for formatting functions.

**Changes to `src/lib/format.ts`:**
- Ensure it exports `formatAmount` and `formatAssets` with the most complete behavior
- `formatAmount`: handle null, percentages (< 1), and dollar amounts
- `formatAssets`: handle null, billions (`.toFixed(1)`), millions, thousands

**Update imports in:**
- `src/app/admin/page.tsx` -- remove local `formatAssets`, import from `@/lib/format`
- `src/app/admin/fees/page.tsx` -- remove local `formatAmount`, import from `@/lib/format`
- `src/app/admin/review/page.tsx` -- remove local `formatAmount`, import from `@/lib/format`
- `src/app/admin/review/[id]/page.tsx` -- remove local `formatAmount`, import from `@/lib/format`
- `src/app/admin/peers/page.tsx` -- remove local `formatAssets`, import from `@/lib/format`
- `src/app/admin/peers/[id]/page.tsx` -- remove local `formatAssets`/`formatAmount`, import from `@/lib/format`

**Files changed:**
- `src/lib/format.ts` -- canonical formatting functions
- 6 page files -- replace local functions with imports

## Acceptance Criteria

### Phase 1 -- Stat Cards
- [x] `StatCard` component accepts optional `href` prop
- [x] Cards with destinations render as `<Link>` with hover state
- [x] "Total Institutions" links to `/admin/peers`
- [x] "Fee Categories" shows dynamically computed count, links to `/admin/fees/catalog`
- [x] "Fees Extracted" links to `/admin/fees`
- [x] "Banks (FDIC)" links to `/admin/peers?type=bank`
- [x] "Credit Unions (NCUA)" links to `/admin/peers?type=credit_union`
- [x] Non-linkable cards remain as plain divs (no dead links)

### Phase 2 -- Institutions Table
- [x] Dashboard institutions table is an interactive client component
- [x] Text search filters by institution name (debounced)
- [x] Charter type filter chips (All/Banks/CUs)
- [x] Column headers are sortable (Name, State, Assets, Fee Count)
- [x] Pagination with PAGE_SIZE=25 and "Show more" button
- [x] Institution names link to `/admin/peers/[id]`
- [x] Fee count links to `/admin/fees?id=[id]`

### Phase 3 -- Loading and Error States
- [x] Each admin route segment has a `loading.tsx` with animate-pulse skeleton
- [x] `error.tsx` at `/admin` catches database errors with meaningful message
- [x] Error boundary shows "Try again" button that calls `reset()`

### Phase 4 -- Nav and Breadcrumbs
- [x] Active nav item is visually highlighted based on current route
- [x] Child routes highlight parent nav item (e.g., `/admin/fees/catalog/overdraft` highlights "Fee Catalog")
- [x] `Breadcrumbs` component is used consistently across all admin pages
- [x] No hardcoded nav link colors remain

### Phase 5 -- Review Queue Summary
- [x] Dashboard shows review queue counts (staged, flagged, pending)
- [x] Each count links to the corresponding status tab in `/admin/review`
- [x] Section only renders when there are fees to review

### Phase 6 -- Cross-Links
- [x] Institution names in fee extracts link to peer profiles
- [x] Institution names in review queue link to peer profiles
- [x] Fee names in peer detail fee comparison link to fee catalog categories
- [ ] Fee extracts page has search and pagination

### Phase 7 -- Utility Consolidation
- [x] `formatAmount` and `formatAssets` have one canonical version in `src/lib/format.ts`
- [x] All 6 page files import from `@/lib/format` instead of defining locally
- [x] No behavioral regressions in number formatting

## Dependencies & Risks

**Dependencies:**
- No new npm packages required (all changes use existing Next.js, React, and Tailwind)
- Database schema unchanged -- all queries use existing tables and functions
- Some new query params added to existing pages (`has_fees`, `type` for peers page)

**Risks:**
- **Peer page filter params:** Adding `?has_fees=true` and `?type=bank` to `/admin/peers` requires updating `getInstitutionsByFilter()` in `crawler-db.ts` if those params aren't already supported
- **Nav matching edge case:** `/admin/fees` is a prefix of `/admin/fees/catalog` -- needs careful `exact` matching logic
- **Large dataset performance:** If institutions table has 10,000+ rows, client-side filtering may feel slow -- but this matches the existing pattern in `institution-table.tsx` which works fine for the current dataset size

## References

### Internal
- `src/app/admin/page.tsx` -- Dashboard (primary target)
- `src/app/admin/layout.tsx` -- Nav layout
- `src/lib/crawler-db.ts` -- Database query layer
- `src/lib/format.ts` -- Existing format utilities
- `src/app/admin/fees/catalog/[category]/institution-table.tsx` -- Reference pattern for interactive tables
- `plans/feat-fee-catalog-ux-improvements.md` -- Prior UX improvement plan (mostly complete)
- `plans/feat-enhance-data-enrichment-pipeline.md` -- Data pipeline plan referencing analytics page

### External
- [Next.js App Router loading.tsx](https://nextjs.org/docs/app/api-reference/file-conventions/loading)
- [Next.js error.tsx boundaries](https://nextjs.org/docs/app/api-reference/file-conventions/error)
- [Dashboard UX: Every metric should be a door](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards)
