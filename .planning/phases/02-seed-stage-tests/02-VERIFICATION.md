---
phase: 02-seed-stage-tests
verified: 2026-04-06T00:00:00Z
status: human_needed
score: 3/3 must-haves verified
gaps: []
human_verification:
  - test: "Run `python -m pytest fee_crawler/tests/e2e/ -v -m e2e` against live FDIC and NCUA endpoints"
    expected: "9 passed (6 smoke + 3 seed); data/crawler.db mtime unchanged"
    why_human: "Tests call real external APIs (api.fdic.gov, ncua.gov ZIP download ~20MB). Cannot verify pass/fail without network access and a live environment with all Python dependencies installed. Automated grep-level checks confirm correct structure but cannot substitute for actual test execution."
  - test: "Confirm `data/crawler.db` mtime is unchanged after running the e2e suite"
    expected: "prod_db_contamination_guard fixture fires with no assertion error"
    why_human: "The guard is a session-teardown assertion. It can only be confirmed by running the full session — not by static analysis."
---

# Phase 2: Seed Stage Tests Verification Report

**Phase Goal:** The seed stage correctly populates crawl_targets from both FDIC and NCUA sources in an isolated test DB
**Verified:** 2026-04-06
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After seed_fdic(limit=5), crawl_targets contains bank rows with all required non-null fields | VERIFIED | Lines 55-104 of test_seed_stage.py assert institution_name, charter_type, asset_size, cert_number, source non-null; charter_type='bank', source='fdic', asset_size>0, fed_district 1-12 if non-null, at least one website_url populated |
| 2 | After seed_ncua(limit=5), crawl_targets contains credit_union rows; website_url is null (expected) | VERIFIED | Lines 108-162 assert charter_type='credit_union', source='ncua', website_url is None for every row (with D-06 comment), institution_name/cert_number/source non-null |
| 3 | Combined seed run produces both charter_type='bank' and charter_type='credit_union' rows | VERIFIED | Lines 165-202 seed both sources (limit=3 each), assert 'fdic' and 'ncua' in sources set, assert all row charter_types in ('bank','credit_union'), assert FDIC rows have charter_type='bank' and NCUA rows have charter_type='credit_union' |

**Score:** 3/3 truths verified (structural/static verification complete; runtime execution requires human)

### Deferred Items

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `fee_crawler/tests/e2e/test_seed_stage.py` | Three pytest tests covering FDIC, NCUA, and combined charter assertions | VERIFIED | File exists at the expected path; 203 lines; exactly 3 test functions confirmed by `grep -c "^def test_"` returning 3 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `test_seed_stage.py` | `fee_crawler/commands/seed_institutions.py` | `from fee_crawler.commands.seed_institutions import seed_fdic, seed_ncua` | WIRED | Import found at line 19; seed_fdic and seed_ncua defined at module level in seed_institutions.py lines 28 and 120 respectively |
| `test_seed_stage.py` | `fee_crawler/tests/e2e/conftest.py` | `seeded_db(test_db)` fixture; tests receive `test_config` | WIRED | `seeded_db` fixture at line 23 accepts `test_db`; all three tests take `(seeded_db, test_config)` params; `test_db` and `test_config` fixtures defined at lines 116 and 94 of conftest.py |

### Data-Flow Trace (Level 4)

Not applicable. This phase produces test infrastructure (pytest tests), not components that render dynamic data. The tests call real external APIs — data flow verification is handled by runtime test execution (see Human Verification section).

### Behavioral Spot-Checks

Step 7b: SKIPPED — tests call live external APIs (api.fdic.gov, ncua.gov) and require a Python environment with all dependencies installed. Running them without that context would fail for infrastructure reasons unrelated to correctness.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SEED-01 | 02-01-PLAN.md | Seed test populates crawl_targets with 3-5 institutions from a random geography with correct fields (name, charter_type, website_url, asset_size, fed_district) | VERIFIED (structural) | `test_seed_fdic_populates_crawl_targets` asserts all five required fields; PLAN note at line 181 clarifies geography filter is correctly absent at this phase (national dataset, Phase 9 adds geography) |
| SEED-02 | 02-01-PLAN.md | Seed test handles both FDIC (banks) and NCUA (credit unions) sources | VERIFIED (structural) | `test_seed_ncua_populates_crawl_targets` (NCUA-specific) and `test_seed_combined_charter_mix` (both sources) together prove both charter types and sources are exercised |

**Note on SEED-01 and "random geography":** REQUIREMENTS.md SEED-01 says "from a random geography." The PLAN explicitly documents at line 181 that `seed_fdic` does not filter by state — it pulls nationally sorted by asset size DESC. The `geography` fixture is wired for Phase 9's full pipeline test. This is intentional design, not a gap: the seed tests prove field correctness and charter type correctness, not geography filtering (which is a Phase 9 concern).

**Note on SEED-01 and "3-5 institutions":** ROADMAP SC 1 says "3-5 crawl_targets rows." The test uses `limit=5` and asserts `count >= 1`. This is a flexible bound rather than a strict range — the PLAN explains this guards against API variability. The FDIC API may return fewer than 5 if institutions have duplicates that are skipped. The minimum-of-1 assertion is weaker than "3-5" but the PLAN explicitly defends this choice. This is a known acceptable trade-off, not a defect.

**Orphaned requirements:** None. Only SEED-01 and SEED-02 are mapped to Phase 2 in REQUIREMENTS.md, and both are claimed by 02-01-PLAN.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `fee_crawler/commands/seed_institutions.py` | 96-97 | `except Exception: total_skipped += 1` — bare exception swallows all insertion errors silently | Warning | Duplicate-key violations are expected and silently skipped (UNIQUE constraint); but any other DB error (schema mismatch, connection failure) would also be silently swallowed and counted as a skip. Does not block the phase goal. |
| `fee_crawler/commands/seed_institutions.py` | 204 | Same bare `except Exception: total_skipped += 1` in NCUA insertion loop | Warning | Same concern as above for NCUA path. |

No blockers found. No TODO/FIXME/placeholder comments in either file. No hardcoded institution names or exact counts in tests.

### Human Verification Required

#### 1. Full e2e test suite execution

**Test:** From the project root with all Python dependencies installed, run:
```
python -m pytest fee_crawler/tests/e2e/ -v -m e2e
```
**Expected:** 9 passed (6 smoke tests from Phase 1 + 3 seed tests from Phase 2). No failures, no warnings about unexpected test counts.

**Why human:** Tests call live external APIs — `api.fdic.gov` (FDIC BankFind) and `ncua.gov` ZIP download (~20MB). These cannot be invoked without a live network and a Python environment with `requests`, `pytest`, and all `fee_crawler` dependencies installed.

#### 2. Production DB contamination guard

**Test:** After running the full e2e suite above, verify the command exits without the contamination guard firing:
```
grep "CRITICAL: data/crawler.db was modified" <test output>
```
**Expected:** No match — the guard assertion passes silently.

**Why human:** The `prod_db_contamination_guard` fixture is a session-teardown assertion. It can only fire (or not fire) at the end of a live pytest session — not through static analysis.

### Gaps Summary

No gaps found. All three observable truths are satisfied by the implementation:

- The artifact (`test_seed_stage.py`) exists, is substantive (203 lines, 3 complete test functions), and is wired to both its upstream dependencies (`seed_institutions.py` via direct import; `conftest.py` via fixture parameters).
- Both requirement IDs (SEED-01, SEED-02) are fully claimed and covered.
- The `seeded_db` fixture correctly truncates `crawl_targets` at both setup and teardown (lines 32-37), ensuring test independence.
- All three tests carry `@pytest.mark.e2e` only — no `@pytest.mark.llm` marker present.
- The documented commit (`b78f8c2`) exists in the git log with the expected message.

The `human_needed` status reflects that runtime execution against live external APIs is required to confirm the tests actually pass — not that any structural defect was found.

---

_Verified: 2026-04-06_
_Verifier: Claude (gsd-verifier)_
