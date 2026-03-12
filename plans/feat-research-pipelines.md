# feat: Customer-Facing Research Pipelines

> Transform Bank Fee Index from an internal admin tool into a public-facing financial research platform that produces authoritative, SEO-rich analysis of bank and credit union fees across the United States.

## Overview

Bank Fee Index has accumulated a uniquely rich dataset:

| Data Asset | Volume | Coverage |
|------------|--------|----------|
| Financial institutions | 8,751 | All 50 states + DC, 12 Fed districts |
| Extracted fees | 65,287 | 49 categories, 9 families, 4 tiers |
| Call report financials | 38,972 | ~8,744 institutions, Q1 2023 - Q3 2025 |
| Fed Beige Book | 114 entries | All 12 districts |
| Fed content | 315 | Speeches, reports |
| CFPB complaints | 2,069 | Product-level data |
| Fee snapshots | 0 (schema ready) | Historical tracking infrastructure |
| Fee change events | 0 (schema ready) | Change detection infrastructure |

This data is currently only accessible through the admin dashboard. The opportunity is to produce customer-facing research that serves multiple audiences while building domain authority and organic traffic.

## Problem Statement

1. **No public output** — All fee data sits behind admin auth. The public `(public)` route group has skeleton pages but no live content.
2. **Underutilized cross-referencing** — Call report data (service charge income, fee-to-revenue ratios) is collected but not correlated with actual fee schedules.
3. **No temporal analysis** — `fee_snapshots` and `fee_change_events` tables exist but are empty. No trend tracking.
4. **No geographic research** — State-level and district-level aggregations exist in admin but aren't published.
5. **No consumer value** — Consumers can't look up or compare fees at specific institutions.

## Target Audiences

| Audience | What They Need | How They'd Find Us |
|----------|---------------|-------------------|
| **Consumers** | Compare fees, find cheapest banks, understand fee types | Google: "average overdraft fee", "bank fees by state" |
| **Bank/CU executives** | Benchmark against peers, competitive intelligence | Google: "community bank fee benchmarking", LinkedIn, industry publications |
| **Financial analysts** | Data for reports, fee trend analysis | Google Scholar, data APIs, industry newsletters |
| **Journalists** | Story hooks, fee statistics, quotes/data points | Google News, press page, data embeds |
| **Regulators/policymakers** | Fee burden data by demographics, district analysis | Direct referral, academic citations |

## Proposed Solution: 7 Research Pipelines

### Pipeline 1: State Fee Reports (50 pages)

**Route:** `/research/state/[state-code]` (e.g., `/research/state/TX`)

**Content per state page:**
- Headline stats: median overdraft fee, # institutions tracked, # fees extracted
- State vs. national comparison table (all 49 fee categories with deltas)
- Top 5 / Bottom 5 institutions by key fees (monthly maintenance, overdraft, NSF)
- Bank vs. credit union comparison within the state
- Asset tier breakdown (do bigger banks charge more?)
- Interactive map showing institutions with fee data
- Call report context: average service charge income for state's institutions
- Fed district overlay (which district(s) cover this state)
- CFPB complaint data for the state
- Methodology note + data freshness badge

**Data source:** `crawl_targets` (state_code) + `extracted_fees` + `institution_financials`

**SEO value:** 50 long-tail pages targeting "[State] bank fees", "average overdraft fee in [State]"

**Sample SQL pattern:**
```sql
SELECT fee_category,
       ROUND(MEDIAN(amount), 2) as state_median,
       COUNT(*) as observations,
       MIN(amount) as min_fee,
       MAX(amount) as max_fee
FROM extracted_fees ef
JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
WHERE ct.state_code = ? AND ef.review_status <> 'rejected' AND ef.amount IS NOT NULL
GROUP BY fee_category
ORDER BY COUNT(*) DESC
```

### Pipeline 2: Fed District Reports (12 pages)

**Route:** `/research/district/[id]` (e.g., `/research/district/7`)

**Content per district page:**
- District overview: name, HQ city, states covered, # institutions
- Fee index for the district (median across all 49 categories)
- District vs. national delta analysis (which fees are higher/lower)
- Beige Book economic context (latest release summary relevant to banking/fees)
- Institution density map (SVG — already have state paths in `us-map-paths.ts`)
- Call report analysis: service charge income trends for district institutions
- Bank vs. credit union breakdown
- Asset tier distribution
- Top outlier institutions (highest and lowest fees)
- Quarterly trend charts (using call report time series)

**Data source:** `crawl_targets` (fed_district) + `extracted_fees` + `institution_financials` + `fed_beige_book`

**SEO value:** 12 authoritative pages on regional banking economics, link to/from Fed publications

### Pipeline 3: Fee Category Deep Dives (49 pages)

**Route:** `/fees/[category]` (e.g., `/fees/overdraft`)

**Content per category page (already has loading skeleton!):**
- Fee explainer: what this fee is, when it's charged, how to avoid it
- National statistics: median, P25, P75, min, max, observation count
- Distribution histogram (Recharts — already in project)
- Bank vs. credit union comparison
- Breakdown by asset tier (do bigger banks charge more for this fee?)
- Breakdown by Fed district (geographic variation)
- Breakdown by state (top 10 most/least expensive states)
- Trend over time (once `fee_snapshots` is populated)
- Related fees in the same family
- Call report correlation: do institutions with higher fees earn more service charge income?
- Consumer tips: how to avoid or reduce this fee

**Data source:** `extracted_fees` (fee_category) + `crawl_targets` + `institution_financials`

**SEO value:** High-intent pages targeting "average [fee type] fee", "how much does [fee] cost"

### Pipeline 4: Institution Profiles (2,100+ pages)

**Route:** `/institution/[id]` or `/institution/[slug]`

**Content per institution page:**
- Institution header: name, city, state, charter type, asset size, website
- Full fee schedule card (all extracted fees with confidence badges)
- Peer comparison: how this institution's fees compare to similar peers (same tier, district, charter)
- Call report financials: total assets, service charge income, fee-to-revenue ratio, trends
- CFPB complaints summary
- Fee schedule source link + last crawled date
- Structured data (JSON-LD) for Google rich results

**Data source:** `crawl_targets` + `extracted_fees` + `institution_financials` + `institution_complaints`

**SEO value:** Institution-name keyword pages targeting "[Bank Name] fees", "[Credit Union] fee schedule"

**Privacy/legal note:** All data is from public sources (FDIC, NCUA, published fee schedules). No proprietary data.

### Pipeline 5: National Fee Index (Quarterly Report)

**Route:** `/research/national-fee-index` + `/research/national-fee-index/[quarter]`

**Content:**
- Headline: "Q3 2025 National Fee Index"
- Executive summary: key trends, notable changes
- Index table: all 49 categories with national medians, quarter-over-quarter change
- Spotlight analysis on 6 key fees (the "spotlight" tier)
- Bank vs. credit union index comparison
- Asset tier index comparison
- Geographic heat map (which districts saw biggest fee changes)
- Call report context: nationwide service charge income trends
- Methodology and data quality section
- Downloadable CSV / PDF

**Data source:** Computed from `extracted_fees` + `fee_snapshots` + `institution_financials`

**SEO value:** Quarterly authoritative publication, citation-worthy, press-friendly

**Dependency:** Requires `fee_snapshots` population to show trends. First edition can be point-in-time.

### Pipeline 6: Fee-to-Revenue Analysis (Research Report)

**Route:** `/research/fee-revenue-analysis`

**Content:**
- Correlation analysis: do institutions with higher listed fees earn more service charge income?
- Scatter plots: fee amount vs. service charge income (by tier, charter, district)
- Revenue dependency: which tiers/types are most dependent on fee income?
- Fee income ratio distribution (from `institution_financials.fee_income_ratio`)
- Top 20 institutions by fee income ratio
- Time series: is fee dependence increasing or decreasing? (quarterly call report data)
- Policy implications: fee burden on consumers
- Methodology section with statistical approach

**Data source:** `institution_financials` (service_charge_income, fee_income_ratio, total_revenue) cross-referenced with `extracted_fees`

**SEO value:** Original research, highly citable, differentiator from Bankrate/NerdWallet

### Pipeline 7: Consumer Fee Guides (Evergreen Content)

**Route:** `/guides/[slug]`

**Content ideas (10-15 guides):**
- "The Complete Guide to Bank Fees in 2026"
- "How to Avoid Overdraft Fees: A Data-Driven Guide"
- "Bank vs. Credit Union: Which Has Lower Fees?"
- "Understanding Wire Transfer Fees"
- "The Hidden Fees in Your Checking Account"
- "How Much Are ATM Fees Really Costing You?"
- Each guide includes live data from the database (not static content)
- Pull in actual median fees, real institution examples, geographic comparisons

**Data source:** All tables, curated into narrative format

**SEO value:** Top-of-funnel content, high search volume keywords, evergreen with auto-updating data

## Technical Approach

### Architecture

```
src/app/(public)/
  layout.tsx                    # Public layout with nav, footer, SEO defaults
  page.tsx                      # Homepage / landing
  research/
    page.tsx                    # Research hub / index of all reports
    state/[code]/page.tsx       # 50 state pages
    district/[id]/page.tsx      # 12 district pages
    national-fee-index/
      page.tsx                  # Latest quarter
      [quarter]/page.tsx        # Historical quarters
    fee-revenue-analysis/page.tsx
  fees/
    page.tsx                    # Fee catalog (all 49 categories)
    [category]/page.tsx         # Individual fee pages
  institution/
    [id]/page.tsx               # Institution profile
  guides/
    page.tsx                    # Guide index
    [slug]/page.tsx             # Individual guides

src/lib/
  research-db/                  # Public-facing query layer (read-only)
    state-reports.ts            # State aggregation queries
    district-reports.ts         # District aggregation queries
    fee-analysis.ts             # Fee category analysis queries
    institution-profiles.ts     # Institution detail queries
    national-index.ts           # National index computation
    fee-revenue.ts              # Fee-to-revenue correlation queries

src/components/public/          # Public-facing components
  fee-comparison-table.tsx
  distribution-chart.tsx
  state-map.tsx
  delta-indicator.tsx
  data-freshness-badge.tsx
  methodology-note.tsx
  share-bar.tsx                 # Already exists: share-buttons.tsx
```

### Data Flow

```
SQLite (crawler.db)
  ↓ (read-only queries via better-sqlite3 singleton)
Research query layer (src/lib/research-db/)
  ↓ (server components call query functions)
Next.js pages (SSG with revalidation)
  ↓ (ISR: revalidate every 24 hours or on-demand)
Public pages with JSON-LD structured data
```

### Rendering Strategy

| Page Type | Rendering | Revalidation |
|-----------|-----------|-------------|
| State reports | SSG | `revalidate: 86400` (daily) |
| District reports | SSG | `revalidate: 86400` (daily) |
| Fee categories | SSG | `revalidate: 86400` (daily) |
| Institution profiles | SSG | `revalidate: 86400` (daily) |
| National index | SSG | `revalidate: 604800` (weekly) |
| Fee-revenue analysis | SSG | `revalidate: 604800` (weekly) |
| Consumer guides | SSG | `revalidate: 604800` (weekly) |
| Homepage | SSG | `revalidate: 3600` (hourly) |

### Key SQLite Patterns Needed

**Percentile computation (P25/P50/P75):**
```sql
-- SQLite doesn't have PERCENTILE_CONT, use subquery approach
WITH ranked AS (
  SELECT amount,
         ROW_NUMBER() OVER (ORDER BY amount) as rn,
         COUNT(*) OVER () as total
  FROM extracted_fees
  WHERE fee_category = ? AND amount IS NOT NULL AND review_status <> 'rejected'
)
SELECT
  (SELECT amount FROM ranked WHERE rn = CAST(total * 0.25 AS INTEGER) + 1) as p25,
  (SELECT amount FROM ranked WHERE rn = CAST(total * 0.50 AS INTEGER) + 1) as median,
  (SELECT amount FROM ranked WHERE rn = CAST(total * 0.75 AS INTEGER) + 1) as p75
FROM ranked LIMIT 1;
```

**State-level aggregation:**
```sql
SELECT ct.state_code,
       ef.fee_category,
       COUNT(*) as observations,
       AVG(ef.amount) as mean,
       -- Median via window function
       ...
FROM extracted_fees ef
JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
WHERE ef.review_status <> 'rejected' AND ef.amount IS NOT NULL
GROUP BY ct.state_code, ef.fee_category
```

**Fee-to-revenue correlation:**
```sql
SELECT ct.id, ct.institution_name, ct.asset_size_tier,
       AVG(ef.amount) as avg_fee,
       ifin.service_charge_income,
       ifin.fee_income_ratio
FROM crawl_targets ct
JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
JOIN institution_financials ifin ON ct.id = ifin.crawl_target_id
WHERE ef.review_status <> 'rejected'
  AND ifin.report_date = (SELECT MAX(report_date) FROM institution_financials WHERE source = ifin.source)
GROUP BY ct.id
```

### SEO & Structured Data

Each public page should include:
- **JSON-LD** structured data (Dataset, Article, or FAQPage schema)
- **Open Graph** meta tags for social sharing
- **Canonical URLs** and proper `<head>` metadata
- **Breadcrumb JSON-LD** (component already exists: `breadcrumb-jsonld.tsx`)
- **Data freshness badge** (component already exists: `data-freshness.tsx`)
- **Sitemap generation** via `sitemap.ts` in app root

### Data Quality Signals

To build credibility as a research source:
- Show observation count per statistic (e.g., "Median based on 2,734 institutions")
- Display data freshness (last crawl date, last update)
- Use maturity badges (already exist in admin: "strong" / "provisional" / "insufficient")
- Link to methodology page explaining extraction process, confidence scoring, review workflow
- Cite data sources: "Data from FDIC Call Reports, NCUA 5300 Reports, published fee schedules"

## Implementation Phases

### Phase 1: Foundation (Public Layout + Fee Category Pages)

**Goal:** Ship 49 fee category pages — the highest-SEO-value, most data-rich pipeline.

**Tasks:**
- [x] Create public layout (`src/app/(public)/layout.tsx`) with navigation, footer, SEO defaults
- [x] Build public homepage with key stats and links to research sections (using existing root page.tsx)
- [x] Create aggregation queries (reused existing `crawler-db/fees.ts` — no new file needed)
- [x] Build `/fees` catalog page listing all 49 categories with key stats
- [x] Build `/fees/[category]` pages with full analysis (stats, charts, breakdowns)
- [x] Add JSON-LD structured data to all pages
- [x] Add `sitemap.ts` for dynamic sitemap generation (already existed)
- [x] Add `robots.ts` for search engine directives
- [x] Create `DataFreshnessBadge` and `MethodologyNote` public components (reused existing + inline)

**Files:**
- `src/app/(public)/layout.tsx`
- `src/app/(public)/page.tsx`
- `src/app/(public)/fees/page.tsx`
- `src/app/(public)/fees/[category]/page.tsx`
- `src/lib/research-db/fee-analysis.ts`
- `src/components/public/fee-comparison-table.tsx`
- `src/components/public/distribution-chart.tsx`
- `src/app/sitemap.ts`
- `src/app/robots.ts`

### Phase 2: Geographic Research (State + District Pages)

**Goal:** Ship 50 state pages + 12 district pages with geographic analysis.

**Tasks:**
- [ ] Create `src/lib/research-db/state-reports.ts` with state-level queries
- [ ] Create `src/lib/research-db/district-reports.ts` with district-level queries
- [ ] Build `/research/state/[code]` pages (50 states + DC)
- [ ] Build `/research/district/[id]` pages (12 Fed districts)
- [ ] Build interactive state map component using existing SVG paths
- [ ] Integrate Beige Book context into district pages
- [ ] Add state/district pages to sitemap
- [ ] Create `/research` hub page linking to all reports

**Files:**
- `src/app/(public)/research/page.tsx`
- `src/app/(public)/research/state/[code]/page.tsx`
- `src/app/(public)/research/district/[id]/page.tsx`
- `src/lib/research-db/state-reports.ts`
- `src/lib/research-db/district-reports.ts`
- `src/components/public/state-map.tsx`

### Phase 3: Institution Profiles + National Index

**Goal:** Ship 2,100+ institution pages and the flagship National Fee Index report.

**Tasks:**
- [x] Create `src/lib/crawler-db/geographic.ts` with `getInstitutionIdsWithFees()`
- [x] Build `/institution/[id]` pages with fee table, financial snapshot, peer comparison
- [x] Reuse admin's `getNationalIndex()` for national medians (no new file needed)
- [x] Build `/research/national-fee-index` page with full index by family
- [ ] Populate `fee_snapshots` table (Python script to snapshot current fees quarterly)
- [ ] Add fee change detection to crawl pipeline
- [ ] Generate institution slugs for clean URLs

**Files:**
- `src/app/(public)/institution/[id]/page.tsx`
- `src/app/(public)/research/national-fee-index/page.tsx`
- `src/lib/research-db/institution-profiles.ts`
- `src/lib/research-db/national-index.ts`
- `fee_crawler/commands/snapshot_fees.py` (new)

### Phase 4: Original Research + Consumer Guides

**Goal:** Ship fee-to-revenue analysis and consumer guides.

**Tasks:**
- [x] Create `src/lib/crawler-db/fee-revenue.ts` with correlation queries (tier, charter, institution-level)
- [x] Build `/research/fee-revenue-analysis` page with charter/tier breakdowns and top institutions
- [x] Create template-based guide system (`src/lib/guides.ts`)
- [x] Build 5 initial guides (overdraft, NSF, ATM, wire transfer, monthly maintenance) with live data
- [ ] Add press/citation page with embeddable data widgets
- [ ] Create RSS feed for new research publications

**Files:**
- `src/app/(public)/research/fee-revenue-analysis/page.tsx`
- `src/app/(public)/guides/page.tsx`
- `src/app/(public)/guides/[slug]/page.tsx`
- `src/lib/research-db/fee-revenue.ts`

### Phase 5: API + Data Products

**Goal:** Offer programmatic access to research data.

**Tasks:**
- [x] Design REST API with versioning (`/api/v1/`)
- [x] Build API route handlers for key datasets
- [ ] Add API key authentication for rate limiting
- [x] Create API documentation page
- [x] Add CSV/JSON download endpoints for each report
- [ ] Consider webhook notifications for data updates

**Files:**
- `src/app/api/v1/fees/route.ts`
- `src/app/api/v1/institutions/route.ts`
- `src/app/api/v1/index/route.ts`
- `src/app/(public)/api-docs/page.tsx`

## Data Coverage Assessment

### Current Strengths
- **Breadth:** 8,751 institutions is near-complete coverage of US banks + CUs
- **Depth:** 49 fee categories with 65K+ observations
- **Financial context:** Call reports with 7 quarters of financial data for ~8,744 institutions
- **Geographic:** All 50 states, all 12 Fed districts represented

### Current Gaps
- **Temporal data:** `fee_snapshots` and `fee_change_events` are empty — no trend tracking yet
- **Fee coverage:** Only ~2,115 institutions have extracted fees (24% of total)
- **Beige Book:** Only 1 release (January 2026) — need to ingest historical releases
- **FRED data:** 0 economic indicators ingested despite schema being ready
- **Complaints:** Only 2,069 records — could be expanded with full CFPB download

### Data Enrichment Priorities
1. **Populate fee_snapshots** — Run quarterly snapshot command to enable trend analysis
2. **Ingest FRED data** — Unemployment, GDP, CPI for economic context
3. **Expand Beige Book** — Ingest 2024-2025 releases for historical context
4. **Increase crawl coverage** — Target remaining 6,636 institutions without fee data
5. **Enable fee change detection** — Populate `fee_change_events` on re-crawl

## Success Metrics

| Metric | Target (6 months) | Target (12 months) |
|--------|-------------------|---------------------|
| Indexed pages | 200+ | 2,500+ |
| Organic monthly visits | 5,000 | 50,000 |
| Media citations | 5 | 25 |
| API consumers | 10 | 100 |
| Newsletter subscribers | 500 | 5,000 |
| Backlinks from .gov/.edu | 3 | 15 |

## Dependencies & Risks

### Dependencies
- Fee snapshots pipeline must be built before trend analysis is possible
- FRED ingest command exists but needs data — run `ingest-fred` with target series
- Public layout/nav needs design before shipping any public pages
- Legal review of publishing institution-specific fee data (all from public sources, but worth confirming)

### Risks
- **Data quality:** 7,063 flagged fees need resolution before publication. Publishing "pending" data requires clear maturity badges.
- **Stale data:** Fee schedules change; need regular re-crawl cadence
- **SEO competition:** Bankrate, NerdWallet dominate consumer fee keywords. Differentiate with data depth and geographic granularity.
- **Scale:** 2,100+ institution pages + 49 fee pages + 50 state + 12 district = 2,200+ pages. SSG build time could be significant — may need ISR.

## Alternative Approaches Considered

1. **API-only (no public pages)** — Rejected: misses SEO opportunity and consumer audience
2. **Blog-style reports (manual)** — Rejected: doesn't scale, can't auto-update with new data
3. **Gated/premium data** — Deferred: build audience first with free research, monetize later
4. **Third-party BI tool (Metabase, Superset)** — Rejected: doesn't integrate with Next.js brand, poor SEO

## References

### Internal
- Fee taxonomy: `src/lib/fee-taxonomy.ts` (9 families, 49 categories)
- Existing index computation: `src/lib/crawler-db/core.ts:getReviewStats`, `getNationalIndex`, `getPeerIndex`
- US map SVG paths: `src/lib/us-map-paths.ts`
- Existing public skeletons: `src/app/(public)/fees/[category]/loading.tsx`
- Share buttons: `src/app/(public)/research/[slug]/share-buttons.tsx`
- Breadcrumb JSON-LD: `src/components/breadcrumb-jsonld.tsx`
- Data freshness component: `src/components/data-freshness.tsx`
- Admin market index: `src/app/admin/market/` (8 files, reusable patterns)

### External
- FDIC BankFind API for institution data verification
- NCUA Credit Union data
- FRED API for economic indicators
- CFPB Consumer Complaint Database
- Fed Beige Book releases
- Schema.org Dataset / Article / FAQPage markup
