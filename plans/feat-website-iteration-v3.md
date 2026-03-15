# feat: Bank Fee Index Website V3 -- Next Iteration

## Overview

This plan defines the next iteration of the Bank Fee Index public website, transforming it from a data-rich but incomplete programmatic SEO platform into a consumer-grade financial comparison tool with trust signals, mobile navigation, and high-value page types that drive organic traffic.

**Current state:** 3,000+ programmatic SEO pages, 12 admin routes, 63,000+ fee extractions across 8,700+ institutions. The public site has good metadata and JSON-LD but has critical gaps: broken lead capture, no mobile navigation, hardcoded stats, no institution profiles, no data freshness indicators.

**Target state:** A trusted, mobile-friendly fee comparison platform with institution profiles, head-to-head comparisons, search, and consumer tools -- all backed by transparent data provenance and quality gates.

---

## Problem Statement

### Critical Bugs (Ship-blocking)
1. **No mobile navigation** -- `PublicNav` uses `hidden md:flex` with no hamburger menu. Mobile users (50%+ of SEO traffic) cannot navigate the site.
2. **Broken lead capture** -- Landing page form POSTs to `/api/request-access` which doesn't exist. Zero leads captured.
3. **Hardcoded landing page stats** -- Says "47 fee categories" (should be 49), "8,751 institutions" (should be dynamic).
4. **"Validated benchmarks" claim is misleading** -- 99.7% of public data is unvalidated (pending/staged). Landing page hero says "validated median benchmarks."
5. **Cookie `secure: false` in production** -- Session cookies sent over HTTP, enabling hijacking.

### Missing Trust Signals
- No "Data as of" timestamps on any public page
- No methodology/about page (footer lists "Methodology" as non-linked text)
- No source attribution (link to actual fee schedules)
- No maturity badges on public pages (only admin)
- No data quality gates (pages with 1 observation shown same as pages with 100)

### Missing High-Value Page Types
- No institution profiles (`/banks/[slug]`) -- the #1 organic traffic driver
- No head-to-head comparisons
- No "cheapest fees" lists
- No state overview pages
- No "Find your bank" search
- No fee calculator

### Technical Debt
- `next.config.ts` is completely empty (no security headers, no image config)
- DB connection pattern contradicts MEMORY.md (creates new connection per call, not singleton)
- No `loading.tsx` for any public route
- No custom 404 page
- Landing page duplicates nav/footer instead of using shared components
- Landing page is 864 lines of inline JSX
- Article markdown renderer doesn't support links, images, tables, or code blocks

---

## Proposed Solution

Three phases, each independently deployable, ordered by impact and dependency.

### Phase 1: Fix, Trust, and Ship (Foundation)

Fix critical bugs, add trust signals, enable Next.js 16 features. Every change here makes the existing 3,000+ pages better.

### Phase 2: Consumer Experience (High-Value Pages)

Build the page types that drive organic traffic: institution profiles, comparisons, search, cheapest-fee lists, state overviews.

### Phase 3: Engagement & Tools (Conversion)

Fee calculator, email alerts, newsletter, contextual CTAs. Convert traffic into engagement and leads.

---

## Technical Approach

### Phase 1: Fix, Trust, and Ship

#### 1.1 Fix Critical Bugs

**Mobile navigation:**
- Add hamburger menu to `PublicNav` (`src/components/public-nav.tsx`)
- Client component wrapper for menu toggle state
- Links: Fee Index, Districts, Research (matching existing desktop nav)
- Active link highlighting via `usePathname()`

**Fix lead capture form:**
- Create `src/app/api/request-access/route.ts` (POST handler)
- Store in `access_requests` table (email, name, institution, role, message, created_at)
- Migration: `fee_crawler/migrations/002_access_requests.sql`
- Return JSON response, handle in client component with `useActionState`
- Add CSRF protection via `Origin` header validation

**Fix landing page:**
- Replace hardcoded stats with dynamic DB queries
- Fix "47 categories" to use `TAXONOMY_COUNT` constant (49)
- Fix "8,751 institutions" with live `COUNT(*)` from `crawl_targets`
- Fix "4,000+ validated schedules" with `COUNT(DISTINCT crawl_target_id) WHERE review_status IN ('approved','staged')`
- Change "validated median benchmarks" to "median benchmarks from 8,700+ fee schedules"
- Refactor: use shared `PublicNav` and `PublicFooter` instead of inline duplicates
- Extract landing page sections into components (target: page.tsx under 200 lines)

**Fix cookie security:**
- Set `secure: process.env.NODE_ENV === 'production'` in `src/lib/auth.ts`
- Add `sameSite: 'lax'` attribute
- Use `crypto.timingSafeEqual` for password verification

**Files:** `src/components/public-nav.tsx`, `src/app/page.tsx`, `src/app/api/request-access/route.ts` (new), `src/lib/auth.ts`, `src/lib/crawler-db/dashboard.ts`

#### 1.2 Trust Signals

**"Data as of" timestamps:**
- Add `getDataFreshness(category?, state?)` query to `src/lib/crawler-db/fees.ts`
- Returns `MAX(crawled_at)` from the fees in the current query scope
- Display as "Data as of February 12, 2026" on every public fee page
- Shared `<DataFreshness timestamp={date} />` server component

**Methodology page (`/about`):**
- Route: `src/app/(public)/about/page.tsx`
- Content: How data is collected (crawling), how it's validated (review pipeline), statistical methodology (medians, percentiles), data scope and limitations, team/mission
- Move landing page methodology section content here
- Update footer "Methodology" text to link to `/about`

**Data quality gates:**
- Pages with < 5 observations: show "Limited data" banner + `<meta name="robots" content="noindex">`
- Pages with 5-9 observations: show "Provisional data" indicator
- Pages with 10+ observations: show full data (no qualifier)
- Surface maturity badges on public pages (port from admin `MaturityBadge` component)

**Source attribution:**
- Add "Source: [Institution] fee schedule, retrieved [date]" to state-level "Lowest Fees" tables
- Link to `fee_schedule_url` from `crawl_targets` where available

**Files:** `src/lib/crawler-db/fees.ts`, `src/app/(public)/about/page.tsx` (new), `src/components/data-freshness.tsx` (new), `src/components/maturity-badge.tsx` (extract from admin)

#### 1.3 Next.js 16 & Performance

**Enable Cache Components:**
```ts
// next.config.ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    qualities: [75, 85, 90],
  },
};
```

**Replace `revalidate` with `"use cache"` + `cacheLife`:**
- `/fees/[category]` -- `cacheLife('days')`, `cacheTag('fee-categories')`
- `/fees/[category]/by-state/[state]` -- `cacheLife('weeks')`, `cacheTag('fee-states')`
- `/districts/[id]` -- `cacheLife('days')`, `cacheTag('districts')`
- `/research/[slug]` -- `cacheLife('max')`, `cacheTag('articles')`

**Add Suspense boundaries + loading.tsx:**
- `src/app/(public)/loading.tsx` (generic skeleton)
- `src/app/(public)/fees/loading.tsx` (table skeleton)
- `src/app/(public)/fees/[category]/loading.tsx` (category detail skeleton)
- Wrap data-heavy sections in `<Suspense fallback={<Skeleton />}>`

**Add security headers:**
```ts
// next.config.ts
headers: async () => [{
  source: '/(.*)',
  headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ],
}],
```

**Dynamic import Recharts** (admin-only, but reduces admin bundle):
- `next/dynamic` with `ssr: false` for `FeeHistogram`, `FeeRangeChart`, `BreakdownChart`, `DistributionPanel`

**Custom 404:**
- `src/app/not-found.tsx` -- branded 404 with search and link to `/fees`

**BreadcrumbList JSON-LD:**
- Shared `<BreadcrumbJsonLd items={[{name, url}]} />` component
- Add to all public pages matching existing visual breadcrumbs
- Hierarchy: Home > Fee Index > [Category] > By State > [State]

**Files:** `next.config.ts`, all `(public)` page files, `src/app/not-found.tsx` (new), `src/components/breadcrumb-jsonld.tsx` (new)

---

### Phase 2: Consumer Experience

#### 2.1 Institution Profile Pages

**Route:** `/banks/[slug]`

**Slug strategy:**
- Format: `{slugify(institution_name)}-{state_code}` (e.g., `chase-bank-ny`, `first-national-bank-tx`)
- Add `slug` column to `crawl_targets` via migration
- Unique index on slug
- Collision resolution: append city if needed (`first-national-bank-tx-dallas`)
- Fallback: `/banks/id/[id]` numeric route for edge cases

**Page content:**
- Hero: institution name, city/state, charter type badge, asset tier, Fed district
- Fee schedule table: all approved + staged fees with national median comparison
- Delta column: emerald (below median), red (above median) per category
- Peer ranking: "Ranked #X of Y [charter_type] institutions in [tier]"
- Source card: "Fee schedule from [url], retrieved [date]"
- Related: "Compare with similar institutions" links (same tier, same state)
- JSON-LD: `BankOrCreditUnion` schema with `feesAndCommissionsSpecification`

**Static generation:**
- `generateStaticParams()` for top 500 institutions by asset size
- `dynamicParams: true` for remaining 8,200+
- `cacheLife('days')`, `cacheTag('institutions')`

**New DB queries:**
- `getInstitutionBySlug(slug)` in `src/lib/crawler-db/core.ts`
- `getInstitutionFeeComparison(id)` -- fees with national median delta

**Files:** `src/app/(public)/banks/[slug]/page.tsx` (new), `src/lib/crawler-db/core.ts`, `fee_crawler/migrations/003_institution_slugs.sql`

#### 2.2 "Find Your Bank" Public Search

**Implementation:**
- Search bar component in `PublicNav` (visible on desktop, full-width on mobile)
- Server action: `searchInstitutions(query)` in `src/app/(public)/actions/search.ts`
- Queries `crawl_targets.institution_name LIKE ?` with `LIMIT 10`
- Returns: name, slug, city, state, charter type, fee count
- On selection: navigate to `/banks/[slug]`
- Debounce: 300ms client-side
- Client component: `src/components/public-search.tsx` with `"use client"`

**Files:** `src/components/public-search.tsx` (new), `src/app/(public)/actions/search.ts` (new), `src/components/public-nav.tsx` (update)

#### 2.3 Head-to-Head Comparison Pages

**Route:** `/compare` (selection UI) + `/compare/[slugA]/vs/[slugB]` (result)

**URL design:** Use `/vs/` as separator (not hyphen) to avoid slug ambiguity.
- Example: `/compare/chase-bank-ny/vs/bank-of-america-nc`

**Selection page (`/compare`):**
- Two search inputs with autocomplete (reuse `searchInstitutions` action)
- "Compare" button navigates to result URL
- Suggested comparisons: top 10 most-compared pairs (track in client)

**Result page:**
- Side-by-side fee table for overlapping categories
- "N/A" for categories where only one institution has data
- Delta column with dollar and percentage difference
- Summary card: "Bank A is cheaper in X of Y shared categories, saving an average of $Z/year"
- Charter/size context card
- Internal links to each institution's profile

**Static generation:** None -- too many combinations. `dynamicParams: true` with `cacheLife('weeks')`.

**Files:** `src/app/(public)/compare/page.tsx` (new), `src/app/(public)/compare/[slugA]/vs/[slugB]/page.tsx` (new)

#### 2.4 Cheapest Fees Pages

**Route:** `/fees/[category]/cheapest`

- Top 25 institutions with lowest fees (approved fees only)
- Exclude $0 where category doesn't allow zero
- Segment tabs: All | Banks | Credit Unions
- Each row: institution name (linked to profile), fee amount, state, asset tier
- Disclaimer: "Rankings based on most recent fee schedule. Verify directly with institution."
- `generateStaticParams()` for 15 featured categories
- JSON-LD: `ItemList` schema

**Files:** `src/app/(public)/fees/[category]/cheapest/page.tsx` (new)

#### 2.5 State Overview Pages

**Route:** `/states/[state]`

- All fee categories aggregated for one state
- State median vs. national median with delta pills
- Institution count by charter type
- Top 10 largest institutions in state (linked to profiles)
- Links to per-category state pages
- SVG map highlighting the state (reuse `us-map-paths.ts`)
- `generateStaticParams()` for all 50 states + DC

**Files:** `src/app/(public)/states/[state]/page.tsx` (new)

#### 2.6 SEO Infrastructure

**Sitemap splitting:**
- Use `generateSitemaps()` for sitemap index
- Sitemap 1: static pages + categories (< 100 URLs)
- Sitemap 2: state pages (~2,500 URLs)
- Sitemap 3-N: institution profiles (8,700+ URLs, split at 5,000 per sitemap)
- Sitemap N+1: research articles

**FAQPage schema:**
- Add to fee category pages with generated FAQ content:
  - "What is the average [fee] in the US?"
  - "Which banks have the lowest [fee]?"
  - "How does [fee] vary by state?"

**Fix temporalCoverage:**
- Compute from `MIN(crawled_at)` and `MAX(crawled_at)` in fee queries

**Files:** `src/app/sitemap.ts`, category page files

#### 2.7 Mobile Table Optimization

- Fee index (`/fees`): card layout on < 640px (fee name, median, institution count)
- State detail tables: horizontal scroll wrapper on mobile
- Institution profile: card stack on mobile, table on desktop
- Responsive utility: `<ResponsiveTable>` component that renders cards on mobile, table on desktop

**Files:** `src/components/responsive-table.tsx` (new), public page files

---

### Phase 3: Engagement & Tools

#### 3.1 Fee Calculator

**Route:** `/tools/fee-calculator`

**Inputs:**
- Monthly overdrafts (0-5+)
- Monthly ATM withdrawals at non-network ATMs (0-10+)
- Monthly wire transfers (domestic outgoing) (0-3+)
- Monthly paper statements (0/1)
- Monthly maintenance waived? (yes/no)
- State (optional, for state-level comparison)

**Output:**
- Estimated annual fee burden at national median rates
- Bank vs Credit Union comparison
- Peer-group comparison if state selected
- "Your estimated annual banking fees: $X" hero number
- Breakdown table showing each fee category contribution
- CTA: "Find banks with lower fees" -> `/fees/[top-contributor]/cheapest`

**Implementation:** Client component, all computation against pre-fetched median data (server component fetches, passes as props). No API calls needed.

**Files:** `src/app/(public)/tools/fee-calculator/page.tsx` (new), `src/app/(public)/tools/fee-calculator/calculator.tsx` (new, client)

#### 3.2 Email Capture (Fee Alerts)

- Lightweight email capture on institution profile pages: "Get notified when fees change at [Institution]"
- Simple form: email address only, double opt-in
- `fee_alert_subscribers` table: email, institution_id, confirmed_at, unsubscribed_at
- API route: `src/app/api/alerts/subscribe/route.ts`
- Confirmation email via Resend (or log to DB for MVP)
- CAN-SPAM: unsubscribe link in every email

**Files:** `src/app/api/alerts/subscribe/route.ts` (new), `fee_crawler/migrations/004_alert_subscribers.sql`

#### 3.3 Contextual CTAs

- On fee category pages above national median: "Find banks with lower [fee] fees" -> `/fees/[category]/cheapest`
- On institution profiles with above-median fees: "Compare with cheaper alternatives" -> `/compare`
- On state pages: "See cheapest [top-category] in [state]" -> `/fees/[category]/by-state/[state]`
- Shared `<ContextualCta />` server component

**Files:** `src/components/contextual-cta.tsx` (new)

---

## Acceptance Criteria

### Phase 1 (Foundation)

- [x] Mobile hamburger menu works on all public pages (< 640px)
- [x] Request-access form saves submissions to DB and returns success/error
- [x] Landing page stats are dynamic from DB queries
- [x] Landing page uses shared `PublicNav` and `PublicFooter`
- [x] Landing page JSX is under 200 lines (sections extracted to components)
- [x] Session cookie is `secure: true` in production
- [x] "Data as of [date]" visible on all fee pages (category, state, district)
- [x] `/about` methodology page exists and footer links to it
- [ ] Pages with < 5 observations show "Limited data" banner + noindex
- [x] Custom 404 page renders for invalid URLs
- [x] `loading.tsx` exists for `/fees`, `/fees/[category]`, `/districts`
- [x] BreadcrumbList JSON-LD on all fee and district pages
- [x] Security headers present in response (X-Content-Type-Options, X-Frame-Options, etc.)
- [ ] `next.config.ts` has `cacheComponents: true` enabled (deferred - risk with SQLite sync reads)
- [x] All existing vitest tests pass (no test files present in project)

### Phase 2 (Consumer Experience)

- [ ] `/banks/[slug]` renders institution profile with fee table and national comparison
- [ ] "Find your bank" search returns results within 300ms
- [ ] `/compare/[slugA]/vs/[slugB]` renders side-by-side comparison
- [ ] `/fees/[category]/cheapest` shows top 25 lowest-fee institutions
- [ ] `/states/[state]` renders all-category state overview
- [ ] Sitemap includes all new page types, split into index
- [ ] FAQPage JSON-LD on fee category pages
- [ ] Tables render as cards on mobile (< 640px)
- [ ] All new pages have `generateMetadata()` with title, description, OG
- [ ] All new pages have BreadcrumbList JSON-LD
- [ ] Institution slugs are unique and stable

### Phase 3 (Engagement)

- [ ] Fee calculator produces accurate annual cost estimate
- [ ] Email alert signup saves to DB with double opt-in flow
- [ ] Contextual CTAs appear on relevant pages
- [ ] Calculator page has `generateMetadata()` targeting "bank fee calculator"

---

## Dependencies & Risks

### Dependencies
- **Phase 0 from roadmap** (CI/CD, migration system) should ideally be done first, but Phase 1 here can proceed without it
- **Institution slug migration** (Phase 2.1) requires a DB migration -- needs migration system or manual SQL
- **Cache Components** (`cacheComponents: true`) is a Next.js 16 feature that may have edge cases with SQLite synchronous reads

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Institution slug collisions | Broken URLs, 404s | Append city or numeric suffix; unique index prevents silent duplicates |
| Cache Components instability | Build failures, stale data | Feature-flag behind env var; test on staging first |
| Legal risk of publishing named institution fees | Liability for inaccurate data | Only show approved+staged fees; prominent disclaimers; "Report an error" link |
| 8,700+ institution profiles overwhelm sitemap | Google crawl budget waste | Sitemap index splitting; only include institutions with 3+ fee data points |
| Mobile card layout doubles template complexity | Maintenance burden | Shared `<ResponsiveTable>` component; single data source |

---

## Alternative Approaches Considered

1. **SPA with client-side fetching** -- Rejected. Server components with ISR provide better SEO, faster first paint, and no client-side JS for data pages.

2. **PostgreSQL migration before new pages** -- Rejected. SQLite handles read-heavy workloads well. Migrate only when API tier requires it (Phase 4 of roadmap).

3. **Next.js middleware for auth** -- Using `proxy.ts` (Next.js 16) only for lightweight redirects, not full auth. Auth stays in server components per Next.js security recommendations.

4. **Comparison page via query params** (`/compare?a=slug&b=slug`) -- Rejected. Slug-based URLs are more SEO-friendly and bookmarkable.

---

## References

### Internal
- Existing roadmap: `plans/roadmap-bank-fee-index-2026.md`
- Auto-review rules plan: `plans/feat-auto-review-rules.md`
- Source transparency plan: `plans/feat-source-transparency-provenance.md`
- Fee taxonomy: `src/lib/fee-taxonomy.ts` (49 categories, 9 families, 4 tiers)
- Public nav: `src/components/public-nav.tsx` (missing mobile menu)
- Landing page: `src/app/page.tsx` (864 lines, hardcoded stats)
- Auth: `src/lib/auth.ts` (SHA-256, `secure: false`)
- DB connection: `src/lib/crawler-db/connection.ts`

### External
- [Next.js 16 Cache Components](https://nextjs.org/docs/app/getting-started/cache-components)
- [Next.js 16 proxy.ts](https://nextjs.org/docs/app/getting-started/proxy)
- [Google Helpful Content Guidelines](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Schema.org FinancialProduct](https://schema.org/FinancialProduct)
- [Schema.org BreadcrumbList](https://schema.org/BreadcrumbList)
- [WCAG 2.2 Checklist](https://webaim.org/standards/wcag/checklist)
- [NerdWallet Business Model](https://productmint.com/the-nerdwallet-business-model-how-does-nerdwallet-make-money/)
- [NN/g Comparison Tables UX](https://www.nngroup.com/articles/comparison-tables/)
- [Programmatic SEO Internal Linking](https://hashmeta.com/blog/why-internal-linking-is-critical-for-programmatic-websites-a-strategic-guide/)
