---
id: 260416-dhf
title: G1+G2 — Unit tests in CI and Python↔TS taxonomy parity
date: 2026-04-16
status: complete
one_liner: Closed Phase 55 gaps G1 (CI coverage) and G2 (taxonomy parity) in three atomic commits
---

# G1 + G2 — Complete

## What shipped

### G1 — `6c84328` — `ci(unit-tests): run Python unit tests on every push and PR`

New file `.github/workflows/unit-tests.yml`. Triggers on push to main and every PR, runs `pytest -m "not e2e and not llm and not slow"` against `fee_crawler/tests/` with a 30s per-test timeout and no external deps (no tesseract, no R2, no API keys).

The existing `e2e-tests.yml` only runs on nightly schedule and manual dispatch. `test_never_merge.py` has no pytest marker so the NEVER_MERGE guards never executed in CI. They now run on every merge-blocking check — 24 cases, <1s.

### G2-TS — `7d55606` — `test(taxonomy): tripwire for Python↔TS CANONICAL_KEY_MAP drift`

Edited `src/lib/fee-taxonomy.test.ts`. Added two pinned assertions:

- `TAXONOMY_COUNT === 49` (base fee categories)
- `CANONICAL_KEY_COUNT === 181` (full canonical key map)

Constants are hard-coded with a comment pointing at the Python counterpart. The audit initially guessed 173 for the canonical count; the test itself caught the drift and surfaced the real number (181).

### G2-PY — `fa4db81` — `test(taxonomy): add Python-side tripwire`

Edited `fee_crawler/tests/test_backfill_canonical.py`. Added paired assertions:

- `len(FEE_FAMILIES base categories) == 49`
- `len(CANONICAL_KEY_MAP) == 181`

Runs under the new `unit-tests.yml` workflow. Comments reference the TS test — a size change on either side fails one test and forces a matched update on the other.

## Verification

```
# Python unit tests (what CI now runs)
$ PYTHONPATH=. pytest -m "not e2e and not llm and not slow" fee_crawler/tests/
252 passed, 30 deselected in 0.69s

# TS taxonomy tests
$ npx vitest run src/lib/fee-taxonomy.test.ts
Test Files  1 passed (1)
Tests       6 passed (6)
```

Python went from 250 → 252 tests (two new tripwires). TS went from 5 → 6 tests (CANONICAL_KEY_COUNT added; TAXONOMY_COUNT replaced the `>= 49` looseness).

## Phase 55 gap list — updated

| # | Status | Gap |
|---|---|---|
| G1 | **closed** | Unit tests now run in CI |
| G2 | **closed** | Tripwire tests assert Python↔TS count parity |
| G3 | open | Operator must run `fee_crawler backfill-canonical --dry-run` in prod shell |
| G4 | open | Operator must run `fee_crawler roomba` and verify flagged rows in `/admin` |
| G5 | deferred | SQLite schema drift — covered by `project_kill_sqlite.md` |

## Recommended next step

G3 and G4 need prod DB credentials I don't have in this session. The operator (James) runs them in a shell with a working DATABASE_URL. Once both green, Phase 55 can be marked complete on ROADMAP.md.

## Out of scope (confirmed)

- Phase 55 remaining work now lives in two operator-run verifications, not code
- `CANONICAL_KEY_MAP` entries unchanged — this shipped tests only
- STATE.md milestone/phase sync with v9.0 — `gsd-progress` output still shows stale v3.0 pointers; separate ticket if worth fixing
