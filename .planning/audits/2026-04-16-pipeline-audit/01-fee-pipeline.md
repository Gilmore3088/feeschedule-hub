# Fee Collection Pipeline — Current State Map

## Executive Summary

The fee collection pipeline is a 5-stage linear system that transforms regulatory institution data into extracted, categorized, and validated fees. The pipeline currently suffers from **critical data lineage loss** (80.4% of fees have NULL `document_url`) and **categorization mismatches** (~5-10% wrong category). This audit identifies the root causes and failure points per stage.

---

## Stage 0: Seed
### What it does
Populates the `crawl_targets` table with institution records from FDIC BankFind API and NCUA bulk data (quarterly Call Report ZIP). Enriches records with state codes, Fed districts, asset sizes, and website URLs.

**Inputs:**
- FDIC API (`/institutions`): ~4,000 active banks, returns CERT number, name, website, assets, state, Fed district
- NCUA ZIP (quarterly): FOICU.txt (institution metadata) + FS220.txt (total assets by ACCT_010)

**Outputs:**
- `crawl_targets` table: 4,000+ institutions with website_url (FDIC), most without website_url (NCUA initially)
- Status: all inserted as `status='active'` by default

**Code map:**
- Entry: `fee_crawler/__main__.py` → `cmd_seed()` (lines 17–26)
- Command: `fee_crawler/commands/seed_institutions.py`
  - `seed_fdic()` (lines 28–114): FDIC API loop, inserts 50 at a time, retries on dupe cert_number
  - `seed_ncua()` (lines 120–208): ZIP extraction, joins FOICU + FS220, inserts with cert_number as cu_num
  - Asset units: FDIC already in thousands; NCUA converted from whole dollars to thousands (line 165: `int(raw / 1000)`)

**DB writes:**
- `crawl_targets` (columns: institution_name, website_url, charter_type, state, state_code, city, asset_size, cert_number, source, fed_district)
- All other columns (asset_size_tier, consecutive_failures, last_crawl_at, last_content_hash, etc.) remain NULL until later stages
- No R2 keys written; no document URLs written

**Known failure modes:**
1. **Silent dupe skips** (lines 96–97, 203–204): Duplicates caught by UNIQUE constraint (source, cert_number) are silently skipped with no log/error message. Missing institutions are invisible.
2. **NCUA website_url NULL by design** (line 191): No website URL ingestion from NCUA data. URL discovery must be run separately with `backfill-ncua-urls` command.
3. **Asset size unit mismatch** (pre-audit): NCUA assets stored as thousands, but FOICU doesn't provide assets — only FS220 has ACCT_010. If a CU is in FOICU but not in FS220, asset_size is NULL.

**Gaps and orphaning risk:**
- **No lineage hooks**: Seed stage writes no cross-reference to the source data file or API call timestamp. Institution origin is implicit in the `source` field only.
- **No audit log**: Volume of dupes unknown; no count of skipped vs. inserted per run.
- **NCUA URL gap**: ~20% of NCUA CUs remain website_url=NULL after seed, requiring a separate enrichment command.

---

## Stage 1: Discover
### What it does
For each institution with a `website_url` but no `fee_schedule_url`, discovers the fee schedule document (PDF or HTML) by:
1. **Pattern probe**: regex-based link extraction from the website
2. **Google search probe**: if pattern fails, fallback to SerpAPI
3. **Playwright fallback**: JS-heavy sites requiring browser automation
4. **Discovery cache**: 30-day TTL per (institution, method) to avoid re-trying failed strategies

**Inputs:**
- `crawl_targets` with website_url populated
- Discovery cache (`discovery_cache` table) to skip methods tried within 30 days
- Config: rate limiter (domain-based polite crawling), search budget ($25 default)

**Outputs:**
- `crawl_targets.fee_schedule_url` updated
- `crawl_targets.document_type` set ('pdf' or 'html')
- `crawl_targets.last_crawl_at` updated
- `crawl_targets.consecutive_failures` incremented on error
- `discovery_cache` table: new rows for each method tried (found/not_found/error)

**Code map:**
- Entry: `fee_crawler/__main__.py` → `cmd_discover()` (lines 29–47)
- Command: `fee_crawler/commands/discover_urls.py`
  - `run()` (lines 186–291): orchestrates serial or concurrent discovery
  - `_discover_one()` (lines 76–184): worker function, calls `UrlDiscoverer` + `SearchDiscoverer` fallback
  - `_get_skip_methods()` (lines 27–51): reads `discovery_cache` with 30-day TTL, returns methods to skip
  - `_save_discovery_attempt()` (lines 54–73): upserts cache row per method
- Discovery methods: `fee_crawler/pipeline/url_discoverer.py` (pattern probing, Playwright)
- Search fallback: `fee_crawler/pipeline/search_discovery.py` (SerpAPI)

**DB writes:**
- `crawl_targets`: fee_schedule_url, document_type, last_crawl_at, last_success_at, consecutive_failures (on success or failure)
- `discovery_cache`: discovery_method, result (found/not_found/error), found_url, error_message, attempted_at

**Known failure modes:**
1. **Silent 404 clearing** (crawl.py lines 122–128, but relevant to discover failure path): When a discovered URL returns 404 during crawl, the fee_schedule_url is NULLed without re-discovery. This creates a "dead link" state but does not re-queue for discover. Requires manual `rediscover-failed` command.
2. **Rate limiter bypass** (concurrent mode, line 98): Concurrent discovery mode sets delay_seconds to 0.3 regardless of config, potentially causing bot detection on rate-limited domains.
3. **Search cost budget applies per-worker, not global** (lines 124–126): In concurrent mode, max_search_cost is passed to each worker independently, risking overspend if multiple workers hit the budget simultaneously.

**Gaps and orphaning risk:**
- **No lineage written**: discover_urls.py does not write which discovery method succeeded or the timestamp of discovery. Only `fee_schedule_url` and `document_type` are stored.
- **Cache not cascade-aware**: Discovery cache assumes 30 days is safe, but institution websites change. Expired cache entries are not re-tried; they must be manually force-cleared with `--force` flag.
- **Search cost is not tracked per-run**: Only the CLI reports search_cost; it is not persisted to the database, so cost accounting is incomplete.

---

## Stage 2: Fetch
### What it does
Downloads the fee schedule document (HTTP GET for HTML, PDF stream, or Playwright for JS-heavy sites). Checks content hash against `last_content_hash` to skip unchanged documents. Stores the content locally (temp) or in R2 (Cloudflare object storage).

**Inputs:**
- `crawl_targets.fee_schedule_url` and `document_type`
- `crawl_targets.last_content_hash` (to detect re-downloads)
- Config: rate limiter, R2 credentials, Playwright stealth mode (optional)

**Outputs:**
- `crawl_results` row with:
  - `document_url` ← fee_schedule_url from crawl_targets (WRITTEN HERE)
  - `document_path` ← local file path or None (WRITTEN HERE)
  - `content_hash` ← SHA256 of document bytes
  - `status` (success/failed/unchanged)
- R2 key stored in `document_r2_key` on crawl_targets (if upload succeeds)
- `crawl_targets.last_content_hash` updated
- `crawl_targets.last_crawl_at` updated

**Code map:**
- Entry: `fee_crawler/__main__.py` → `cmd_crawl()` (lines 50–66)
- Command: `fee_crawler/commands/crawl.py`
  - `_crawl_one()` (lines 44–350): worker function for single institution
  - **Download step** (line 79): `download_document()` from `fee_crawler/pipeline/download.py`
    - Handles HTTP GET, PDF streams, Playwright fallback, content hash check, R2 upload
    - Returns dict: {success, content, content_type, browser_rendered, path, r2_key, content_hash}
  - **Stealth retry on 403** (lines 84–113): if download fails with 403, retry with Playwright stealth mode before clearing URL
  - **Hash check** (lines 138–143): if unchanged, write crawl_results(unchanged) and return
  - **Text extraction** (lines 145–190): PDF via pdfplumber, HTML via BeautifulSoup
  - **_save_result()** (lines 973–993): INSERT crawl_results with document_url, document_path, content_hash

**DB writes:**
- `crawl_results` (crawl_run_id, crawl_target_id, status, **document_url**, **document_path**, content_hash, fees_extracted, error_message)
- `crawl_targets`: last_content_hash, last_crawl_at, last_success_at, consecutive_failures, document_r2_key (if R2 upload succeeds)

**Known failure modes:**
1. **404/403 clears URL without audit** (lines 122–128): Dead URLs are NULLed in crawl_targets but not logged to a dead_urls table. No operator visibility into which URLs died or when.
2. **R2 upload failure is silent** (download.py): If R2 upload fails, the document is not stored in object storage, but crawl_results is still written. document_r2_key remains NULL, and downstream queries fail to locate the document.
3. **Stealth retry only on 403** (line 86): Other auth errors (e.g., 401) or rate-limit errors (429) are not retried, potentially discarding valid URLs.
4. **Embedded PDF extraction failure silent** (lines 174–184): If HTML contains an embedded PDF and extraction fails, the error is caught and swallowed. No flag set on crawl_results.

**Gaps and orphaning risk:**
- **document_path is ephemeral** (line 248): Local file paths are written to crawl_results only if fetch uses local temp storage. If R2 upload succeeds, the local file is deleted, and document_path becomes the only proof that the document ever existed. If that crawl_result row is later deleted or migrated, the path is lost forever.
- **document_url is stable but not validated**: crawl_results.document_url is simply a copy of fee_schedule_url from crawl_targets at the time of fetch. If the URL becomes dead in subsequent stages, there is no reverse link from extracted_fees back to crawl_results, so fees are orphaned from their source.
- **R2 key not indexed**: No foreign key from extracted_fees to crawl_results.document_r2_key; document recovery requires a join through crawl_results.id.

---

## Stage 3: Extract
### What it does
Sends extracted text (from PDF or HTML) to Claude Haiku for structured fee extraction. Uses tool_use with schema enforcement to extract fee names, amounts, frequency, conditions, and confidence scores. Validates extracted fees against amount bounds and business rules. Assigns initial review_status (staged/approved/flagged/pending) based on confidence thresholds and validation flags.

**Inputs:**
- Text extracted from document (pdfplumber, BeautifulSoup, Playwright, OCR fallback)
- Config: confidence_auto_stage_threshold (default 0.85), approval_threshold (default 0.90)
- Validation rules: FEE_AMOUNT_RULES per category, FALLBACK_RULES for uncategorized

**Outputs:**
- `extracted_fees` rows with:
  - fee_name, amount, frequency, conditions
  - extraction_confidence (LLM confidence score)
  - validation_flags (JSON array of {rule, severity, message})
  - review_status: pending | staged | flagged | approved | rejected
  - fee_category, fee_family, canonical_fee_key (computed during insert)
  - crawl_result_id (link back to fetch stage)

**Code map:**
- Entry: lines 331–345 in crawl.py
- LLM extraction: `fee_crawler/pipeline/extract_llm.py`
  - `extract_fees_with_llm()` (lines 1–300): orchestrates Anthropic API call with tool_use schema
  - Tool schema (lines 68–100): define tool "extract_fees" with fee_name, amount, frequency, conditions, confidence
  - System prompt (line 18): "Only extract from <document_content> tags"
  - Retry logic (lines 256–300): if first call returns 0 fees, retry with more specific prompt
- Validation: `fee_crawler/validation.py`
  - `validate_and_classify_fees()` (lines 200+): loop through extracted fees, apply rules, set review_status
  - `_check_required_fields()` (lines 38–47): flag missing fee_name
  - `_check_amount_range()` (lines 50–88): category-specific bounds via FEE_AMOUNT_RULES
  - `_check_null_amount()` (lines 91–109): flag null amounts unless "free" keywords present
  - `_check_low_confidence()` (lines 112–122): flag if confidence < threshold
  - `_check_frequency()` (lines 139–149): flag if frequency not in VALID_FREQUENCIES
  - `_check_duplicate()` (lines 125–136): flag duplicate canonical names per institution
- Document classification (pre-check): `fee_crawler/pipeline/classify_document.py`
  - Runs before LLM extraction to skip non-fee documents (saves API cost)
  - Returns is_fee_schedule, doc_type_guess, confidence
  - If fails, fee_schedule_url is NULLed and institution is re-queued for discover

**DB writes:**
- `extracted_fees` INSERT with all fields above
- `crawl_results.fees_extracted` incremented
- Via merge: `fee_snapshots`, `fee_change_events` for recrawls

**Known failure modes:**
1. **LLM hallucination undetected** (extract_llm.py): Confidence score is LLM self-reported; no ground truth validation. Fees with high confidence but wrong amounts pass through.
2. **Validation rules are static** (fee_amount_rules.py): FEE_AMOUNT_RULES are hardcoded per category. If a new fee type appears (e.g., crypto-related), it has no bounds and falls to FALLBACK_RULES.
3. **Retry on zero fees is fragile** (extract_llm.py lines 274–300): If the retry prompt still returns 0 fees, they are reported as extracted=0, not an error. Silent failure.
4. **Platform rule extraction not tracked** (crawl.py line 286): If platform rule extraction succeeds, extracted_by is set to "{platform}_rule" but the rule_id or matched pattern is not stored. No auditability.

**Gaps and orphaning risk:**
- **No link to source text**: extracted_fees has crawl_result_id, which links to the document URL. But the raw extracted text is not persisted; if re-extraction is needed, the document must be re-fetched from R2.
- **Validation flags are lost in review_status transition**: validation_flags are JSON-serialized at insert time but not updated if fees are edited later. Manual edits overwrite flags without appending audit trail.
- **canonical_fee_key is computed during merge, not extract** (merge_fees.py line 148): `classify_fee()` is called during merge, not during insert. If merge is skipped or delayed, canonical_fee_key remains NULL.

---

## Stage 4: Categorize
### What it does
Batch assigns `fee_category` and `fee_family` to uncategorized extracted fees using the `CANONICAL_KEY_MAP` and FEE_NAME_ALIASES. Normalizes fee names via `normalize_fee_name()` (lowercasing, regex substitution, tokenization). Detects fee variants (rush, express, daily_cap) via `detect_variant_type()`.

**Inputs:**
- `extracted_fees` rows where fee_category IS NULL or --force re-categorization
- FEE_FAMILIES and CANONICAL_KEY_MAP from `fee_crawler/fee_analysis.py` (49 base categories, ~200 aliases)
- FEE_NAME_ALIASES: maps raw fee names → canonical category keys
- NEVER_MERGE_PAIRS: guard against incorrect category merges (nsf/overdraft, wire_domestic/wire_intl, etc.)

**Outputs:**
- `extracted_fees.fee_category` ← canonical key (e.g., "monthly_maintenance")
- `extracted_fees.fee_family` ← human-readable family (e.g., "Account Maintenance")
- `extracted_fees.canonical_fee_key` ← backfilled by separate `backfill-canonical` command

**Code map:**
- Entry: `fee_crawler/__main__.py` → `cmd_categorize()` (lines 141–150)
- Command: `fee_crawler/commands/categorize_fees.py`
  - `run()` (lines 20–125): fetch uncategorized rows, normalize names, match to canonical_set, write updates
  - `_all_canonical()` (lines 12–17): returns set of all valid canonical keys from FEE_FAMILIES
  - `normalize_fee_name()` (fee_analysis.py): lowercases, removes punctuation, splits into canonical token

**DB writes:**
- `extracted_fees` UPDATE: fee_category, fee_family (batch update, 1000 rows at a time)
- Stale categories are cleared if --force is used and row no longer matches
- No audit trail; just in-place updates

**Known failure modes:**
1. **Silent unmatched fees** (categorize_fees.py lines 56–57): If normalize_fee_name() returns a key not in CANONICAL_KEY_MAP, the fee is left uncategorized. No error; just skipped. Top unmatched names are printed but not logged.
2. **Alias collisions not detected** (fee_analysis.py): If two different canonical keys both map via aliases to the same normalized name, the last one wins. No conflict detection.
3. **NEVER_MERGE_PAIRS enforcement is tests-only** (test_never_merge.py): The guards are checked in unit tests but not at runtime. A misconfigured alias could merge nsf + overdraft without warning.
4. **Variant detection is optional** (backfill_canonical.py lines 159–228): `detect_variant_type()` is a separate backfill command, not run during extract or categorize. Variant types are often NULL in production.

**Gaps and orphaning risk:**
- **No lineage to aliases**: extracted_fees.fee_category does not record which alias matched. If an alias is removed or changed, previously categorized fees become stale and are invisible to audit.
- **Stale categories not flagged**: If --force is used and a fee name no longer matches any alias, fee_category is cleared but the fee is not re-reviewed. It reverts to pending status without notification.
- **Canonical backfill is decoupled** (backfill_canonical.py): canonical_fee_key is backfilled separately via SQL CASE statement. If CANONICAL_KEY_MAP changes, backfill must be re-run, risking orphaning old fees with stale keys.

---

## Stage 5: Validate
### What it does
Applies post-categorization validation rules and auto-reviews fees based on:
1. **Confidence thresholds**: fees with confidence >= 0.85 are staged (ready for manual approval); >= 0.90 are auto-approved
2. **Amount bounds**: category-specific min/max from FEE_AMOUNT_RULES; fees outside bounds are flagged or rejected
3. **NEVER_MERGE guards**: no category pair is created that violates the guard list
4. **Review status transitions**: staged → approved/rejected via auto-review logic or manual action

**Inputs:**
- `extracted_fees` with fee_category, extraction_confidence, amount, validation_flags
- FEE_AMOUNT_RULES and FALLBACK_RULES (min, max, hard_ceiling per category)
- Config: confidence_auto_stage_threshold, confidence_approve_threshold

**Outputs:**
- `extracted_fees.review_status` transition: pending → staged → approved | flagged → rejected
- `fee_reviews` audit trail: record every status change with actor, notes, timestamp
- No new columns; only status transitions and audit trail

**Code map:**
- Entry: `fee_crawler/__main__.py` → `cmd_auto_review()` (lines 81–89)
- Command: `fee_crawler/commands/auto_review.py`
  - `run()` (lines 23–123): fetch staged/flagged fees, apply _decide() logic, batch status transitions
  - `_decide()` (lines 142–194): for staged fees, approve if conf >= threshold AND amount in bounds; else reject if fails bounds or non-fee content
  - `_decide_flagged()` (lines 197–212): for flagged fees, reject if amount fails bounds
  - `_flush_batch()` (lines 126–139): write status transitions via `transition_fee_status()` state machine
- State machine: `fee_crawler/review_status.py`
  - `transition_fee_status()` (lines 1–100): validate state transition, write fee_reviews row, write extracted_fees.review_status
  - Allowed transitions: pending → staged | flagged → approved | rejected (strict FSM)

**DB writes:**
- `extracted_fees.review_status` UPDATE (in-place via state machine)
- `fee_reviews` INSERT: fee_id, action, user_id, actor, previous_status, new_status, notes, created_at (audit trail)

**Known failure modes:**
1. **Confidence score is LLM self-reported** (extract_llm.py): No re-validation of confidence scores post-extraction. A fee with 0.95 confidence but an obviously wrong amount (e.g., $999,999 for a monthly fee) is auto-approved.
2. **Amount bounds are static** (fee_amount_rules.py): FALLBACK_RULES (min=0, max=500, hard_ceiling=10000) are overly broad. A $500 fee might be reasonable for wire transfer but suspicious for an ATM fee.
3. **Duplicate detection only within same institution** (validation.py line 126): `_check_duplicate()` checks if canonical name already exists for same institution, but does not check if a nearly-identical fee exists at peer institutions. Outliers are not caught.
4. **Flagged fees can stay flagged forever** (auto_review.py): Flagged fees are only rejected if amount fails bounds. If flagged for "low confidence" only, they stay flagged indefinitely.

**Gaps and orphaning risk:**
- **Transitions are one-way**: review_status never reverts backward (e.g., approved → staged if re-extraction finds a change). Manual edits can override this, but auto-review cannot.
- **No compounding logic**: previous validation results are not stored per fee version. If a fee is edited 3 times, only the latest validation_flags are visible; history is lost.
- **NEVER_MERGE guards are not enforced**: Two fees can exist in the same institution with categories that violate NEVER_MERGE_PAIRS. The guard is tests-only.

---

## Cross-cutting Findings

### 1. Data Lineage Gaps — Root Cause of 80.4% NULL document_url

**Hypothesis:** The NULL document_url issue is not a data entry bug but a schema design issue:

- **Stage 2 (Fetch) writes document_url to crawl_results** correctly (line 989 in crawl.py)
- **Stage 3 (Extract) inserts extracted_fees with crawl_result_id** (foreign key to crawl_results)
- **The missing link**: There is no active query joining extracted_fees → crawl_results to materialize the document_url column on extracted_fees itself

**Evidence:**
- crawl_results.document_url is populated at fetch time (crawl.py line 989)
- extracted_fees.crawl_result_id is populated at extract time (crawl.py line 377)
- But extracted_fees has NO document_url column; it must be joined with crawl_results
- Upstream queries that assume extracted_fees.document_url exists will see NULL

**Why 80.4%?**
- Fees extracted during the initial crawl cycle have crawl_result_id set
- But if crawl_results rows are deleted or if data was migrated from SQLite (which may have lost the join), the link is broken
- Or: older code paths inserted fees WITHOUT setting crawl_result_id

**Solution path:**
1. Add a materialized `document_url` column to extracted_fees (nullable, can be populated retroactively)
2. Or: require all queries to join extracted_fees with crawl_results via crawl_result_id
3. Or: enforce a NOT NULL constraint on crawl_result_id to prevent orphaning

---

### 2. Where Rows Get Orphaned

**Seed stage:** Silent dupe skips leave no record of which institutions were rejected.

**Discover stage:** Dead URLs (404/403) are NULLed but not logged; re-discovery requires manual action.

**Fetch stage:** R2 upload failures are silent; document_path is ephemeral and can be lost if crawl_result is deleted.

**Extract stage:** LLM failures on retry (0 fees extracted) are logged but not flagged for manual triage.

**Categorize stage:** Unmatched fee names are skipped without marking the fee for manual review.

**Validate stage:** Flagged fees that fail bounds are rejected, but flagged fees that fail on "low confidence" alone stay flagged indefinitely.

---

### 3. Retry and Idempotency Discipline

| Stage | Retry Mechanism | Idempotent? | Issue |
|-------|-----------------|-------------|-------|
| Seed | No retry; duplicate skipped | Yes (UNIQUE constraint prevents re-insert) | Silent failure; no audit |
| Discover | 30-day cache; --force flag clears | Partially (methods are retried; methods_tried list prevents infinite loop) | Cache can become stale; no config version control |
| Fetch | Content hash check (unchanged) | Yes (hash match skips re-download) | 403 retry only on stealth; other auth errors not retried |
| Extract | Retry on zero fees with more specific prompt | Partially (retry is one-shot; double-failure is silent) | No backoff; no max retries |
| Categorize | --force flag re-categorizes all rows | Yes (UPDATE is idempotent) | Stale aliases are not versioned |
| Validate | --dry-run for testing; no re-run flag | Yes (state machine prevents invalid transitions) | Staged → rejected transitions are not reversible |

**Finding:** Retries are ad-hoc and not orchestrated. There is no global retry queue or exponential backoff. Modal cron jobs can re-run the whole pipeline, but mid-stage failures are not automatically retried.

---

### 4. What Is Logged vs. Silently Dropped

**Logged (visible in stdout/stderr):**
- Seed: total inserted/skipped per FDIC/NCUA batch
- Discover: per-institution result (FOUND/NOT FOUND/ERROR), search cost
- Fetch: download status, hash match, stealth retry attempt
- Extract: fee count returned by LLM
- Categorize: matched/unmatched counts, top unmatched names, category histogram
- Validate: auto-approved/rejected/staged/flagged counts

**Silently dropped (not visible):**
- Seed: which institutions were rejected as dupes, which asset_size values are NULL
- Discover: which discovery methods were tried (only cache row is written, not logged)
- Fetch: why 404/403 happened (URL pattern, domain, etc.); R2 upload failures
- Extract: LLM confidence distribution (only individual fees logged); document classification failures
- Categorize: which aliases matched each fee; why a fee remained unmatched
- Validate: reason for flagging (bounds, confidence, duplicate); never-merge guard evaluations

**Implication:** Operators have visibility into aggregate counts but not row-level triage data. Repairing outliers requires manual SQL queries.

---

### 5. Source Preservation Per Stage

| Stage | Preserves Source? | How | Loss Points |
|-------|-------------------|-----|-------------|
| Seed | `source` field (fdic/ncua) | Institution-level | No file version, no timestamp |
| Discover | `discovery_cache` (method, result) | Per-method attempt log | URL change not detected; cache not validated |
| Fetch | `crawl_results.document_url` | Snapshot of URL at fetch time | If crawl_results.id is orphaned or deleted |
| Extract | `crawl_result_id` (FK) | Link back to fetch | If crawl_result is deleted; no direct document_url on extracted_fees |
| Categorize | `fee_category` + `canonical_fee_key` | Snapshot of category at categorize time | If aliases are changed/removed; category becomes stale |
| Validate | `review_status` + `fee_reviews` (audit) | Audit trail of transitions | No snapshot of validation rules used; no rule version |

**Critical gap:** extracted_fees has no direct column for document_url. Must join crawl_results, which introduces a fragile dependency.

---

### 6. Compounding Hooks — What Improves the Next Cycle?

**Seed → Discover:**
- Seed writes `website_url`, which is the input to discover
- But `asset_size`, `fed_district`, `charter_type` are enrichment data not currently used by discover
- Discover does not write back to crawl_targets to improve the next cycle (e.g., discovery confidence, retry_after timestamp)

**Discover → Fetch:**
- Discover writes `fee_schedule_url` and `document_type`, which are required for fetch
- Discover also writes `discovery_cache`, which allows skipping failed methods in next cycle
- But Discover does not write how_many_pages_to_crawl or confidence_in_url; fetch must evaluate these at runtime

**Fetch → Extract:**
- Fetch writes `content_hash` and `last_content_hash`, enabling hash-based dedup in next cycle
- Fetch writes `document_r2_key`, enabling fast re-fetch from R2 instead of re-downloading from origin
- But Fetch does not write extraction_difficulty or text_quality_score; extract assumes all documents are equal

**Extract → Categorize:**
- Extract writes `fee_name`, which is the input to categorize
- But Extract does not write extraction_confidence per fee (only at insert to extracted_fees), so categorize cannot weight matches by confidence
- Hypothesis: low-confidence extractions are often harder to categorize; this coupling is broken

**Categorize → Validate:**
- Categorize writes `fee_category` and `fee_family`, which are required for validate
- Validate applies category-specific bounds (FEE_AMOUNT_RULES), so categorization directly impacts validation
- But Categorize does not write ambiguity_score or alias_match_confidence; validate cannot know if the category is uncertain

**Validate → Next Seed/Discover/Fetch cycle:**
- Validate writes `review_status` and `fee_reviews`, which are feedback to operators
- But Validate does not write "refine_institution_url" or "recrawl_needed" flags
- So if a URL is consistently producing wrong document classifications, the next cycle will crawl it again

**Finding:** Data flows forward (seed → discover → fetch → extract → categorize → validate) but does not flow backward (validate → fetch → discover to improve future cycles). The pipeline is one-way; improvements are manual.

---

## Known Bugs and Anti-Patterns

1. **Silent failures throughout**: Discover (404 clearing), Extract (LLM retry 0), Categorize (unmatched names) all fail silently without marking rows for triage.

2. **Validation rules are not versioned**: FEE_AMOUNT_RULES are hardcoded in fee_amount_rules.py. If rules change, there is no way to know which historical fees were validated under which rules.

3. **Aliases are not versioned**: FEE_NAME_ALIASES in fee_analysis.py are hardcoded. Renamed aliases can cause retroactive recategorization but create no audit trail.

4. **Canonical backfill is decoupled**: canonical_fee_key is backfilled via a separate SQL command (backfill-canonical.py), not during extract or categorize. This creates a 2-phase process that can be skipped.

5. **NEVER_MERGE guards are test-only**: NEVER_MERGE_PAIRS are checked in unit tests but not enforced at runtime. A misconfigured alias could merge nsf + overdraft without warning.

6. **No materialized views**: Queries often assume extracted_fees.document_url exists, but it doesn't. Joins with crawl_results are needed, creating N+1 query risks.

7. **Confidence is LLM self-reported**: extract_llm.py uses Haiku's confidence score as-is, with no ground truth validation. High confidence + wrong amount is not caught until manual review.

8. **Concurrent discovery has race conditions**: max_search_cost is passed to each worker independently, risking overspend if multiple workers hit the budget simultaneously (lines 124–126 in discover_urls.py).

9. **Platform rule extraction is not tracked**: crawl.py line 286 sets extracted_by to "{platform}_rule" but the rule_id or matched pattern is not stored. No auditability for which rules fired.

10. **Recrawl logic assumes categorization is stable**: merge_fees.py compares old and new fees by fee_category, but if an old fee was miscategorized, the comparison will miss the match and treat it as a new fee.

---

## Recommendations for Audit and Fix

1. **Materialize document_url on extracted_fees** (immediate): Add a nullable column, populate retroactively via crawl_result_id join, enforce NOT NULL going forward.

2. **Version validation and alias data** (week 1): Move FEE_AMOUNT_RULES and FEE_NAME_ALIASES into database tables with version history, not hardcoded Python dicts.

3. **Enforce NEVER_MERGE guards at runtime** (week 1): Check guards during extract or categorize, not just in tests.

4. **Add row-level audit log for silent failures** (week 1): Flag unmatched fees, LLM retries that fail, etc. to a triage table.

5. **Decouple canonical backfill** (week 2): Compute canonical_fee_key during extract/merge, not in a separate post-hoc command.

6. **Implement true retry orchestration** (week 2): Modal job queue with exponential backoff and mid-stage failure recovery.

7. **Add search cost tracking** (week 1): Persist search cost per run to the database; cap per-run, not per-worker.

8. **Implement feedback loops** (week 3): Validate writes feedback (refine_url, recrawl_needed) that next cycle acts on.

