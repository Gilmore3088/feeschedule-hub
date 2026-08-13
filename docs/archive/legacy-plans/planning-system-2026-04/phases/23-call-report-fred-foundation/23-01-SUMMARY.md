---
phase: 23-call-report-fred-foundation
plan: "01"
subsystem: call-reports
tags: [data-correctness, ingestion, scaling, migration, tests]
dependency_graph:
  requires: []
  provides: [ffiec-scaling-fix, call-report-backfill-migration, scaling-tests]
  affects: [institution_financials, getRevenueTrend, getTopRevenueInstitutions]
tech_stack:
  added: []
  patterns: [extract-helper-for-testability, idempotent-migration-guard]
key_files:
  created:
    - scripts/migrations/023-fix-ffiec-scaling.sql
    - fee_crawler/tests/test_call_report_scaling.py
  modified:
    - fee_crawler/commands/ingest_call_reports.py
    - src/lib/crawler-db/call-reports.ts
    - src/lib/crawler-db/call-reports.test.ts
decisions:
  - "Extract _apply_ffiec_scaling() as module-level helper — enables direct pytest without DB mocking"
  - "Gate multiplier on source == 'ffiec' only — NCUA 5300 rows already in whole dollars"
  - "Migration guard service_charge_income < 100000000 prevents double-application on re-run"
  - "Balance sheet columns (total_assets etc.) not currently ingested — excluded from migration"
metrics:
  duration_minutes: 2
  completed_date: "2026-04-08"
  tasks_completed: 3
  files_changed: 5
---

# Phase 23 Plan 01: Call Report FFIEC Scaling Fix Summary

**One-liner:** Fix FFIEC RIAD4080 1000x scaling bug in ingestion pipeline, add idempotent backfill migration, extend vitest with dollar-scale assertions, add pytest behavioral tests for multiplier logic.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix ingestion pipeline — multiply FFIEC values by 1000 | bfdae14 | ingest_call_reports.py, 023-fix-ffiec-scaling.sql |
| 2 | Extend vitest tests with scaling verification and range assertions | be2652d | call-reports.ts, call-reports.test.ts |
| 3 | Add pytest behavioral test for FFIEC scaling multiplier | 3f4fca3 | test_call_report_scaling.py |

## What Was Built

**Task 1 — Ingestion pipeline fix:**
- Extracted `_apply_ffiec_scaling(source, service_charges, other_noninterest)` as a module-level helper in `ingest_call_reports.py`. Multiplies both `service_charge_income` and `other_noninterest_income` by 1000 when `source == "ffiec"`. Zero and None values are guarded.
- `_ingest_from_csv()` now calls `_apply_ffiec_scaling()` after parsing MDRM fields.
- Created `scripts/migrations/023-fix-ffiec-scaling.sql` to backfill ~38K existing rows. Idempotency guard `service_charge_income < 100000000` prevents double-application. Balance sheet columns excluded (not currently ingested).

**Task 2 — Vitest test extensions:**
- Fixed pre-existing bug: `getRevenueTrend()` had no try-catch, causing tests to fail on DB error. Wrapped function body in try-catch returning empty trend (Rule 1 auto-fix).
- Added `describe("scaling verification")`: asserts `total_service_charges > 1_000_000_000` for JPMorgan-scale mock rows.
- Added charter split reconciliation: `bank_service_charges + cu_service_charges === total_service_charges` for each snapshot.
- Added `describe("range assertions")`: every institution `service_charge_income` in `[0, 100_000_000_000)`.
- Added sort order verification for `getTopRevenueInstitutions`.
- 21 tests passing (was 15 passing, 1 failing before this plan).

**Task 3 — Pytest behavioral tests:**
- Created `fee_crawler/tests/test_call_report_scaling.py` with `TestFfiecScalingMultiplier` (8 tests).
- Covers: ffiec x1000, ncua_5300 unchanged, zero guard, None guard, partial None, fdic unchanged, large real-world values (JPMorgan raw 5_200_000 → $5.2B).
- All 8 tests passing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing try-catch in getRevenueTrend**
- **Found during:** Task 2 (RED phase — ran existing tests before adding new ones)
- **Issue:** `getRevenueTrend()` had no error handling. The existing test "returns empty trend on DB error" was failing because the function throws instead of returning empty trend.
- **Fix:** Wrapped function body in `try { ... } catch { return emptyTrend; }`, matching the same pattern already used in `getTopRevenueInstitutions`.
- **Files modified:** `src/lib/crawler-db/call-reports.ts`
- **Commit:** be2652d

## Known Stubs

None — all functionality is complete. The migration SQL is ready for production execution but requires a human to run it against the live database (not a stub; it's an operational step).

## Threat Flags

No new security-relevant surface introduced. All changes are within existing trust boundaries:
- `_apply_ffiec_scaling()` is a pure function with no I/O
- Migration SQL operates on existing `institution_financials` table with existing access controls
- New test files have no production surface

## Self-Check: PASSED

- `fee_crawler/commands/ingest_call_reports.py` — modified, contains `_apply_ffiec_scaling` and `service_charges = service_charges * 1000`
- `scripts/migrations/023-fix-ffiec-scaling.sql` — created, contains idempotency guard
- `fee_crawler/tests/test_call_report_scaling.py` — created, 8 tests
- `src/lib/crawler-db/call-reports.ts` — modified, try-catch added
- `src/lib/crawler-db/call-reports.test.ts` — modified, new describe blocks added
- Commits bfdae14, be2652d, 3f4fca3 — all present in git log
- `npx vitest run src/lib/crawler-db/call-reports.test.ts` — 21 passed
- `python -m pytest fee_crawler/tests/test_call_report_scaling.py -v` — 8 passed
