---
phase: 23-call-report-fred-foundation
fixed_at: 2026-04-07T19:18:34Z
review_path: .planning/phases/23-call-report-fred-foundation/23-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 23: Code Review Fix Report

**Fixed at:** 2026-04-07T19:18:34Z
**Source review:** .planning/phases/23-call-report-fred-foundation/23-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (CR-01, WR-01, WR-02, WR-03, WR-04)
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: `Number(null)` coerces missing indicator values to `0` in `getFredSummary`

**Files modified:** `src/lib/crawler-db/fed.ts`
**Commit:** 19ceeee
**Applied fix:** In the `byId`-building loop inside `getFredSummary`, replaced `Number(row.value)` with a conditional that preserves `null` when `row.value` is `null` or `undefined`. The `Map` type already declared `value: number | null`; the assignment now matches that contract so `byId.get("FEDFUNDS")?.value ?? null` correctly returns `null` for missing series instead of `0`.

### WR-01: FRED API key may be committed to `config.yaml`

**Files modified:** `fee_crawler/config.py`, `fee_crawler/commands/ingest_fred.py`
**Commit:** 4b271d8
**Applied fix:** Removed `api_key` field from `FREDConfig` entirely and replaced it with a comment. Updated `_get_api_key()` in `ingest_fred.py` to read only from the `FRED_API_KEY` env var (removed the `config.fred.api_key` fallback). Updated the error message that previously referenced `fred.api_key to config.yaml` to direct users to set the env var instead.

### WR-02: Silent error suppression in `getTopRevenueInstitutions`

**Files modified:** `src/lib/crawler-db/call-reports.ts`
**Commit:** 0176e65
**Applied fix:** Changed bare `catch {` to `catch (e) {` and added `console.warn('[getTopRevenueInstitutions]', e)` before `return []`, consistent with the pattern used by every other exported function in the file.

### WR-03: YoY comparison in `getRevenueTrend` assumes no quarter gaps

**Files modified:** `src/lib/crawler-db/call-reports.ts`
**Commit:** 77333c8
**Applied fix:** Added a `priorYearQuarter(quarter: string): string` helper that derives the prior-year quarter label from a `YYYY-QN` string (e.g. `"2024-Q3"` → `"2023-Q3"`). Replaced the positional `i + 4` offset loop with a `Map`-based lookup: build `byQuarter` from all snapshots, then for each snapshot look up its prior year by label. This ensures gaps in the data (missing quarters) never produce a YoY comparison against the wrong period.

### WR-04: Empty-password seed users created when env vars are unset

**Files modified:** `fee_crawler/config.py`
**Commit:** 63f36fa
**Applied fix:** Added a `model_validator(mode='after')` to `SeedUser` that raises `ValueError` if `password` is empty, with a message naming the missing env var. Moved the `seed_users` default from a list literal (evaluated at class-definition time) to `Field(default_factory=_default_seed_users)` via a new module-level factory function, so the validator fires at config load time rather than at import time. Also converted all `Config` sub-model defaults from `= SubModel()` to `Field(default_factory=SubModel)` for consistency and to ensure `AuthConfig` itself is not instantiated at class-definition time.

---

_Fixed: 2026-04-07T19:18:34Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
