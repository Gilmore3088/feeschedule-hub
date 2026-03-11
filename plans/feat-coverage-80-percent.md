# feat: Drive Fee Coverage from 3% to 80%

> **Goal:** Go from ~2,100 institutions with fees (~3%) to 57,000+ (80%) across 71,923 total institutions
> **Date:** 2026-03-11
> **Priority:** Critical — blocks launch
> **Supersedes:** `feat-data-accuracy-richness-granularity.md` (incorporates all unchecked items)

## Current State (from live dashboard)

| Metric | Value |
|--------|-------|
| Total institutions | 71,923 (23,213 banks + 48,710 CUs) |
| With extracted fees | 2,115 (2.9%) |
| With fee URL | ~3,100 (4.3%) |
| With website, no fee URL | 5,541 |
| Fee URL but no fees | 485 |
| Crawl OK but 0 fees extracted | 471 |
| Crawl failing (consecutive) | 893 |
| Heatmap | Almost entirely red (<20% in every cell) |
| Failure reasons | 485 unclassified |

### Coverage by Tier (all under 8%)

| Tier | With Fees | Total | Coverage |
|------|-----------|-------|----------|
| Super Regional ($250B+) | 4 | 53 | 7.5% |
| Large Regional ($50B-$250B) | 6 | 192 | 3.1% |
| Regional ($10B-$50B) | 21 | 608 | 3.5% |
| Community ($1B-$10B) | 159 | 6,059 | 2.6% |
| Community ($300M-$1B) | 228 | 8,521 | 2.7% |
| Community (<$300M) | 1,697 | 56,490 | 3.0% |

## Root Cause Analysis

The pipeline has a **cascading funnel problem** — each stage loses institutions:

```
71,923 institutions seeded
  → ~66,000 have website URL (92%)      ← 5,900 have no website (mostly small CUs)
    → ~3,100 have fee_schedule_url (4.7%) ← URL DISCOVERY IS THE #1 BOTTLENECK
      → ~2,600 download succeeds (84%)   ← No retries, bot protection, URL rot
        → ~2,300 text extracted (88%)     ← No OCR for scanned PDFs
          → ~2,115 fees extracted (92%)   ← LLM failures, non-fee docs
```

**The single biggest lever is URL discovery.** 63,000+ institutions have a website but no discovered fee schedule URL. The discoverer currently tries only 14 common paths and 2-level deep link scanning.

### Why Discovery Fails (ranked by frequency)

1. **Non-standard URL paths** (~40%): Banks use paths like `/personal-banking/checking/fees-and-charges` not `/fees`
2. **No sitemap parsing** (~15%): Many bank sites have sitemaps listing fee schedule PDFs
3. **Fee schedule behind JS rendering** (~10%): SPAs return empty HTML to `requests.get()`
4. **Login-required content** (~10%): Fee schedule is behind authentication
5. **Shallow scan depth** (~10%): Fee pages are 3+ clicks from homepage
6. **Conservative PDF filtering** (~5%): Valid PDFs rejected because URL path lacks fee keywords
7. **No search engine fallback** (~10%): Google `site:bank.com "fee schedule"` would find many

### Why Extraction Fails (for those with URLs)

1. **Scanned PDFs** (37%): pdfplumber returns empty text, no OCR fallback
2. **Wrong document** (20%): URL is account agreement, not fee schedule
3. **Bot protection** (15%): 403/captcha responses
4. **LLM returns 0 fees** (12%): Document has fees but LLM fails to extract
5. **Download errors** (10%): Timeouts, SSL errors, no retry logic
6. **Stale URLs** (6%): 404s from URL rot

## Strategy: Phased Coverage Ramp

### Target Milestones

| Phase | Target | Coverage | Timeline |
|-------|--------|----------|----------|
| Phase 1: Quick Wins | 5,000+ institutions | ~7% | 1-2 weeks |
| Phase 2: Discovery Engine | 15,000+ institutions | ~21% | 2-3 weeks |
| Phase 3: Scale Extraction | 35,000+ institutions | ~49% | 3-4 weeks |
| Phase 4: Long Tail | 57,000+ institutions | ~80% | 6-8 weeks |

---

## Phase 1: Quick Wins (3% → 7%)

Low-effort, high-impact fixes to the existing pipeline. No new dependencies.

### 1a. Implement Download Retries

`max_retries = 3` is configured but **never used** in `download.py`. Add exponential backoff.

```python
# fee_crawler/pipeline/download.py
# Add retry loop around requests.get() with:
# - 3 retries with 2s, 4s, 8s backoff
# - Retry on 429, 500, 502, 503, 504, ConnectionError, Timeout
# - Respect Retry-After header on 429
```

**Expected impact:** Recover ~130 institutions from transient download failures.

- [x] Add retry loop to `download_document()` in `fee_crawler/pipeline/download.py`
- [x] Use `tenacity` library: `@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2))`
- [x] Handle `Retry-After` header on 429 responses
- [x] Add timeout parameter to `requests.get()` (30s connect, 60s read)

### 1b. Expand Common Paths from 14 to 50+

The discoverer probes only 14 paths. Commit `f04da18` expanded to 42 but it's on a feature branch.

```python
# fee_crawler/pipeline/url_discoverer.py — COMMON_PATHS
# Add platform-specific patterns:
"/sites/default/files/fee-schedule.pdf",    # Drupal
"/wp-content/uploads/fee-schedule.pdf",     # WordPress
"/documents/fee-schedule.pdf",              # Generic CMS
"/personal-banking/fees",
"/consumer/fee-schedule",
"/membership/fee-schedule",                 # Credit unions
"/truth-in-savings",
"/reg-dd-disclosure",
"/accounts/fee-schedule",
"/legal/disclosures",
# ... 30+ more patterns
```

**Expected impact:** 10-15% more URL discoveries = ~6,000-9,000 new fee URLs.

- [x] Merge expanded path list from `feat/modular-scraper-v2` branch into discoverer
- [x] Add credit union-specific paths (`/membership/fees`, `/share-account-fees`, etc.)
- [x] Add CMS-specific patterns (Drupal, WordPress, Banno/Jack Henry, Q2)
- [x] Increase deep scan depth from 2 to 3 levels

### 1c. Add Sitemap Parsing

Parse `sitemap.xml` before path probing — many banks have complete sitemaps with PDF links.

```python
# fee_crawler/pipeline/url_discoverer.py — new method
# 1. Check robots.txt for Sitemap: directive
# 2. Fetch /sitemap.xml and /sitemap_index.xml
# 3. Parse <urlset> entries, filter by fee-related keywords
# 4. Score and rank matching URLs
```

- [x] Add `SitemapParser` to `url_discoverer.py`
- [x] Extract sitemap URLs from `robots.txt`
- [x] Parse both `<sitemapindex>` (follow children) and `<urlset>` formats
- [x] Filter URLs matching fee-related keywords in path
- [x] Insert as Step 0.5: after robots check, before path probing
- [x] If sitemap finds a hit, skip path probing entirely

**Expected impact:** 5-10% more discoveries = ~3,000-6,000 new fee URLs.

### 1d. OCR Fallback for Scanned PDFs

`extract_pdf.py` uses only pdfplumber. Commit `3c5253a` added OCR but it's on a feature branch.

- [x] Add OCR fallback when pdfplumber returns < 50 chars of text
- [x] Use `pdf2image` (poppler) to convert pages to images at 300 DPI
- [x] Run `pytesseract` with `--psm 6` (table-optimized) on each page image
- [x] Limit to first 10 pages, reject PDFs > 20 pages before OCR
- [x] Add file size guard: reject > 50MB
- [x] Add per-page timeout (30s) and total timeout (120s)
- [ ] Document system dependencies: `tesseract-ocr`, `poppler-utils` (deferred to README update)

**Expected impact:** Recover ~180 institutions from "no text extracted" failures.

### 1e. Pre-LLM Content Screening

Avoid wasting API calls on non-fee documents.

- [x] Add `is_likely_fee_schedule(text)` function checking for 3+ fee keywords AND 2+ dollar amounts
- [x] Skip LLM extraction if screening fails — set `failure_reason` with classification
- [x] Log skipped documents for review

**Expected impact:** Save ~20% of API costs, reduce false positives.

### 1f. Circuit Breaker for Consecutive Failures

Institutions with 5+ consecutive failures keep getting retried every run.

- [x] Add `WHERE consecutive_failures < 5` to crawl target query in `crawl.py`
- [x] Add `--include-failing` flag to override for manual reruns
- [x] Log skipped institutions count at start of each run

### 1g. Fix Transaction Safety for Re-crawl

Currently, old fees are deleted before new ones are inserted without a transaction wrapper. A crash between delete and insert loses all data.

- [x] Wrap delete-old + insert-new in `BEGIN IMMEDIATE` / `ROLLBACK` in `crawl.py`
- [x] Ensure rollback on any insertion failure

---

## Phase 2: Discovery Engine (7% → 21%)

New infrastructure to dramatically expand URL discovery.

### 2a. Search API Fallback (SerpAPI)

For institutions where sitemap + paths + link scan all fail, use search as last resort.

```python
# fee_crawler/pipeline/search_discovery.py
# Query: site:{domain} "fee schedule" filetype:pdf
# Fallback: site:{domain} "schedule of fees" OR "truth in savings"
# Cache results in SQLite (30-day TTL)
# Cost: ~$0.01/search, ~$700 for full sweep of 70K institutions
```

- [ ] Create `fee_crawler/pipeline/search_discovery.py` with `SearchDiscoverer` class
- [ ] Gate behind `SERPAPI_API_KEY` env var
- [ ] Cache results in `discovery_cache` table (30-day TTL)
- [ ] Only invoke after sitemap + paths + link scan all fail
- [ ] Validate returned URLs match queried domain
- [ ] Add `--max-search-cost` flag with default $25/run
- [ ] Never log full API URL (strip query params from error messages)

### 2b. Playwright for JS-Rendered Sites

~10% of bank sites return empty HTML because they're SPAs.

- [ ] Add `PlaywrightPool` class with configurable pool size (default 3 contexts)
- [ ] Trigger when BeautifulSoup extraction yields < 100 chars of content
- [ ] Use `playwright-stealth` to avoid basic bot detection
- [ ] Block images/fonts/media via route interception (bandwidth savings)
- [ ] Use `wait_until="domcontentloaded"` (not `networkidle`)
- [ ] SSRF protection: block RFC 1918, link-local, cloud metadata IPs
- [ ] Fresh browser context per institution (no cookie/credential leakage)
- [ ] Cleanup: ensure Chromium processes are killed on crash

### 2c. Discovery Cache and Cascade

Track which discovery methods have been tried per institution for incremental improvement.

```sql
CREATE TABLE IF NOT EXISTS discovery_cache (
  id INTEGER PRIMARY KEY,
  crawl_target_id INTEGER NOT NULL,
  discovery_method TEXT NOT NULL,  -- sitemap, common_path, link_scan, deep_scan, search_api, playwright
  attempted_at TEXT NOT NULL,
  result TEXT NOT NULL,  -- found, not_found, error
  found_url TEXT,
  error_message TEXT,
  UNIQUE(crawl_target_id, discovery_method)
);
```

- [ ] Add `discovery_cache` table migration to `db.py`
- [ ] Implement `get_next_method()` cascade that skips recently-tried methods
- [ ] On re-discovery: only try methods not yet attempted or expired (30-day TTL)
- [ ] Add `--force` flag to retry all methods regardless of cache

### 2d. Per-Domain Rate Limiter

Current flat delay bypasses per-domain limits. Multiple workers can hit the same domain simultaneously.

- [ ] Create `fee_crawler/pipeline/rate_limiter.py` with `DomainRateLimiter` class
- [ ] Parse `Crawl-delay` from robots.txt (cap at 30s)
- [ ] Enforce 1 concurrent request per domain
- [ ] Add jitter: `delay * (1 + random.uniform(-0.2, 0.2))`
- [ ] Max 10 concurrent domains globally
- [ ] Integrate into both `url_discoverer.py` and `download.py`

### 2e. NCUA Website Enrichment

Many NCUA credit unions have no website URL in the bulk data.

- [ ] Run `backfill-ncua-urls` for all CUs with `website_url IS NULL`
- [ ] For CUs where NCUA API returns no website, try Google search: `"{cu_name}" credit union website`
- [ ] Track results in `discovery_cache`

### 2f. Call Report Fee Revenue Ingestion

FDIC Call Reports contain aggregate service charge revenue per bank (RIAD4080). Use for prioritization.

```
GET https://banks.data.fdic.gov/api/financials?filters=CERT:{cert}&fields=REPDTE,DEP,DEPDOM,SC
```

- [ ] Add `ingest-call-reports` command to fetch service charge revenue data
- [ ] Store in new `financial_data` table or extend `crawl_targets`
- [ ] Use fee revenue as priority signal: high-revenue banks with no fees = highest priority gaps
- [ ] Cross-validate: if extracted fees imply $2M revenue but Call Report shows $20M, flag as incomplete

---

## Phase 3: Scale Extraction (21% → 49%)

Improve extraction quality for the flood of new URLs from Phase 2.

### 3a. LLM Extraction Improvements

- [ ] Switch from free-form JSON to `tool_use` with schema enforcement (eliminates JSON parsing failures)
- [ ] Increase `MAX_TEXT_LENGTH` from 50K to 100K chars (Sonnet handles 200K context)
- [ ] Add institution context to prompt: name, charter type, document type
- [ ] Wrap extracted text in XML delimiters for prompt injection defense
- [ ] Add system prompt: "Only extract data from within document_content tags"
- [ ] Add retry on empty results with a more specific prompt ("Look for fee tables, schedules, or disclosures")
- [ ] Add anomaly detection: flag if single institution returns 100+ fees

### 3b. Expand Fee Categorization

380+ aliases cover ~75% of fees. Expand to 90%+.

- [ ] Run `SELECT fee_name, COUNT(*) FROM extracted_fees WHERE fee_category IS NULL GROUP BY fee_name ORDER BY 2 DESC LIMIT 200` to find top unmapped names
- [ ] Add ~165 new aliases (target 550+ total)
- [ ] Add regex-based pattern matching before fuzzy match (e.g., `.*wire.*transfer.*` → `wire_domestic_outgoing`)
- [ ] Add compound fee splitting: "Overdraft / NSF Fee $35" → two rows
- [ ] Fix "Minimum Balance Fee" false positive in `NON_FEE_SUBSTRINGS` (only flag when "fee" is NOT present)
- [ ] Add 12+ new non-fee substrings
- [ ] Run categorization inline during crawl (not as separate post-processing step)

### 3c. Automated Scheduling (Cron)

- [ ] Create `scripts/run_pipeline.sh` with lockfile (`flock -n`)
- [ ] Tiered frequency: monthly for $10B+, quarterly for $1B-$10B, semi-annually for <$1B
- [ ] API cost tracking with daily budget cap
- [ ] Structured JSON logs for monitoring
- [ ] Add `--max-cost` flag to limit per-run API spend
- [ ] PID-based stale lockfile detection

### 3d. Data Quality Dashboard

New `/admin/data-quality` page showing pipeline health.

- [ ] Coverage funnel visualization (institutions → websites → URLs → fees)
- [ ] Top 20 uncategorized fee names (actionable: "add alias" link)
- [ ] Stale data metrics: institutions not re-crawled in 90+ days
- [ ] Extraction success rate over time (by crawl run)
- [ ] Per-district and per-tier coverage progress charts
- [ ] Discovery method effectiveness (which methods find the most URLs)

---

## Phase 4: Long Tail (49% → 80%)

Community data, partnerships, and advanced extraction for hard-to-reach institutions.

### 4a. Public Fee Submission Form

Allow anyone to contribute fee data for institutions we can't crawl.

- [ ] New `/submit-fees` public page with institution autocomplete
- [ ] Simple form: 5 common fees (monthly maintenance, overdraft, NSF, ATM, wire)
- [ ] Source URL field (required)
- [ ] All submissions enter as `review_status = 'pending'`, `source = 'community'`
- [ ] Rate limiting and CAPTCHA to prevent abuse

### 4b. Statistical Outlier Detection

Cross-institutional validation to catch extraction errors at scale.

- [ ] For each category, compute IQR from national median
- [ ] Flag amounts > P75 + 3*IQR or < P25 - 3*IQR as `statistical_outlier`
- [ ] Detect decimal errors: amounts that are 10x or 100x the median
- [ ] Detect percentage confusion: "0.50%" extracted as $0.50
- [ ] Run after each crawl batch, flag outliers for review

### 4c. CMS Fingerprinting for Targeted Discovery

Knowing a bank's CMS platform (Drupal, WordPress, Banno, Q2) dramatically narrows URL patterns.

- [ ] Detect CMS from `X-Powered-By` header, `<meta name="generator">`, or URL patterns
- [ ] Maintain CMS-to-path mapping (e.g., Drupal → `/sites/default/files/*.pdf`)
- [ ] Skip irrelevant paths for known CMS platforms
- [ ] Track CMS platform in `crawl_targets` for analytics

### 4d. Advanced PDF Handling

For complex PDFs that pdfplumber + OCR can't handle.

- [ ] Evaluate Docling (IBM TableFormer) as fallback for mangled table extraction
- [ ] Add chunk-based extraction: split long documents, extract fees per chunk, deduplicate
- [ ] Handle password-protected PDFs: log as `failure_reason = 'pdf_protected'`

### 4e. Data Partnerships and Regulatory Sources

- [ ] Ingest NCUA 5300 Call Reports for credit union fee income data
- [ ] Ingest CFPB complaint data as prioritization signal
- [ ] Explore partnerships with Bankrate, NerdWallet, GOBankingRates for top-bank gap filling
- [ ] Monitor FINOS for open financial data initiatives

---

## Security Prerequisites

**These MUST be done before expanding the pipeline:**

- [ ] Remove hardcoded `changeme` passwords from `fee_crawler/config.py`
- [ ] Require seed passwords via env vars, reject `changeme` at startup
- [ ] Add HMAC-SHA256 signature to `bfi_sub` cookie (prevent forgery)
- [ ] Whitelist valid table names in `db.py:count()` (SQL injection fix)
- [ ] Update Python seeder to use scrypt matching Node.js `hashNewPassword()` format
- [ ] Add LLM prompt injection defense (XML delimiters, system prompt instruction)
- [ ] SSRF protection in download.py (reject private IPs, cloud metadata endpoints)

---

## Acceptance Criteria

### Phase 1 (Quick Wins → 7%)
- [ ] Download retries implemented with exponential backoff
- [ ] Common paths expanded to 50+
- [ ] Sitemap parsing runs before path probing
- [ ] OCR fallback produces text from scanned PDFs
- [ ] Pre-LLM screening rejects non-fee documents
- [ ] Circuit breaker skips institutions with 5+ consecutive failures
- [ ] Re-crawl wrapped in transaction (no data loss on crash)
- [ ] Full re-discovery + re-crawl run shows 5,000+ institutions with fees

### Phase 2 (Discovery Engine → 21%)
- [ ] SerpAPI integration finds URLs for 5,000+ previously-missed institutions
- [ ] Playwright renders JS sites and extracts fee URLs
- [ ] Discovery cache prevents re-trying exhausted methods
- [ ] Per-domain rate limiter prevents IP bans
- [ ] NCUA website enrichment fills 1,000+ missing URLs
- [ ] Call Report data ingested for prioritization
- [ ] Full re-discovery run shows 15,000+ institutions with fee URLs

### Phase 3 (Scale Extraction → 49%)
- [ ] LLM uses tool_use with schema enforcement
- [ ] Categorization rate above 90%
- [ ] Cron runs pipeline unattended with cost controls
- [ ] Data quality dashboard shows coverage funnel and trends
- [ ] 35,000+ institutions with extracted fees

### Phase 4 (Long Tail → 80%)
- [ ] Public submission form accepts community contributions
- [ ] Outlier detection flags extraction errors
- [ ] CMS fingerprinting improves discovery efficiency
- [ ] 57,000+ institutions with extracted fees (80% coverage)

---

## Key Files

| File | Role |
|------|------|
| `fee_crawler/pipeline/url_discoverer.py` | URL discovery (expand paths, add sitemap, add search) |
| `fee_crawler/pipeline/download.py` | Document download (add retries, SSRF protection) |
| `fee_crawler/pipeline/extract_pdf.py` | PDF text extraction (add OCR fallback) |
| `fee_crawler/pipeline/extract_llm.py` | LLM fee extraction (tool_use, XML delimiters) |
| `fee_crawler/pipeline/extract_html.py` | HTML text extraction |
| `fee_crawler/commands/crawl.py` | Main crawl pipeline orchestrator |
| `fee_crawler/commands/discover_urls.py` | Discovery CLI command |
| `fee_crawler/validation.py` | Post-extraction validation |
| `fee_crawler/fee_analysis.py` | Fee name normalization (380+ aliases) |
| `fee_crawler/fee_amount_rules.py` | Per-category amount bounds |
| `fee_crawler/db.py` | Schema, migrations |
| `fee_crawler/config.py` | Configuration (security fixes needed) |
| `src/lib/crawler-db/coverage.ts` | Coverage query module |
| `src/app/admin/ops/page.tsx` | Coverage ops dashboard |

## References

- Prior plan: `plans/feat-data-accuracy-richness-granularity.md` (deeper research, all items incorporated here)
- Coverage ops PR: https://github.com/Gilmore3088/feeschedule-hub/pull/7
- FDIC BankFind API: `https://banks.data.fdic.gov/api/`
- NCUA Mapping API: `https://mapping.ncua.gov/api/CreditUnionDetails/GetCreditUnionDetails/{charter}`
- SerpAPI: `https://serpapi.com/` ($150/mo for 15K searches)
- CFPB Complaints: `https://www.consumerfinance.gov/data-research/consumer-complaints/`
