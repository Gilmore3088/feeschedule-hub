---
phase: 04-extraction-stage-tests
plan: 1
subsystem: fee_crawler/tests/e2e
tags: [testing, e2e, extraction, llm, pytest]
dependency_graph:
  requires: [03-01 (discovered_db fixture + discovery infrastructure)]
  provides: [extracted_db fixture, EXTR-01, EXTR-02, EXTR-03 test coverage]
  affects: [fee_crawler/tests/e2e/]
tech_stack:
  added: []
  patterns: [module-scoped fixture chaining, socket timeout save/restore, FK-ordered teardown]
key_files:
  created: [fee_crawler/tests/e2e/test_extraction_stage.py]
  modified: []
decisions:
  - "Use trigger column (not trigger_type) — actual crawl_runs schema uses 'trigger TEXT NOT NULL'"
  - "Socket timeout 30s for LLM calls (discovery used 15s — LLM PDF downloads need more)"
  - "cms_platform fallback query — handle older schemas without that column via try/except"
  - "Commit extracted_db + 3 tests atomically — both tasks build the same file"
metrics:
  duration: ~10m
  completed: "2026-04-06"
---

# Phase 4 Plan 1: Extraction Stage E2E Tests Summary

**One-liner:** Module-scoped `extracted_db` fixture calling `_crawl_one` for each discovered institution, with three tests asserting EXTR-01 (confidence range), EXTR-02 (doc type coverage with D-04 tolerance), and EXTR-03 (crawl_results completeness).

## What Was Built

`fee_crawler/tests/e2e/test_extraction_stage.py` — 302 lines:

- `extracted_db` module-scoped fixture: cleans prior state, inserts `crawl_runs` row with `trigger='test'`, queries `crawl_targets WHERE fee_schedule_url IS NOT NULL ORDER BY asset_size DESC LIMIT 3`, calls `_crawl_one` for each target with socket timeout 30s, commits, skip guards if no crawl_results, yields `discovered_db`, tears down in FK order (extracted_fees → crawl_results → crawl_runs).
- `test_extract_produces_valid_confidence_scores` (EXTR-01): fetches all `extracted_fees` rows, asserts each `extraction_confidence` in [0.0, 1.0].
- `test_extract_records_all_crawl_results` (EXTR-03): asserts each `crawl_target` with `fee_schedule_url` has >= 1 `crawl_results` row; asserts all statuses in `{'success', 'failed', 'unchanged'}`.
- `test_extract_document_type_coverage` (EXTR-02): queries DISTINCT `document_type` from successful `crawl_results` via JOIN; asserts >= 1 type, each in `{'pdf', 'html', 'unknown', None}`; prints found types.

## Verification

```
python -m pytest fee_crawler/tests/e2e/test_extraction_stage.py --collect-only -q
# 3 tests collected

python -c "import fee_crawler.tests.e2e.test_extraction_stage; print('OK')"
# OK
```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1+2  | a8be2c0 | feat(04-01): add extraction stage e2e tests |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed column name mismatch: trigger vs trigger_type**
- **Found during:** Task 1 implementation
- **Issue:** The plan's interface documentation (`<interfaces>`) specified `INSERT INTO crawl_runs (trigger_type, ...)` but the actual DB schema (both `db.py` CREATE TABLE and live `data/crawler.db`) uses column name `trigger TEXT NOT NULL`. Using `trigger_type` would cause a SQLite "table has no column named trigger_type" error at test runtime.
- **Fix:** Used `trigger` column name in INSERT and WHERE clauses throughout the fixture.
- **Files modified:** `fee_crawler/tests/e2e/test_extraction_stage.py`
- **Commit:** a8be2c0

**2. [Rule 2 - Missing critical functionality] Added cms_platform schema fallback**
- **Found during:** Task 1 — reviewing crawl_targets SELECT
- **Issue:** The plan noted `cms_platform may not exist in older schemas` but didn't specify the fallback query. Without it, tests would fail if running against a DB that pre-dates the cms_platform migration.
- **Fix:** Wrapped the cms_platform SELECT in a try/except, falling back to a query without that column if it raises an exception.
- **Files modified:** `fee_crawler/tests/e2e/test_extraction_stage.py`
- **Commit:** a8be2c0

## Known Stubs

None — all test logic is fully wired. The `extracted_db` fixture calls real `_crawl_one` against real discovered institutions. Tests will skip (not fail) when network/API is unavailable.

## Threat Flags

None — this plan adds test-only code (`fee_crawler/tests/e2e/`). No new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- `/Users/jgmbp/Desktop/feeschedule-hub/.claude/worktrees/agent-a795e3c6/fee_crawler/tests/e2e/test_extraction_stage.py` — FOUND
- Commit `a8be2c0` — FOUND (git log confirms)
- 3 tests collected — VERIFIED
- Import OK — VERIFIED
