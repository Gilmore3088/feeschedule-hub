# Bank Fee Index: 2026 Product Roadmap

## Vision

Become the authoritative, publicly accessible source on US bank and credit union fees — serving consumers researching fees, financial institutions benchmarking pricing, analysts tracking trends, and developers building on fee data. The "Bloomberg Terminal for bank fees" at multiple price points.

**Where we are today:**
- 63,000+ fee extractions across 8,700+ institutions, 49 categories, 9 families
- Admin hub with 12 routes: Dashboard V2, Market Index Explorer, National/Peer Fee Index, Fee Catalog, Review queue, Districts, Articles
- 3,000+ programmatic public SEO pages (fees by category, state, district)
- LLM article generation pipeline (4 article types with SEO editorial + fact-checking)
- Financial enrichment: FDIC call reports, NCUA 5300, CFPB complaints, Fed Beige Book, FRED indicators
- Design system: Geist font, dark mode, skeletons, sparklines, admin cards

**Competitive position:**
- Enterprise players (Curinos at $50K+/yr, S&P/RateWatch) sell to banks — we serve everyone
- Consumer sites (NerdWallet, Bankrate) focus on affiliate referrals, not systematic fee data
- Survey firms (Moebs, MoneyRates) sample 100-5,000 institutions — we extract from 8,700+
- No one else has institution-level, 49-category fee extraction at this scale, publicly accessible

---

## Roadmap Overview

Six phases, ordered by dependency and impact. Each phase builds on the previous.

```
Phase 0: Foundation Hardening (prerequisites)
    |
Phase 1: Data Quality & Trust (auto-review, source transparency)
    |
Phase 2: Public Site Expansion (institution pages, comparisons, best-of lists)
    |
    +---> Phase 3: Content Engine Scale (quarterly reports, newsletter, tools)
    |         (parallel with Phase 2)
    |
Phase 4: API & Data Products (REST API, reports, exports)
    |
Phase 5: Monetization & Growth (Stripe, enterprise tiers, consulting)
```

---

## Phase 0: Foundation Hardening

**Goal:** Merge the test branch, set up CI, fix security issues, and establish the migration system. Everything else depends on this.

**Priority:** CRITICAL — do first

### 0.1 Merge Test Infrastructure

- [ ] Merge `feat/data-integrity-and-tests` branch into main (60 vitest + 60 pytest tests, singleton DB fix)
- [ ] Add `vitest` to package.json devDependencies
- [ ] Add `test` script to package.json: `"test": "vitest run"`
- [ ] Verify all 120 tests pass on main

**Files:** `package.json`, `vitest.config.ts`, `src/lib/*.test.ts`, `fee_crawler/tests/`

### 0.2 CI/CD Pipeline

- [ ] Create `.github/workflows/ci.yml` with:
  - Node.js build + lint + vitest (with fixture DB or mocked)
  - Python pytest (with fixture DB or mocked)
  - Run on PR to main
- [ ] Create a test fixture DB (`data/test.db`) with seed data for CI
- [ ] Add branch protection rules: require CI pass before merge

**Files:** `.github/workflows/ci.yml`, `data/test.db` (fixture)

### 0.3 Security Fixes

- [ ] Replace SHA-256 password hashing with bcrypt in `src/lib/auth.ts`
  - Install `bcryptjs` (pure JS, no native deps)
  - Update `hashPassword()` and `verifyPassword()` functions
  - Migrate existing password hashes (re-hash on next login)
- [ ] Set `secure: true` on session cookie for non-localhost deployments
- [ ] Add `SameSite: Lax` cookie attribute

**Files:** `src/lib/auth.ts`, `package.json`

### 0.4 Database Migration System

- [ ] Create `fee_crawler/migrations/` directory with numbered SQL files
- [ ] Add `migrations` tracking table: `(id, filename, applied_at)`
- [ ] Add `migrate` CLI command to `fee_crawler/__main__.py`
- [ ] Migrate existing schema-in-code to migration files (baseline migration)
- [ ] All future schema changes go through migration files

**Files:** `fee_crawler/migrations/*.sql`, `fee_crawler/commands/migrate.py`, `fee_crawler/__main__.py`

### 0.5 Taxonomy Sync Guard

- [ ] Add a vitest test that imports both Python taxonomy (via JSON export) and TypeScript taxonomy, asserts they match
- [ ] OR: Create a codegen script that generates `fee-taxonomy.ts` from `fee_analysis.py` as source of truth
- [ ] Update PRD to reflect correct count (49 categories, not 47)

**Files:** `src/lib/fee-taxonomy.test.ts` or `scripts/sync-taxonomy.ts`

---

## Phase 1: Data Quality & Trust

**Goal:** Make the data trustworthy enough for public consumption. Auto-approve the easy 87%, surface source documents, show data freshness.

**Priority:** HIGH — prerequisite for all public-facing and enterprise features

### 1.1 Auto-Review Rules (plan exists: `plans/feat-auto-review-rules.md`)

- [ ] **Phase 1 (one-line fix):** Demote `duplicate_fee_name` from `warning` to `info` severity in `validation.py` — instantly resolves 5,620 flagged fees (87% of backlog)
- [ ] **Phase 2:** Add `fee_crawler/fee_amount_rules.py` with per-category amount bounds (49 categories with min/max/ceiling/allows_zero)
- [ ] **Phase 3:** Enhance `determine_review_status()` to auto-stage fees that pass all checks with confidence >= 0.90
- [ ] Re-run `python3 -m fee_crawler validate` to apply new rules to existing data
- [ ] Add rule version tracking: `fee_amount_rules.VERSION` string stored in `validation_flags` JSON

**Files:** `fee_crawler/validation.py`, `fee_crawler/fee_amount_rules.py` (new), `fee_crawler/fee_analysis.py`

### 1.2 Source Transparency & Provenance (plan exists: `plans/feat-source-transparency-provenance.md`)

- [ ] Content-addressed document storage: rename files to `{hash[:16]}.{ext}` (preserves history)
- [ ] API route to serve cached documents: `src/app/api/documents/[...path]/route.ts`
  - Require auth, validate path against `crawl_results.document_path`
  - Protect against path traversal: strip `..`, validate path starts with expected prefix
- [ ] Extend DB queries to include source URLs, crawl timestamps, document links
- [ ] Add "Source & Provenance" card to institution detail page (`/admin/peers/[id]`)
- [ ] Add source attribution to fee detail page (`/admin/review/[id]`)
- [ ] Add inline categorization + analysis to crawl pipeline (categorize on insert, not as separate CLI step)

**Files:** `fee_crawler/pipeline/download.py`, `src/app/api/documents/[...path]/route.ts` (new), `src/lib/crawler-db/core.ts`, `src/app/admin/peers/[id]/page.tsx`, `src/app/admin/review/[id]/page.tsx`

### 1.3 Data Freshness on Public Pages

- [ ] Add "Last updated" timestamp to all public fee pages (derived from max `crawl_results.crawled_at` for displayed data)
- [ ] Add `getDataFreshness(category?, state?)` query to `src/lib/crawler-db/fees.ts`
- [ ] Show freshness badge: "Updated 3 days ago" or "Data from January 2026"
- [ ] Add disclaimer: "Verify current fees directly with your institution"

**Files:** `src/lib/crawler-db/fees.ts`, `src/app/(public)/fees/[category]/page.tsx`, `src/app/(public)/fees/[category]/by-state/[state]/page.tsx`

### 1.4 Public Data Policy Decision

- [ ] Decide: Should public pages show only approved fees, or approved + staged?
  - Current: shows pending + staged + approved (all non-rejected)
  - Recommended: approved + staged (exclude pending), with maturity badge visible
- [ ] Add observation count threshold: pages with < 5 observations show "Insufficient data" instead of statistics
- [ ] Filter "Lowest fees" tables to only show approved fees (prevents misextracted $0.50 values from appearing as "cheapest")

**Files:** `src/lib/crawler-db/fee-index.ts`, `src/app/(public)/fees/[category]/by-state/[state]/page.tsx`

### 1.5 Historical Fee Tracking

- [ ] Ensure `fee_snapshots` table is populated on every crawl run
- [ ] Define change detection logic: when re-crawl finds different amount for same institution+category, create `fee_change_events` row
- [ ] Add `getRecentFeeChanges(limit)` query for dashboard
- [ ] Surface fee change history on institution detail page

**Files:** `fee_crawler/pipeline/store.py`, `fee_crawler/db.py`, `src/lib/crawler-db/fees.ts`

### 1.6 Crawl Health Monitoring

- [ ] Surface `consecutive_failures` in admin dashboard (count of institutions with 3+ consecutive failures)
- [ ] Add `/admin/crawl-health` page showing: broken URLs, stale institutions (not crawled in 90+ days), success rate trends
- [ ] Add `--retry-failed` flag to `discover_urls` command for re-discovering broken URLs

**Files:** `src/app/admin/crawl-health/page.tsx` (new), `src/lib/crawler-db/dashboard.ts`, `fee_crawler/commands/discover_urls.py`

---

## Phase 2: Public Site Expansion

**Goal:** Build the high-value public pages that drive organic traffic. Institution profiles are the #1 priority (users search "Chase bank fees").

**Priority:** HIGH — primary growth driver

### 2.1 Institution Profile Pages

**Route:** `/institutions/[slug]/page.tsx`

- [ ] Design URL scheme: use slugified institution name + state code (e.g., `/institutions/chase-bank-ny`)
  - Add `slug` column to `crawl_targets` table (generated from name + state)
  - Fallback to numeric ID if slug not found
- [ ] Page content:
  - Institution name, charter type, state, city, asset size, Fed district
  - Full fee schedule table (all extracted fees, approved + staged only)
  - Percentile ranking vs. national medians per category
  - Charter/tier peer comparison (where does this institution rank?)
  - Source link: "Fee schedule from [URL], last verified [date]"
  - FDIC/NCUA financial summary (if enriched)
  - CFPB complaint summary (if available)
- [ ] `generateStaticParams()` for top 500 institutions by asset size
- [ ] `generateMetadata()` with institution name, state, fee count
- [ ] JSON-LD `BankOrCreditUnion` schema
- [ ] "Report an error" link (mailto or form that creates a DB record)

**Files:** `src/app/(public)/institutions/[slug]/page.tsx` (new), `src/lib/crawler-db/core.ts`, `fee_crawler/migrations/002_add_institution_slug.sql`

### 2.2 Head-to-Head Comparison Pages

**Route:** `/compare/page.tsx` (selection UI) + `/compare/[slugA]/vs/[slugB]/page.tsx` (result)

- [ ] Comparison selection UI: search/autocomplete for two institutions
- [ ] Comparison result page:
  - Side-by-side fee table for all overlapping categories
  - Categories where only one institution has data: show with "N/A" for the other
  - Delta column: which institution is cheaper per category, by how much
  - Summary: "Institution A is cheaper in 8 of 12 shared categories"
  - Charter/size context: "Comparing a $2.1B bank to a $450M credit union"
- [ ] Limit to 2 institutions initially (3+ adds significant UI complexity)
- [ ] SEO: `generateMetadata()` with both institution names
- [ ] Internal linking from institution profile pages: "Compare with similar institutions"

**Files:** `src/app/(public)/compare/page.tsx` (new), `src/app/(public)/compare/[slugA]/vs/[slugB]/page.tsx` (new), `src/lib/crawler-db/core.ts`

### 2.3 "Cheapest Fees" / Best-Of Lists

**Route:** `/fees/[category]/cheapest/page.tsx`

- [ ] Top 25 institutions with lowest fees in each category
- [ ] Filter: approved fees only, exclude $0 where `allows_zero = false`
- [ ] Segment by charter type (cheapest banks, cheapest credit unions)
- [ ] Disclaimer: "Rankings based on most recent fee schedule extraction. Fees may have changed. Verify directly with institution."
- [ ] Link to institution profile and source document
- [ ] `generateStaticParams()` for spotlight + core categories (15)

**Files:** `src/app/(public)/fees/[category]/cheapest/page.tsx` (new)

### 2.4 State Overview Pages

**Route:** `/states/[state]/page.tsx`

- [ ] All fee categories aggregated for one state
- [ ] State median vs. national median for each category (delta pills)
- [ ] Institution count in state, breakdown by charter type
- [ ] Top 5 largest institutions in state
- [ ] Link to per-category state pages (`/fees/[category]/by-state/[state]`)
- [ ] Map highlighting the state with neighboring states for context

**Files:** `src/app/(public)/states/[state]/page.tsx` (new), `src/lib/crawler-db/fees.ts`

### 2.5 SEO Infrastructure Improvements

- [ ] Add `BreadcrumbList` JSON-LD to all public pages (fee category, state, institution, district)
- [ ] Fix `temporalCoverage` in Dataset schema: compute from actual crawl date range, not hardcoded
- [ ] Add JSON-LD `Dataset` schema to state pages
- [ ] Add `FAQPage` schema to pages with FAQ sections
- [ ] Improve internal linking: "Related categories" (same family), "Nearby states", "Similar institutions"
- [ ] Add XML sitemap entries for new page types (institutions, comparisons, cheapest, states)

**Files:** `src/app/sitemap.ts`, all `(public)` page files

---

## Phase 3: Content Engine Scale (parallel with Phase 2)

**Goal:** Automate content production to build topical authority and earn backlinks. Target 2 articles/week.

### 3.1 Quarterly Fee Report

- [ ] Add `quarterly_report` article type to generation pipeline
  - Aggregate stats across all 49 categories
  - Quarter-over-quarter changes (requires 2+ quarters of `fee_snapshots`)
  - Notable movements: categories with largest median shifts
  - Charter type divergence: where banks vs CUs are diverging
- [ ] Design a branded PDF template (via `@react-pdf/renderer` or Puppeteer)
- [ ] Generate both markdown (for web) and PDF (for download/distribution)
- [ ] Publish to `/research/quarterly/[slug]` with PDF download link

**Files:** `fee_crawler/generation/article_data.py`, `fee_crawler/generation/templates.py`, `src/app/(public)/research/quarterly/[slug]/page.tsx` (new)

### 3.2 Content Calendar Automation

- [ ] Add `content-schedule` config file: which article types to generate, on what cadence
- [ ] Add `generate-scheduled` CLI command: reads schedule, generates due articles
- [ ] Cron-friendly: `python3 -m fee_crawler generate-scheduled` runs idempotently (skips already-generated)
- [ ] Schedule:
  - Weekly: 1 national benchmark (rotating through spotlight categories)
  - Biweekly: 1 charter comparison or district comparison
  - Quarterly: full quarterly report
  - On-demand: top-10 lists, regulatory analysis

**Files:** `fee_crawler/content_schedule.py` (new), `fee_crawler/commands/generate.py`

### 3.3 Email Newsletter

- [ ] Choose email provider: Resend (simple API, React email templates) or Buttondown (newsletter-native)
- [ ] Design email template: "Bank Fee Index Weekly" — top 3 fee changes, 1 featured article, data highlight
- [ ] Subscriber management:
  - Signup form on public pages (email only, double opt-in)
  - `newsletter_subscribers` table: email, confirmed_at, unsubscribed_at
  - CAN-SPAM compliant: unsubscribe link in every email
- [ ] Add `send-newsletter` CLI command
- [ ] Signup CTA on landing page, fee category pages, and research articles

**Files:** `src/app/api/newsletter/subscribe/route.ts` (new), `src/app/api/newsletter/unsubscribe/route.ts` (new), `fee_crawler/commands/newsletter.py` (new), `fee_crawler/migrations/003_newsletter_subscribers.sql`

### 3.4 Interactive Fee Calculator

**Route:** `/tools/fee-calculator/page.tsx`

- [ ] "What would you pay?" calculator:
  - User selects: state, institution size preference, usage patterns (overdrafts/month, ATM withdrawals/month, wire transfers/month)
  - Shows: estimated annual fee burden based on median fees in their segment
  - Compare: "You'd pay $X at a typical bank vs $Y at a typical credit union"
- [ ] Lead capture: "Get a detailed breakdown — enter your email"
- [ ] SEO target: "bank fee calculator 2026"

**Files:** `src/app/(public)/tools/fee-calculator/page.tsx` (new)

---

## Phase 4: API & Data Products

**Goal:** Build the REST API that enables developers and enterprise clients to access fee data programmatically.

**Depends on:** Phase 1 (data quality), Phase 0 (migration system)

### 4.1 API Foundation

- [ ] Create `src/app/api/v1/` route group
- [ ] Authentication: API key in `Authorization: Bearer <key>` header
  - `api_keys` table: id, key_hash, email, tier (free/pro/enterprise), created_at, revoked_at, last_used_at
  - Key generation: `crypto.randomUUID()` shown once on creation, stored as SHA-256 hash
  - Key rotation: generate new key, old key valid for 7-day grace period
  - Key revocation: set `revoked_at`, immediately invalid
- [ ] Rate limiting: in-memory counter per API key (reset hourly)
  - Free: 100 calls/day
  - Pro: 5,000 calls/day
  - Enterprise: 50,000 calls/day
  - Return `429 Too Many Requests` with `Retry-After` header
- [ ] Response format: `{ data, meta: { total, page, per_page }, links: { next, prev } }`
- [ ] Error format: `{ error: { code, message, details } }`
- [ ] OpenAPI spec: auto-generated or hand-authored YAML

**Files:** `src/app/api/v1/middleware.ts` (new), `src/lib/api-auth.ts` (new), `fee_crawler/migrations/004_api_keys.sql`

### 4.2 Core API Endpoints

```
# Free tier
GET /api/v1/fees                              # All 49 categories with national medians
GET /api/v1/fees/:category                    # Single category detail
GET /api/v1/fees/:category/distribution       # Histogram bucket data

# Pro tier
GET /api/v1/fees/:category/states             # State-level breakdown
GET /api/v1/fees/:category/states/:state      # Single state detail
GET /api/v1/fees/:category/districts          # Fed district breakdown
GET /api/v1/fees/:category/trends             # Historical trend (requires snapshots)

# Enterprise tier
GET /api/v1/institutions                      # Search/list institutions
GET /api/v1/institutions/:id                  # Full institution profile
GET /api/v1/institutions/:id/fees             # Institution's fee schedule
GET /api/v1/compare                           # Peer group comparison
  ?charter=bank&tier=community_mid,community_large&district=1,3
```

- [ ] Implement each endpoint as a Next.js route handler
- [ ] Cursor-based pagination for list endpoints
- [ ] `Cache-Control` headers: 1 hour for national data, 24 hours for institution data
- [ ] ETag support for conditional requests

**Files:** `src/app/api/v1/fees/route.ts`, `src/app/api/v1/fees/[category]/route.ts`, `src/app/api/v1/institutions/route.ts`, etc.

### 4.3 Developer Portal

**Route:** `/developers/page.tsx`

- [ ] API documentation with endpoint reference, example requests/responses
- [ ] API key self-service: register with email, get free tier key instantly
- [ ] Usage dashboard: calls today, calls this month, rate limit status
- [ ] Code examples: curl, Python, JavaScript, Ruby
- [ ] Changelog: versioned API changes

**Files:** `src/app/(public)/developers/page.tsx` (new), `src/app/(public)/developers/keys/page.tsx` (new)

### 4.4 Data Exports

- [ ] CSV export: already exists on admin pages, extend to API
- [ ] XLSX export: add `xlsx` package, format with headers and data types
- [ ] PDF peer benchmark reports:
  - Use `@react-pdf/renderer` or Puppeteer for generation
  - Branded template: institution name, peer group, fee comparison table, percentile chart
  - Async generation: return job ID, poll for completion, download when ready
- [ ] Export endpoints:
  ```
  GET /api/v1/export/fees.csv?category=overdraft&state=TX
  GET /api/v1/export/fees.xlsx?category=overdraft
  POST /api/v1/reports/peer-benchmark  (async, returns job ID)
  GET /api/v1/reports/:jobId/status
  GET /api/v1/reports/:jobId/download
  ```

**Files:** `src/app/api/v1/export/route.ts` (new), `src/app/api/v1/reports/route.ts` (new)

### 4.5 Webhook Notifications

- [ ] `webhooks` table: id, api_key_id, url, events (JSON array), secret, created_at, active
- [ ] Events: `fee.changed`, `crawl.completed`, `report.published`
- [ ] Payload: JSON with event type, timestamp, affected entity
- [ ] Delivery: HMAC-SHA256 signature in `X-Webhook-Signature` header
- [ ] Retry policy: 3 attempts with exponential backoff (1s, 10s, 60s)
- [ ] Webhook management in developer portal: add/edit/delete/test

**Files:** `fee_crawler/migrations/005_webhooks.sql`, `src/app/api/v1/webhooks/route.ts` (new), `src/lib/webhook-delivery.ts` (new)

---

## Phase 5: Monetization & Growth

**Goal:** Turn the product into a revenue-generating business.

**Depends on:** Phase 4 (API), Phase 2 (public site traffic)

### 5.1 Pricing & Billing

- [ ] Define pricing tiers:
  | Tier | Price | API Calls | Features |
  |------|-------|-----------|----------|
  | Free | $0/mo | 100/day | National medians, aggregate data |
  | Pro | $99/mo | 5,000/day | State/district data, trends, CSV export |
  | Enterprise | Custom | 50,000/day | Institution data, XLSX, PDF reports, webhooks, SLA |
- [ ] Stripe integration:
  - Checkout for Pro tier (Stripe Checkout Session)
  - Custom pricing form for Enterprise (sends to sales email)
  - Webhook handler for: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`
  - Grace period: 7 days after payment failure before downgrade
  - Proration: upgrade mid-cycle prorated, downgrade effective at period end
- [ ] Billing management page: current plan, usage, invoices, cancel

**Files:** `src/app/api/stripe/webhook/route.ts` (new), `src/app/(public)/pricing/page.tsx` (new), `fee_crawler/migrations/006_billing.sql`

### 5.2 Lead Capture Unification

- [ ] Consolidate three lead funnels into one:
  - Landing page "Request Access" form
  - `/waitlist` page
  - Developer portal registration
- [ ] Single `leads` table: email, name, institution, role, source, created_at, converted_at
- [ ] Lead notification: email to admin on new submission (via Resend or similar)
- [ ] Eventually deprecate `/waitlist` route (redirect to pricing page)

**Files:** `fee_crawler/migrations/007_leads.sql`, `src/app/api/leads/route.ts` (new)

### 5.3 Affiliate Revenue (Consumer Pages)

- [ ] Add "Open an Account" affiliate links on institution profile pages
- [ ] Add "Find a Cheaper Bank" CTA on fee category pages
- [ ] Track clicks: `affiliate_clicks` table with UTM parameters
- [ ] Partner with bank affiliate networks (Bankrate, LendingTree, etc.)
- [ ] Disclaimer: "We may earn a commission from partner links"

**Files:** `src/components/affiliate-cta.tsx` (new)

### 5.4 Institution Data Correction Flow

- [ ] "Report an error" form on public institution pages
- [ ] `data_corrections` table: institution_id, fee_id, reporter_email, description, status, resolved_at
- [ ] Admin page to review and action corrections
- [ ] Email notification to reporter when correction is resolved
- [ ] This builds trust and improves data quality simultaneously

**Files:** `src/app/api/corrections/route.ts` (new), `src/app/admin/corrections/page.tsx` (new), `fee_crawler/migrations/008_corrections.sql`

---

## Infrastructure Considerations

### SQLite Scalability Path

The current SQLite architecture works well for the admin tool and public pages (read-heavy). For the API tier:

- **Phase 4 (initial API):** Stay on SQLite. Use WAL mode (already enabled). Track API usage in an append-only log file, batch-insert to DB periodically. This handles up to ~1,000 API calls/day.
- **Phase 5 (scaled API):** If API usage exceeds 5,000 calls/day, evaluate migration to PostgreSQL (via Turso/libSQL for SQLite-compatible transition, or full Postgres migration).
- **Decision point:** Monitor API call volume for 2 months after launch. Migrate only if needed.

### Caching Strategy

- Public pages: `revalidate = 86400` (24 hours) — already implemented
- API responses: `Cache-Control: public, max-age=3600` for national data
- Dashboard: consider ISR with on-demand revalidation after crawl pipeline runs
- Add revalidation webhook: `POST /api/revalidate?tag=fees` triggered by Python pipeline after crawl

### Error Monitoring

- Add Sentry (free tier: 5K errors/month) for both Next.js frontend and Python pipeline
- Alert on: build failures, crawl error rate > 10%, API error rate > 1%
- Pipeline monitoring: log crawl success/failure rates, send daily summary email

---

## Timeline Estimates

| Phase | Scope | Dependency |
|-------|-------|------------|
| Phase 0: Foundation | Merge tests, CI, security, migrations | None |
| Phase 1: Data Quality | Auto-review, source transparency, freshness | Phase 0 |
| Phase 2: Public Site | Institution pages, comparisons, best-of, states | Phase 1 |
| Phase 3: Content Scale | Quarterly reports, newsletter, calculator | Phase 1 (parallel with 2) |
| Phase 4: API | REST API, developer portal, exports, webhooks | Phase 1, partially Phase 2 |
| Phase 5: Monetization | Stripe, pricing, affiliates, corrections | Phase 4 |

---

## Success Metrics

| Metric | Current | Phase 1 Target | Phase 3 Target | Phase 5 Target |
|--------|---------|----------------|----------------|----------------|
| Institutions crawled | 8,700 | 8,700 | 9,500+ | 10,000+ |
| Fee extractions | 63,000 | 63,000 | 70,000+ | 80,000+ |
| Approved fees (%) | ~90% | 95%+ | 97%+ | 99%+ |
| Public pages indexed | ~3,000 | 3,500+ | 12,000+ | 15,000+ |
| Organic monthly visits | 0 | — | 5,000+ | 25,000+ |
| Research articles published | 5 | 15+ | 50+ | 100+ |
| API registered developers | 0 | 0 | 0 | 50+ |
| Monthly recurring revenue | $0 | $0 | $0 | $5,000+ |

---

## Open Questions

1. **Database migration path:** Stay on SQLite through Phase 4, or migrate to Postgres before API launch?
2. **Institution URL scheme:** Slug (`/institutions/chase-bank-ny`) vs FDIC cert number (`/institutions/cert/628`) vs opaque ID?
3. **Public data scope:** Show only approved fees, or approved + staged with maturity indicators?
4. **Affiliate strategy:** Build affiliate partnerships in Phase 5, or earlier alongside public page expansion?
5. **Mobile app:** Is a mobile app (React Native) on the roadmap, or is mobile web sufficient?
6. **Regulatory content:** Should regulatory analysis articles require legal review before publication?

---

## Appendix: Existing Plans (Status)

| Plan | Status | Phase |
|------|--------|-------|
| `plans/feat-auto-review-rules.md` | Not started | Phase 1.1 |
| `plans/feat-source-transparency-provenance.md` | Not started | Phase 1.2 |
| `plans/feat-content-platform-strategy.md` | Phase 1-2 complete | Phase 3 |
| `plans/feat-enhance-data-enrichment-pipeline.md` | Largely complete | Done |
| `plans/feat-fed-district-commentary.md` | Complete | Done |
| `plans/feat-admin-hub-drill-down-navigation.md` | Complete | Done |
| `plans/feat-fee-catalog-ux-improvements.md` | Partially built | Phase 2 |
| `plans/refactor-dead-code-cleanup.md` | Complete | Done |
