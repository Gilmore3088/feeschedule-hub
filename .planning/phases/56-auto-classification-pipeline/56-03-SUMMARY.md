---
phase: 56-auto-classification-pipeline
plan: "03"
subsystem: fee-crawler-pipeline
tags: [roomba, modal, snapshot, postgres, classification, pipeline]
dependency_graph:
  requires: [56-01, 56-02]
  provides: [run_post_crawl, modal-orchestration, snapshot-tables, classify-nulls-cli]
  affects: [fee_crawler/commands/roomba.py, fee_crawler/modal_app.py, fee_crawler/commands/snapshot_fees.py, fee_crawler/__main__.py]
tech_stack:
  added: [psycopg2 snapshot writes, Modal cron at 5am ET]
  patterns: [ON CONFLICT DO UPDATE idempotent snapshots, 4-stage classification pipeline, Modal subprocess orchestration]
key_files:
  created:
    - supabase/migrations/20260410_snapshot_tables.sql
  modified:
    - fee_crawler/commands/roomba.py
    - fee_crawler/commands/snapshot_fees.py
    - fee_crawler/__main__.py
    - fee_crawler/modal_app.py
    - fee_crawler/tests/test_roomba_canonical.py
    - fee_crawler/tests/test_snapshot.py
decisions:
  - "Snapshot JOIN crawl_targets for charter column — allows per-charter category aggregates in one pass"
  - "run_nightly_roomba uses run_post_crawl (not run() full sweep) — canonical sweeps only, not legacy amount outlier rules"
  - "E2E test failures (test_extraction_stage.py) are pre-existing network-dependent failures unrelated to this plan"
metrics:
  duration: ~25 minutes
  completed: "2026-04-10"
  tasks_completed: 3
  files_changed: 6
  tests_added: 8
---

# Phase 56 Plan 03: Modal Orchestration + Snapshot Tables Summary

**One-liner:** 4-stage canonical classification pipeline wired end-to-end: Roomba post-crawl entry point, Postgres snapshot tables with category/institution-level aggregates, classify-nulls Modal step, and nightly drift detection cron.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | run_post_crawl + snapshot tables + Postgres snapshot command | 004904d | roomba.py, snapshot_fees.py, __main__.py, migrations/, test_roomba_canonical.py, test_snapshot.py |
| 2 | Wire Modal orchestration — classify-nulls + nightly Roomba | e9b3dbb | modal_app.py |
| 3 | Checkpoint: verify complete pipeline | (auto-verified) | — |

## What Was Built

### Task 1: run_post_crawl() + Snapshot Infrastructure

**roomba.py — `run_post_crawl(conn) -> dict`**
- Validates `canonical_fee_key` column exists (raises `RuntimeError` with migration hint if absent)
- Calls `ensure_roomba_log(conn)` then chains `sweep_canonical_outliers(conn, fix=True)` and `sweep_canonical_reassignments(conn, fix=True)`
- Returns `{"outliers_flagged": int, "reassignments_made": int}`

**supabase/migrations/20260410_snapshot_tables.sql**
- `fee_index_snapshots`: category-level aggregates (median, P25, P75, institution_count, fee_count, charter)
- `institution_fee_snapshots`: per-bank fee state (crawl_target_id, canonical_fee_key, amount, review_status)
- Unique indexes use `COALESCE(charter, '')` pattern to handle NULL charter in Postgres unique constraints (per RESEARCH.md Pitfall 5)

**fee_crawler/commands/snapshot_fees.py — full Postgres rewrite**
- New signature: `run(conn, *, snapshot_date: str | None = None) -> dict`
- Category snapshots: JOIN crawl_targets for charter, group by (category, canonical_key, charter), compute median/P25/P75 via Python `statistics.median()`
- Institution snapshots: all non-rejected fees with canonical_fee_key
- Both INSERT paths use `ON CONFLICT DO UPDATE` — fully idempotent on same date

**fee_crawler/__main__.py**
- Added `cmd_snapshot()` updated to use `psycopg2.connect(DATABASE_URL)` (replacing SQLite `Database` class)
- Added `cmd_classify_nulls()` + `classify-nulls` subparser with `--fix` flag

### Task 2: Modal Orchestration

**fee_crawler/modal_app.py**
- `run_post_processing()`: classify-nulls added as first subprocess command; Roomba post-crawl sweep added after the commands loop with try/except resilience
- `run_nightly_roomba()`: new Modal function at `Cron("0 5 * * *")`, timeout=1800, calls `run_post_crawl(conn)` directly
- `run_classify_nulls()`: new on-demand Modal function (no cron, timeout=1800), chains `classify_nulls.run(conn, fix=True)` then `run_post_crawl(conn)`

**Complete pipeline schedule after this plan:**
- 2am: URL discovery
- 3am: PDF extraction (fees stored with classify_fee() alias lookup, NULL for unknowns)
- 4am: Browser extraction (same)
- 5am: Nightly Roomba — full-table canonical outlier + reassignment sweep
- 6am: Post-processing — classify-nulls → categorize → auto-review → snapshot → publish-index → roomba post-crawl

## Checkpoint Verification (Task 3 — Auto-executed)

All verification commands from the plan passed:

| Check | Result |
|-------|--------|
| `python -m pytest fee_crawler/tests/ --ignore=fee_crawler/tests/e2e -q` | 221 passed |
| `python -c "import fee_crawler.modal_app"` | OK (no import errors) |
| `python -m fee_crawler classify-nulls --help` | shows help with --fix flag |
| `python -m fee_crawler snapshot --help` | shows help with --date flag |
| `ls supabase/migrations/20260410_*` | classification_cache.sql + snapshot_tables.sql present |
| `grep -n "classify-nulls" fee_crawler/modal_app.py` | present at line 117 in commands list |
| `grep -n "run_nightly_roomba" fee_crawler/modal_app.py` | present at line 163 |
| `grep -n "run_post_crawl" fee_crawler/commands/roomba.py` | present at line 656 |
| `grep -n "psycopg2" fee_crawler/commands/snapshot_fees.py` | present (Postgres, not SQLite) |
| `grep -n "classify-nulls" fee_crawler/__main__.py` | present at line 1152 |

**Note on E2E test failures:** `fee_crawler/tests/e2e/` tests fail due to live network calls (FDIC API + real URL discovery) hitting the 60s pytest timeout. These are pre-existing failures unrelated to this plan. All 221 unit and integration tests not requiring live network access pass.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written with one minor addition:

**1. [Rule 2 - Missing functionality] Added `test_run_post_crawl_raises_when_column_missing` test**
- Found during: Task 1 test implementation
- Issue: Plan only specified one `test_run_post_crawl` test but the RuntimeError guard is a critical correctness check that deserved its own test
- Fix: Added `test_run_post_crawl_raises_when_column_missing` to verify the migration guard works
- Files modified: `fee_crawler/tests/test_roomba_canonical.py`
- Commit: 004904d

## Known Stubs

None. All data paths are fully wired.

## Threat Flags

No new threat surface beyond what was planned in the plan's threat model (T-56-09 through T-56-12). The `run_post_crawl()` function calls `ensure_roomba_log()` before any writes, satisfying T-56-09 mitigation. The `run_classify_nulls()` Modal function chains `run_post_crawl()` after classify, providing full audit trail coverage.

## Self-Check

**Files exist:**
- fee_crawler/commands/roomba.py — contains `def run_post_crawl`
- supabase/migrations/20260410_snapshot_tables.sql — contains `CREATE TABLE IF NOT EXISTS fee_index_snapshots`
- fee_crawler/commands/snapshot_fees.py — contains `psycopg2` and `ON CONFLICT`
- fee_crawler/modal_app.py — contains `run_nightly_roomba` and `run_classify_nulls`
- fee_crawler/__main__.py — contains `classify-nulls` subcommand
- fee_crawler/tests/test_roomba_canonical.py — contains `test_run_post_crawl`
- fee_crawler/tests/test_snapshot.py — no `pytest.skip` calls

**Commits exist:**
- 004904d — feat(56-03): add run_post_crawl, snapshot tables migration, Postgres snapshot command
- e9b3dbb — feat(56-03): wire Modal orchestration — classify-nulls in post-processing, nightly Roomba cron

## Self-Check: PASSED
