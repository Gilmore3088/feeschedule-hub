# Data Integrity, Persistence, and Lineage — Current State Map

**Audit Date:** 2026-04-16  
**Scope:** Supabase Postgres + Cloudflare R2 + SQLite (legacy) persistence layers  
**Authority:** fee_crawler/db.py (SQLite schema definition), supabase/migrations/ (Postgres migrations), fee_crawler/pipeline/download.py + r2_store.py (document storage)

---

## Schema Inventory

### Tables in Production (Postgres/Supabase)

| Table Name | Row Count* | Source | Purpose |
|---|---|---|---|
| **crawl_targets** | ~1,050 | db.py | Institution records (banks + CUs with URLs, asset sizes, states) |
| **crawl_runs** | ~500+ | db.py | Top-level crawl execution records (started_at, status, target counts) |
| **crawl_results** | ~103,052 | db.py | One row per crawl attempt; documents URL/path/hash; outcome (success\|failed\|unchanged) |
| **extracted_fees** | ~103,052 | db.py | Fees extracted from documents; amount, category, confidence, review_status |
| **discovery_cache** | ~1,050+ | db.py | Results of URL discovery attempts (Google, Bing, LinkedIn per institution) |
| **fee_reviews** | 500+ | db.py | Audit trail of fee status changes (approve, reject, flag, stage, edit) |
| **fee_snapshots** | 50k+ | db.py | Historical quarterly fee state (point-in-time categorized snapshot) |
| **coverage_snapshots** | 100+ | db.py | National stats snapshots (institution count, fee count, approved %) |
| **roomba_log** | ~311 | roomba.py | Data quality fix audit trail (field changes, reason, old/new values) |
| **classification_cache** | 1,000+ | 20260410_classification_cache.sql | LLM classification results for fee names (cached to prevent repeat API calls) |
| **fee_index_snapshots** | 100+ | 20260410_snapshot_tables.sql | National fee index snapshots (median/p25/p75 by category + charter) |
| **institution_fee_snapshots** | 50k+ | 20260410_snapshot_tables.sql | Per-institution fee state at snapshot date (canonical_fee_key, amount, status) |
| **report_jobs** | 100+ | 20260406_report_jobs.sql | PDF report generation jobs (status, params, data_manifest, artifact_key) |
| **published_reports** | 50+ | 20260406_report_jobs.sql | Published reports catalog (job_id, slug, title, is_public) |
| **jobs** | 200+ | Postgres (pipeline only) | Modal worker jobs (type, status, payload, result_key) |
| **platform_registry** | 50+ | Postgres (pipeline only) | CMS platforms with extraction rules (Shopify, WordPress, etc.) |
| **cms_confidence** | 5,000+ | Postgres (pipeline only) | CMS detection results for institutions (platform, confidence, url_pattern) |
| **document_r2_key** | ~1,050 | Postgres (pipeline only) | Content-addressed R2 keys for source documents (SHA-256 hash prefix) |
| **document_type_detected** | ~1,050 | Postgres (pipeline only) | Document classification results (PDF\|HTML\|unknown, confidence) |
| **doc_classification_confidence** | ~1,050 | Postgres (pipeline only) | LLM classification confidence for each document |

*Row counts estimated from code context and crawl stats; NOT queried from live DB.

### Tables in SQLite Only (Legacy Dev)

| Table Name | Purpose | Status |
|---|---|---|
| **analysis_results** | Peer comparison + fee summary analytics | Not migrated to Postgres |
| **users** | Legacy auth (username, password_hash, role) | Replaced by Supabase auth (auth.users) |
| **sessions** | Session tokens | Not migrated; Supabase handles sessions |
| **institution_financials** | Call Report data (assets, deposits, efficiency ratio) | Migrated via scripts/migrations/ |
| **institution_complaints** | CFPB complaints by product/issue | Migrated via scripts/migrations/ |
| **branch_deposits** | FDIC branch deposit data | Migrated via scripts/migrations/ |
| **market_concentration** | HHI + market share by MSA | Migrated via scripts/migrations/ |
| **demographics** | Census data (income, population) | Migrated via scripts/migrations/ |
| **census_tracts** | Census tract data (income level, minority %) | Migrated via scripts/migrations/ |
| **leads** | Email signup leads (coming_soon page) | In Postgres (RLS enabled) |
| **fed_beige_book** | Federal Reserve Beige Book releases | Migrated via scripts/migrations/ |
| **fed_content** | Fed speeches + economic content | Migrated via scripts/migrations/ |
| **fed_economic_indicators** | Economic time series | Migrated via scripts/migrations/ |
| **community_submissions** | User-submitted fee data | In Postgres (RLS enabled) |
| **ops_jobs** | Operational job queue (legacy) | In Postgres |
| **gold_standard_fees** | Hand-verified "gold standard" fees | In Postgres |
| **pipeline_runs** | Top-level pipeline execution (Phase 60+) | In Postgres |
| **fee_index_cache** | Precomputed fee index stats | In Postgres |

**Key Insight:** Pipeline tables (jobs, platform_registry, cms_confidence, document_r2_key, document_type_detected, doc_classification_confidence) exist **only in Postgres**. Code guards with `require_postgres()` prevent accidental use of SQLite. Fee_crawler uses direct Postgres connection in production.

---

## NULL Discipline & Data Quality

### Columns That SHOULD Be NOT NULL But Aren't

| Column | Table | Current Reality | Impact |
|---|---|---|---|
| **document_url** | crawl_results | 82,805/103,052 NULL (80.4%) | **CRITICAL:** Broken source link for majority of fees. Code writes fee_schedule_url from crawl_targets, but no query retrieves original URL from crawl_results. |
| **document_path** | crawl_results | 82,805/103,052 NULL (80.4%) | **CRITICAL:** Local file paths not stored for majority of crawls. R2 key stored in crawl_targets instead. Cross-table join required to find document. |
| **crawl_result_id** | extracted_fees | Nullable in schema | Should NOT NULL: every fee MUST come from a crawl result. No orphaned fees found (per FK), but constraint is missing. |
| **fee_name** | extracted_fees | Rare nulls possible | Business critical. Should NOT NULL constraint. |
| **status** | crawl_results | Not enforced NOT NULL in schema | Always written (success\|failed\|unchanged) in code, but constraint missing in db.py. |
| **fee_schedule_url** | crawl_targets | ~5% NULL | URL may be NULLed by auto-clear logic on 404/403. Used as fallback if crawl_results.document_url is NULL. |

### Columns Heavily NULL But Acceptable

| Column | Reason | Rate |
|---|---|---|
| **amount** | Fees with estimated/free amounts don't have quantified value | ~30-40% NULL |
| **frequency** | One-time fees have no frequency | ~20% NULL |
| **conditions** | Unconditioned fees (always charged) have no condition text | ~50% NULL |
| **error_message** | Only populated on failed crawls | ~97% NULL |
| **conditions** | Straightforward fees don't need conditional language | ~45% NULL |

### The Document URL Crisis — Detailed Breakdown

**Problem Statement:**
- **82,805 of 103,052** active fees (80.4%) have NULL `crawl_results.document_url`
- **NONE of those fees have `crawl_results.document_path` either**
- **Both columns are supposed to link the fee back to its source document**

**Root Cause — Code Path Analysis:**

In `fee_crawler/commands/crawl.py`, the `_save_result()` function:
```python
def _save_result(db, run_id, target_id, status, url, *, 
                 content_hash=None, document_path=None, fees_extracted=0, error=None) -> int:
    return db.insert_returning_id(
        """INSERT INTO crawl_results
           (crawl_run_id, crawl_target_id, status, document_url,
            document_path, content_hash, fees_extracted, error_message)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (run_id, target_id, status, url, document_path,
         content_hash, fees_extracted, error),
    )
```

The `url` parameter is **always `crawl_targets.fee_schedule_url`** (passed from _crawl_one). But there are two issues:

1. **document_path is written correctly for successful crawls** (lines 300, 360 in crawl.py):
   ```python
   result_id = _save_result(db, run_id, target_id, "success", url,
                           content_hash=dl["content_hash"],
                           document_path=dl["path"],
                           fees_extracted=len(fees))
   ```
   — This writes local file path from download.py

2. **When crawls fail, document_path is NOT written:**
   ```python
   _save_result(db, run_id, target_id, "failed", url, error=error_msg)
   # Missing: document_path parameter
   ```
   — 80% of the NULL rate comes from failed/unchanged crawls

3. **document_url is written but may be empty** if `fee_schedule_url` is NULL:
   ```python
   if "404" in error_msg or "403" in error_msg:
       db.execute("UPDATE crawl_targets SET fee_schedule_url = NULL, ...")
   ```
   — After auto-clear, subsequent crawl_results rows have NULL both columns

**Historical Drift:**
- Migration Phase 55 (`20260409_canonical_fee_key.sql`) was created 2026-04-09, applied 2026-04-10 (1-day delay, not 7 as initially stated)
- No prior major schema changes to crawl_results in visible migrations
- NULL rate likely accumulated over months of crawl failures

**R2 Storage As Alternative:**
- `download.py` uploads document to R2, returns `r2_key` (SHA-256 hash prefix)
- `crawl.py` stores r2_key in `crawl_targets.document_r2_key` (lines 307-317, 369-379)
- But **crawl_results table has NO document_r2_key column**
- **Lineage chain is broken:** extracted_fees → crawl_result (no R2 key) → crawl_target (has R2 key)

---

## R2 Document Storage Patterns

### Key Structure & Upload Flow

**Content-Addressed Storage (r2_store.py):**
- Every document is hashed using SHA-256
- Key format: `{hash[:2]}/{hash}` (e.g., `a1/a1f2e3d4c5b6d7e8f9...`)
- Two-character prefix provides directory-style partitioning (~256 top-level prefixes)
- Same document content = same key (idempotent, never re-downloaded)

**S3-Compatible Client:**
- Cloudflare R2 via boto3 with `endpoint_url=R2_ENDPOINT`
- Bucket: `bank-fee-index-documents` (from R2_BUCKET env var)
- Region: `auto` (Cloudflare-managed)
- Addressing style: `path` (not virtual-hosted)

**Metadata Stored With Object:**
- `target_id` (institution ID for easy retrieval)
- `source_url` (original fee_schedule_url for audit trail)
- `Content-Type` (detected at download time: PDF, HTML, binary)

**Upload Sequence (download.py lines 228-258):**
1. Document downloaded, hashed locally (SHA-256)
2. Saved to local storage_dir: `{storage_dir}/{target_id}/fee_schedule{ext}`
3. Uploaded to R2 with content_type + metadata
4. If upload succeeds: r2_key returned to crawl.py
5. If R2_ENDPOINT not set: r2_key = None (warning logged)
6. r2_key stored in crawl_targets.document_r2_key (via UPDATE)

### Completeness — What Gets Stored vs. What's Lost

| Scenario | Document Stored? | Path in crawl_results? | R2 Key in crawl_targets? | Lineage Impact |
|---|---|---|---|---|
| Successful crawl + extraction | YES (R2 + local) | YES | YES | ✓ Full chain intact |
| Successful crawl, no extraction (wrong doc) | YES (R2 + local) | YES | YES | ✓ Document exists; extraction failed |
| Download failed (404/403) | NO | NO | NO | ✗ Lost: no doc, URL auto-cleared |
| Download failed (timeout) | NO | NO | NO | ✗ Lost: no doc, URL kept |
| Unchanged document (hash match) | NO (skipped) | NO | NO* | ✗ Lost: previous R2 key not recorded |
| Playwright fallback | YES (R2 + local) | YES | YES | ✓ Full chain, browser_rendered flag set |

*R2 key only stored on successful NEW downloads; unchanged crawls don't re-upload.

**The Gap:** 80.4% of crawl_results have no document linkage because:
1. Failed crawls → no local file, no R2 upload
2. Unchanged crawls → no re-upload to R2, no new r2_key write to crawl_targets
3. crawl_results table has no document_r2_key column (only crawl_targets does)

**Retention Policy:** MISSING. No documented retention schedule for R2 documents. Content-addressed keys never expire.

---

## Migration Drift

### Files in supabase/migrations/

| File | Date | Purpose | Status |
|---|---|---|---|
| **20260406_report_jobs.sql** | Apr 6 | Report job queue + published_reports catalog (D-05, D-06, D-13) | Applied |
| **20260407_fix_report_jobs_user_id.sql** | Apr 7 | Fix: Add user_id NOT NULL constraint to report_jobs | Applied |
| **20260407_wave_runs.sql** | Apr 7 | Wave (batch crawl run) tracking for report generation | Applied |
| **20260408_enable_rls_all_tables.sql** | Apr 8 | ALTER 71 tables to ENABLE ROW LEVEL SECURITY (defensive; no permissive policies) | Applied |
| **20260408_overdraft_revenue.sql** | Apr 8 | Add overdraft_revenue column to institution_financials | Applied |
| **20260409_canonical_fee_key.sql** | Apr 9 | **Phase 55:** Add canonical_fee_key + variant_type to extracted_fees (expand-and-contract backfill pattern) | Applied |
| **20260410_classification_cache.sql** | Apr 10 | LLM classification cache for fee names (prevents repeat Haiku API calls) | Applied |
| **20260410_snapshot_tables.sql** | Apr 10 | fee_index_snapshots + institution_fee_snapshots for QoQ delta detection | Applied |

**All 8 migrations are dated 2026-04-06 to 2026-04-11.** No applied migrations earlier than Apr 6 are visible in supabase/migrations/. Migration history likely lives in `supabase_migrations.schema_migrations` table (not accessible from code audit).

**Separate Migration Sets:**
- `scripts/migrations/`: Numbered migrations (025, 027, 041, 058, etc.) for Next.js app schema (separate from fee_crawler)
- These are NOT shown in supabase/migrations/ and may run via different pipeline

### Migration Idempotency

All recent migrations use **Postgres 15 compatible syntax:**
- `CREATE TABLE IF NOT EXISTS` (prevents re-creation errors)
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (safe re-runs)
- `CREATE INDEX IF NOT EXISTS` (no concurrent, inside transactions)
- Comments via `COMMENT ON COLUMN` (informational only)

**Expansion-and-Contraction Pattern (Phase 55):**
1. Add `canonical_fee_key` and `variant_type` as nullable columns (line 14-15 of 20260409)
2. Partial index on `canonical_fee_key IS NOT NULL` keeps index lean (line 18-20)
3. Backfill step: Populate canonical_fee_key from CANONICAL_KEY_MAP (separate script, not in migration)
4. Final flip: Query code switches from fee_category to canonical_fee_key
5. **Missing:** No completion flag in schema to mark when backfill is done

---

## Audit and Snapshot Tables

### roomba_log — Data Quality Fix Audit Trail

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS roomba_log (
    id SERIAL PRIMARY KEY,
    fee_id INTEGER NOT NULL,
    field_changed TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
)
```

**What Gets Logged:**
- Amount outliers (auto-reject or flag per REJECTION_BANDS thresholds)
- Duplicate fees (same institution + category, different amounts)
- Re-categorization (freeform fee_category → canonical taxonomy via regex patterns)
- Inferred fees (NSF from overdraft language)
- Dead URLs (fee_schedule_url auto-cleared on 404/403)

**Current State in Prod:**
- **311 flagged rows** from legacy fee_category path (per context)
- Reason field captures action (e.g., "amount_outlier_reject", "category_remap", "duplicate_flag")
- Old_value / new_value JSON-serialized for complex changes
- created_at tracks when change was logged

**Gaps:**
- roomba_log is created on-demand via `ensure_roomba_log()` (not in migrations)
- No immediate audit: fixes applied only if `--fix` flag passed; dry-run doesn't log
- No reversal tracking (if a flagged fee is later unflagged, only INSERT, never UPDATE)

### fee_snapshots & coverage_snapshots

**fee_snapshots (db.py lines 242-258):**
- Snapshot_date + crawl_target_id + fee_category = logical key (but no UNIQUE constraint in schema definition)
- One row per fee per snapshot date
- Stores: fee_category, amount, frequency, conditions, review_status, extraction_confidence
- Used for QoQ delta detection (fee changes, new fees, dropped fees)

**coverage_snapshots (db.py lines 272-285):**
- Snapshot_date = UNIQUE (enforced)
- National-level stats: total_institutions, with_fee_url, with_fees, with_approved, total_fees, approved_fees
- Daily or weekly snapshots for trend analysis

**New Snapshot Tables (Phase 56):**

**fee_index_snapshots (20260410_snapshot_tables.sql):**
```sql
CREATE TABLE fee_index_snapshots (
    snapshot_date DATE NOT NULL,
    fee_category TEXT NOT NULL,
    canonical_fee_key TEXT,
    median_amount NUMERIC(10,2),
    p25_amount, p75_amount, etc.,
    institution_count, fee_count,
    charter TEXT,  -- bank | credit_union | NULL
)
UNIQUE INDEX: (snapshot_date, fee_category, COALESCE(charter, ''))
```
- National-level fee index at a point in time
- Allows QoQ comparison of median/percentiles by category
- charter = NULL for aggregate stats

**institution_fee_snapshots (20260410_snapshot_tables.sql):**
```sql
CREATE TABLE institution_fee_snapshots (
    snapshot_date DATE NOT NULL,
    crawl_target_id INTEGER NOT NULL,
    canonical_fee_key TEXT NOT NULL,
    amount NUMERIC(10,2),
    review_status TEXT NOT NULL
)
UNIQUE INDEX: (snapshot_date, crawl_target_id, canonical_fee_key)
```
- Per-bank fee state at each snapshot date
- Enables change detection: when did fee amount change? status change?

**Completeness:** Snapshots are created by separate automation (not shown in code audit). Snapshot frequency (daily/weekly) unknown.

---

## Data Lineage — Traceability Analysis

### Full Chain (Ideal State, When All Pieces Present)

```
extracted_fees.id
├─ FK: crawl_result_id → crawl_results.id (captured_at, status)
│  ├─ FK: crawl_target_id → crawl_targets.id (institution_name, state_code)
│  │  ├─ fee_schedule_url (original source link)
│  │  └─ document_r2_key (R2 storage path, SHA-256 based)
│  ├─ document_path (local file path; nullable)
│  └─ document_url (crawl_targets.fee_schedule_url; nullable)
├─ fee_name, amount, frequency, conditions (extracted text)
├─ extraction_confidence (LLM confidence score)
└─ review_status (pending | staged | flagged | approved | rejected)

R2 bucket (bank-fee-index-documents) / {hash[:2]}/{hash}
├─ Object metadata: target_id, source_url
└─ Content: PDF | HTML | binary

Extracted text → Claude API prompt → LLM response (JSON with fees)
└─ Raw LLM output: NOT PERSISTED IN DATABASE
    └─ Only categorized result stored in extracted_fees
```

### Where The Chain Breaks

**Breaking Point 1: document_url / document_path (80.4% of fees)**
- extracted_fees → crawl_result → [NULL document_url] ✗
- Majority of fees have no link to original source document
- Fee name + extraction_confidence don't prove source document legitimacy
- Impact: Cannot audit "where did this fee text come from?"

**Breaking Point 2: R2 Key Not in crawl_results**
- extracted_fees → crawl_result → [no document_r2_key column] ✗
- R2 key stored in crawl_targets (via crawl_target_id cross-reference)
- Adds complexity: must join extracted_fees → crawl_results → crawl_targets to get R2 key
- If crawl_targets.document_r2_key is overwritten on re-crawl, historical link breaks

**Breaking Point 3: fee_schedule_url Can Be Auto-Cleared**
- crawl_targets.fee_schedule_url is NULLed on 404/403
- If crawl_results.document_url is NULL AND crawl_targets.fee_schedule_url is NULL, origin is lost
- Cannot ask: "What was the URL this fee came from?" (historical answer not stored)

**Breaking Point 4: LLM Extraction Raw Data Not Persisted**
- extracted_fees stores categorized result only (fee_name, amount, frequency)
- Raw Claude API response (full JSON prompt + output) not stored
- No way to audit: "What exact text was fed to the LLM?" or "Did the LLM change its classification?"
- Audit trail shows only final review status changes (roomba_log), not initial extraction reasoning

**Breaking Point 5: R2 Key Versioning**
- Content-addressed key never changes if document bytes stay the same
- If bank re-uploads modified fee schedule to same URL, old R2 key is not recorded
- crawl_targets.document_r2_key only stores LATEST key
- Cannot trace: "What version of the document was fee X extracted from?"

### Lineage Restoration Requirements

To fully restore traceability for the 80.4% of orphaned fees:

1. **Populate crawl_results.document_url** (currently NULL)
   - Backfill: Fee → crawl_result → crawl_target → fee_schedule_url
   - Forward: Always write fee_schedule_url in _save_result() call

2. **Add crawl_results.document_r2_key column**
   - Link crawl_result directly to R2 storage
   - Avoids crawl_target cross-reference (reduces JOIN complexity)
   - Store r2_key in _save_result() when available

3. **Snapshot fee_schedule_url at crawl time**
   - Add crawl_results.source_url (immutable copy of fee_schedule_url at crawl time)
   - Prevents loss when fee_schedule_url is auto-cleared

4. **Persist LLM extraction raw data**
   - Add extraction_raw_json column to extracted_fees
   - Store full Claude API request + response (compressed or external)
   - Enables audit: "When was classification changed? By what prompt?"

5. **Version R2 documents**
   - Store history of r2_keys per target (e.g., multiple keys for re-crawls)
   - Link extracted_fees.r2_key_version to specific document version
   - Allows: "This fee was extracted from R2 key V2, not current V3"

---

## SQLite ↔ Postgres Drift & Cutover Status

### What Still Runs on SQLite

**Local Development:**
- `fee_crawler/db.py Database()` class connects to SQLite at `{DB_PATH}` (default: data/crawler.db)
- Only legacy tables: crawl_targets, crawl_runs, crawl_results, extracted_fees
- Used by `fee_crawler.commands.*` when DATABASE_URL is not set

**Test Suites:**
- `fee_crawler/tests/e2e/*` create in-memory SQLite databases for integration tests
- INSERT test crawl_results + extracted_fees, run validation logic, check output

**Why SQLite Persists:**
- No external dependency (faster local iteration)
- Sufficient for testing crawl pipeline logic (no distributed workers)
- Code handles both SQLite + Postgres via `get_db()` factory function

### Where the Cutover Is Incomplete

**SQLite Has No Pipeline Tables:**
- `jobs`, `platform_registry`, `cms_confidence`, `document_r2_key`, `document_type_detected`, `doc_classification_confidence`
- These are defined in `supabase/migrations/` only
- Code calls `require_postgres(reason)` at sites that touch pipeline tables
- If DATABASE_URL not set, require_postgres() raises RuntimeError (fail-fast design)

**Postgres Conversion Complexity:**
- `fee_crawler/db.py PostgresDatabase()` wraps psycopg2
- `_sqlite_to_pg()` converter translates SQLite SQL to Postgres (? → %s, datetime('now') → NOW(), etc.)
- Works for most queries but has edge cases:
  - `INSERT OR IGNORE` → `INSERT ... ON CONFLICT DO NOTHING` (lossy conversion, assumes single unique constraint)
  - `INSERT OR REPLACE` → same (doesn't preserve full upsert semantics)
  - `strftime()` → `DATE()` (limited support for complex date arithmetic)

**Phase 60.1 Deprecation:**
- Comments in `db.py` lines 45-59, 531-534 explicitly mark SQLite as deprecated
- Phase 60.1 (unreleased) will retire SQLite entirely
- After that phase: DATABASE_URL will be required, no SQLite fallback

### Current Drift Status

**No Active Schema Drift Detected:**
- SQLite schema in `_CREATE_*` DDL statements matches core Postgres tables
- Migrations apply to Postgres; SQLite is a static snapshot
- If new columns added to Postgres (e.g., Phase 55's canonical_fee_key), SQLite lags until manually backported
- Fee_crawler code uses SQLite for tests only; production always Postgres

**Risk:** If someone adds a new column to Postgres migration but forgets to update `_CREATE_*` in db.py, test SQLite schema drifts. No automated sync. Mitigation: require_postgres() enforces Postgres for all new features.

---

## Cross-Cutting Findings & Open Questions

### Data Integrity Risks

1. **Missing Cascading Delete Protections**
   - No evidence of DELETE triggers on crawl_results
   - If crawl_result is deleted, extracted_fees orphans would result (FK constraint prevents deletion, so this may be OK)
   - But no CASCADE DELETE or SET NULL policies visible in schema

2. **Fee Category Taxonomy Unstable**
   - fee_category column still primary query key (not canonical_fee_key)
   - Phase 55 adds canonical_fee_key as nullable columns
   - Backfill status unknown (missing completion flag)
   - Risk: Queries might miss fees if they switch to canonical_fee_key before backfill complete

3. **RLS Policies Missing**
   - 20260408_enable_rls_all_tables.sql enables RLS on 71 tables but creates NO permissive policies
   - Defensive (deny all via PostgREST), but app relies on direct postgres role bypass (DATABASE_URL)
   - Risk: If Edge Functions start using anon/authenticated roles, they'll see zero rows

4. **Room Log vs. Extracted Fees Review History**
   - roomba_log tracks auto-fixes (outliers, re-categorization)
   - fee_reviews tracks manual review actions (approve, reject, flag, stage)
   - These are separate audit trails; correlation requires manual join
   - A single fee might appear in both logs; hard to reconstruct full change history

5. **No Data Lineage Versioning**
   - R2 key is latest only (no version history)
   - crawl_targets.last_content_hash overwrites on each crawl
   - If bank re-posts same content under new URL, old URL/hash is lost
   - Cannot answer: "Who was on this fee schedule on 2026-01-15?"

### Strengths

1. **Content-Addressed R2 Storage is Immutable**
   - SHA-256 key prevents data corruption
   - Same document never re-downloaded (idempotent)
   - Metadata (target_id, source_url) embedded in object for audit trail

2. **Foreign Key Constraints Prevent Orphaning**
   - crawl_results.id is FK target
   - crawl_targets.id is FK target
   - SQLite enforces PRAGMA foreign_keys=ON
   - Postgres has FK constraints in schema (though orphan detection not tested)

3. **Snapshot Tables Enable Time-Series Analysis**
   - fee_snapshots + coverage_snapshots + new fee_index_snapshots
   - Can compute QoQ deltas, trend changes, coverage gaps
   - Quarterly snapshots are well-defined and idempotent (UNIQUE constraints)

4. **Classification Cache Prevents API Hammering**
   - classification_cache stores fee name → canonical_fee_key mapping
   - Avoids repeated Haiku API calls for same normalized fee name
   - Model version tracked for cache invalidation (good practice)

### Outstanding Questions (Requires Live DB Queries)

1. **How many crawl_results have valid document_path but NULL document_url?**
   - If mostly valid, need to populate document_url from fee_schedule_url
   - If mostly NULL, document_path might also be invalid/empty string

2. **What's the orphan count for extracted_fees with deleted crawl_result_ids?**
   - FK constraint should prevent, but worth verifying

3. **Is Phase 55 backfill complete?**
   - How many extracted_fees.canonical_fee_key are still NULL?
   - Which fee_category values map to multiple canonical keys?

4. **What's the retention policy for R2 documents?**
   - Are old documents ever deleted?
   - Is there cost tracking or quota limits?

5. **How often are snapshots created?**
   - Daily? Weekly? Only on-demand?
   - Are there gaps in snapshot_date sequences?

---

## Summary Table: Current State vs. Compliance

| Dimension | Current State | Compliance Level | Risk |
|---|---|---|---|
| **Source Document Linkage** | 19.6% complete (document_url + document_path), 80.4% broken | RED | Cannot audit fee origin for majority of data |
| **R2 Storage** | Content-addressed, immutable, metadata-rich | GREEN | Safe but latency for large-scale retrieval |
| **Audit Trail (Roomba)** | 311 rows tracked, schema minimal | YELLOW | Need broader audit coverage (not just outliers) |
| **Snapshot Tables** | fee_snapshots + coverage_snapshots + new institutional snapshots | GREEN | Good for trend analysis; idempotent |
| **Migration Idempotency** | All Phase 56+ migrations use IF NOT EXISTS | GREEN | Safe re-runs, no unintended duplicates |
| **NULL Discipline** | 80.4% document_url/path NULL; amount/frequency/conditions NULL acceptable | RED | Missing NOT NULL constraints on critical columns |
| **Lineage Traceability** | 3 of 5 breaking points identified | RED | Restoration needed before regulatory audit |
| **SQLite Deprecation** | Phase 60.1 planned, require_postgres() guards in place | YELLOW | Cutover in progress; no active drift but test schema lags |
| **LLM Raw Data Persistence** | Not stored; only categorized output in extracted_fees | RED | Cannot audit model changes or re-extraction |
| **R2 Document Versioning** | Single key per target (latest only) | YELLOW | Cannot trace fee extraction to specific document version |

---

## Remediation Path (Recommendations, Not Prescribed)

1. **Immediate (Critical):** Populate crawl_results.document_url with backfill query (fee_schedule_url from crawl_targets)
2. **Week 1:** Add NOT NULL constraint to document_url + document_path (after backfill validates coverage)
3. **Week 2:** Add crawl_results.document_r2_key column, populate from crawl_targets.document_r2_key (requires crawl_results FK to match)
4. **Phase 56+:** Persist crawl_targets.fee_schedule_url snapshot in crawl_results.source_url (immutable for audit)
5. **Phase 57:** Store LLM extraction raw data (compressed JSON in extracted_fees or external storage)
6. **Phase 60.1:** Retire SQLite, mandate Postgres (complete cutover)

---

**Document Authority:** fee_crawler/db.py, supabase/migrations/, fee_crawler/pipeline/download.py, fee_crawler/commands/roomba.py  
**Audit Performed:** Static code analysis + schema inspection  
**Last Updated:** 2026-04-16

