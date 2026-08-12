# Feature: FI Fee Tracker — Find Your Bank

## Enhancement Summary

**Deepened on:** 2026-02-20
**Sections enhanced:** 4 phases + design decisions + edge cases
**Research agents used:** 13 (architecture-strategist, performance-oracle, security-sentinel, code-simplicity-reviewer, kieran-typescript-reviewer, julik-frontend-races-reviewer, pattern-recognition-specialist, data-integrity-guardian, agent-native-reviewer, best-practices-researcher, framework-docs-researcher, SQLite-search-explorer, frontend-design-skill)

### Key Improvements

1. **Batched scorecard query** — eliminates N+1 problem (14-27 queries -> 2-3)
2. **Simplified v1 scope** — drop percentile rank, drop popular grid, single peer scope (state-based, same charter) instead of 3-way toggle
3. **Race condition prevention** — generation counter + state machine for autocomplete
4. **Naming collision resolved** — plan's `getInstitutionsWithFees()` renamed to `getInstitutionIdsWithFees()` to avoid conflict with existing `core.ts:33`
5. **Type reuse** — extend existing `InstitutionDetail` and `InstitutionSummary` instead of creating overlapping types
6. **Fee deduplication** — discovered 6,997 institution+category pairs with duplicate entries; queries must deduplicate
7. **Security hardening** — rate limiting on search action, LIKE pattern sanitization, URL validation

### New Considerations Discovered

- 6,997 institution+category pairs have duplicate entries in `extracted_fees` — must deduplicate in queries
- Existing `getInstitutionsWithFees()` in `core.ts:33` conflicts with plan's proposed sitemap function
- `InstitutionDetail` in `types.ts:53` overlaps 7 of 10 fields with proposed `InstitutionProfile`
- Autocomplete has 7 identified race conditions requiring explicit mitigation
- Winsorization already implemented in `computeStats()` (fees.ts:60-83) — no additional work needed
- Sequential IDs in URLs enable enumeration; acceptable for public data but noted

---

## Overview

Add a consumer-facing institution lookup tool where users search for their specific bank or credit union by name and see that institution's fees compared to local/regional/national competitors. This is a new page at `/institutions` with individual institution profiles at `/institutions/[id]`.

**Key data points:**
- 8,751 institutions in DB (4,332 banks, 4,419 CUs)
- 1,987 have categorized fees; 1,885 have approved fees
- Average 13 categorized fee categories per institution (of 49 total)
- 6,764 institutions have zero extracted fees (77%) — empty state is the majority case
- Heavy name collisions: 35 "First State Bank", 22 "Farmers State Bank", etc.
- 6,997 institution+category pairs have duplicate entries — queries must handle this

---

## Phase 1: Data Layer & Search

New DB queries and a Server Action for institution search. No UI yet.

### 1.1 Add `searchInstitutions()` query

**File:** `src/lib/crawler-db/institutions.ts`

Server-side SQLite search (consistent with existing admin search pattern in `src/app/admin/actions/search.ts`). Not Fuse.js — avoids shipping 500KB of institution data to the client.

```typescript
export interface InstitutionSearchResult {
  id: number;
  institution_name: string;
  city: string | null;
  state_code: string | null;
  charter_type: string;
  asset_size_tier: string | null;
  has_fees: boolean;      // true if any extracted fees exist
  fee_count: number;      // count of categorized fees
}

export function searchInstitutions(query: string, limit = 10): InstitutionSearchResult[]
```

Query logic:
- `WHERE institution_name LIKE ?` with `%query%` pattern
- LEFT JOIN to `extracted_fees` for `has_fees` and `fee_count` (subquery with GROUP BY)
- Order by: exact prefix match first, then `has_fees DESC`, then alphabetical
- Minimum 2-character query (return empty for shorter)

#### Research Insights

**LIKE pattern sanitization (P1):**
Escape `%` and `_` characters in user input before passing to LIKE:
```typescript
function sanitizeLikePattern(input: string): string {
  return input.replace(/[%_]/g, '\\$&');
}
// Use: WHERE institution_name LIKE '%' || ? || '%' ESCAPE '\'
```

**Search performance (SQLite explorer):**
- FTS5 is NOT recommended for 8,751 records — LIKE scan is <5ms
- Split search into two steps for perceived speed: (1) fast `crawl_targets`-only query for names, (2) batch fee counts in a single subquery using `IN(...)` clause
- Consider adding `CREATE INDEX idx_targets_name ON crawl_targets(institution_name)` if search latency exceeds 10ms on production hardware

**Fee deduplication (data integrity, P0):**
6,997 institution+category pairs have duplicate entries. The fee_count subquery must use `COUNT(DISTINCT fee_category)` or deduplicate:
```sql
SELECT COUNT(DISTINCT ef.fee_category) as fee_count
FROM extracted_fees ef
WHERE ef.crawl_target_id = ct.id
  AND ef.fee_category IS NOT NULL
  AND ef.review_status != 'rejected'
```

### 1.2 Add `getInstitutionProfile()` query

**File:** `src/lib/crawler-db/institutions.ts`

#### Research Insights

**Type reuse (pattern recognition, simplicity, P1):**
`InstitutionDetail` in `types.ts:53` overlaps 7 of 10 fields. Instead of creating a new `InstitutionProfile` interface, extend the existing type:

```typescript
import { InstitutionDetail } from "./types";

export interface InstitutionFee {
  fee_category: string;
  fee_name: string;
  amount: number | null;
  frequency: string | null;
  conditions: string | null;
  review_status: "pending" | "staged" | "approved" | "rejected";  // union type, not string
  confidence: number | null;
}

export interface InstitutionProfile extends InstitutionDetail {
  fees: InstitutionFee[];
}
```

**Consider reuse (simplicity):**
The simplicity reviewer recommends using existing `getInstitutionById()` (core.ts:148) + `getFeesByInstitution()` (core.ts:47) composed together, rather than writing a new combined query. If performance is acceptable (2 queries vs 1 JOIN), this is simpler and avoids duplicating logic.

**Fee deduplication in profile query:**
When an institution has duplicate fee entries for the same category, pick the most recent (latest `created_at`) or highest-confidence entry:
```sql
-- Deduplicate: keep latest per category
SELECT DISTINCT ON (ef.fee_category) ef.*
FROM extracted_fees ef
WHERE ef.crawl_target_id = ?
  AND ef.fee_category IS NOT NULL
  AND ef.review_status != 'rejected'
ORDER BY ef.fee_category, ef.created_at DESC
```
Note: SQLite doesn't have `DISTINCT ON` — use a `GROUP BY` with `MAX(created_at)` subquery or window function approach.

**Review status union type (TypeScript reviewer, P1):**
Use a string union instead of bare `string` for `review_status`:
```typescript
export type FeeReviewStatus = "pending" | "staged" | "approved" | "rejected";
```
Precedent: `ArticleStatus` in `types.ts` already uses this pattern.

### 1.3 Add `getInstitutionScorecard()` query

**File:** `src/lib/crawler-db/institutions.ts`

Computes this institution's fees vs a peer group and national benchmarks.

```typescript
export interface ScorecardEntry {
  fee_category: string;
  institution_amount: number | null;
  national_median: number | null;
  national_delta_pct: number | null; // ((inst - national) / national) * 100
  conditions: string | null;
}

export function getInstitutionScorecard(
  institutionId: number
): ScorecardEntry[]
```

#### Research Insights

**CRITICAL: Eliminate N+1 query pattern (architecture, performance, pattern — all 3 flagged this):**

The original plan calls `getCategoryIndex(category)` per fee category = 14-27 sequential queries per page load. Instead, batch into 2-3 queries:

```typescript
export function getInstitutionScorecard(institutionId: number): ScorecardEntry[] {
  const db = getDb();

  // Query 1: Get this institution's fees (1 query)
  const instFees = db.prepare(`
    SELECT fee_category, amount, conditions, fee_name,
           ROW_NUMBER() OVER (PARTITION BY fee_category ORDER BY created_at DESC) as rn
    FROM extracted_fees
    WHERE crawl_target_id = ? AND fee_category IS NOT NULL AND review_status != 'rejected'
  `).all(institutionId).filter((r: any) => r.rn === 1);

  if (instFees.length === 0) return [];

  const categories = instFees.map((f: any) => f.fee_category);

  // Query 2: Get national benchmarks for those categories only (1 query)
  const placeholders = categories.map(() => '?').join(',');
  const nationalRows = db.prepare(`
    SELECT ef.fee_category, ef.amount
    FROM extracted_fees ef
    WHERE ef.fee_category IN (${placeholders})
      AND ef.review_status != 'rejected'
      AND ef.amount > 0
  `).all(...categories);

  // Compute national medians in JS (reuse computeStats pattern)
  // Build scorecard entries
}
```

This reduces 14-27 queries to exactly 2.

**Simplified v1 scope (simplicity reviewer, P0):**
Drop the 3-way `PeerScope` toggle for v1. Use a single implicit peer scope: **same charter type, national**. This eliminates:
- The `PeerScope` type and toggle UI
- Extra query complexity for state/district filtering
- URL param management for `?peers=`

Rationale: The primary user question is "are my fees high or low?" — national same-charter comparison answers this. State/district granularity can come in v2 when users request it.

**Drop `percentile_rank` for v1 (simplicity reviewer, P0):**
`computePercentileRank()` (Section 1.6) is YAGNI. The delta percentage already tells users if they're above or below the median. Percentile rank adds implementation complexity (edge cases with NULLs, zeros, identical values, empty arrays) for marginal UX value. Defer to v2.

**Double-fetch elimination (performance, P1):**
Original plan calls `getInstitutionProfile()` inside `getInstitutionScorecard()`, then the page also calls `getInstitutionProfile()` directly. Accept the profile as a parameter:
```typescript
export function getInstitutionScorecard(
  institutionId: number,
  fees: InstitutionFee[]  // pass fees from profile, don't re-fetch
): ScorecardEntry[]
```

### 1.4 Add Server Action for search

**File:** `src/app/(public)/institutions/actions.ts` (new)

```typescript
"use server";

export async function searchInstitutionsAction(query: string): Promise<InstitutionSearchResult[]> {
  if (!query || query.trim().length < 2) return [];
  return searchInstitutions(query.trim(), 10);
}
```

#### Research Insights

**Rate limiting (security, P0):**
Add IP-based rate limiting to the search Server Action. Without it, bots can enumerate all institutions. Reuse the same in-memory rate limiter pattern from `src/app/api/request-access/route.ts`:
```typescript
const SEARCH_RATE_LIMIT = 30; // requests per minute per IP
const SEARCH_WINDOW = 60_000; // 1 minute
```

This is more generous than the request-access limiter (5/hour) since search is a core UX flow, but still prevents automated scraping.

**Input validation (security, P1):**
- Max query length: 100 characters (no institution name exceeds this)
- Strip control characters and excessive whitespace
- The LIKE sanitization from 1.1 applies here

### 1.5 Export new functions from barrel

**File:** `src/lib/crawler-db/index.ts`

- [ ] Add exports: `searchInstitutions`, `getInstitutionProfile`, `getInstitutionScorecard`
- [ ] Add type exports: `InstitutionSearchResult`, `InstitutionProfile`, `InstitutionFee`, `ScorecardEntry`, `FeeReviewStatus`

### ~~1.6 Add `computePercentileRank()` utility~~ (DEFERRED to v2)

**Deferred per simplicity review.** Delta percentages provide sufficient signal for v1. Percentile rank has edge cases (NULL, zero, negative, identical values, empty arrays) that add complexity for marginal UX value.

### 1.7 Tests

**File:** `src/lib/crawler-db/institutions.test.ts` (new)

- [ ] `searchInstitutions`: returns results, respects limit, 2-char minimum, prefix matches first, sanitizes LIKE special chars
- [ ] `getInstitutionProfile`: returns full profile with deduplicated fees, returns null for invalid ID
- [ ] `getInstitutionScorecard`: batched query returns correct deltas, handles zero/null amounts, handles institution with no fees

---

## Phase 2: Institution Search Component

Client component with accessible autocomplete.

### 2.1 Create `InstitutionSearch` client component

**File:** `src/components/institution-search.tsx` (new)

```
"use client"
```

Features:
- Text input with 250ms debounce
- Calls `searchInstitutionsAction` Server Action
- Dropdown results showing: `{name} - {city}, {state} ({charter_type})`
- Subtle indicator for institutions with fee data (e.g., "{fee_count} fees tracked")
- Institutions without fees shown grayed with "No fee data yet"
- On select: `router.push(/institutions/${id})`
- Keyboard navigation: arrow keys, Enter to select, Escape to close

Accessibility (W3C APG combobox pattern):
- `role="combobox"` on input
- `aria-expanded`, `aria-controls`, `aria-activedescendant`
- `role="listbox"` on dropdown, `role="option"` on each result
- `aria-live="polite"` region announcing result count
- Focus management: focus returns to input after selection

No external dependencies (no Downshift, no Fuse.js). Keep it simple with native ARIA attributes. The existing admin Cmd+K search in `src/app/admin/layout.tsx` already implements a similar pattern.

#### Research Insights

**CRITICAL: Race condition prevention (frontend races reviewer, 7 issues identified):**

1. **Out-of-order responses (P0):** Fast typer sends "Fir" then "First" — if "Fir" response arrives after "First" response, stale results display. Fix with a generation counter:
```typescript
const generationRef = useRef(0);

async function handleSearch(query: string) {
  const gen = ++generationRef.current;
  const results = await searchInstitutionsAction(query);
  if (gen !== generationRef.current) return; // stale, discard
  setResults(results);
}
```

2. **Blur vs click race (P1):** `onBlur` fires before `onClick` on dropdown items, closing the dropdown before the click registers. Fix: use `onMouseDown` with `preventDefault` on dropdown items instead of `onClick`.

3. **Keyboard + mouse highlight conflict (P1):** Arrow keys set `activeIndex`, then mouse hover sets a different `activeIndex`, then Enter selects the wrong item. Fix: single source for selection — `onMouseDown` selects directly, arrow keys only update the visual highlight.

4. **Stale results after navigation (P1):** User selects an institution, navigates away, comes back — old results still showing. Fix: clear results when `pathname` changes (via `usePathname()` in a `useEffect`).

5. **Double-submission on Enter during loading (P2):** User hits Enter while search is in-flight, navigates to an item from stale results. Fix: disable Enter selection while `isLoading` is true.

6. **Recommended: Explicit state machine (6 states):**
```
idle -> typing (on input change)
typing -> loading (after debounce, if query >= 2 chars)
typing -> idle (if query < 2 chars)
loading -> showing (on results received, if generation matches)
loading -> idle (on results received, if generation stale)
showing -> typing (on input change)
showing -> idle (on Escape or selection)
```

**Design direction (frontend design skill):**

- **Search input:** Full-width, 48px height, subtle left-aligned search icon (gray-400), placeholder "Search by bank or credit union name...", no border radius — squared with 1px slate-200 border, focus ring `ring-1 ring-slate-900`
- **Autocomplete dropdown:** 1px slate-200 border, white bg, shadow-md, max 5 visible items with scroll, each item 48px height with name bold + city/state/type in gray-500 right-aligned
- **Fee count indicator:** right-aligned monospace "{N} fees" in gray-400, or "No data" in gray-300 italic
- **Active item:** bg-slate-50 (not blue — consistent with admin design system)
- **Empty state in dropdown:** "No institutions found matching '{query}'" in gray-400 italic, centered

**W3C ARIA combobox checklist (from W3C APG research):**
- Input: `role="combobox"`, `aria-expanded="true/false"`, `aria-controls="listbox-id"`, `aria-activedescendant="option-{id}"`, `aria-autocomplete="list"`, `aria-haspopup="listbox"`
- Listbox: `role="listbox"`, `id="listbox-id"`, items with `role="option"`, `id="option-{id}"`, `aria-selected="true/false"`
- Keyboard: Down opens/navigates, Up navigates, Enter selects, Escape closes, Home/End to first/last
- Live region: `<div aria-live="polite" class="sr-only">{count} results available</div>`

### 2.2 Create `/institutions` page

**File:** `src/app/(public)/institutions/page.tsx` (new)

Server component. Layout:
- Breadcrumb: Home / Find Your Bank
- Heading: "Find Your Bank or Credit Union"
- Subtext: "Search by name to see how your institution's fees compare to local and national benchmarks."
- `<InstitutionSearch />` component (client)
- BreadcrumbJsonLd, metadata with canonical

```typescript
export const metadata: Metadata = {
  title: "Find Your Bank - Compare Fees | Bank Fee Index",
  description: "Search for your bank or credit union and see how their fees compare to local and national competitors.",
  alternates: { canonical: "/institutions" },
};
```

#### Research Insights

**Remove popular institutions grid (simplicity, P0):**
The original plan included a "top 12 by asset size" grid below search. This adds:
- A new query (`getPopularInstitutions`)
- A card grid component
- Maintenance burden (what if an institution loses fee data?)

The search box alone is sufficient for v1. Users know their bank's name. If discoverability becomes an issue, add the grid in v2.

**Revalidation (framework docs):**
Add `export const revalidate = 86400` (24 hours) consistent with the institution profile page.

### 2.3 Add nav link

**File:** `src/components/public-nav.tsx`

Add to `NAV_LINKS` array:
```typescript
{ href: "/institutions", label: "Find Your Bank" },
```

Place after "Fee Checker" and before "Fee Index".

### 2.4 Cross-link from `/check` page

**File:** `src/app/(public)/check/page.tsx`

Add a section below the FeeChecker component:
```
Looking for a specific institution? Search for your bank or credit union to see
their exact fees and how they compare to competitors.
[Find Your Bank ->]
```

### 2.5 Add loading skeleton

**File:** `src/app/(public)/institutions/loading.tsx` (new)

Search bar skeleton + subtle "searching..." pulse. No card grid skeleton since popular grid was removed.

---

## Phase 3: Institution Profile Page

### 3.1 Create `/institutions/[id]` page

**File:** `src/app/(public)/institutions/[id]/page.tsx` (new)

```typescript
export async function generateStaticParams() {
  return []; // generate on-demand
}
export const dynamicParams = true;
export const revalidate = 86400; // 24 hours
```

**Layout (institution WITH fees):**

1. **Breadcrumb:** Home / Find Your Bank / {Institution Name}

2. **Header section:**
   - Institution name (h1)
   - Metadata chips: charter type badge, asset tier badge, Fed district badge
   - City, State
   - Data freshness: "Last updated {timeAgo(last_crawl_at)}"
   - Link: "View source fee schedule" (if `fee_schedule_url` exists)

3. **Scorecard summary cards (2-across):**
   - "Fees Tracked": count of categorized fees for this institution
   - "Comparison": "X of Y fees are below the national median for {charter_type}s"

4. **Fee comparison table:**
   - Columns: Category | Your Fee | National Median | vs National
   - Delta pills (emerald = below, red = above) with `title` attributes for accessibility and text labels ("below" / "above")
   - Sorted by spotlight tier first, then core, then alphabetical
   - Conditions shown as subtle gray text below fee amount
   - Categories this institution doesn't have: omitted (not shown as N/A)
   - Table caption: `sr-only` for accessibility
   - `scope="col"` on all th elements

5. **Cross-links:**
   - Link to each fee category page (`/fees/{category}`)
   - Link to state page (`/fees/{category}/by-state/{state}`)
   - Link to district page (`/districts/{district}`)
   - "Report a data correction" mailto link

6. **Schema.org JSON-LD:**
   ```json
   {
     "@type": "BankOrCreditUnion",
     "name": "...",
     "address": { "@type": "PostalAddress", "addressLocality": "...", "addressRegion": "..." },
     "url": "..."
   }
   ```

**Layout (institution WITHOUT fees — 77% of institutions):**

1. Same breadcrumb and header
2. Instead of scorecard/table, show:
   - "Fee data is not yet available for {name}."
   - "We're continuously expanding our coverage. In the meantime, you can explore:"
   - Link to state-level comparison: "Banking fees in {state}" -> `/fees/monthly_maintenance/by-state/{state}`
   - Link to Fee Checker: "Compare fees by state" -> `/check`
   - Link to national index: "National Fee Index" -> `/fees`
3. Add `<meta name="robots" content="noindex" />` to prevent thin content indexing

#### Research Insights

**URL validation (security, P1):**
`fee_schedule_url` and `website_url` come from crawl data and could contain `javascript:` URIs. Validate before rendering:
```typescript
function isSafeUrl(url: string | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// Usage:
{isSafeUrl(profile.website_url) && (
  <a href={profile.website_url} rel="noopener noreferrer" target="_blank">
    Visit website
  </a>
)}
```

**Data freshness guard (data integrity, P1):**
If `last_crawl_at` is older than 12 months, show a warning:
```
"This data was last updated {timeAgo}. Fees may have changed since then."
```

**Cache-Control header (architecture, P1):**
Add to `next.config.ts` alongside existing `/fees`, `/districts`, `/research` patterns:
```typescript
{
  source: "/institutions/:path*",
  headers: [
    {
      key: "Cache-Control",
      value: "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  ],
},
```

**Status filter consistency (data integrity, P1):**
The profile page uses `review_status != 'rejected'` (includes pending + staged + approved). This is consistent with existing public pages (`/fees/[category]`, `/fees/[category]/by-state/[state]`). The scorecard's national medians must also use the same filter — do NOT use `approved`-only for national medians while showing all statuses for the institution's own fees, as this creates misleading comparisons.

**Design direction (frontend design skill):**

- **Header:** institution_name in `text-3xl font-bold tracking-tight text-slate-900`, metadata chips as rounded-full pills with subtle backgrounds (same pattern as by-state page)
- **Summary cards:** 2-column grid, same card style as by-state page comparison cards: `rounded-lg border border-slate-200 bg-white p-5`
- **Table:** Follow existing design system exactly — `bg-slate-50/80` headers, `text-[11px] font-semibold uppercase tracking-wider text-slate-400`, `hover:bg-slate-50/50 transition-colors` rows, `px-4 py-2.5` padding
- **Delta pills:** Reuse existing pattern from by-state page (emerald/red/slate rounded-full pills with text labels)
- **Empty state:** Clean and helpful, not sad. Dashed border box with a subtle building icon (use an SVG inline, not an icon library). Slate-400 text, action links as text buttons with hover underline.

### 3.2 Generate metadata

**File:** `src/app/(public)/institutions/[id]/page.tsx`

```typescript
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const profile = getInstitutionProfile(Number(id));
  if (!profile) return { title: "Institution Not Found" };

  const state = STATE_NAMES[profile.state_code ?? ""] ?? profile.state_code;
  return {
    title: `${profile.institution_name} Fees: Compare to Local Banks | Bank Fee Index`,
    description: `See ${profile.institution_name} banking fees compared to ${state} competitors. Overdraft, maintenance, ATM, and more.`,
    alternates: { canonical: `/institutions/${id}` },
    ...(profile.fees.length === 0 ? { robots: { index: false } } : {}),
  };
}
```

### 3.3 Validate route params

Call `notFound()` if:
- `id` is not a positive integer
- `getInstitutionProfile(id)` returns null

```typescript
const numId = Number(id);
if (!Number.isInteger(numId) || numId <= 0) notFound();
```

### 3.4 Add loading skeleton

**File:** `src/app/(public)/institutions/[id]/loading.tsx` (new)

Header skeleton + 2 summary cards + table skeleton.

### 3.5 Add to sitemap

**File:** `src/app/sitemap.ts`

Add institution pages with fee data:
```typescript
// Only include institutions that have categorized fees
const institutionIds = getInstitutionIdsWithFees(); // RENAMED to avoid collision with core.ts:33
for (const inst of institutionIds) {
  urls.push({
    url: `${baseUrl}/institutions/${inst.id}`,
    lastModified: inst.last_crawl_at ? new Date(inst.last_crawl_at) : new Date(),
    changeFrequency: "weekly",
    priority: 0.6,
  });
}
```

#### Research Insights

**Naming collision (pattern recognition, architecture, P0):**
`getInstitutionsWithFees()` already exists in `core.ts:33` and returns `InstitutionSummary[]` with full institution data. The sitemap function needs only `{id, last_crawl_at}`. Rename the new function to `getInstitutionIdsWithFees()` to avoid collision and clarify intent:
```typescript
export function getInstitutionIdsWithFees(): { id: number; last_crawl_at: string | null }[]
```

---

## Phase 4: Cross-Linking & Polish

### 4.1 Add institution links to state breakdown pages

**File:** `src/lib/crawler-db/fee-index.ts`

Update `StateFeeStats.top_lowest` to include `crawl_target_id`:
```typescript
top_lowest: {
  crawl_target_id: number;  // ADD
  institution_name: string;
  amount: number;
  charter_type: string;
  city: string | null;
}[];
```

**File:** `src/app/(public)/fees/[category]/by-state/[state]/page.tsx`

Wrap institution names in the lowest-fees table with `<Link href={/institutions/${id}}>`.

### 4.2 Add "Find Your Bank" CTA to homepage

**File:** `src/app/page.tsx` (or wherever the homepage hero is)

Add a search input or prominent link: "Find your bank and compare fees" -> `/institutions`

### 4.3 Add institution search to `/check` page

**File:** `src/app/(public)/check/page.tsx`

Below the existing FeeChecker, add a section:
```
Looking for your specific bank or credit union?
[InstitutionSearch component or link to /institutions]
```

#### Research Insights

**Defer Phase 4 to follow-up PR (simplicity reviewer):**
Phase 4 is polish and cross-linking. It can be a separate PR after Phases 1-3 ship. This keeps the initial PR focused and under 400 lines of changed code (per git workflow rules). The cross-links don't block the core feature.

---

## Files Modified Summary

| Phase | File | Change |
|-------|------|--------|
| 1.1-1.3 | `src/lib/crawler-db/institutions.ts` | Add searchInstitutions, getInstitutionProfile, getInstitutionScorecard |
| 1.4 | `src/app/(public)/institutions/actions.ts` | New: Server Action for search |
| 1.5 | `src/lib/crawler-db/index.ts` | Export new functions and types |
| 1.7 | `src/lib/crawler-db/institutions.test.ts` | New: tests |
| 2.1 | `src/components/institution-search.tsx` | New: autocomplete component |
| 2.2 | `src/app/(public)/institutions/page.tsx` | New: search page |
| 2.3 | `src/components/public-nav.tsx` | Add "Find Your Bank" nav link |
| 2.4 | `src/app/(public)/check/page.tsx` | Cross-link to institutions |
| 2.5 | `src/app/(public)/institutions/loading.tsx` | New: loading skeleton |
| 3.1 | `src/app/(public)/institutions/[id]/page.tsx` | New: institution profile |
| 3.2 | `next.config.ts` | Add Cache-Control for /institutions |
| 3.4 | `src/app/(public)/institutions/[id]/loading.tsx` | New: loading skeleton |
| 3.5 | `src/app/sitemap.ts` | Add institution pages (using getInstitutionIdsWithFees) |
| 4.1 | `src/lib/crawler-db/fee-index.ts` | Add crawl_target_id to StateFeeStats |
| 4.1 | `src/app/(public)/fees/[category]/by-state/[state]/page.tsx` | Link institution names |
| 4.2 | `src/app/page.tsx` | Add "Find Your Bank" CTA |
| 4.3 | `src/app/(public)/check/page.tsx` | Add institution search CTA |

---

## Design Decisions

1. **Server-side search over Fuse.js**: Consistent with existing admin search pattern. Avoids shipping 500KB to client. SQLite LIKE is fast enough for 8,751 records (<5ms per SQLite search analysis).

2. **No Downshift dependency**: Native ARIA attributes with the W3C APG combobox pattern. The existing admin Cmd+K search proves this works without extra deps.

3. **Batched scorecard query**: Instead of calling `getCategoryIndex()` per fee category (14-27 queries), fetch all national amounts in a single query with `IN(...)` clause. Reduces to 2 queries total.

4. **Show all non-rejected fees (not just approved)**: Consistent with existing public pages. Both institution fees and national benchmarks use the same `review_status != 'rejected'` filter to ensure apples-to-apples comparison.

5. **Empty state with `noindex`**: 77% of institutions have no fee data. These pages should exist (someone might land there) but should not be indexed by search engines.

6. **Single peer scope for v1**: National same-charter comparison only. Eliminates UI complexity of state/district/national toggle. The primary user question "are my fees high?" is answered by national benchmarks.

7. **Disambiguation via city**: Search results show `{name} - {city}, {state} ({type})`. This handles the 35 "First State Bank" problem using data already in the DB.

8. **Extend `InstitutionDetail` instead of new type**: Reuse existing types from `types.ts` to avoid type sprawl. Add only the `fees` array as an extension.

9. **Generation counter for race conditions**: Lightweight alternative to AbortController. Each keystroke increments a counter; stale responses are discarded by comparing the counter value at send-time vs receive-time.

10. **Phase 4 as follow-up PR**: Keeps the initial PR focused on core search + profile functionality. Cross-linking is polish that can ship separately.

---

## Edge Cases

| Case | Handling |
|------|----------|
| Institution has zero fees (77%) | Branded empty state with links to state/national data. `noindex`. |
| Institution has 1-3 fees | Show scorecard but note "Limited fee data available for this institution" |
| Duplicate fee entries per category (6,997 pairs) | Deduplicate: keep most recent per category (`MAX(created_at)`) |
| Identical institution names (35 "First State Bank") | Disambiguate with city + state + charter type in autocomplete |
| Invalid institution ID in URL | `notFound()` |
| Non-numeric ID in URL | `notFound()` via `Number.isInteger()` check |
| Institution exists but was never crawled | Same as zero-fees empty state |
| Fee has conditions | Show conditions as gray text below fee amount |
| Search query < 2 characters | Return empty results, show hint text |
| Search query contains `%` or `_` | Escape before LIKE pattern |
| `fee_schedule_url` contains `javascript:` | Validate protocol before rendering link |
| `last_crawl_at` older than 12 months | Show staleness warning |
| Out-of-order search responses | Generation counter discards stale results |
| User clicks dropdown during blur event | `onMouseDown` with `preventDefault` |
| Fee amount is null or zero | Show "N/A" or omit from comparison |
| National median unavailable for a category | Show institution amount without delta |

---

## Acceptance Criteria

- [x] User can search for an institution by name from `/institutions`
- [x] Autocomplete shows max 10 results with city/state/type for disambiguation
- [x] Institutions with fee data are visually distinguished from those without
- [x] Selecting an institution navigates to `/institutions/[id]`
- [x] Institution profile shows fee scorecard with national comparison
- [x] Fee comparison table uses delta pills with text labels for accessibility
- [x] Duplicate fee entries are deduplicated (most recent per category)
- [x] Empty state (no fees) shows helpful links and is not indexed
- [x] Accessibility: combobox pattern, ARIA labels, keyboard navigation, live region
- [x] Race conditions handled (generation counter, blur/click, stale results)
- [x] LIKE patterns sanitized (escape `%` and `_`)
- [x] External URLs validated (no `javascript:` protocol)
- [x] Search action rate-limited (30 req/min/IP)
- [x] Loading skeletons for both `/institutions` and `/institutions/[id]`
- [x] Cache-Control headers for `/institutions` routes
- [ ] State breakdown pages link institution names to profiles (Phase 4, follow-up PR)
- [x] Sitemap includes institution pages with fee data only

---

## Verification

```bash
# Phase 1: Data layer
npx vitest run src/lib/crawler-db/institutions.test.ts

# Phase 2-3: Build check
npx next build

# Phase 3: Spot check
# Visit /institutions, search "First State Bank", verify disambiguation
# Visit /institutions/{id} for institution with fees — verify scorecard
# Visit /institutions/{id} for institution without fees — verify empty state
# Check mobile responsive layout
# Test keyboard navigation in autocomplete (arrow keys, Enter, Escape)
# Verify race condition handling (type fast, verify no stale results)
```

---

## v2 Roadmap (deferred)

Items explicitly deferred from v1 for simplicity:
- [ ] Peer scope toggle (state/district/national) with URL params
- [ ] Percentile rank per fee category
- [ ] Popular institutions grid on search page
- [ ] Schema.org JSON-LD for institution profiles (low SEO value vs effort)
- [ ] API routes for agent/programmatic access (`/api/institutions/search`, `/api/institutions/[id]`)
- [ ] Institution comparison tool (side-by-side 2-3 institutions)
