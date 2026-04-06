---
phase: 01-test-infrastructure
plan: 02
subsystem: test-infrastructure
tags: [pytest, e2e, fixtures, db-isolation, r2-bypass, lock-file]
dependency_graph:
  requires: []
  provides: [e2e-conftest, db-isolation, r2-bypass-guard, lock-file-override]
  affects: [all-e2e-phases]
tech_stack:
  added: []
  patterns: [session-scoped-fixtures, autouse-guards, monkeypatch-lock-file, file-backed-wal-sqlite]
key_files:
  created:
    - fee_crawler/tests/e2e/__init__.py
    - fee_crawler/tests/e2e/conftest.py
    - fee_crawler/tests/e2e/test_infra_smoke.py
  modified: []
decisions:
  - "D-01: File-backed temp SQLite (not :memory:) — WAL mode silently ignored on :memory:, subprocess access required"
  - "D-09: Session scope for test_db — schema created once, Phase 2+ tests clean up their own rows"
  - "D-11: R2 bypass via absent R2_ENDPOINT + document_storage_dir → tmp_path"
  - "D-12: daily_budget_usd=2.0 cap applied in test_config"
  - "Pitfall 5: isolated_lock_file is function-scoped because monkeypatch fixture is function-scoped"
metrics:
  duration_minutes: 8
  completed_date: "2026-04-06"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 0
---

# Phase 1 Plan 02: E2E Conftest and Safety Fixtures Summary

**One-liner:** Session-scoped SQLite isolation + autouse R2 bypass and production DB contamination guards for all e2e pipeline tests.

## What Was Built

Created `fee_crawler/tests/e2e/` as a Python package with a `conftest.py` providing six fixtures that serve as the safety net for all future pipeline stage tests (Phases 2-9):

| Fixture | Scope | Purpose |
|---------|-------|---------|
| `prod_db_contamination_guard` | session, autouse | Asserts `data/crawler.db` mtime unchanged after full session |
| `r2_bypass_guard` | session, autouse | Raises RuntimeError if `R2_ENDPOINT` is set before tests run |
| `test_db_path` | session | Temp path for isolated SQLite DB file |
| `test_config` | session | Config override: temp DB, temp doc dir, 2.0 budget cap, 0.5s crawl delay |
| `test_db` | session | Opens file-backed WAL-mode SQLite; asserts journal_mode='wal' on open |
| `isolated_lock_file` | function | Monkeypatches `fee_crawler.pipeline.executor.LOCK_FILE` to tmp_path |

Six smoke tests in `test_infra_smoke.py` verify each fixture works correctly. All marked `@pytest.mark.e2e`.

## Verification Results

```
fee_crawler/tests/e2e/test_infra_smoke.py::test_db_is_file_backed_wal_mode    PASSED
fee_crawler/tests/e2e/test_infra_smoke.py::test_db_path_is_not_production      PASSED
fee_crawler/tests/e2e/test_infra_smoke.py::test_config_document_dir_is_temp   PASSED
fee_crawler/tests/e2e/test_infra_smoke.py::test_config_budget_guard            PASSED
fee_crawler/tests/e2e/test_infra_smoke.py::test_config_db_path_matches_test_db_path PASSED
fee_crawler/tests/e2e/test_infra_smoke.py::test_isolated_lock_file_is_not_production PASSED

6 passed in 0.02s

Existing unit tests: 42 passed (test_executor, test_review_status, test_transition_fee_status)

R2_ENDPOINT guard: When R2_ENDPOINT=test is set, all 6 tests fail at setup with RuntimeError
```

## Commits

| Hash | Message |
|------|---------|
| cb81ea0 | feat(01-02): add e2e conftest with DB isolation and R2 bypass fixtures |
| 4c5450f | test(01-02): add smoke tests for e2e test infrastructure fixtures |

## Deviations from Plan

None — plan executed exactly as written.

The `@pytest.mark.e2e` marker registration warning (PytestUnknownMarkWarning) is expected and will be resolved by Plan 01-01 which creates `pyproject.toml` with `[tool.pytest.ini_options]` marker registration. These two plans run in the same wave; 01-01 owns the marker registration.

## Known Stubs

None. All six fixtures are fully implemented and verified.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. The conftest.py contains only test infrastructure — autouse guards, fixture definitions, and a WAL mode assertion.

## Self-Check: PASSED

Files exist:
- fee_crawler/tests/e2e/__init__.py: FOUND
- fee_crawler/tests/e2e/conftest.py: FOUND
- fee_crawler/tests/e2e/test_infra_smoke.py: FOUND

Commits exist:
- cb81ea0: FOUND (feat(01-02): add e2e conftest with DB isolation and R2 bypass fixtures)
- 4c5450f: FOUND (test(01-02): add smoke tests for e2e test infrastructure fixtures)
