# feat: Consumer Experience Suite — Public-Facing Features for Bank Fee Index

## Enhancement Summary

**Deepened on:** 2026-03-11
**Sections enhanced:** 10 features + cross-cutting concerns
**Review agents used:** Architecture Strategist, Security Sentinel, Performance Oracle, Data Migration Expert, Code Simplicity Reviewer, TypeScript Reviewer, Pattern Recognition Specialist, Data Integrity Guardian, Frontend Design, Learnings Agent

### Key Improvements
1. **URL scheme fix**: `/institutions/[slug]` renamed to `/institutions/[slug]` — "banks" excludes credit unions (45%+ of dataset)
2. **Redirect API fix**: `redirect(url, 301)` is invalid Next.js API — must use `permanentRedirect()` from `next/navigation`
3. **Performance critical path**: `getNationalIndex()` scans 65K rows per call; SSG with 8,751 institutions = 273M redundant row reads. Must use module-level memoization.
4. **Existing bugs to fix first**: Duplicate `getWriteDb()` in `fee-actions.ts` without `foreign_keys=ON`; `getFeeCategorySummaries()` includes rejected fees; admin search bypasses DB singleton; `submit-fees/actions.ts` calls `db.close()` on singleton

### New Considerations Discovered
- Comparison page cache exhaustion: 37M+ possible pairs with ISR creates unbounded cache growth — add `Cache-Control: s-maxage=3600, stale-while-revalidate` headers and monitor
- Dark mode CSS scoped to `.admin-content` will NOT apply to `(public)` routes — consumer pages need their own dark mode strategy
- `state_code` is nullable in `crawl_targets` — slug generation must handle null states gracefully
- Fee Score has legal liability implications — defer methodology to separate design doc with legal review
- Mobile layout: use CSS Grid `display: grid` with `@media` instead of dual DOM (`hidden sm:block` / `sm:hidden`) to avoid rendering data twice
- Email capture needs bot protection (honeypot + rate limit), GDPR-compliant unsubscribe tokens, and `ON DELETE SET NULL` for institution FK
- Split sitemap in Phase 1 (not Phase 3) — 8,751 institution pages exceed Google's 50K URL soft limit per sitemap

### Existing Bugs to Fix Before Consumer Launch
| Bug | Location | Fix |
|-----|----------|-----|
| Duplicate `getWriteDb()` missing `foreign_keys=ON` | `src/lib/fee-actions.ts` | Delete duplicate, import from `connection.ts` |
| `getFeeCategorySummaries()` includes rejected fees | `src/lib/crawler-db/fees.ts` | Add `WHERE review_status != 'rejected'` |
| Admin search bypasses DB singleton | `src/app/admin/actions/search.ts:36` | Replace `new Database()` with `getDb()` |
| `submit-fees` closes singleton | `src/app/submit-fees/actions.ts` | Remove `db.close()` call |
| `approveFee()`/`rejectFee()` lack transaction wrappers | `src/lib/fee-actions.ts` | Wrap in `db.transaction()` |

---

## Overview

Add interactive consumer-action features on top of the existing public site. The foundation is comprehensive: 49 fee category pages with deep-dive analysis, 50 state + 12 district reports, 5 consumer guides with live data, institution profiles, fee-revenue analysis, inline AI search, REST API, and full SSG with `generateStaticParams`. This plan defines the remaining consumer features to drive engagement, retention, and organic growth.

**Positioning**: Bank Fee Index is to bank fees what Zillow is to home prices — a transparent, data-driven index that makes opaque pricing visible. Unlike NerdWallet/Bankrate (editorial listicles with affiliate bias), BFI publishes actual dollar amounts, statistical distributions, and peer benchmarks from crawled fee schedules.

## Problem Statement

The public site has a strong data foundation but lacks interactive consumer-action features:

1. **No structured search**: AI search bar exists but no institution autocomplete with structured results.
2. **No comparison**: Cannot compare two institutions side-by-side.
3. **No "cheapest" lists**: Cannot find institutions with lowest fees by category.
4. **No calculator**: Cannot estimate personal annual fee burden.
5. **No alerts**: Cannot be notified when fees change.
6. **No at-a-glance quality signal**: No Fee Score or grade per institution.
7. **Numeric URLs**: Institution profiles use `/institution/[id]` — not SEO-friendly.

## Current Public Site Inventory

| Route | What It Does | Status |
|-------|-------------|--------|
| `/` | Landing page with site nav | Live |
| `/fees` | All 49 categories with medians/percentiles, grouped by family | Live (SSG) |
| `/fees/[category]` | Deep dive with histogram, charter/tier/district/state breakdowns | Live (49 pages, SSG) |
| `/institution/[id]` | Institution profile with all fees + national comparison | Live (numeric ID) |
| `/research` | Hub: national index, state/district reports, fee-revenue analysis | Live |
| `/research/national-fee-index` | Full national index with maturity badges | Live (SSG) |
| `/research/state/[code]` | State-level fee reports with delta pills | Live (50 pages, SSG) |
| `/research/district/[id]` | Fed district reports with Beige Book context | Live (12 pages, SSG) |
| `/research/fee-revenue-analysis` | Original research: fee vs. service charge income | Live |
| `/guides` | 5 consumer guides (overdraft, NSF, ATM, wire, maintenance) | Live |
| `/guides/[slug]` | Individual guide with live data snapshots + FAQ JSON-LD | Live (5 pages) |
| `/api-docs` | REST API documentation | Live |
| Inline AI search bar | AI-powered search in header (streaming, @ai-sdk/react) | Live |
| `BreadcrumbJsonLd` | Schema.org breadcrumbs on all pages | Live |
| `DataFreshness` | Last crawl date badge on data pages | Live |
| `generateStaticParams` | SSG for all categories, states, districts, institutions | Live |

## Proposed Features (Ranked by Impact)

### 1. Institution Search ("Find Your Bank")
**Impact**: Critical — unlocks all other consumer features
**Effort**: Medium

Search bar in the public nav with debounced autocomplete. Results show institution name, city, state, charter type, and fee count. Selecting navigates to institution profile.

#### Technical Approach

##### `src/app/(public)/search/page.tsx` (server component)
Full search results page for SEO and no-JS fallback.

```tsx
// GET /search?q=chase
// Server-side LIKE query against crawl_targets
// Renders results list with links to /institutions/[slug]
// <form method="GET" action="/search"> for progressive enhancement
```

##### `src/components/public/institution-search.tsx` (client component)
Autocomplete dropdown in nav.

```tsx
// Debounced input (300ms)
// Calls /api/v1/institutions?q=query&limit=8
// Shows: name, city, state, charter badge, fee count
// "(No fee data yet)" label for institutions with 0 fees
// Keyboard: arrow keys navigate, Enter selects, Escape closes
// ARIA: combobox pattern with listbox role
```

##### `src/lib/crawler-db/institutions.ts`
Add search query using existing `getDb()` singleton.

```typescript
export function searchInstitutions(query: string, limit = 10): InstitutionSearchResult[] {
  // Uses LIKE '%query%' — fast enough at 8,700 rows on SQLite
  // Returns: id, slug, institution_name, city, state_code, charter_type, fee_count
  // Ordered by: exact match first, then starts-with, then contains
  // Filters: non-zero fee count shown first, then zero-fee institutions
}
```

#### Edge Cases
- **Ambiguous names**: "First National Bank" matches dozens. Disambiguate with city + state in results.
- **Abbreviations**: "BoA" for Bank of America, "JPM" for JPMorgan — consider adding an `aliases` column or common abbreviation matching.
- **Zero-fee institutions**: Show in results with "(No fee data yet)" badge. Profile page shows institutional data without fee table + "Submit your fee schedule" CTA.
- **No results**: Show "No institutions found" with suggestion to try a different name.

#### Research Insights

**Architecture:**
- Use a server action (not API route) for search — matches existing admin pattern (`src/app/admin/actions/search.ts`) and avoids exposing a public API endpoint without rate limiting.
- Create a single `<InstitutionCombobox>` component reusable across search, comparison picker, and calculator state selector — avoid duplicating autocomplete logic.

**Performance:**
- SQLite `LIKE '%query%'` on 8,700 rows is fine (< 5ms). No need for FTS5 at this scale.
- Debounce at 300ms is correct. Consider `AbortController` to cancel in-flight requests when user types faster.

**Security:**
- Sanitize search input server-side: strip SQL wildcards (`%`, `_`) from user input before LIKE query, or use parameterized queries only (already planned).
- Rate limit search endpoint: 30 requests/minute per IP to prevent scraping.

**Accessibility:**
- ARIA combobox pattern requires: `role="combobox"`, `aria-expanded`, `aria-activedescendant`, `aria-owns` pointing to listbox.
- Announce result count to screen readers: `aria-live="polite"` region with "X results found".

---

### 2. Slug-Based Institution URLs (`/institutions/[slug]`)
**Impact**: Critical — SEO foundation for all institution-related features
**Effort**: Medium

Replace `/institution/[id]` with SEO-friendly `/institutions/[slug]` URLs.

> **Renamed from `/institutions/[slug]`**: The dataset includes both banks AND credit unions (45%+ of institutions). Using `/institutions/` would be semantically wrong for credit unions and could confuse consumers. `/institutions/` is neutral and accurate.

#### Technical Approach

##### Database Migration
```sql
ALTER TABLE crawl_targets ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX idx_crawl_targets_slug ON crawl_targets(slug);
```

##### Slug Generation Algorithm (`src/lib/slugify.ts`)
```typescript
export function generateInstitutionSlug(name: string, stateCode: string, city?: string | null): string {
  // 1. Lowercase, strip special chars (& → and, apostrophes removed, periods removed)
  // 2. Replace spaces/hyphens with single hyphen
  // 3. Append state code: "chase-bank-ny"
  // 4. If collision, append city: "first-national-bank-tx-dallas"
  // 5. If still collision (or city is null), append numeric suffix: "first-national-bank-tx-2"
  // Examples:
  //   "M&T Bank" + "NY" → "mt-bank-ny"
  //   "PNC Bank, N.A." + "PA" → "pnc-bank-na-pa"
  //   "Chase Bank" + "NY" → "chase-bank-ny"
}
```

##### Migration Script
One-time script to populate `slug` column for all 8,751 institutions. Run idempotently.

##### URL Redirect Strategy
```typescript
// src/app/institution/[id]/page.tsx → redirect to /institutions/[slug]
import { permanentRedirect, notFound } from "next/navigation";
import { getInstitutionSlugById } from "@/lib/crawler-db";

export default async function LegacyInstitutionPage({ params }) {
  const { id } = await params;
  const slug = getInstitutionSlugById(parseInt(id, 10));
  if (!slug) notFound();
  permanentRedirect(`/institutions/${slug}`);
}
```

> **API fix**: `redirect(url, 301)` is NOT valid Next.js API. Use `permanentRedirect()` (308 status) from `next/navigation` for permanent redirects. `redirect()` always sends 307 (temporary).

##### New Route: `src/app/(public)/institutions/[slug]/page.tsx`
Same content as current `/institution/[id]/page.tsx` but resolved by slug.

#### Critical Decisions
- **Slug immutability**: Once generated, slugs never change. If an institution rebrands, the old slug becomes an alias with a 301 redirect to the new slug. Enforce immutability by storing `slug_locked_at` timestamp — crawler never overwrites locked slugs.
- **`city` is nullable**: Fall back to numeric suffix for collision resolution when city is null.
- **`state_code` is nullable**: ~200 institutions have null `state_code`. Use institution ID suffix for these: `first-national-bank-id-1234`.
- **`dynamicParams = false`**: All slugs are known at build time via `generateStaticParams`. Invalid slugs return 404.
- **Slug generation in crawler**: New institutions discovered by crawler must generate slugs at insert time, not just via one-time migration. Add slug generation to the crawler's `upsert_institution` flow.

#### Research Insights

**Data Migration Safety:**
- Migration order: (1) add nullable `slug` column → (2) populate slugs with script → (3) verify uniqueness + no nulls → (4) add UNIQUE index → (5) add NOT NULL constraint
- Do NOT add UNIQUE + NOT NULL in the ALTER TABLE — populate first, then constrain
- Keep old `/institution/[id]` routes alive with redirects indefinitely (search engines may have indexed them)

**Performance:**
- `generateStaticParams` for 8,751 slugs is fine for build time
- Memoize `getNationalIndex()` at module level during SSG — avoids 273M redundant row reads when building all institution pages (each page calls `getNationalIndex()` for comparison)

```typescript
// src/lib/crawler-db/fee-index.ts — memoization pattern
let _cachedIndex: IndexEntry[] | null = null;
export function getNationalIndex(): IndexEntry[] {
  if (_cachedIndex) return _cachedIndex;
  _cachedIndex = buildIndexEntries(/* ... */);
  return _cachedIndex;
}
```

**SEO:**
- Add `BreadcrumbList` JSON-LD: Home > Institutions > [Institution Name]
- Add `FinancialProduct` JSON-LD per fee on institution profiles
- Canonical URL must use the slug, never the numeric ID

---

### 3. Head-to-Head Comparison (`/compare`)
**Impact**: High — core consumer utility, shareable, link-worthy
**Effort**: Medium-Large

Side-by-side fee comparison of 2 institutions.

#### Technical Approach

##### `src/app/(public)/compare/page.tsx`
Landing page with two search boxes. Submit navigates to comparison URL.

##### `src/app/(public)/compare/[slugA]/vs/[slugB]/page.tsx`
Comparison page with:
- Header: Institution A vs Institution B (name, charter, state, assets)
- Fee comparison table: rows for each shared category, columns for A amount, B amount, national median, delta
- Summary card: "Bank A is cheaper in X of Y shared categories"
- Categories unique to each institution listed separately
- Links to individual institution profiles

```tsx
// Canonical URL: alphabetically-first slug always in position A
// /compare/chase-bank-ny/vs/bank-of-america-nc → canonical
// /compare/bank-of-america-nc/vs/chase-bank-ny → 301 redirect to above
```

##### `generateStaticParams`
Do NOT pre-generate comparison pages (37M+ possible pairs). Use `dynamicParams = true` with `revalidate = 3600` for on-demand ISR.

#### Edge Cases
- **Same institution**: `/compare/chase/vs/chase` → redirect to institution profile with message
- **No overlapping categories**: Show both fee lists separately with "No shared fee categories" notice
- **One slug invalid**: 404 page with "We couldn't find [slug]. Try searching."
- **Savings estimate**: Avoid computing "annual savings" without usage assumptions. Instead show per-fee deltas: "Bank A charges $15 less for overdraft per occurrence"

#### Research Insights

**Simplicity:**
- Consider using query params instead of nested routes for MVP: `/compare?a=chase-bank-ny&b=bank-of-america-nc`. Simpler to implement, no routing complexity, still shareable. Nested route (`/compare/[a]/vs/[b]`) is better for SEO but can come in Phase 3 as a rewrite.
- Do NOT pre-generate any comparison pages. Use `dynamicParams = true` with ISR only.

**Performance:**
- Cache exhaustion risk: 37M+ possible pairs with `revalidate = 3600` creates unbounded ISR cache. Monitor cache size. Consider `Cache-Control: s-maxage=3600, stale-while-revalidate=86400` with no persistent ISR cache.
- Both institution fee queries should run in a single DB call (JOIN or UNION), not two separate `getInstitutionFees()` calls.

**Data Integrity:**
- Temporal fairness: Only compare fees from similar crawl dates. If Institution A was crawled 6 months ago and B yesterday, the comparison is misleading. Show "Last updated: [date]" per institution and warn if > 90 days apart.
- Quality gates: Only show comparison if both institutions have 3+ fee categories. Otherwise show "Insufficient data for comparison."

**Accessibility:**
- Comparison table needs `scope="col"` and `scope="row"` for screen readers
- Color-coded deltas (red/green) must also use text indicators (arrows, +/- signs) for color-blind users

---

### 4. Cheapest Fees Pages (`/fees/[category]/cheapest`)
**Impact**: High — high-intent SEO traffic ("cheapest overdraft fee bank")
**Effort**: Small

Ranked list of institutions with lowest fees for each category.

#### Technical Approach

##### `src/app/(public)/fees/[category]/cheapest/page.tsx`
```tsx
// Top 25 institutions with lowest non-null fee amounts
// Data scope: non-rejected fees (pending + staged + approved) — same as national index
// Columns: Rank, Institution, Amount, vs National Median (delta), Charter, State
// Segment tabs: All | Banks | Credit Unions
// Link to institution profile from each row
// Data quality disclaimer: "Based on extracted fee schedules. Verify with your institution."
```

##### `src/lib/crawler-db/fees.ts`
```typescript
export function getCheapestByCategory(
  category: string,
  charterType?: "bank" | "credit_union",
  limit = 25,
): { institution_name: string; slug: string; amount: number; state_code: string; charter_type: string }[]
```

#### Edge Cases
- **$0 fees**: Include them — $0 is genuinely cheapest. Some banks truly charge $0 for certain fees (e.g., Ally, many CUs for bill pay).
- **Null amounts**: Exclude (unknown, not free).
- **< 25 results for a category**: Show however many exist. No minimum threshold.
- **Categories with < 5 observations**: Show with "Limited data" badge + `noindex` meta tag.
- **`generateStaticParams`**: Generate for all 49 categories. `revalidate = 3600`.

#### Research Insights

**Performance:**
- Add composite index: `CREATE INDEX idx_fees_category_amount ON extracted_fees(fee_category, amount) WHERE review_status != 'rejected' AND amount IS NOT NULL`
- This makes the `getCheapestByCategory()` query use an index scan instead of full table scan + sort.
- Limit `generateStaticParams` to 49 categories (bounded). These are true static pages.

**Data Integrity:**
- `getCheapestByCategory()` MUST exclude rejected fees — verify the WHERE clause includes `review_status != 'rejected'`. (Existing `getFeeCategorySummaries()` has this bug — don't repeat it.)
- Per-category-per-state quality gate: If a category has < 3 institutions with data in a state, mark as "Limited data" in state-filtered views.

**SEO:**
- High-intent keyword pages: "cheapest overdraft fee bank" has strong search intent. Add `<title>` like "Banks with the Cheapest Overdraft Fees (2026) | Bank Fee Index"
- Add `Dataset` JSON-LD with `measurementTechnique: "Automated extraction from published fee schedules"`

---

### 5. State Overview Pages — Enhance Existing
**Impact**: Medium — local SEO, state-level consumer context
**Effort**: Small
**Status**: 50 state pages already live at `/research/state/[code]` with delta pills, charter breakdown, SSG

#### Decision: Keep at `/research/state/[code]`

The existing state pages are comprehensive: state vs. national fee comparisons, delta pills, charter type breakdowns, featured categories. Rather than creating a separate `/states/[state]` route, enhance the existing pages in place.

#### Remaining Enhancements:
- Add "Find a bank in [State]" — link to search with state pre-filter
- Add cheapest-fee callouts per spotlight category (link to `/fees/[category]/cheapest`)
- Add mobile card layout for fee comparison table

---

### 6. Fee Calculator (`/tools/fee-calculator`)
**Impact**: Medium-High — engagement driver, lead gen, shareable results
**Effort**: Medium

Interactive tool to estimate annual banking fee costs.

#### Technical Approach

##### `src/app/(public)/tools/fee-calculator/page.tsx` (server component)
Loads national/state medians for calculator defaults.

##### `src/app/(public)/tools/fee-calculator/calculator.tsx` (client component)
```tsx
// Inputs (6 core scenarios):
// 1. Monthly maintenance: toggle "Is your maintenance fee waived?" (yes/no)
// 2. Overdraft: slider 0-5 "How many overdrafts per month?"
// 3. NSF: slider 0-3 "Returned checks per month?"
// 4. ATM (non-network): slider 0-10 "Non-network ATM withdrawals per month?"
// 5. Wire transfers: slider 0-5 "Domestic wires per year?"
// 6. Foreign transactions: slider 0-5 "International card purchases per month?"
//
// Output:
// - Estimated annual fee cost at national median rates
// - Breakdown by category (pie chart or horizontal bars)
// - "Your estimated annual fees: $XXX"
// - Comparison: "vs. cheapest available: $YY (save $ZZZ/year)"
// - CTA: "Find banks with lower fees" → links to cheapest pages
//
// State selector: optional, switches medians to state-level
// All computation is client-side (no API calls after initial load)
```

#### Edge Cases
- **All zeros**: Show $0 with "You may still pay monthly maintenance" callout
- **State with insufficient data**: Fall back to national medians with note
- **Mobile**: Stack inputs vertically, chart below

#### Research Insights

**Simplicity:**
- All computation is client-side after initial data load — this is correct. Ship national medians + cheapest amounts as JSON props from the server component. No API calls during interaction.
- Use native `<input type="range">` for sliders. Custom slider components add bundle size with no UX benefit for this use case.

**Design:**
- Receipt-style output: render the fee breakdown as a receipt/invoice aesthetic (monospace amounts, dotted separator lines, bold total). More memorable than a generic card.
- Horizontal bar chart for breakdown (not pie chart) — easier to compare magnitudes and works better on mobile.

---

### 7. Email Capture & Fee Change Alerts
**Impact**: Medium — retention, email list building
**Effort**: Medium-Large (requires email infrastructure)

#### Phase 1: Email Collection (MVP)
- "Get notified about fee changes" form on institution profiles
- Stores email + institution_id in `fee_alert_subscriptions` table
- Honest copy: "We'll notify you when we detect fee changes at [Bank]"
- Double opt-in NOT required at MVP (just collect, send later)
- GDPR/CAN-SPAM compliant unsubscribe mechanism planned

#### Phase 2: Actual Alerts (requires email service)
- Integrate Resend or similar transactional email service
- Triggered by `fee_change_events` table populated during crawls
- Weekly digest option vs. immediate alerts
- Unsubscribe link in every email

#### Database Schema
```sql
CREATE TABLE IF NOT EXISTS fee_alert_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  institution_id INTEGER REFERENCES crawl_targets(id),
  category TEXT, -- null = all categories for this institution
  confirmed_at TEXT,
  unsubscribed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_alert_subs_email ON fee_alert_subscriptions(email);
CREATE INDEX idx_alert_subs_inst ON fee_alert_subscriptions(institution_id);
```

#### Research Insights

**Security (Critical):**
- Bot protection: Add honeypot field (hidden input that bots fill, humans don't) + server-side rate limit (5 subscriptions per IP per hour).
- Email validation: Validate format server-side. Do NOT store unvalidated emails.
- GDPR compliance: Generate a unique unsubscribe token per subscription (UUID). Store in `unsubscribe_token` column. Every email must include one-click unsubscribe link. CAN-SPAM requires this.
- Double opt-in: Even if deferred, design the schema for it now. Add `confirmation_token` and `confirmed_at` columns.

**Data Integrity:**
- Add `ON DELETE SET NULL` to `institution_id` FK — if an institution is removed, subscriptions survive (user still has email list).
- Add UNIQUE constraint on `(email, institution_id)` to prevent duplicate subscriptions.
- Never expose subscriber emails in any public API or page.

**Schema Enhancement:**
```sql
CREATE TABLE IF NOT EXISTS fee_alert_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  institution_id INTEGER REFERENCES crawl_targets(id) ON DELETE SET NULL,
  category TEXT,
  unsubscribe_token TEXT NOT NULL DEFAULT (hex(randomblob(16))),
  confirmation_token TEXT,
  confirmed_at TEXT,
  unsubscribed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(email, institution_id)
);
```

---

### 8. Fee Score (A-F Grade)
**Impact**: High — most shareable, most controversial, most visible
**Effort**: Medium (methodology is the hard part, not code)

**Recommendation: Defer to a separate design document.** The scoring methodology needs careful design:

- Which categories are included? (spotlight 6? core 15? all 49?)
- How are missing categories handled? (institution has 3 of 15 fees)
- Relative (percentile rank) or absolute (fixed dollar thresholds)?
- Weighted? (overdraft matters more than notary fee?)
- Minimum data threshold? (need 5+ fees to score?)
- Legal review? (grading named institutions has liability implications)

#### Proposed Methodology (for discussion)

```
Fee Score = weighted average of per-category percentile ranks

For each fee category the institution has:
  percentile_rank = (count of institutions with higher fee) / (total institutions in category)

Weights:
  Spotlight categories: 3x
  Core categories: 2x
  Extended/Comprehensive: 1x

Score = sum(percentile_rank * weight) / sum(weights)

Grade mapping:
  A  = 0.80 - 1.00 (cheapest 20%)
  B  = 0.60 - 0.79
  C  = 0.40 - 0.59
  D  = 0.20 - 0.39
  F  = 0.00 - 0.19 (most expensive 20%)

Minimum: 3+ fee categories required to generate a score.
Display: "B+" with "Based on X of 15 core fee categories"
```

#### Where It Appears
- Institution profile page (prominent badge)
- Search autocomplete results
- Comparison tool
- Cheapest-fees rankings

---

### 9. Mobile Card Layout
**Impact**: Medium — 50%+ traffic is mobile
**Effort**: Small

#### Technical Approach

Replace table rows with stacked cards on screens < 640px.

```tsx
// Pattern for all public data tables:
{/* Desktop */}
<div className="hidden sm:block">
  <table>...</table>
</div>

{/* Mobile */}
<div className="sm:hidden space-y-3">
  {data.map((item) => (
    <div key={item.id} className="rounded-lg border border-slate-200 p-4">
      <p className="font-medium text-slate-900">{item.name}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-slate-500">Median</span>
          <p className="font-bold tabular-nums">{formatAmount(item.median)}</p>
        </div>
        <div>
          <span className="text-slate-500">Range</span>
          <p className="tabular-nums">{formatAmount(item.min)}-{formatAmount(item.max)}</p>
        </div>
      </div>
    </div>
  ))}
</div>
```

Apply to: `/fees`, `/fees/[category]`, `/fees/[category]/cheapest`, institution profiles, comparison pages, state pages.

#### Research Insights

**Performance:**
- Avoid dual DOM (`hidden sm:block` + `sm:hidden`) — this renders the data twice in the DOM, doubling memory and hydration cost.
- Instead, use CSS Grid with responsive rules on a single DOM structure:

```tsx
// Single DOM, responsive via CSS
<div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto_auto] gap-2 sm:gap-0">
  {data.map((item) => (
    <Fragment key={item.id}>
      <div className="font-medium">{item.name}</div>
      <div className="tabular-nums">{formatAmount(item.median)}</div>
      {/* ... */}
    </Fragment>
  ))}
</div>
```

- This approach: single DOM, no duplicate rendering, pure CSS responsive behavior.

**Accessibility:**
- Mobile cards must maintain table semantics for screen readers. Use `role="table"`, `role="row"`, `role="cell"` on the card layout, or use a `<dl>` (definition list) pattern.

---

### 10. Expanded Consumer Guides
**Impact**: Medium — SEO content, educational value
**Effort**: Medium (content creation, not code)
**Status**: 5 guides already live at `/guides/[slug]` with live data snapshots + FAQ JSON-LD

#### Remaining Work
Verify taxonomy category references in `src/lib/guides.ts` are correct. Known issues:
- `returned_item` should be `deposited_item_return`
- `account_closure` should be `early_closure`

#### New Guides (4 families not yet covered)
1. **Digital & Electronic Fees** — ACH, bill pay, mobile deposit, Zelle
2. **Cash & Deposit Fees** — coin counting, cash advance, night deposit
3. **Account Services Fees** — safe deposit box, garnishment/levy, notary, balance inquiry
4. **Lending Fees** — late payment, loan origination, appraisal

Each guide follows existing pattern in `src/lib/guides.ts`: structured sections + `feeCategories` array linking to live data.

## Implementation Sequence

Features are sequenced by dependency — each builds on the infrastructure of previous ones.

```
Phase 0: Bug Fixes (Must Do First)
  ├── 0a. Fix duplicate getWriteDb() in fee-actions.ts (import from connection.ts)
  ├── 0b. Fix getFeeCategorySummaries() to exclude rejected fees
  ├── 0c. Fix admin search to use getDb() singleton
  ├── 0d. Fix submit-fees closing singleton DB
  └── 0e. Wrap approveFee()/rejectFee() in db.transaction()

Phase 1: Foundation (Search + Slugs + Sitemap)
  ├── 1. Slug generation + DB migration (add to crawler upsert flow too)
  ├── 2. /institutions/[slug] route + /institution/[id] permanentRedirect()
  ├── 3. Institution search (nav autocomplete + /search page)
  ├── 4. Fix guide taxonomy references
  ├── 5. Split sitemap via generateSitemaps (institution pages in batches of 5,000)
  └── 6. Memoize getNationalIndex() for SSG build performance

Phase 2: Consumer Tools (Comparison + Cheapest + Calculator)
  ├── 5. Cheapest fees pages (/fees/[category]/cheapest)
  ├── 6. Head-to-head comparison (/compare/[a]/vs/[b])
  ├── 7. Fee calculator (/tools/fee-calculator)
  └── 8. Mobile card layouts

Phase 3: Engagement (Alerts + Score + Content)
  ├── 9. Email capture (subscription collection)
  ├── 10. State page consolidation (/states/[state])
  ├── 11. Expanded guides (4 new families)
  └── 12. Fee Score methodology + implementation (separate design doc first)
```

## SEO Infrastructure (Cross-Cutting)

Already in place: `BreadcrumbJsonLd`, `DataFreshness`, `generateStaticParams` on all routes, JSON-LD on main pages.

Still needed for new pages:

- [ ] Add `rel="canonical"` to all new pages via `generateMetadata` `alternates.canonical`
- [ ] Add `dynamicParams = false` to `/institutions/[slug]` (bounded by slug list)
- [ ] Split sitemap via `generateSitemaps` (institution pages in batches of 5,000)
- [ ] Add `WebSite` + `SearchAction` JSON-LD to root layout (sitelinks search box)
- [ ] Add dynamic OG images via `opengraph-image.tsx` for institutions and cheapest pages
- [ ] Fix color contrast: `text-slate-400` (3.03:1) → `text-slate-500` (4.63:1) for WCAG AA
- [ ] Add `scope="col"` to all `<th>` elements on new pages
- [ ] Add skip-navigation link to public layout

### Research Insights

**Architecture:**
- URL canonicalization should happen in Next.js middleware, not per-page. Single middleware checks: trailing slashes, lowercase enforcement, redirect old `/institution/[id]` URLs.
- Use server actions (not API routes) for search — matches admin patterns and avoids exposing public endpoints.

**Performance:**
- `generateStaticParams` for institution pages: limit to top 500 by fee count for initial build. Remaining 8,251 pages build on-demand via ISR. This keeps build times under 5 minutes.
- Dynamic OG images via `next/og` (Satori): cache aggressively with `revalidate = 86400` (24h). OG images rarely change.

**Dark Mode:**
- Existing dark mode CSS is scoped to `.admin-content` class — this will NOT apply to `(public)` routes. Consumer pages need their own dark mode strategy. Options: (1) extend dark mode to `(public)` layout, (2) consumer pages are light-only for launch (simpler). Recommend option 2 for MVP.

**Learnings Applied:**
- `timeAgo()` defensive date handling (guards against empty/NaN) must be applied to any new date displays (crawl dates, fee update dates) on consumer pages.

**Reusable Components to Extract:**
- `DeltaPill` — currently duplicated 5x across admin pages. Extract to `src/components/delta-pill.tsx` before adding to consumer pages (comparison, cheapest).
- `InstitutionCombobox` — single autocomplete component reusable across search, comparison picker, and calculator.
- `DataFreshness` — already exists at `src/components/data-freshness.tsx`, reuse on all consumer data pages.

## Data Quality Policy (Must Decide First)

**The critical blocker**: Only 58 of 65,287 fees are approved (0.09%). Every consumer feature depends on the answer to: **what review statuses are shown publicly?**

**Current behavior**: Public pages show all non-rejected fees (pending + staged + approved). This is correct given the data maturity.

**Recommendation**: Continue showing non-rejected fees with these safeguards:
1. Remove `review_status` badges from public institution profiles (consumers don't need to see "staged"/"pending")
2. Add `DataFreshness` component to all data pages showing last crawl date
3. Add subtle "Data quality" indicator per institution based on maturity (strong/provisional/insufficient)
4. Add global disclaimer: "Fee data is extracted from published fee schedules and may contain errors. Always verify with your institution."
5. `noindex` pages with < 5 fee observations per the V3 plan

## Acceptance Criteria

### Phase 1: Foundation
- [ ] Slug column populated for all 8,751 institutions with unique slugs
- [ ] `/institutions/[slug]` renders institution profile (same content as current `/institution/[id]`)
- [ ] `/institution/[id]` returns permanent redirect to `/institutions/[slug]`
- [ ] Institution search autocomplete in public nav returns structured results within 300ms
- [ ] Search works without JavaScript via `/search?q=query` form fallback
- [ ] Zero-fee institutions appear in search with "(No fee data)" label
- [ ] Sitemap split via `generateSitemaps` (institution pages in batches of 5,000)
- [ ] `getNationalIndex()` memoized for SSG build performance
- [ ] Guide taxonomy references verified/fixed

### Phase 2: Consumer Tools
- [ ] `/fees/[category]/cheapest` shows top 25 lowest-fee institutions per category
- [ ] Cheapest pages have charter type tabs (All / Banks / Credit Unions)
- [ ] `/compare?a=[slug]&b=[slug]` shows side-by-side fee comparison for shared categories
- [ ] Fee calculator computes annual estimate from 6 input variables
- [ ] Calculator allows state selection for state-level medians
- [ ] Mobile-responsive layout on all new consumer pages (single DOM, CSS Grid)

### Phase 3: Engagement
- [ ] Email subscription form on institution profiles collects email + institution_id
- [ ] 4 new consumer guides covering remaining fee families
- [ ] Fee Score methodology documented and reviewed before implementation
- [ ] State pages enhanced with cheapest-fee callouts and institution search links

## References

### Internal
- Institution profiles: `src/app/(public)/institution/[id]/page.tsx`
- Fee catalog: `src/app/(public)/fees/page.tsx`
- Fee category deep-dives: `src/app/(public)/fees/[category]/page.tsx`
- Research hub: `src/app/(public)/research/page.tsx`
- State reports: `src/app/(public)/research/state/[code]/page.tsx`
- District reports: `src/app/(public)/research/district/[id]/page.tsx`
- National index: `src/app/(public)/research/national-fee-index/page.tsx`
- Fee-revenue analysis: `src/app/(public)/research/fee-revenue-analysis/page.tsx`
- Consumer guides: `src/app/(public)/guides/page.tsx` + `src/app/(public)/guides/[slug]/page.tsx`
- Guide content: `src/lib/guides.ts`
- Public layout + nav: `src/app/(public)/layout.tsx`
- AI search bar: `src/components/public/ask-search-bar.tsx`
- Distribution chart: `src/components/public/distribution-chart.tsx`
- State map: `src/components/public/state-map.tsx`
- Data freshness: `src/components/data-freshness.tsx`
- Breadcrumb JSON-LD: `src/components/breadcrumb-jsonld.tsx`
- Fee taxonomy (49 categories, 9 families): `src/lib/fee-taxonomy.ts`
- DB queries: `src/lib/crawler-db/` (10 files, 47+ exports)
- Format utilities: `src/lib/format.ts`
- Sitemap: `src/app/sitemap.ts`
- API docs: `src/app/(public)/api-docs/page.tsx`

### External
- Schema.org FinancialProduct: https://schema.org/FinancialProduct
- Next.js generateSitemaps: https://nextjs.org/docs/app/api-reference/functions/generate-sitemaps
- WCAG 2.1 AA color contrast: minimum 4.5:1 for normal text
- CFPB Open Banking Rule (Section 1033): largest institutions comply by April 2026
- Bank fee analysis software market: $1.6B, growing 12.9% CAGR
