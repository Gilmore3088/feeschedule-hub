# Phase 57: Admin UX Sortable Tables & Districts - Research

**Researched:** 2026-04-10
**Domain:** Next.js admin UI — client-side sort, server-side sort, district intelligence rendering, responsive layouts
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** All admin tables with 3+ rows adopt sortable behavior. No exceptions.
- **D-02:** Default sort is alphabetical by name/label column ascending on first page load. No domain-specific defaults.
- **D-03:** Sort state persists in URL params (?sort=name&dir=asc). Shareable, back-button friendly.
- **D-04:** Hybrid approach — client-side SortableTable for bounded tables (under ~500 rows), server-side ORDER BY for unbounded tables (review queue, fees catalog).
- **D-05:** Review queue and fees catalog use server-side pagination with URL params (?page=1&per=50&sort=name&dir=asc).
- **D-06:** Page size is user-selectable via dropdown with 25/50/100 options. Default is 50.
- **D-07:** Separate ServerSortableTable component (server component reading searchParams). Client-side SortableTable stays as-is for bounded tables. Two distinct components, clean separation.
- **D-08:** Existing client-side SortableTable component updated to persist sort state in URL params (currently uses local useState).
- **D-09:** Full intelligence panel on district detail — Beige Book themes, economic indicators (FRED), CFPB complaint summary, district median fees, fee revenue from Call Reports.
- **D-10:** Tabbed section layout: Economy | Fees | Complaints | Beige Book. Keeps each section focused, reduces scroll.
- **D-11:** Districts index page (/admin/districts) also upgraded — sortable table with key metrics per district. Click-through to detail.
- **D-12:** Beige Book themes displayed as cards with sentiment indicators (positive/neutral/negative) and key excerpts.
- **D-13:** Adaptive layouts — tables become stacked cards on mobile where appropriate, sidebar collapses. Full mobile-first treatment.
- **D-14:** Wide tables on tablet get horizontal scroll within overflow-x-auto container. Preserves all data columns, user scrolls to see them.
- **D-15 (Discretion):** Prioritize adaptive layouts for the most visual/complex pages (districts, dashboard) while simpler pages may just get overflow fixes.

### Claude's Discretion

- Column classification for responsive hide/show: not used — horizontal scroll is the standard approach.
- Triage by visual complexity and user value for adaptive vs overflow-only treatment.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADM-01 | SortableTable component wired to all admin pages (currently only on /admin/index) | SortableTable exists at src/components/sortable-table.tsx; only one adoption confirmed (index-table.tsx). 11+ pages need it. URL param persistence requires updating useState to useRouter/useSearchParams |
| ADM-02 | Server-side sort via URL params for unbounded tables (review queue, fees catalog) where in-memory sort fails at 15K+ rows | Review queue already has server-side sort via getReviewFees with ORDER BY. Fee catalog (fees/catalog) has server-side sort via SortLink components. Both need page-size selector (25/50/100) and Pagination integration updates |
| ADM-03 | Districts pages consume Phase 23-24 district queries (Beige Book summaries, economic indicators, CFPB data) | District detail page ALREADY imports all queries (getDistrictEconomicSummary, getBeigeBookThemes, getDistrictFeeRevenue, getDistrictComplaintSummary) and renders them — but layout is a flat stack of cards with no tabs. Needs tab restructure + district median fees added |
| ADM-04 | All admin pages responsive on tablet/mobile breakpoints | Layout uses min-w-0 on main content but many tables lack overflow-x-auto containers. Sidebar is hidden below md: breakpoint. Wide tables (10 columns) need overflow-x-auto wrappers |
</phase_requirements>

---

## Summary

The admin UI has a solid foundation: `SortableTable<T>` component exists with Column config, pagination, and sort logic, but it uses `useState` for sort state (no URL persistence) and is only wired to `/admin/index`. Every other admin page uses raw `<table>` markup. The review queue and fee catalog already have server-side sort via URL params and `SortLink` components — they need a page-size selector (D-06) and the review queue's `PAGE_SIZE` constant needs to be made user-configurable.

The district detail page already fetches all Phase 23-24 data (economic summary, Beige Book themes, CFPB complaints, fee revenue) and renders it — the gap is layout restructure (flat stack → tabbed panel per D-10) and adding district median fees (missing: no call to `getDistrictMedianByCategory` on this page). The districts index page is a grid of cards with no sort capability.

The responsive situation is straightforward: the admin layout's sidebar collapses at `md:` already, and most table wrappers have `overflow-x-auto`. The remaining work is auditing which specific pages lack the wrapper and adding it.

**Primary recommendation:** The largest impact task is updating `SortableTable` to persist sort in URL params (D-08), then batch-adopting it across all bounded-row pages. District detail tab restructure and adding `getDistrictMedianByCategory` is self-contained. Server-side tables (review queue, fee catalog) need a page-size dropdown wired to a new URL param.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 16.1.6 | searchParams (Promise-based), Link for URL navigation | Already in use; server components read searchParams for sort/filter |
| React | 19.2.3 | Client component state for interactive tab switching | Already in use |
| Tailwind CSS v4 | 4 | Responsive breakpoints (sm:/md:/lg:), overflow-x-auto | Already in use throughout admin |
| lucide-react | 0.564.0 | ArrowUp/ArrowDown/ArrowUpDown sort icons in SortableTable | Already imported in sortable-table.tsx |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `useRouter` + `useSearchParams` (next/navigation) | Next.js built-in | Update URL params from client component (SortableTable URL persistence) | Used in SortableHeader component already; adapt for SortableTable |
| `URLSearchParams` | Web API | Build updated query string preserving existing params | Already used in SortLink pattern in review/page.tsx and fees/catalog/page.tsx |

### No New Dependencies Required

All work uses existing stack. No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure

New files this phase:
```
src/components/
├── sortable-table.tsx        # MODIFY: add URL param persistence (D-08)
└── server-sortable-table.tsx # NEW: server component for unbounded tables (D-07)

src/app/admin/districts/
├── [id]/page.tsx             # MODIFY: flat stack → tabbed layout (D-10) + district fee medians
├── page.tsx                  # MODIFY: cards grid → sortable table (D-11)
└── [id]/district-tabs.tsx    # NEW: client component for tab switching

src/app/admin/review/
└── page.tsx                  # MODIFY: add page-size selector (D-06)

src/app/admin/fees/catalog/
└── page.tsx                  # MODIFY: add page-size selector (D-06)
```

### Pattern 1: SortableTable URL Param Persistence (D-08)

**What:** Replace `useState(defaultSort)` and `useState(defaultDir)` with values read from `useSearchParams()`. On sort click, call `router.push(newUrl)` instead of `setSortKey`.

**When to use:** Every client-side SortableTable instance.

**Implementation approach:**
```typescript
// In sortable-table.tsx - replace useState with:
"use client";
import { useRouter, useSearchParams } from "next/navigation";

// Read initial state from URL, fall back to prop default
const searchParams = useSearchParams();
const sortKey = searchParams.get("sort") ?? defaultSort ?? columns[0]?.key ?? "";
const sortDir = (searchParams.get("dir") as "asc" | "desc") ?? defaultDir;
const page = Math.max(0, Number(searchParams.get("page") ?? "0"));

// On sort click, push URL update preserving existing params
const router = useRouter();
function handleSort(key: string) {
  const params = new URLSearchParams(searchParams.toString());
  if (key === sortKey) {
    params.set("dir", sortDir === "asc" ? "desc" : "asc");
  } else {
    params.set("sort", key);
    params.set("dir", "desc");
  }
  params.delete("page");
  router.push(`?${params.toString()}`);
}
```

**Source:** `[VERIFIED: codebase]` — SortableHeader component at `src/components/sortable-header.tsx` already uses `useSearchParams()` + `Link href` for the same pattern. SortableTable should mirror this.

**Caution:** `useSearchParams()` requires a `<Suspense>` boundary wrapper when used inside a server-rendered page. The existing `SortableHeader` is already wrapped in `<Suspense fallback={null}>` in fees/catalog — apply the same pattern.

### Pattern 2: ServerSortableTable Component (D-07)

**What:** A server component that receives `searchParams` from the page, renders table with sort links (using `Link` not `onClick`), and includes page-size selector.

**When to use:** Review queue, fees catalog (unbounded row counts).

**Key insight:** This is NOT a new `<table>` — it is a server-rendered wrapper that generates the same HTML structure as `SortableTable` but sources sort state from URL props, not React state. No `"use client"` needed.

**Page-size selector implementation:**
```typescript
// In server page component:
const perPage = [25, 50, 100].includes(Number(params.per)) ? Number(params.per) : 50;

// Selector renders as links (not form submit):
<select onChange={...} /> // Would need client component wrapper
// OR: render as Link buttons: "25 | 50 | 100" — simpler, no client JS
```

**Recommendation:** Use a tiny `"use client"` wrapper for the per-page `<select>` only (or render as three `<Link>` buttons). The rest of ServerSortableTable stays server component. [ASSUMED — pattern choice, valid options exist]

### Pattern 3: District Detail Tab Layout (D-10)

**What:** Four tabs (Economy | Fees | Complaints | Beige Book). Active tab controlled by URL param `?tab=economy` or via client-side state.

**When to use:** `/admin/districts/[id]` — replaces the current flat stack of card sections.

**Recommended approach:** Client component `DistrictTabs` wraps all four panels. Active tab = `useState` or `useSearchParams`. Given D-03 (sort state in URL) applies to tables, using URL for tab too is consistent. However, tabs are non-critical for shareability — `useState` is simpler.

**Context:** The market page uses tab-like "section buttons" with client-side state (it's a `"use client"` component). District detail is a server component — extract the tab navigation into a client component child, keeping data fetching in the server.

```typescript
// src/app/admin/districts/[id]/district-tabs.tsx
"use client";
import { useState } from "react";
type Tab = "economy" | "fees" | "complaints" | "beigebook";
export function DistrictTabs({ children }: { children: Record<Tab, React.ReactNode> }) {
  const [active, setActive] = useState<Tab>("economy");
  return (
    <>
      <div className="flex gap-1 border-b mb-4">
        {(["economy","fees","complaints","beigebook"] as Tab[]).map(tab => (
          <button key={tab} onClick={() => setActive(tab)} ...>{tab}</button>
        ))}
      </div>
      {children[active]}
    </>
  );
}
```

**Source:** `[VERIFIED: codebase]` — Market page client tab pattern at `src/app/admin/market/page.tsx`.

### Pattern 4: District Median Fees (missing from detail page)

**What:** District detail page currently does NOT call `getDistrictMedianByCategory`. Need to show per-category fee medians for the district in the "Fees" tab.

**Available query:** `getDistrictMedianByCategory(category, { charter_type?, asset_tiers? })` returns `{ district, median_amount, institution_count }[]` — it fetches ALL districts for a given category. To show "Fees" tab for district detail, need to fetch top categories and for each, get the district's row.

**Better approach:** Add a new query `getDistrictFeeMedians(district: number)` that returns median per category for a single district — analogous to `getNationalIndex` but filtered to one district. This avoids calling `getDistrictMedianByCategory` 49 times. [ASSUMED — new query needed, design TBD]

**Source:** `[VERIFIED: codebase]` — `getDistrictMedianByCategory` in `src/lib/crawler-db/fee-index.ts` returns all-district rows for one category. Inverting (one district, all categories) requires a new function.

### Pattern 5: Districts Index Upgrade (D-11)

**What:** Replace the current 12-card grid layout with a sortable table showing district number, name, institution count, fee coverage %, total fees, and optionally avg fee revenue.

**Bounded row count:** Always 12 rows (12 Fed districts). Client-side SortableTable is appropriate (D-04).

**Data needed:** `getDistrictOverview()` already returns `{ district, name, total, with_fees, pct }`. Add call to `getDistrictFeeRevenue` per district (or create a batch query) for revenue column. Or simply use the existing data for v1 of the table.

### Anti-Patterns to Avoid

- **Server component using useState for tabs:** District detail is server component — tab state must be in a client child component, not the page itself.
- **Calling getDistrictMedianByCategory 49 times:** Too many DB round trips. Write one query that aggregates all categories for a district.
- **Adding overflow-x-auto to layout.tsx:** Apply it per-table wrapper, not globally — some pages have non-table content that should not scroll.
- **SortableTable without Suspense:** `useSearchParams()` requires Suspense boundary. Wrap adopters accordingly.
- **Using router.replace instead of router.push for sort:** Push gives back-button navigation as required by D-03.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sort icons | Custom SVG arrows | `ArrowUp/ArrowDown/ArrowUpDown` from lucide-react | Already imported in sortable-table.tsx |
| URL param merging | Manual string concat | `URLSearchParams.toString()` — already used in SortLink pattern | Handles encoding, existing params preserved |
| Pagination UI | Custom component | `Pagination` component at `src/components/pagination.tsx` | Already accepts `params` dict for param preservation |
| Tab navigation | Radix Tabs | Plain `<button>` with useState per Pattern 3 | Radix overkill for 4 tabs; consistent with existing market page approach |

---

## Runtime State Inventory

Not applicable — this is a UI/UX phase with no data migrations, renames, or refactors of stored state.

---

## Common Pitfalls

### Pitfall 1: SortableTable URL Persistence Breaks Pagination Reset

**What goes wrong:** After adopting URL params for sort, clicking a column header doesn't reset to page 0 — user stays on page 3 seeing stale results.

**Why it happens:** The existing `handleSort` does `setPage(0)` via useState, but URL version must explicitly `params.delete("page")` before pushing.

**How to avoid:** In `handleSort`, always `params.delete("page")` before `router.push`. Already handled in SortableHeader — replicate the pattern.

**Warning signs:** Sort works but paginated table shows "no results" on page 3 after sorting.

### Pitfall 2: searchParams Promise Not Awaited

**What goes wrong:** TypeScript error or runtime undefined when reading `searchParams` in server pages.

**Why it happens:** Next.js 16 App Router made `searchParams` Promise-based. Must `await searchParams` at the top of the page function.

**How to avoid:** Pattern already established in every admin page (`const params = await searchParams`). New server pages must follow the same.

**Warning signs:** `params.sort` is `undefined` or TypeScript complains about accessing `.sort` on `Promise<...>`.

### Pitfall 3: District Detail Fetches All Districts for Category Queries

**What goes wrong:** Calling `getDistrictMedianByCategory` for each of 49 categories individually = 49 DB round trips, slow page load.

**Why it happens:** The existing function takes a category and returns all districts. The "district fees" tab needs the inverse: all categories for one district.

**How to avoid:** Write `getDistrictFeeMedians(district)` — one query with GROUP BY fee_category WHERE fed_district = $1.

**Warning signs:** District detail page taking 2+ seconds to load Fees tab.

### Pitfall 4: SortableTable Client Component Inside Server Component Without Suspense

**What goes wrong:** Hydration error or build failure when `useSearchParams()` is used outside a Suspense boundary.

**Why it happens:** `useSearchParams()` suspends during SSR if not wrapped in Suspense. Next.js App Router requires this.

**How to avoid:** Wrap SortableTable (after URL param update) in `<Suspense fallback={...}>` at the call site. Existing usage in fees/catalog already does this for SortLink.

**Warning signs:** Build error: "useSearchParams() should be wrapped in a suspense boundary."

### Pitfall 5: Per-Page Selector Conflicts with Existing Pagination

**What goes wrong:** Changing per-page resets to page 1 but existing `<Pagination>` component has hardcoded `pageSize` prop — it doesn't emit the new per-page value in its page links.

**Why it happens:** `Pagination` at `src/components/pagination.tsx` accepts `params` dict for extra query params — `per` param needs to be included in the `params` dict passed to Pagination so page links preserve it.

**How to avoid:** When adding per-page selector, pass `{ ...existingParams, per: String(perPage) }` to the `<Pagination params={...}>` prop.

**Warning signs:** Changing per-page to 100, clicking page 2 resets back to 50 items.

---

## Code Examples

### Current SortableTable Call Site (index-table.tsx)
```typescript
// VERIFIED: src/app/admin/index/index-table.tsx
export function IndexTable({ entries }: { entries: IndexRow[] }) {
  return (
    <SortableTable
      columns={columns}
      rows={entries as (IndexRow & Record<string, unknown>)[]}
      rowKey={(r) => r.fee_category}
      defaultSort="institution_count"
      defaultDir="desc"
      pageSize={100}
    />
  );
}
```

Note: `defaultSort` and `defaultDir` become the URL param fallback after the update. Per D-02, these should default to alphabetical by name column.

### getReviewFees Signature (already server-side sort)
```typescript
// VERIFIED: src/lib/admin-queries.ts line 714
export async function getReviewFees(
  status: string,
  page: number,
  limit: number,        // will become user-configurable (25/50/100)
  search?: string,
  sort?: string,
  dir?: string,
): Promise<{ fees: ReviewFeeRow[]; total: number }>
```
Review queue page already reads `params.sort`, `params.dir`, `params.page` from `searchParams`. The only missing piece is `params.per` for page size.

### District Detail Data Already Fetched
```typescript
// VERIFIED: src/app/admin/districts/[id]/page.tsx line 41
const [beigeBook, editions, content, indicators, metrics, econSummary, feeRevenue, complaints, themes] = await Promise.all([
  getLatestBeigeBook(districtId),
  getBeigeBookEditions(8),
  getDistrictContent(districtId, 15),
  getDistrictIndicators(districtId),
  getDistrictMetrics(),
  getDistrictEconomicSummary(districtId).catch(() => null),
  getDistrictFeeRevenue(districtId).catch(() => null),
  getDistrictComplaintSummary(districtId).catch(() => null),
  getBeigeBookThemes().catch(() => []),
]);
```
All data is already fetched. The page renders it in a flat card stack. The restructure to tabs is purely a layout change — no new data fetching needed except district fee medians.

### DistrictComplaintSummary Interface
```typescript
// VERIFIED: src/lib/crawler-db/complaints.ts
export interface DistrictComplaintSummary {
  fed_district: number;
  total_complaints: number;
  fee_related_complaints: number;
  institution_count: number;
  top_products: { product: string; count: number }[];
}
```
Note: the current district detail page has a `fee_related_pct` property access on the complaints object (line 341) — but the interface has `fee_related_complaints` (not `fee_related_pct`). This is a pre-existing bug in the rendering code. The new Complaints tab must use the correct field names.

### BeigeBookTheme Interface
```typescript
// VERIFIED: src/lib/crawler-db/fed.ts
export interface BeigeBookTheme {
  release_code: string;
  fed_district: number;
  district_name: string;
  theme_category: 'growth' | 'employment' | 'prices' | 'lending_conditions';
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  summary: string;
  confidence: number;
  extracted_at: string;
}
```

### Admin Layout Responsive Structure
```typescript
// VERIFIED: src/app/admin/layout.tsx
// Sidebar: hidden below md: breakpoint
<aside className="hidden md:flex flex-col w-[180px] shrink-0 ...">
// Main: min-w-0 prevents overflow, flex-1 fills space
<main className="admin-content flex-1 min-w-0 px-5 py-5 lg:px-7">
  <div className="mx-auto max-w-[1600px]">{children}</div>
```
The layout itself is correctly structured. Overflow issues are within page content, not the layout shell.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| useState for sort | URL param sort (server-side) | D-08 this phase | Sort is bookmarkable, back-button friendly |
| Flat stack sections on district detail | Tabbed section layout | D-10 this phase | Reduced scroll, focused sections |
| Card grid for districts index | Sortable table | D-11 this phase | Enables comparison sorting by coverage/fees |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Per-page selector best implemented as three `<Link>` buttons or a tiny `"use client"` select wrapper | Architecture Patterns | Minor — either works, choose whichever is simpler during implementation |
| A2 | `getDistrictFeeMedians(district)` needs to be written as a new query (inverting getDistrictMedianByCategory) | Architecture Patterns | Medium — if existing queries can compose this without a new function, planner can adjust |
| A3 | Tab state in DistrictTabs uses useState (not URL param) | Architecture Patterns | Low — could use URL param instead; both are valid per project patterns |
| A4 | The `fee_related_pct` field access on complaints object (district detail line 341) is a pre-existing bug | Code Examples | Low risk to plan — fixing this is part of the refactor anyway |

---

## Open Questions

1. **District fee medians query**
   - What we know: `getDistrictMedianByCategory` inverts the needed query (category → all districts)
   - What's unclear: Whether a single SQL query can efficiently return per-category medians for one district in one round trip
   - Recommendation: Write `getDistrictFeeMedians(district: number, categories?: string[])` in `fee-index.ts` — GROUP BY fee_category WHERE fed_district = $1

2. **Scope of bounded-table adoption**
   - What we know: 40+ files have `<table>` markup; many are admin pages with bounded rows
   - What's unclear: Which pages are genuinely bounded vs. potentially large (institutions, peers, leads)
   - Recommendation: Pages with server-side pagination already (institutions, review) = ServerSortableTable. Pages with aggregated/grouped data (fees/page.tsx = 49 rows, districts = 12 rows, peers = aggregated index) = client SortableTable. Planner should enumerate each page explicitly.

---

## Environment Availability

Step 2.6 SKIPPED — purely UI/code changes, no new external dependencies.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/lib` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADM-01 | SortableTable URL persistence — sort click updates URL | manual/smoke | N/A — UI interaction | N/A |
| ADM-02 | getReviewFees respects per-page limit param | unit | `npx vitest run src/lib` | Existing query tests; new test for per-page |
| ADM-03 | District detail renders all four data sections | manual/smoke | N/A — server render | N/A |
| ADM-04 | No horizontal overflow on 768px viewport | manual | Browser devtools 768px | N/A |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib` (existing tests; catch regressions)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green + manual viewport check at 768px before `/gsd-verify-work`

### Wave 0 Gaps
- None — existing test infrastructure sufficient for the utility/query layer. UI interaction tests are manual-only for this phase.

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | requireAuth already in all admin pages |
| V4 Access Control | no | requireAuth("view") pattern unchanged |
| V5 Input Validation | yes | Sort key and dir params must be validated against allowlist before use in ORDER BY |

### Sort Parameter Injection Risk

The review queue's `getReviewFees` (admin-queries.ts line 754) uses a ternary to map sort param values to SQL column names — this is the correct pattern and already guards against injection:

```typescript
// VERIFIED: src/lib/admin-queries.ts
ORDER BY ${sort === "amount" ? "ef.amount" : sort === "category" ? "ef.fee_category" : ...} ${dir === "asc" ? "ASC" : "DESC"}
```

Any new server-side sort queries MUST use the same allowlist-ternary pattern. Never interpolate `sort` or `dir` URL params directly into SQL.

---

## Sources

### Primary (HIGH confidence)
- `[VERIFIED: codebase]` — `src/components/sortable-table.tsx` — current implementation, useState-based
- `[VERIFIED: codebase]` — `src/components/sortable-header.tsx` — URL param pattern with useSearchParams
- `[VERIFIED: codebase]` — `src/app/admin/districts/[id]/page.tsx` — all Phase 23-24 data already fetched
- `[VERIFIED: codebase]` — `src/lib/crawler-db/fed.ts` — BeigeBookTheme, DistrictEconomicSummary interfaces
- `[VERIFIED: codebase]` — `src/lib/crawler-db/complaints.ts` — DistrictComplaintSummary interface
- `[VERIFIED: codebase]` — `src/lib/crawler-db/call-reports.ts` — DistrictFeeRevenue interface
- `[VERIFIED: codebase]` — `src/lib/admin-queries.ts` — getReviewFees already has server-side sort
- `[VERIFIED: codebase]` — `src/app/admin/fees/catalog/page.tsx` — already has SortLink/URL sort, needs per-page
- `[VERIFIED: codebase]` — `src/app/admin/review/page.tsx` — PAGE_SIZE=20 hardcoded, needs user-configurable
- `[VERIFIED: codebase]` — `src/app/admin/layout.tsx` — sidebar hidden md:, main has min-w-0

### Secondary (MEDIUM confidence)
- Next.js 16 searchParams is Promise-based — confirmed by existing page patterns across all admin pages

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing, no new dependencies
- Architecture: HIGH — all patterns verified in codebase
- Pitfalls: HIGH — pitfall 4 (Suspense) and pitfall 5 (pagination) verified by reading existing code
- District detail: HIGH — confirmed all data is already fetched, gap is layout only

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable stack, no fast-moving dependencies)
