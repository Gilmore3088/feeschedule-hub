---
phase: 02-seed-stage-tests
plan: "01"
subsystem: fee_crawler/tests/e2e
tags: [testing, e2e, seed, fdic, ncua, pytest]
dependency_graph:
  requires:
    - "01-02-SUMMARY.md (conftest.py fixtures: test_db, test_config, seeded_db)"
    - "fee_crawler/commands/seed_institutions.py (seed_fdic, seed_ncua)"
    - "fee_crawler/db.py (Database, crawl_targets schema)"
  provides:
    - "fee_crawler/tests/e2e/test_seed_stage.py — 3 e2e tests covering SEED-01, SEED-02"
    - "seeded_db fixture — function-scoped crawl_targets truncation for test isolation"
  affects:
    - "Phase 3+ tests that seed institutions (will use seeded_db pattern)"
tech_stack:
  added: []
  patterns:
    - "seeded_db fixture: function-scoped DB cleanup around session-scoped test_db"
    - "Flexible assertions: count >= 1 and field presence, no hardcoded institution names"
    - "D-06 compliance: explicit assertion that NCUA website_url is None (expected, not bug)"
key_files:
  created:
    - fee_crawler/tests/e2e/test_seed_stage.py
  modified: []
decisions:
  - "Assert at least 1 row has website_url (not every row) for FDIC — avoids flakiness when FDIC WEBADDR is empty for some top-5 banks"
  - "NCUA website_url=None assertion uses explicit failure message referencing D-06 and Phase 3"
  - "seeded_db fixture performs cleanup at both setup and teardown for deterministic isolation"
metrics:
  duration: "~7 minutes"
  completed: "2026-04-06T15:24:49Z"
  tasks_completed: 2
  files_created: 1
  files_modified: 0
---

# Phase 2 Plan 01: Seed Stage E2E Tests Summary

One-liner: Three pytest e2e tests verifying FDIC and NCUA seed commands produce correctly-typed rows in isolated crawl_targets with a function-scoped seeded_db fixture.

## What Was Built

Created `fee_crawler/tests/e2e/test_seed_stage.py` with:

- **`seeded_db` fixture** (function-scoped): truncates `crawl_targets` before and after each test, providing a clean slate regardless of session ordering
- **`test_seed_fdic_populates_crawl_targets`**: calls `seed_fdic(limit=5)`, asserts row count >= 1, verifies charter_type='bank', source='fdic', asset_size > 0, fed_district in 1-12 range, at least one website_url populated
- **`test_seed_ncua_populates_crawl_targets`**: calls `seed_ncua(limit=5)`, asserts charter_type='credit_union', source='ncua', website_url is None for all rows (D-06 expected behavior), asset_size >= 0 when present
- **`test_seed_combined_charter_mix`**: seeds both sources (limit=3 each), confirms both 'fdic' and 'ncua' appear in sources, validates source-charter_type correspondence for all rows

## Test Results

- `python -m pytest fee_crawler/tests/e2e/ -m e2e` — **9 passed** (6 smoke + 3 seed)
- `python -m pytest fee_crawler/tests/ --ignore=fee_crawler/tests/e2e/ -x` — **42 passed** (unit tests unaffected)
- `data/crawler.db` mtime unchanged (prod_db_contamination_guard passed)

## Deviations from Plan

None — plan executed exactly as written. All three tests were authored in a single write as the plan described both tasks in the same target file.

## Known Stubs

None — no placeholder data, all assertions use real API responses.

## Threat Flags

No new security surface introduced. Tests use:
- External APIs (FDIC, NCUA) at limit=5/3 — T-02-01 and T-02-02 accepted in plan threat model
- Isolated SQLite in pytest tmp_path — T-02-03 accepted
- seeded_db truncates only crawl_targets — T-02-04 mitigated (no cascade risk at this stage)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 + Task 2 | b78f8c2 | feat(02-01): add seed stage e2e tests for FDIC, NCUA, and combined charter mix |

## Self-Check: PASSED
