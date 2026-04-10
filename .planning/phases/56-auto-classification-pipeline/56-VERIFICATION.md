---
phase: 56-auto-classification-pipeline
verified: 2026-04-10T17:30:00Z
status: human_needed
score: 4/4
overrides_applied: 0
human_verification:
  - test: "Run a crawl against a known institution and verify canonical_fee_key is populated for alias-matched fees"
    expected: "Fees matching FEE_NAME_ALIASES (e.g., 'Monthly Service Charge') have canonical_fee_key set; unmatched fees have NULL"
    why_human: "Requires live database with crawl_targets and extraction pipeline running"
  - test: "Trigger classify-nulls --fix against a database with NULL canonical_fee_key rows"
    expected: "LLM classifies unmatched fees, cache entries written, high-confidence results update extracted_fees"
    why_human: "Requires ANTHROPIC_API_KEY and Postgres database with real fee data"
  - test: "Deploy to Modal staging and verify run_post_processing pipeline order"
    expected: "classify-nulls runs first, then categorize/auto-review/snapshot/publish-index, then roomba post-crawl"
    why_human: "Requires Modal deployment with secrets configured"
  - test: "Run snapshot command against Postgres and verify fee_index_snapshots rows"
    expected: "Category-level and institution-level snapshot rows created; re-run on same date updates, not duplicates"
    why_human: "Requires Postgres database with approved/staged fees"
---

# Phase 56: Auto-Classification Pipeline Verification Report

**Phase Goal:** Every new fee inserted by the crawler is automatically assigned a canonical_fee_key at INSERT time -- the canonical taxonomy is self-maintaining after this phase ships
**Verified:** 2026-04-10T17:30:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A new crawl run inserts fees with canonical_fee_key populated for every fee that matches the alias table | VERIFIED | merge_fees.py line 148 calls `classify_fee(fee.fee_name)` before INSERT; state_agent.py line 299 calls `classify_fee(fee_name)` replacing normalize_fee_name(); both INSERT statements include canonical_fee_key and variant_type columns |
| 2 | A fee whose raw name does not match the alias table is classified via Claude Haiku LLM fallback; the result is cached in classification_cache | VERIFIED | classify_nulls.py implements full pipeline: dedup by normalized name, cache-first lookup, LLM batch via _classify_batch_with_llm(), write_cache_entry() with ON CONFLICT DO UPDATE; classification_cache migration exists with normalized_name TEXT PRIMARY KEY |
| 3 | The LLM fallback does not block or delay fee storage -- a fee with an unmatched raw name is stored immediately with canonical_fee_key = NULL and the LLM call runs asynchronously | VERIFIED | merge_fees.py and state_agent.py store NULL canonical_fee_key immediately at INSERT for unmatched fees; classify-nulls runs as a separate post-processing step in modal_app.py (line 117: first command in run_post_processing) |
| 4 | After any crawl run, the Roomba integration automatically flags outlier fees in the newly inserted batch | VERIFIED | run_post_crawl() in roomba.py (line 656) chains sweep_canonical_outliers + sweep_canonical_reassignments; modal_app.py run_post_processing() calls run_post_crawl(conn) after the subprocess commands; nightly cron at 5am ET via run_nightly_roomba() |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `fee_crawler/commands/merge_fees.py` | classify_fee() wiring before INSERT | VERIFIED | Line 19: `from fee_crawler.fee_analysis import classify_fee`; Line 148: `_, canonical_key, variant = classify_fee(fee.fee_name)`; INSERT includes canonical_fee_key, variant_type |
| `fee_crawler/agents/state_agent.py` | classify_fee() wiring before INSERT in agent path | VERIFIED | Line 29: `from fee_crawler.fee_analysis import classify_fee, normalize_fee_name, get_fee_family`; Line 299: `category, canonical_key, variant = classify_fee(fee_name)`; INSERT includes canonical_fee_key, variant_type |
| `supabase/migrations/20260410_classification_cache.sql` | classification_cache table DDL | VERIFIED | CREATE TABLE with normalized_name TEXT PRIMARY KEY, canonical_fee_key TEXT, confidence FLOAT NOT NULL, model TEXT NOT NULL; partial indexes present |
| `fee_crawler/commands/classify_nulls.py` | LLM batch classification command | VERIFIED | 370 lines, fully implemented: classify_with_cache(), write_cache_entry(), _validate_llm_result(), _classify_batch_with_llm(), run(), _apply_classification() |
| `fee_crawler/config.py` | confidence_classify_threshold = 0.90 | VERIFIED | Line 44: `confidence_classify_threshold: float = 0.90` |
| `fee_crawler/commands/roomba.py` | run_post_crawl() entry point | VERIFIED | Line 656: `def run_post_crawl(conn) -> dict:` with RuntimeError guard, ensure_roomba_log, sweep_canonical_outliers(fix=True), sweep_canonical_reassignments(fix=True) |
| `fee_crawler/modal_app.py` | classify-nulls step + nightly Roomba cron | VERIFIED | Line 117: classify-nulls --fix in commands list; Line 128-142: roomba post-crawl; Line 158-181: run_nightly_roomba at Cron("0 5 * * *"); Line 184-209: run_classify_nulls on-demand |
| `supabase/migrations/20260410_snapshot_tables.sql` | fee_index_snapshots and institution_fee_snapshots DDL | VERIFIED | Both CREATE TABLE statements present with COALESCE(charter, '') unique index pattern |
| `fee_crawler/commands/snapshot_fees.py` | Postgres-based snapshot command | VERIFIED | Uses psycopg2 conn parameter, ON CONFLICT DO UPDATE for both tables, statistics.median for aggregation |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| merge_fees.py | fee_analysis.py | classify_fee() call before INSERT | WIRED | Line 19 import, line 148 call |
| state_agent.py | fee_analysis.py | classify_fee() replacing normalize_fee_name() | WIRED | Line 29 import, line 299 call |
| classify_nulls.py | fee_analysis.py | normalize_fee_name, CANONICAL_KEY_MAP, NEVER_MERGE_PAIRS | WIRED | Line 27 import with all three symbols |
| classify_nulls.py | classification_cache table | psycopg2 SELECT/INSERT | WIRED | classify_with_cache() SELECT, write_cache_entry() INSERT ON CONFLICT |
| modal_app.py | classify_nulls.py | subprocess classify-nulls --fix | WIRED | Line 117 in commands list |
| modal_app.py | roomba.py | from fee_crawler.commands.roomba import run_post_crawl | WIRED | Lines 133, 171, 197 |
| snapshot_fees.py | fee_index_snapshots table | psycopg2 INSERT ON CONFLICT | WIRED | _snapshot_categories() and _snapshot_institutions() both write via psycopg2 |

### Data-Flow Trace (Level 4)

Not applicable -- this phase is Python pipeline code (CLI commands, Modal workers), not UI components rendering dynamic data.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| classify-nulls CLI registered | `python -m fee_crawler classify-nulls --help` | Shows help with --fix flag | PASS |
| snapshot CLI registered | `python -m fee_crawler snapshot --help` | Shows help with --date flag | PASS |
| classify_nulls module exports | `python -c "from fee_crawler.commands.classify_nulls import run, classify_with_cache, _validate_llm_result, write_cache_entry"` | All exports OK | PASS |
| run_post_crawl importable | `python -c "from fee_crawler.commands.roomba import run_post_crawl"` | Import OK | PASS |
| snapshot_fees importable | `python -c "from fee_crawler.commands.snapshot_fees import run"` | Import OK | PASS |
| Phase 56 tests pass | `python -m pytest fee_crawler/tests/test_classify_nulls.py test_snapshot.py test_roomba_canonical.py -q` | 24 passed | PASS |
| Full test suite passes | `python -m pytest fee_crawler/tests/ --ignore=e2e -q` | 221 passed | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CLS-01 | 56-01 | classify_fee() runs inline at INSERT time during extraction | SATISFIED | merge_fees.py and state_agent.py both call classify_fee() before INSERT; canonical_fee_key and variant_type columns populated for alias matches, NULL for unknowns |
| CLS-02 | 56-02 | LLM fallback classification via Claude Haiku with classification_cache | SATISFIED | classify_nulls.py implements cache-first + LLM batch + 0.90 confidence gate + NEVER_MERGE guard + CANONICAL_KEY_MAP validation; classification_cache migration ready |
| CLS-03 | 56-03 | Roomba integration wired into post-extraction pipeline | SATISFIED | run_post_crawl() entry point chains both sweeps; modal_app.py runs roomba after classify-nulls in post-processing; nightly cron at 5am ET |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | - | - | - | - |

No TODO/FIXME/PLACEHOLDER markers found in any phase 56 artifacts. No stub returns detected. All functions are fully implemented.

### Human Verification Required

### 1. End-to-end classify_fee() at INSERT

**Test:** Run a crawl against a known institution with fees matching FEE_NAME_ALIASES
**Expected:** Inserted fees have canonical_fee_key and variant_type populated for alias matches; unmatched fees have NULL
**Why human:** Requires live database with crawl_targets and the extraction pipeline running

### 2. LLM batch classification flow

**Test:** Trigger `python -m fee_crawler classify-nulls --fix` against a database with NULL canonical_fee_key rows
**Expected:** LLM classifies unmatched fees, classification_cache entries written, high-confidence results update extracted_fees
**Why human:** Requires ANTHROPIC_API_KEY environment variable and Postgres database with real fee data

### 3. Modal pipeline orchestration

**Test:** Deploy to Modal staging and trigger run_post_processing
**Expected:** Commands execute in order: classify-nulls -> categorize -> auto-review -> snapshot -> publish-index -> roomba post-crawl
**Why human:** Requires Modal deployment with secrets configured; cannot verify subprocess ordering without a live environment

### 4. Snapshot idempotency on real data

**Test:** Run `python -m fee_crawler snapshot` twice on the same date against Postgres
**Expected:** First run creates rows in fee_index_snapshots and institution_fee_snapshots; second run updates (not duplicates)
**Why human:** Requires Postgres database with approved/staged fees and the snapshot_tables migration applied

### Gaps Summary

No gaps found. All 4 roadmap success criteria verified through code inspection. All 3 requirements (CLS-01, CLS-02, CLS-03) satisfied. Full test suite (221 tests) passes. CLI commands registered and importable. Migrations exist with correct schemas.

Status is `human_needed` because the pipeline involves live infrastructure (Postgres, Anthropic API, Modal) that cannot be verified through static code analysis alone. The code-level implementation is complete and correct.

---

_Verified: 2026-04-10T17:30:00Z_
_Verifier: Claude (gsd-verifier)_
