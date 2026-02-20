# Bank Fee Index: Content Platform Strategy

## Vision

Transform Bank Fee Index from an internal admin tool into the authoritative public source on US bank fees — serving consumers researching fees, financial institutions benchmarking pricing, and industry analysts tracking trends. Become the "FRED Blog of bank fees" with daily data-driven content, programmatic SEO pages, and enterprise data products.

**Assets we have today:**
- 63,000+ fee extractions across 8,700+ institutions, 49 categories
- Peer benchmarking by charter type, 6 asset tiers, 12 Fed districts
- Fed Beige Book economic commentary (19 editions, 12 districts)
- FRED economic indicators + FDIC/NCUA financials
- Full Python extraction pipeline with Claude LLM integration
- Next.js App Router + SQLite read infrastructure already serving public data

**What we're building:**
1. Public data pages (programmatic SEO) — 3,000+ pages generated from existing data
2. LLM-powered research articles — daily/weekly analysis from fee statistics
3. Enterprise data products — API, peer benchmarking reports, consulting funnel
4. Content editorial pipeline — Python CLI for article generation + admin review UI

---

## Architecture Overview

```
                    PUBLIC SITE                         ENTERPRISE
                    ──────────                         ──────────
               /fees/[category]/                    /api/v1/ (gated)
          /fees/[category]/by-state/[state]         Peer benchmark PDFs
          /fees/[category]/by-district/[id]         Custom data exports
              /research/[slug]                      Consulting funnel
              /districts/[id]
              /compare/
              /banks/[slug]

                    CONTENT ENGINE
                    ──────────────
        Python CLI: generate-articles command
        Templates: 5 article types (decomposed sections)
        LLM: Claude Sonnet for prose, data grounding from DB
        Review: /admin/articles staging UI (tiered approval)
        Storage: articles table in crawler.db
```

---

## Phase 1: Public Data Pages (Programmatic SEO)

**Goal:** Expose existing fee index data through 3,000+ public pages with proper SEO infrastructure. No LLM generation needed — these are pure data display pages powered by existing DB queries.

**Timeline:** 2-3 weeks

### 1.1 Route Group & Public Layout

- [x] Create `src/app/(public)/layout.tsx` — public nav (dark `#0f172a` brand), footer, consistent with current landing page style
- [x] Move current `src/app/page.tsx` into `src/app/(public)/page.tsx` (or keep at root and add layout wrapper — kept at root)
- [x] Create `src/components/public-nav.tsx` — links to /fees, /research, /districts, /compare
- [x] Create `src/components/public-footer.tsx` — methodology link, disclaimer, about

### 1.2 Fee Category Hub Pages (49 pages)

**Route:** `/fees/[category]/page.tsx`

Each page shows for one fee category:
- National median, mean, P25/P75, min/max, institution count
- Charter comparison (bank vs credit union medians)
- Asset tier breakdown (6 tiers)
- Fed district breakdown (12-district choropleth using existing `us-map-paths.ts`)
- Distribution histogram (reuse `FeeHistogram` component)
- Range chart (reuse `FeeRangeChart` component)
- Methodology note + disclaimer (static)

**Data source:** `getNationalIndex()`, `getPeerIndex()`, `getDistrictMedianByCategory()` — all exist today.

```typescript
// src/app/(public)/fees/[category]/page.tsx
export async function generateStaticParams() {
  // Pre-generate the 15 featured categories at build time
  return getFeaturedCategories().map((cat) => ({ category: cat }));
}
export const dynamicParams = true; // Other 34 built on demand
export const revalidate = 86400; // 24 hours
```

- [x] Create `src/app/(public)/fees/page.tsx` — fee category index (all 49, grouped by family)
- [x] Create `src/app/(public)/fees/[category]/page.tsx` — category hub page
- [x] Add `generateMetadata()` with dynamic title/description per category
- [x] Add JSON-LD `Dataset` schema per category page
- [x] Add dynamic OG image (`opengraph-image.tsx`) showing median fee + institution count

### 1.3 State Breakdown Pages (49 x 50 = 2,450 pages)

**Route:** `/fees/[category]/by-state/[state]/page.tsx`

Each page shows one fee category filtered to institutions in one state:
- State median vs national median (delta pill)
- Institution count in state
- Charter/tier breakdown within state
- Top 5 lowest-fee institutions in state
- Link back to category hub

**Data source:** New query `getStateFeeStats(category, stateCode)` needed — simple WHERE clause on existing `extracted_fees JOIN crawl_targets`.

```typescript
export async function generateStaticParams() {
  return []; // All 2,450 pages built on demand
}
export const dynamicParams = true;
export const revalidate = 604800; // 7 days
```

- [x] Add `getStateFeeStats()` to `src/lib/crawler-db/fee-index.ts`
- [x] Create `src/app/(public)/fees/[category]/by-state/page.tsx` — state list for category
- [x] Create `src/app/(public)/fees/[category]/by-state/[state]/page.tsx`
- [x] Add `generateMetadata()` with state + category in title

### 1.4 District Hub Pages (12 pages)

**Route:** `/districts/[id]/page.tsx`

Each page shows one Fed district:
- Beige Book economic summary (latest edition)
- Fee index for that district (all categories, medians vs national)
- Institution count and charter mix
- FRED economic indicators (unemployment, rates)
- Recent Fed speeches for district
- Map highlighting district states

**Data source:** `getLatestBeigeBook()`, `getPeerIndex({districts: [id]})`, `getDistrictIndicators()`, `getDistrictContent()` — all exist.

- [x] Create `src/app/(public)/districts/page.tsx` — 12-district grid with map
- [x] Create `src/app/(public)/districts/[id]/page.tsx` — district hub (reuse admin district page components minus auth)
- [x] Add Beige Book summary excerpt + "Read full report" expandable

### 1.5 SEO Infrastructure

- [x] Create `src/app/sitemap.ts` — dynamic sitemap covering all category, state, district, and research pages
- [x] Create `src/app/robots.ts` — allow all public routes, disallow /admin/
- [x] Add JSON-LD `Organization` schema to root layout
- [x] Add JSON-LD `Dataset` schema to category pages
- [x] Create `src/app/(public)/fees/[category]/opengraph-image.tsx` — dynamic OG with median fee stat
- [ ] Submit sitemap to Google Search Console after deploy

### 1.6 Revalidation Webhook

- [ ] Create `src/app/api/revalidate/route.ts` — secret-protected POST endpoint
- [ ] Tag DB queries with `unstable_cache` + named tags per category
- [ ] Python pipeline calls webhook after crawl run completes to invalidate stale pages

**Files to create/modify (Phase 1):**

| File | Action | Notes |
|------|--------|-------|
| `src/app/(public)/layout.tsx` | Create | Public nav + footer wrapper |
| `src/components/public-nav.tsx` | Create | Dark brand nav for public pages |
| `src/components/public-footer.tsx` | Create | Disclaimer, methodology link |
| `src/app/(public)/fees/page.tsx` | Create | Fee category index |
| `src/app/(public)/fees/[category]/page.tsx` | Create | Category hub |
| `src/app/(public)/fees/[category]/opengraph-image.tsx` | Create | Dynamic OG image |
| `src/app/(public)/fees/[category]/by-state/page.tsx` | Create | State list |
| `src/app/(public)/fees/[category]/by-state/[state]/page.tsx` | Create | State breakdown |
| `src/app/(public)/districts/page.tsx` | Create | District grid |
| `src/app/(public)/districts/[id]/page.tsx` | Create | District hub |
| `src/app/sitemap.ts` | Create | Dynamic sitemap |
| `src/app/robots.ts` | Create | Crawl rules |
| `src/app/api/revalidate/route.ts` | Create | ISR invalidation webhook |
| `src/lib/crawler-db/fee-index.ts` | Modify | Add `getStateFeeStats()` |

---

## Phase 2: Research Articles & Content Engine

**Goal:** Build an LLM-powered article generation pipeline that produces daily/weekly data analysis articles from fee statistics. Articles are generated by Python CLI, reviewed in admin UI, published to /research/.

**Timeline:** 2-3 weeks

### 2.1 Article Database Schema

Add to `fee_crawler/db.py`:

```sql
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    article_type TEXT NOT NULL,  -- national_benchmark, district_comparison, charter_comparison, top_10, quarterly_trend
    fee_category TEXT,           -- NULL for cross-category articles
    fed_district INTEGER,        -- NULL for national articles
    status TEXT NOT NULL DEFAULT 'draft',  -- draft, review, approved, published, rejected
    review_tier INTEGER NOT NULL DEFAULT 2,  -- 1=auto, 2=light, 3=full compliance
    content_md TEXT NOT NULL,     -- Markdown article body
    data_context TEXT NOT NULL,   -- JSON: exact data payload used to generate
    summary TEXT,                 -- 1-2 sentence excerpt for cards/OG
    model_id TEXT,               -- e.g. claude-sonnet-4-5-20250929
    prompt_hash TEXT,            -- SHA256 of concatenated prompts for reproducibility
    generated_at TEXT NOT NULL,
    reviewed_by TEXT,            -- user who approved
    reviewed_at TEXT,
    published_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_type ON articles(article_type, fee_category);
CREATE INDEX idx_articles_published ON articles(published_at);
```

- [x] Add `articles` table migration to `db.py`
- [x] Add TypeScript types to `src/lib/crawler-db/types.ts`
- [x] Add query functions to new `src/lib/crawler-db/articles.ts`

### 2.2 Article Data Query Layer (Python)

Create `fee_crawler/generation/article_data.py` with typed data payloads:

```python
@dataclass
class NationalBenchmarkData:
    category: str
    display_name: str
    quarter: str
    national: FeeStats          # median, mean, p25, p75, min, max, n
    by_charter: dict[str, FeeStats]   # bank, credit_union
    by_tier: list[TierStats]          # 6 tiers
    by_district: list[DistrictStats]  # 12 districts
    trend: TrendData | None           # QoQ if snapshots exist
    sample_date: str

@dataclass
class DistrictComparisonData:
    category: str
    district: int
    district_name: str
    district_stats: FeeStats
    national_stats: FeeStats
    delta_pct: float
    beige_book_summary: str | None
    fred_indicators: list[IndicatorData]
    top_lowest: list[InstitutionFee]  # 5 lowest-fee institutions
```

Functions query SQLite directly (reusing existing `db.py` patterns):

- [x] Create `fee_crawler/generation/__init__.py`
- [x] Create `fee_crawler/generation/article_data.py` — data query layer (5 article types)
- [x] Create `fee_crawler/generation/templates.py` — section definitions per article type

### 2.3 LLM Prompt Templates (Decomposed Sections)

Each article type has explicit sections, each generated by a separate Claude call with its own data slice. This follows the DecomposedIR pattern (27% quality improvement vs monolithic generation).

5 article types:

1. **`national_benchmark`** — "Overdraft Fees in 2026: National Benchmark Report"
   - Sections: executive_summary, methodology, distribution, charter_comparison, tier_breakdown, geographic_variation, consumer_takeaway, disclaimer

2. **`district_comparison`** — "How Kansas City District Banks Compare on Monthly Maintenance Fees"
   - Sections: district_overview (Beige Book context), fee_landscape (local vs national), institution_breakdown, top_performers, economic_context (FRED), disclaimer

3. **`charter_comparison`** — "Credit Union vs Bank Fees: The Complete 2026 Comparison"
   - Sections: executive_summary, category_by_category (spotlight fees), where_cus_win, where_banks_win, methodology, disclaimer

4. **`top_10`** — "Top 10 Banks with the Lowest Wire Transfer Fees"
   - Sections: intro, ranked_list, methodology, caveats, disclaimer
   - **Review tier: 3** (names specific institutions)

5. **`quarterly_trend`** — "Q1 2026 Fee Trend Report: What Changed This Quarter"
   - Sections: executive_summary, biggest_movers, new_categories, methodology, disclaimer
   - Requires `fee_snapshots` data

**Grounding rules (enforced in system prompt):**
- LLM receives JSON data context, must not introduce any statistics not in context
- Citation markers: `[STAT:key_name]` replaced in post-processing with links
- Second LLM pass (Haiku) validates no hallucinated numbers
- Disclaimer section is static text, never LLM-generated

- [x] Create `fee_crawler/generation/prompts.py` — system prompt + per-section prompt builders
- [x] Create `fee_crawler/generation/generator.py` — orchestrator: query data → build prompts → call Claude → assemble → validate
- [x] Add fact-checking validation pass (Haiku model)

### 2.4 CLI Command

```bash
# Generate a single article
python -m fee_crawler generate-articles \
    --type national-benchmark \
    --category overdraft

# Generate all spotlight categories
python -m fee_crawler generate-articles \
    --type national-benchmark \
    --all-spotlight

# Generate district comparison
python -m fee_crawler generate-articles \
    --type district-comparison \
    --category monthly_maintenance \
    --district 10

# Dry run — outputs data context JSON only, no LLM calls
python -m fee_crawler generate-articles \
    --type national-benchmark \
    --category nsf \
    --dry-run

# Batch — use Anthropic Batch API (50% cost savings)
python -m fee_crawler generate-articles \
    --type national-benchmark \
    --all-spotlight \
    --batch
```

- [x] Create `fee_crawler/commands/generate_articles.py`
- [x] Register `generate-articles` in `fee_crawler/__main__.py`
- [x] Support `--dry-run`, `--all-spotlight`, `--limit` (batch deferred)

### 2.5 Article Review Admin UI

**Route:** `/admin/articles/`

List view:
- Table: title, type, category, status, review tier, generated date
- Filter by status (draft/review/approved/published/rejected)
- Sort by date

**Route:** `/admin/articles/[id]/`

Detail view:
- Rendered markdown preview
- Collapsible "Data Context" panel showing the exact JSON used
- Collapsible "Prompts Used" panel
- Review tier badge
- Actions: Approve, Reject, Request Revision, Publish
- Edit capability for minor prose tweaks (textarea with markdown preview)

- [x] Create `src/app/admin/articles/page.tsx` — article list
- [x] Create `src/app/admin/articles/[id]/page.tsx` — article detail + review
- [x] Create `src/app/admin/articles/actions.ts` — server actions (approve, reject, publish)
- [x] Add "Articles" to admin nav

### 2.6 Public Research Pages

**Route:** `/research/` — research hub listing published articles

**Route:** `/research/[slug]` — individual article page

- [x] Create `src/app/(public)/research/page.tsx` — article grid/list with category filters
- [x] Create `src/app/(public)/research/[slug]/page.tsx` — article page with JSON-LD Article schema
- [ ] Add dynamic OG image for research articles (title + key stat) — deferred
- [x] Add "Related Data" sidebar linking to relevant `/fees/[category]` pages

**Files to create (Phase 2):**

| File | Action |
|------|--------|
| `fee_crawler/generation/__init__.py` | Create |
| `fee_crawler/generation/article_data.py` | Create |
| `fee_crawler/generation/templates.py` | Create |
| `fee_crawler/generation/prompts.py` | Create |
| `fee_crawler/generation/generator.py` | Create |
| `fee_crawler/commands/generate_articles.py` | Create |
| `fee_crawler/__main__.py` | Modify (add command) |
| `fee_crawler/db.py` | Modify (add articles table) |
| `src/lib/crawler-db/articles.ts` | Create |
| `src/lib/crawler-db/types.ts` | Modify (add Article types) |
| `src/app/admin/articles/page.tsx` | Create |
| `src/app/admin/articles/[id]/page.tsx` | Create |
| `src/app/admin/articles/actions.ts` | Create |
| `src/app/(public)/research/page.tsx` | Create |
| `src/app/(public)/research/[slug]/page.tsx` | Create |

---

## Phase 3: Enterprise Data Products

**Goal:** Monetize the data platform with tiered access — free public content as lead generation, paid tiers for deeper access.

**Timeline:** 3-4 weeks

### 3.1 API Layer

**Route:** `/api/v1/` — read-only REST API, key-authenticated, rate-limited

Endpoints:
- `GET /api/v1/fees/:category` — national stats for a category
- `GET /api/v1/fees/:category/by-state/:state` — state-level stats
- `GET /api/v1/fees/:category/by-district/:id` — district-level stats
- `GET /api/v1/fees/:category/distribution` — full percentile distribution
- `GET /api/v1/institutions/:id/fees` — all fees for an institution
- `GET /api/v1/compare` — peer comparison (query params: charter, tier, district)

Authentication: API key in `Authorization: Bearer <key>` header. Keys stored in `api_keys` table with tier, rate limit, and usage tracking.

Rate limits by tier:
- Free: 100 calls/day (requires email registration)
- Professional ($49/mo): 1,000 calls/day
- Institution ($299/mo): 10,000 calls/day
- Enterprise: unlimited

- [ ] Create `src/app/api/v1/` route handlers
- [ ] Add `api_keys` and `api_usage` tables to schema
- [ ] Implement rate limiting middleware
- [ ] Create API documentation page at `/developers`

### 3.2 Peer Benchmarking Reports (PDF)

Paid product: Institution submits their fee schedule, gets a custom PDF report comparing their fees to peers.

- "Your overdraft fee of $35.00 is at the 72nd percentile among community banks in Fed District 7"
- Report includes all 49 categories with peer positioning
- Generated server-side using existing data + a simple PDF library (e.g., `@react-pdf/renderer`)

- [ ] Create `src/lib/report-generator.ts` — peer benchmarking PDF generation
- [ ] Create `/admin/reports/` for generating and managing reports
- [ ] Design report template (cover page, executive summary, category-by-category comparison)

### 3.3 Pricing & Access Tiers

| Tier | Price | Access |
|------|-------|--------|
| Free | $0 | Public pages, national medians, 5 spotlight categories |
| Professional | $49/mo | Full data, CSV export, API (1K/day), all 49 categories, trend data |
| Institution | $299/mo | Everything + peer benchmarking, district reports, API (10K/day) |
| Enterprise | Custom | Bulk API, white-label, consulting, custom peer groups |

One-time products:
- Annual "State of Bank Fees" report: $299 (consumer) / $999 (institutional)
- Custom peer benchmarking report: $500-2,000
- Custom dataset export: $1,000+

- [ ] Add Stripe integration for subscriptions
- [ ] Create pricing page at `/pricing`
- [ ] Create gated content middleware (check subscription tier)
- [ ] Create `/for-banks/` landing page targeting FI buyers

### 3.4 Email Capture & Nurture

- [ ] Replace dead `/api/request-access` endpoint with working server action
- [ ] Add email capture on gated content (annual report download)
- [ ] Set up email list (ConvertKit, Loops.so, or Resend)
- [ ] Create automated nurture sequence: research highlight → peer benchmark CTA → consulting CTA

---

## Phase 4: Content Cadence & Operations

**Goal:** Establish sustainable content rhythm that positions Bank Fee Index as the daily authority on bank fees.

### Content Calendar

| Frequency | Type | Example | Generation |
|-----------|------|---------|------------|
| Daily | Data tracker | "Overdraft Fee Tracker: Week of Feb 17" | Automated (ISR refresh) |
| 2x/week | Analysis article | "How Kansas City Banks Compare on NSF Fees" | LLM-generated, light review |
| Weekly | District roundup | "Fed District 10 Fee Roundup" | LLM-generated, light review |
| Monthly | Benchmark report | "Monthly Maintenance: Feb 2026 National Benchmark" | LLM-generated, full review |
| Quarterly | Trend analysis | "Q1 2026 Fee Trends: What Changed" | LLM-generated, full review |
| Annual | Flagship report | "State of Bank Fees in America: 2026" | Hand-crafted + LLM sections |

### Tiered Review Workflow

| Tier | Criteria | Reviewer | Time |
|------|----------|----------|------|
| 1 (Auto) | Aggregate stats only, no named institutions, spotlight categories | None (auto-publish) | 0 min |
| 2 (Light) | Names institutions OR has trend claims OR district comparisons | Editor | 15 min |
| 3 (Full) | Rankings, regulatory context mentions, quarterly/annual reports | Editor + compliance | 1-2 hrs |

### Required Disclaimers (hardcoded, never LLM-generated)

Every published page and article must include:

```
DATA SOURCING: Fee data sourced from Bank Fee Index, a proprietary database of
fee schedule documents collected from [N] US banks and credit unions as of [DATE].

COVERAGE: This analysis covers institutions from which fee data was successfully
extracted and may not be representative of the full market.

NOT ADVICE: This content is for informational purposes only and does not constitute
financial advice or a recommendation regarding any specific institution.

METHODOLOGY: Fee amounts reflect disclosed fee schedules and may not reflect
promotional rates, relationship pricing, or waived fees.

AI DISCLOSURE: Statistical analysis computed from source data. Narrative generated
with AI assistance and reviewed by editorial staff.
```

---

## Implementation Priority

```
Phase 1 (Weeks 1-3): Public Data Pages
  ├── 1.1 Route group + public layout
  ├── 1.2 Fee category hub pages (49)
  ├── 1.3 State breakdown pages (2,450)
  ├── 1.4 District hub pages (12)
  ├── 1.5 SEO infrastructure (sitemap, robots, JSON-LD, OG)
  └── 1.6 Revalidation webhook

Phase 2 (Weeks 4-6): Content Engine
  ├── 2.1 Articles DB schema
  ├── 2.2 Article data query layer (Python)
  ├── 2.3 LLM prompt templates (5 article types)
  ├── 2.4 CLI command (generate-articles)
  ├── 2.5 Admin article review UI
  └── 2.6 Public research pages

Phase 3 (Weeks 7-10): Enterprise Products
  ├── 3.1 API layer (v1)
  ├── 3.2 Peer benchmarking PDF reports
  ├── 3.3 Pricing & access tiers (Stripe)
  └── 3.4 Email capture & nurture

Phase 4 (Ongoing): Content Operations
  ├── Content calendar execution
  ├── SEO monitoring & optimization
  └── Enterprise sales funnel
```

---

## Key Architectural Decisions

1. **No CMS** — Articles stored as markdown in SQLite `articles` table, generated by Python CLI, rendered by Next.js. Keeps the entire stack in one repo with one database.

2. **Programmatic pages use existing DB queries** — No new data pipeline needed for Phase 1. `getNationalIndex()`, `getPeerIndex()`, `getDistrictMedianByCategory()` already return everything needed.

3. **LLM generates prose, not data** — All statistics are computed by Python/SQL before the LLM sees them. The LLM's only job is turning structured data into readable sentences. Fact-checking pass catches any hallucinated numbers.

4. **ISR over SSG** — With 3,000+ pages, build-on-demand with `revalidate` is the right choice. Featured categories (15) pre-generated at build time; everything else lazy.

5. **Route group `(public)`** — Cleanly separates public content from admin without changing existing `/admin/` routes. Public pages get their own layout with public nav/footer.

6. **Reuse chart components** — `FeeHistogram`, `FeeRangeChart`, `BreakdownChart`, `Sparkline` are already built and have zero admin coupling. They work directly in public pages.

---

## Success Metrics

| Metric | 3-month target | 6-month target |
|--------|---------------|----------------|
| Indexed pages | 500+ | 3,000+ |
| Organic monthly visits | 5,000 | 25,000 |
| Published articles | 30 | 120 |
| Email subscribers | 500 | 2,000 |
| API registered users | 50 | 200 |
| Paid subscribers | 5 | 25 |
| Enterprise leads | 3 | 15 |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Google thin content penalty on programmatic pages | Minimum 500 unique words per page; 30%+ content differentiation between similar pages; progressive rollout (100 pages → monitor → expand) |
| LLM hallucinating statistics | Grounded prompts with explicit DATA blocks; fact-checking validation pass; review tiers |
| Low maturity categories (insufficient data) | Show maturity badges; "provisional" disclaimer on pages with <10 approved observations |
| Regulatory risk (publishing financial data) | Standard disclaimers on every page; never generate financial advice; human review before publish |
| Single-person content bottleneck | Tier 1 articles auto-publish; Tier 2 is 15-min review; reserve Tier 3 for flagship content only |
