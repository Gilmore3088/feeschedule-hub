# Bank Fee Index — Master Plan
### Rebuild · Accuracy · Product · Revenue
#### Written 2026-03-22 — Rebuild starts today

---

> **This is the single source of truth.** Everything else in `docs/rebuild/` is the detailed implementation reference. This document is the map. When in doubt about what to do next, come back here.

---

## Where You Stand Right Now

```
Data (as of 2026-03-15)
  71,923 institutions seeded (FDIC + NCUA)
  ~3,100 have a fee_schedule_url (4.3%)
  ~2,115 institutions with extracted fees (3%)
  65,287 total fee extractions
  229K+ research rows (FRED, BLS, NYFED, OFR, SOD, Census, Beige Book)
  MSA market concentration (HHI) computed for all 384 MSAs ← not yet surfaced
  Branch deposit data by institution by MSA ← not yet surfaced

Infrastructure
  Fly.io: web server + SQLite volume + crawler (all on one 512MB machine)
  GitHub Actions: weekly SSH cron, limit 100 institutions/run
  Stripe: configured, test mode
  3 domains live: feeinsight.com, bankfeeindex.com, thebankfeeindex.com
  Coming soon page active
  50 Next.js pages, 11 API routes, 14 server actions

Revenue
  $0 MRR
  Unknown number of leads (check the DB)
  0 paying customers
```

**The core problem in one sentence:** The pipeline processes 100 institutions per week against a 71,923-institution database, has never been run at real scale, and the data it has produced contains unknown accuracy issues because there is no ground truth to measure against.

---

## The Non-Technical Task That Comes First

**Read your CSI employment agreement today.**

You work at CSI. CSI's NuPoint core platform runs 10.1% of all US banks. You are building a financial intelligence product that could compete with or complement what CSI sells.

This takes 30 minutes. The three outcomes:
- **No conflict** (Bank Fee Index uses only public data, no CSI IP) → Document it, move on
- **Possible conflict** → Disclose proactively to your manager. Most employers are fine with clearly separate projects when disclosed. This is better than being surprised later.
- **Strategic opportunity** → CSI's open banking marketplace needs a fee intelligence layer. Pitch it internally. That path leads to a promotion or a buyout, not a lawsuit.

Do not raise money, sign customer contracts, or quit your job until this is resolved. Do not skip this.

---

## The Stack: Before → After

| Layer | Today | After Rebuild |
|---|---|---|
| Web hosting | Fly.io (shared with crawler) | **Vercel** |
| Database | SQLite + Litestream on Fly volume | **Supabase Postgres** |
| Python workers | GitHub Actions SSH cron, limit 100/run | **Modal** (serverless, async) |
| Document store | Fly.io local volume | **Cloudflare R2** (content-addressed) |
| LLM model | Claude Sonnet, real-time, 4096 tokens | **Claude Haiku, Batch API, 2048 tokens** |
| Job scheduling | GitHub Actions | **pg_cron** (built into Supabase) |
| HTTP client | `requests` + 2 sync threads | **httpx + asyncio**, 20 concurrent |
| Fee extraction | 100 institutions/week | 10,000 institutions/day |
| Estimated LLM cost (70K insts) | ~$1,155 | **~$62** |
| Monthly infra cost | ~$15 | ~$8–25 |

---

## The Two Things You're Building

These run in parallel and feed each other.

```
TRACK A: ACCURATE DATABASE          TRACK B: INFRASTRUCTURE REBUILD
────────────────────────────────    ────────────────────────────────
Fix the 8 accuracy problems         Migrate to Vercel + Supabase + Modal
Build ground truth (50 insts)       Async discovery → 12K+ fee URLs
Calibrate confidence thresholds     Haiku batch extraction at scale
Add completeness scoring            Time series snapshots (start NOW)
Expand aliases (categorization)     MSA analysis layer
                                    Platform rule extraction (free)
        ↓                                       ↓
  5,000 institutions you           35,000+ institutions with
  can honestly stand behind        extracted fees (50% coverage)
```

Track A work can start immediately on your existing 2,115 institutions. You don't need to wait for the rebuild.

---

## Part 1: Accuracy — Fix This First

The 8 accuracy problems, in order of impact. Each one produces fake or wrong data. Fix them in sequence.

### Problem 1 — Wrong Document (HIGHEST IMPACT)

`discover_urls` finds a URL and marks it as a fee schedule. But it's often:
- An account agreement (mentions fees but isn't the fee schedule)
- A Truth in Savings disclosure (APY rates, not fees)
- A loan disclosure or mortgage document
- A "disclosures" hub page that links to the real PDF

The LLM then extracts whatever dollar amounts it finds — loan APRs, minimum balance requirements, wire limits — and writes them as fees.

**Fix:** Build `fee_crawler/pipeline/classify_document.py` before the LLM call.

```python
def classify_document(text: str) -> dict:
    """
    Returns: { "is_fee_schedule": bool, "confidence": float,
                "doc_type_guess": str, "signals": list[str] }
    
    doc_type_guess: "fee_schedule" | "account_agreement" |
                    "tis_disclosure" | "rate_sheet" | "other"
    """
    lower = text.lower()
    score = 0.0
    signals = []

    # Strong positive: explicit fee schedule title
    TITLES = ["schedule of fees", "fee schedule", "schedule of charges",
              "consumer deposit account fees", "deposit account fee schedule",
              "personal fee schedule", "account fees and charges"]
    for t in TITLES:
        if t in lower:
            score += 0.4
            signals.append(f"title: {t}")
            break

    # Structure signals (fee schedules are tabular / list-based)
    for sig, w in [("per item", 0.1), ("per occurrence", 0.1),
                   ("per month", 0.1), ("waived if", 0.1),
                   ("fee waiver", 0.1), ("no charge", 0.05)]:
        if sig in lower:
            score += w
            signals.append(f"structure: {sig}")

    # Many distinct dollar amounts = fee schedule
    import re
    distinct = len(set(re.findall(r"\$\d+(?:\.\d{2})?", text)))
    if distinct >= 8:   score += 0.3; signals.append(f"amounts: {distinct}")
    elif distinct >= 4: score += 0.1; signals.append(f"amounts: {distinct}")

    # Negative signals: these are account agreements / rate sheets
    for sig, w in [("annual percentage rate", -0.3),
                   ("truth in lending", -0.3),
                   ("credit agreement", -0.3),
                   ("loan agreement", -0.3),
                   ("annual percentage yield", -0.2),
                   ("arbitration", -0.15),
                   ("governing law", -0.15)]:
        if sig in lower:
            score += w
            signals.append(f"negative: {sig}")

    score = max(0.0, min(1.0, score))

    if score >= 0.4:           doc_type = "fee_schedule"
    elif "truth in savings" in lower or " apy" in lower:
                               doc_type = "tis_disclosure"
    elif "annual percentage rate" in lower or "loan agreement" in lower:
                               doc_type = "account_agreement"
    else:                      doc_type = "other"

    return {"is_fee_schedule": score >= 0.4, "confidence": score,
            "doc_type_guess": doc_type, "signals": signals}
```

Wire into `crawl.py` after text extraction, before LLM:

```python
doc_class = classify_document(text)
if not doc_class["is_fee_schedule"]:
    # Wrong document — reset URL and re-queue for discovery
    db.execute("UPDATE crawl_targets SET fee_schedule_url = NULL, "
               "failure_reason = 'wrong_document' WHERE id = ?", (target_id,))
    return result  # skip LLM entirely
```

Add to schema:
```sql
ALTER TABLE crawl_targets ADD COLUMN document_type_detected TEXT;
ALTER TABLE crawl_targets ADD COLUMN doc_classification_confidence FLOAT;
```

### Problem 2 — LLM Extracts Non-Fees

The LLM sees "$10,000 wire limit" and writes a $10,000 wire fee. Sees "Minimum balance to open: $500" and writes a $500 fee.

**Fix A:** Tighten the extraction prompt with explicit negative examples:

```
DO NOT EXTRACT — these look like fees but are not:
- Minimum balance requirements ("Minimum balance to open: $500")
- Interest rates or APY values ("0.05% APY")  
- Daily transaction limits ("ATM limit: $500/day")
- Transfer limits ("Wire limit: $10,000")
- Account maximums or borrowing caps
- Share/membership par values at credit unions
- Loan amounts or credit limits
```

**Fix B:** Expand `NON_FEE_SUBSTRINGS` in `fee_amount_rules.py`:

```python
# Add these — currently missing:
"daily atm limit", "daily withdrawal limit", "daily purchase limit",
"daily transaction limit", "transfer limit", "wire limit", "atm limit",
"cash limit", "credit limit", "loan amount", "borrowing limit",
"maximum loan", " apr", "annual percentage", "interest rate",
"variable rate", "fixed rate", "required opening deposit",
"average daily balance", "daily balance required",
"fdic insured", "ncua insured", "member fdic", "federally insured",
```

### Problem 3 — Categorization Fallthrough

When a fee name doesn't match any alias in `FEE_NAME_ALIASES`, it gets stored as a raw cleaned string like `telephone_banking_inquiry_fee`. These fees have no bounds checking, can't be used in peer analysis, and clutter the review queue.

**Fix — measure then add aliases:**

```sql
-- Run this on your DB. The top results = missing aliases to add.
SELECT fee_category, COUNT(*) as n
FROM extracted_fees
WHERE review_status IN ('approved', 'staged')
  AND fee_category NOT IN (
    'monthly_maintenance','minimum_balance','early_closure','dormant_account',
    'account_research','paper_statement','estatement_fee','overdraft','nsf',
    'continuous_od','od_protection_transfer','od_line_of_credit','od_daily_cap',
    'nsf_daily_cap','atm_non_network','atm_international','card_replacement',
    'rush_card','card_foreign_txn','card_dispute','wire_domestic_outgoing',
    'wire_domestic_incoming','wire_intl_outgoing','wire_intl_incoming',
    'cashiers_check','money_order','check_printing','stop_payment',
    'counter_check','check_cashing','check_image','ach_origination',
    'ach_return','bill_pay','mobile_deposit','zelle_fee','coin_counting',
    'cash_advance','deposited_item_return','night_deposit','notary_fee',
    'safe_deposit_box','garnishment_levy','legal_process','account_verification',
    'balance_inquiry','late_payment','loan_origination','appraisal_fee'
  )
GROUP BY fee_category ORDER BY n DESC LIMIT 30;
```

Common aliases likely missing from `FEE_NAME_ALIASES`:

```python
# Add to fee_analysis.py:
"telephone banking fee":         "balance_inquiry",
"teller fee":                    "balance_inquiry",
"assisted transaction fee":      "balance_inquiry",
"live teller fee":               "balance_inquiry",
"excessive withdrawal fee":      "overdraft",
"excess withdrawal fee":         "overdraft",
"over limit fee":                "overdraft",
"return mail fee":               "account_research",
"undeliverable mail fee":        "account_research",
"remote deposit fee":            "mobile_deposit",
"remote deposit capture fee":    "mobile_deposit",
"rdc fee":                       "mobile_deposit",
"domestic wire fee":             "wire_domestic_outgoing",
"outgoing wire fee":             "wire_domestic_outgoing",
"wire fee":                      "wire_domestic_outgoing",
"signature guarantee":           "account_verification",
"medallion signature":           "account_verification",
"bank reference letter":         "account_verification",
```

### Problem 4 — Completeness Is Unmeasured

3 fees extracted from JPMorgan Chase and 3 from a $50M community bank look identical in the database. A large bank's fee schedule has 30–60 fees. Showing 3 is misleading.

**Fix:** Add `extraction_completeness_score` and `extraction_completeness_label` to `crawl_targets`.

```sql
ALTER TABLE crawl_targets ADD COLUMN extraction_completeness_score FLOAT;
ALTER TABLE crawl_targets ADD COLUMN extraction_completeness_label TEXT;
-- Values: 'complete' | 'partial' | 'likely_incomplete' | 'not_extracted'
```

Logic: check which core categories are present (OD, NSF, monthly maintenance, wire) and compare fee count to expected range for that asset tier. Full implementation in `docs/rebuild/11-accurate-database.md`.

Every public API response and UI display must include this label. Users need to know.

### Problem 5 — Pre-Screen Rejects Valid Documents

`_is_likely_fee_schedule()` requires 3+ fee keywords AND 2+ dollar amounts. A credit union that writes "thirty dollars" instead of "$30", or uses "service charge schedule" as the title, fails the pre-screen and never gets sent to the LLM.

**Fix:** Add a short-circuit for explicit fee schedule titles:

```python
DEFINITIVE_TITLES = [
    "schedule of fees", "fee schedule", "schedule of charges",
    "consumer fee schedule", "deposit account fees",
    "schedule of service charges", "consumer deposit account fees",
]
if any(t in lower for t in DEFINITIVE_TITLES):
    return True  # always try LLM — don't pre-screen out explicit fee schedules
```

Also loosen the fallback: require 2 keywords OR 1 dollar amount (was: 3 AND 2).
The document classifier now handles the real filtering — pre-screen just needs to exclude completely non-financial pages.

### Problem 6 — No Ground Truth

You have no way to measure your error rate. You don't know if you're at 70% accuracy or 95% accuracy.

**Fix:** Build a gold standard dataset of 50 manually verified institutions.

```sql
CREATE TABLE gold_standard_fees (
    id                BIGSERIAL PRIMARY KEY,
    crawl_target_id   BIGINT NOT NULL REFERENCES crawl_targets(id),
    fee_name          TEXT NOT NULL,
    amount            FLOAT,
    fee_category      TEXT,
    source_url        TEXT,       -- direct link to the fee schedule
    verified_by       TEXT,
    verified_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes             TEXT
);
```

Process: pick 50 institutions with extracted fees, go to their actual website, manually record every fee, compare to what you extracted. Calculate precision and recall.

**Target metrics for launch:** Precision ≥ 90%, Recall ≥ 70%, Category accuracy ≥ 85%.

You cannot credibly sell this data to B2B customers without a number here. "We think it's pretty accurate" is not a sales pitch. "90% precision measured against 50 manually verified institutions" is.

### Problem 7 — Data Goes Stale Silently

Approved fees sit in the database indefinitely. If a bank raises their OD fee from $35 to $28, your database still says $35. Nothing flags it.

**Fix:** Re-queue any institution where `last_success_at > 90 days` in the crawl worker:

```python
# Crawl priority order:
# 1. Has fee URL, never crawled (last_success_at IS NULL)
# 2. last_success_at > 90 days
# 3. Everything else
ORDER BY
    CASE WHEN last_success_at IS NULL THEN 0 ELSE 1 END ASC,
    last_success_at ASC NULLS FIRST,
    asset_size DESC NULLS LAST
```

Every public fee row must display `data_freshness_days`. Users need to know when the data was collected. Hiding this destroys trust when they find a discrepancy.

### Problem 8 — Confidence Scores Are Not Calibrated

Claude returns confidence 0.0–1.0 per fee. Your auto-approve threshold is 0.90. But you don't know if confidence 0.90 means 70% of those fees are correct or 99% are correct.

**Fix:** After building the gold standard, calibrate:

```python
# For each fee in the gold standard, compare to extracted.
# Group by confidence bucket (0.85-0.90, 0.90-0.95, 0.95-1.0).
# Measure actual precision per bucket.
# Set threshold at the bucket where precision hits 90%.
```

Until calibration is done, keep auto-approve at 0.90. Do not lower it to inflate approval rates. A wrong fee showing as approved is worse than a correct fee sitting in staged.

### Accuracy Build Order

| Order | Task | Estimated Time |
|---|---|---|
| **1** | `classify_document.py` + wire into `crawl.py` + schema columns | 4 hrs |
| **2** | Expand `NON_FEE_SUBSTRINGS` + update LLM prompt negative examples | 2 hrs |
| **3** | Run uncategorized query. Add top 30 aliases to `FEE_NAME_ALIASES` | 3 hrs |
| **4** | `extraction_completeness_score` — add column, compute on write | 3 hrs |
| **5** | Loosen pre-screen threshold + add definitive title short-circuit | 1 hr |
| **6** | Build `gold_standard_fees` table. Manually verify 50 institutions | 8 hrs (manual) |
| **7** | `evaluate_accuracy.py` — compare extracted vs gold standard | 3 hrs |
| **8** | Staleness re-queue logic in crawl worker | 2 hrs |
| **9** | Confidence calibration (requires gold standard to be complete) | 2 hrs |

**Total: ~28 hours of code + 8 hours of manual verification**

Track A (accuracy) runs on your existing data. Start today while Track B (infrastructure) is being set up. They don't block each other.

---

## Part 2: Infrastructure Rebuild

Full detail in `docs/rebuild/` Phase 0–5. Summary here.

### Why the Current Stack Fails at Scale

```
GitHub Actions SSH → Fly.io (512MB) → run-pipeline --limit 100 --workers 2
```

- 100 institutions/week × 71,923 institutions = **13.5 years to full coverage**
- The web server and crawler fight over 512MB RAM on the same machine
- 2-hour GitHub Actions timeout kills long crawls mid-run
- SQLite write lock means workers serialize even with `--workers 4`
- No job persistence — every run starts from scratch
- Discovery and LLM extraction compete for the same 2 threads

### Phase 0 — Foundation Setup (Today, ~5 hours)

Before touching a line of existing code:

```
☐ Supabase: provision project, enable pg_cron, copy DATABASE_URL
☐ Cloudflare R2: create bucket bank-fee-index-documents, copy credentials
☐ Modal: modal token new
☐ Vercel: link GitHub repo (do NOT deploy yet)
☐ GitHub secrets: add SUPABASE_URL, DATABASE_URL, R2_*, MODAL_*
☐ Pause crons: comment out schedule: blocks in both GitHub Actions workflows
☐ Baseline audit: run query below, save to docs/baseline-2026-03-22.md
☐ CSI: read employment agreement, write one paragraph conclusion
```

Baseline audit query:
```sql
SELECT 'total'             , COUNT(*)                    FROM crawl_targets
UNION ALL SELECT 'has_website', COUNT(*) FROM crawl_targets WHERE website_url IS NOT NULL
UNION ALL SELECT 'has_fee_url', COUNT(*) FROM crawl_targets WHERE fee_schedule_url IS NOT NULL
UNION ALL SELECT 'has_fees'   , COUNT(DISTINCT crawl_target_id) FROM extracted_fees
UNION ALL SELECT 'approved'   , COUNT(*) FROM extracted_fees WHERE review_status = 'approved'
UNION ALL SELECT 'staged'     , COUNT(*) FROM extracted_fees WHERE review_status = 'staged'
UNION ALL SELECT 'leads'      , COUNT(*) FROM leads
UNION ALL SELECT 'users'      , COUNT(*) FROM users WHERE role != 'admin';
```

**Gate:** `psql $DATABASE_URL -c "SELECT 1"` returns 1. All secrets in GitHub. Crons paused.

---

### Phase 1 — Database Migration (Weeks 1–2, ~15 hours)

**What changes:** SQLite → Supabase Postgres. Two new tables. 21 Next.js files become async.

New tables:
```sql
-- Job queue (the core new primitive — replaces GitHub Actions cron)
CREATE TABLE jobs (
    id           BIGSERIAL PRIMARY KEY,
    queue        TEXT NOT NULL,          -- 'discovery' | 'extract' | 'llm_batch'
    entity_id    TEXT NOT NULL,
    payload      JSONB,
    status       TEXT NOT NULL DEFAULT 'pending',
    priority     INT  NOT NULL DEFAULT 0,  -- asset_size / 1M
    attempts     INT  NOT NULL DEFAULT 0,
    max_attempts INT  NOT NULL DEFAULT 3,
    run_at       TIMESTAMPTZ DEFAULT NOW(),
    locked_by    TEXT,
    locked_at    TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error        TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_jobs_queue_pending
    ON jobs (queue, priority DESC, id ASC) WHERE status = 'pending';

-- Platform routing intelligence (replaces hardcoded logic)
CREATE TABLE platform_registry (
    platform          TEXT PRIMARY KEY,
    fee_paths         TEXT[],
    extraction_method TEXT NOT NULL DEFAULT 'llm',
    rule_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    validated_count   INT NOT NULL DEFAULT 0,
    institution_count INT,
    last_updated      TIMESTAMPTZ DEFAULT NOW()
);
```

**The 190 async conversions:** `better-sqlite3` is sync-only. Every `db.prepare().get()` becomes `await sql\`...\``. All 21 files in `src/lib/crawler-db/`. This is mechanical but it's the bulk of Phase 1 effort.

```typescript
// Before (better-sqlite3):
export function getStats() {
  return getDb().prepare('SELECT COUNT(*) as cnt FROM crawl_targets').get();
}
// After (postgres.js):
export async function getStats() {
  const [row] = await sql`SELECT COUNT(*) as cnt FROM crawl_targets`;
  return row;
}
```

**Gate:** All 50 pages load from Postgres. Auth works. Stripe webhook fires to Postgres. Fly.io still running.

---

### Phase 2 — Infrastructure Split (Week 3, ~8 hours)

**What changes:** Fly.io destroyed. Vercel serves Next.js. Modal runs Python workers.

**Dockerfile.web** (Node only, ~200MB vs ~800MB current):
```dockerfile
FROM node:20-slim AS builder
# ... Next.js build only
# NO Python, NO pdfplumber, NO crawler code
```

**Modal worker skeleton:**
```python
# fee_crawler/modal_app.py
import modal

image = (modal.Image.debian_slim(python_version="3.12")
    .apt_install("tesseract-ocr", "poppler-utils")  # OCR for scanned PDFs
    .pip_install_from_requirements("fee_crawler/requirements.txt"))

app = modal.App("bank-fee-index-workers", image=image)
secrets = [modal.Secret.from_name("bfi-secrets")]

@app.function(schedule=modal.Cron("0 2 * * *"), timeout=21600, secrets=secrets)
async def run_discovery(): ...     # 2am nightly, 6hr max, no LLM cost

@app.function(schedule=modal.Cron("0 3 * * *"), timeout=14400, secrets=secrets)
async def run_extraction(): ...    # 3am nightly, after discovery

@app.function(schedule=modal.Cron("0 1 * * *"), timeout=7200, secrets=secrets)
async def run_llm_batch(): ...     # 1am nightly, ~$20/day budget

@app.function(schedule=modal.Cron("0 6 * * *"), timeout=3600, secrets=secrets)
async def run_post_processing(): ...  # validate, categorize, auto-review
```

**Critical Stripe sequence:**
1. Update webhook endpoint URL in Stripe Dashboard to Vercel domain
2. Deploy Vercel, verify all pages load
3. Cut over DNS
4. Wait 48 hours
5. **Then** destroy Fly.io

**Gate:** `flyctl apps list` shows nothing. All 3 domains resolve on Vercel with SSL. Modal deployed. Test Stripe checkout completes.

---

### Phase 3 — Discovery at Scale (Weeks 3–5, compute: 5–10 days)

**What changes:** Async discovery worker sweeps 63,000 institutions. 8,000–15,000 new fee URLs.

The worker is `httpx + asyncio`, 20 concurrent tasks, pulls from `jobs` table using `FOR UPDATE SKIP LOCKED`. Platform-aware: if CMS is known (Banno, Q2, Drupal), probe only that platform's 3–5 paths instead of all 50+.

**Seed the queue (run once after Phase 2):**
```sql
INSERT INTO jobs (queue, entity_id, priority)
SELECT 'discovery', id::TEXT, COALESCE(asset_size, 0) / 1000000
FROM crawl_targets
WHERE website_url IS NOT NULL AND fee_schedule_url IS NULL
ORDER BY asset_size DESC NULLS LAST
ON CONFLICT DO NOTHING;
-- Expected: ~63,000 rows
```

**Also run NCUA enrichment:** ~5,900 credit unions have no `website_url`. NCUA mapping API fills most of them. Add those to the queue too.

**Start time series here — do not wait:** Every re-crawl from this point writes a snapshot:
```sql
INSERT INTO fee_snapshots (crawl_target_id, fee_category, amount, snapshot_date)
SELECT crawl_target_id, fee_category, amount, NOW()
FROM extracted_fees
WHERE crawl_target_id = $1 AND review_status = 'approved'
ON CONFLICT DO NOTHING;
```
Six months of history cannot be manufactured retroactively. Start now.

**Gate:** 12,000+ institutions have `fee_schedule_url`. Discovery queue < 500 pending.

---

### Phase 4 — Extraction Pipeline + MSA Layer (Weeks 5–8)

**What changes:** R2 document store. Async extraction. Haiku Batch API. MSA fee analysis live.

**Config change (immediate cost impact):**
```python
# fee_crawler/config.py
model: str = "claude-haiku-4-5-20251001"   # was claude-sonnet-4-5
max_tokens: int = 2048                       # was 4096
use_batch_api: bool = True                   # new
```

**Cost:** ~$0.002/institution (Haiku + 50% batch discount). Full 70K sweep: ~$62 total.

**LLM batch worker:** collects all pending `llm_batch` jobs nightly, groups by state (locality-aware batching reduces redundant path probing), submits to Anthropic Batch API, polls completion, writes to `extracted_fees`. Daily budget cap: $20 = 10,000 institutions/day.

**R2 document store:** Every downloaded PDF/HTML stored at its SHA-256 hash. Same document → same key → never re-download. Re-run extraction with a new prompt or model without hitting the bank's website.

**MSA analysis layer (the underused asset):** You already have `branch_deposits` and `market_concentration` (HHI) tables populated. The missing piece is surfacing them:

```sql
-- All institutions competing in a given MSA, with their fees
SELECT ct.institution_name, ct.charter_type,
       ef.fee_category, ef.amount,
       mc.hhi, mc.institution_count,
       bd.deposits::float / mc.total_deposits AS msa_market_share
FROM crawl_targets ct
JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
JOIN branch_deposits bd ON bd.cert = ct.cert_number
    AND bd.msa_code = $msa_code AND bd.year = (SELECT MAX(year) FROM branch_deposits)
JOIN market_concentration mc ON mc.msa_code = $msa_code AND mc.year = bd.year
WHERE ef.review_status = 'approved'
ORDER BY bd.deposits DESC;
```

This query is the foundation of the MSA Market Report product ($750/report).

New public pages:
- `/research/market/[msa-slug]` — "Atlanta Metro Bank Fee Landscape"
- 384 MSAs × meaningful search traffic = SEO compounding

**Gate:** 12,000+ institutions with fees. Nightly batch pipeline running. R2 has 5,000+ objects. MSA query returns data.

---

### Phase 5 — Platform Rules + 50% Coverage (Weeks 8–12, ongoing)

**What changes:** Rule-based extraction for known CMS platforms (free). Second discovery pass with Playwright. 35,000+ institutions with approved fees.

Platform rule priority:
| Platform | Est. US Institutions | Validate First? |
|---|---|---|
| Jack Henry / Banno | ~1,100 | ✅ Start here |
| Q2 Banking | ~450 | ✅ Second |
| WordPress (PDF at known path) | ~2,000+ | ✅ Third |
| Drupal | ~800 | Fourth |

Process: extract 20 real Banno sites using LLM. Extract same sites using rules. If rules match LLM output at 90%+ precision: `UPDATE platform_registry SET rule_enabled = TRUE WHERE platform = 'banno'`. Every future Banno institution costs $0 to extract.

**Gate:** 35,000+ institutions with approved fees. 2+ platforms with `rule_enabled = TRUE`. Every US state has 100+ institutions with fees. Monthly LLM cost < $10.

---

## Part 3: The Products

These build on top of accurate, scaled data. Phases 4–5 unlock them.

### Product 1 — Time Series / Fee Change History (enable in Phase 3)

Not a separate product — it's the foundation everything else is built on. Start writing `fee_snapshots` today. In 6 months you can answer "Which banks raised their OD fee in Q3 2026?" That question is worth $25K/year to a bank regulator.

### Product 2 — Fee Change Alerts (launch in Phase 4)

**What:** Email alert when a monitored institution changes a fee.

**Who buys it:** Bank competitor intelligence teams, consultants monitoring clients.

**How it works:**
```sql
CREATE TABLE fee_alert_subscriptions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    crawl_target_id BIGINT NOT NULL REFERENCES crawl_targets(id),
    fee_categories  TEXT[],  -- NULL = all categories
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, crawl_target_id)
);
```
After each monthly re-crawl, Modal queries `fee_change_events` for subscribed institutions and sends digest emails via Resend.

**Pricing:** $50/month for 20 institutions monitored. Include in Professional seat license.

### Product 3 — Institution Fee Report Card (launch in Phase 4)

**What:** One-page PDF. "Here's how your fee schedule compares to your 50 closest peers."

**Content:** Your OD fee vs. peer median. Categories where you're above median (consumer risk). Categories where you're below (revenue opportunity). Peer group = 50 institutions closest by asset size, charter type, and state.

**Who buys it:** The institutions themselves. Every bank's marketing or compliance team. Consultants resell it.

**Pricing:** $250 per report (one-time). Include in Professional seat license. Generated on-demand by Modal, delivered by email within 5 minutes.

**Why it matters for sales:** The institution you generate it for is now a prospect. They've seen their data. That's the foot in the door.

### Product 4 — MSA Market Report (launch in Phase 5)

**What:** On-demand PDF for a given metro area. All institutions competing in that market, their fee structures, market concentration (HHI), who dominates deposits.

**Who buys it:**
- Banks planning to open branches in a new market
- De novo bank applicants (OCC requires market analysis)
- State banking regulators reviewing merger applications
- Local journalists and researchers

**Pricing:** $750 per report. Custom research for regulators: $2,500+.

**The MSA data you already have:** HHI computed for all 384 MSAs. Branch-level deposits by institution. Joining fee data to this is Phase 4 work.

### Product 5 — Data API with Free Tier (launch in Phase 5)

**Why the free tier matters:** Every fintech that builds on your free tier is distribution. When they get acquired, their buyer asks what data they're using. That's how Clearbit grew.

**Tiers:**
- Free: 100 calls/month, national medians, 6 spotlight categories
- Paid: $200/month, full access, institution-level, all 49 categories
- Enterprise: custom, MSA data, bulk export, webhook alerts

**What to build:**
- Rate limiting by API key (`api_keys` table already exists)
- Usage metering (`research_usage` table, extend for API)
- OpenAPI spec at `/api/v1/openapi.json`
- Real docs at `/api-docs` (page exists, needs content)

---

## Part 4: The Revenue Path

### Who Actually Pays

| Customer | Price | What They Buy | Sales Cycle |
|---|---|---|---|
| Bank/fintech consultants | $5K/yr | Seat license, peer analysis, exports | 2–4 weeks |
| Fintech comparison apps | $10–20K/yr | Data API license | 4–8 weeks |
| Institutions benchmarking themselves | $10–25K/yr | Seat + custom reports | 4–12 weeks |
| State banking regulators | $20–50K | Data contract, MSA reports | 90–180 days |
| Federal Reserve districts | $10–20K | Research data access | 90–180 days |
| Academic researchers | $1–5K/yr | Academic license | 2–4 weeks |

### The $100K Path

```
Month 1–2:   3 consultant/fintech early adopters at $5K/yr       = $15K ARR
Month 3–4:   Fee alert product + 20 customers at $600/yr         = $12K ARR
Month 4–5:   15 fee report cards at $250 each                    = $3.75K one-time
Month 5–6:   1 bank institutional license                         = $15K ARR
Month 7–9:   1 fintech API license                               = $15K ARR
Month 9–12:  1 state regulator or Fed district data contract      = $20–50K
─────────────────────────────────────────────────────────────────────────────
             12-month total:                                      ~$80–110K ARR
```

The regulator or fintech contract is the swing factor. One of those closes and you're there.

### The Sales Motion (Starting Today)

**Step 1:** Pull your leads table. Email every person personally. Not a newsletter. One real email: *"Hi [name], you signed up for early access. I'm about to launch and would love 20 minutes to show you what we've built. Does [day] work?"*

**Step 2:** Search LinkedIn for "community bank consultant" and "credit union fee analysis." Find 20 people. Connect and send a note: *"I run Bank Fee Index — systematic fee data across 70K US banks and CUs. Would love your perspective on what your clients actually need."* 

**Step 3:** The demo is the admin dashboard. Show peer analysis, fee catalog, district data, research agent. This is better than any deck.

**Step 4:** Choose your first customer carefully. A consultant shapes you toward peer analysis and exports (right). A consumer shapes you toward comparison features (wrong path for now).

### What to Not Build Right Now

These are in your plans folder but they wait:

- Mobile nav — B2B users are on desktop
- Consumer experience suite — B2B pays bills first
- More LLM article generation — coverage first
- Community submissions — needs credibility first
- White-label / branded output — wait for 2 customers asking for it
- Docling / TableFormer — Haiku handles tables well enough

---

## Part 5: The Moat

By month 12, if you execute, you have things that cannot be bought:

1. **12 months of fee change history** across 35,000 institutions — irreplaceable. Starts the day you write `fee_snapshots` for the first time.
2. **MSA competitive analysis** — fee data joined to deposit market share per metro area — unique dataset, nowhere else exists
3. **Validated platform extraction rules** for Banno, Q2, WordPress — free extraction forever for all future institutions on those platforms
4. **SEO authority** on bank fee search terms — built over 12 months, not 12 days
5. **Ground truth gold standard** — documented accuracy that B2B customers trust

Items 1 and 2 are the real moat. They compound with time. Everything else can be replicated with money.

---

## Today's Task List

Ordered. Do not skip ahead.

**Hours 1–2: Non-Technical**
- [ ] Read employment agreement. Write one paragraph conclusion. File it.
- [ ] Pull leads from DB. Open a blank email draft to each one. Don't send yet.

**Hours 2–4: Phase 0 Infrastructure**
- [ ] Provision Supabase project. Enable pg_cron extension. Copy `DATABASE_URL`.
- [ ] Create Cloudflare R2 bucket `bank-fee-index-documents`. Copy credentials.
- [ ] `modal token new`. Verify `modal run --help` works.
- [ ] Link Vercel project to GitHub repo. Do not deploy yet.
- [ ] Add all new secrets to GitHub repo settings.
- [ ] Comment out `schedule:` blocks in `crawl-pipeline.yml` and `refresh-data.yml`. Push.

**Hour 4: Baseline**
- [ ] Run baseline audit query against current SQLite on Fly.io.
- [ ] Save output to `docs/baseline-2026-03-22.md`. Commit.

**Hour 5: Accuracy Track A Starts**
- [ ] Create `fee_crawler/pipeline/classify_document.py` (code above).
- [ ] Add `document_type_detected` and `doc_classification_confidence` columns to schema.
- [ ] Wire `classify_document()` into `crawl.py` after text extraction.
- [ ] Run `python -m fee_crawler crawl --dry-run --limit 10` to confirm it doesn't crash.

**End of Day**
- [ ] Send the lead emails.
- [ ] `git push origin rebuild/backend-migration-plan`
- [ ] Tomorrow: Phase 1A — run Postgres schema migration against Supabase test project.

---

## Reference Index

All implementation detail lives in `docs/rebuild/`:

| File | Contents |
|---|---|
| `00-overview.md` | Stack comparison, hard rules |
| `01-tool-inventory.md` | What to deprecate, keep, and add |
| `02-risk-register.md` | 9 risks with mitigations |
| `03-phase-0-foundation.md` | Full Phase 0 task list |
| `04-phase-1-database.md` | Schema SQL, migration script, 21-file async conversion guide |
| `05-phase-2-infrastructure.md` | Dockerfile.web, Modal skeleton, Fly.io decommission sequence |
| `06-phase-3-discovery.md` | Full async discovery worker code |
| `07-phase-4-extraction.md` | R2 store, full LLM batch worker code |
| `08-phase-5-coverage.md` | Platform rule extractor, validation process |
| `09-appendix.md` | Full Postgres schema SQL, data migration script, monitoring queries |
| `10-master-roadmap.md` | Expanded product + revenue detail |
| `11-accurate-database.md` | Full accuracy problem writeups with complete code |

---

*Last updated: 2026-03-22. This is a living document — update it as decisions are made and milestones hit.*
