---
id: 260416-d9t
title: Phase 55 Canonical Taxonomy — Audit Findings
date: 2026-04-16
status: complete
one_liner: Phase 55 is ~85% shipped inside Phases 56–59 — 4 concrete gaps remain
---

# Phase 55 Canonical Taxonomy — Audit Findings

## Headline

The ROADMAP.md checkbox says Phase 55 is "not started". The code says otherwise. Most Phase 55 infrastructure was shipped inside Phases 56–59. Four concrete gaps remain, not a from-scratch build.

## Per-Criterion Findings

### SC1 — `canonical_fee_key` column on `extracted_fees` (idempotent)

**Status:** ✓ Shipped (Postgres), ✗ SQLite schema drift

| Evidence | Location |
|---|---|
| Migration exists, idempotent | `supabase/migrations/20260409_canonical_fee_key.sql` |
| Uses `ADD COLUMN IF NOT EXISTS` | Same file — re-running is a no-op |
| Partial index on non-null keys | `idx_fees_canonical_key` in same migration |
| Also adds `variant_type` column | Same migration |

**Gap:** The legacy SQLite schema in `fee_crawler/db.py` does not include `canonical_fee_key` or `variant_type`. Local dev DB at `data/crawler.db` is missing both columns. This is schema drift.

Per memory `project_kill_sqlite.md`, the SQLite path is deprecated and all production code targets Postgres. The drift is low-severity but should be tracked.

### SC2 — ~200-key canonical map + parity unit test

**Status:** ✓ Map exists, ✗ Cross-language parity test missing

| Evidence | Location |
|---|---|
| `CANONICAL_KEY_MAP` exists with 173 entries | `fee_crawler/fee_analysis.py:93` |
| All 49 base categories have identity entries | Covered by `test_backfill_canonical.py:94-105` |
| Backfill CASE WHEN covers every map entry | `test_backfill_canonical.py:25-47` |
| TS `FEE_FAMILIES` has 49 unique categories | `src/lib/fee-taxonomy.ts` |

**Gaps:**
1. No test asserts Python `CANONICAL_KEY_MAP` count matches the TS `TAXONOMY_COUNT = Object.values(FEE_FAMILIES).flat().length`. Cross-language drift could go undetected.
2. 173 entries ≠ "~200" from the roadmap success criterion — either the roadmap was aspirational or synonym expansion remains.

Recommended fix: add a Python snapshot test that asserts the count of Python base categories matches a hard-coded number (49), and a matching TS vitest assertion. Or generate the TS taxonomy from Python via a build step.

### SC3 — Backfill populated every row; index counts identical pre/post

**Status:** ✓ Script exists with parity check, ? Prod execution unverified

| Evidence | Location |
|---|---|
| Backfill command exists | `fee_crawler/commands/backfill_canonical.py` (254 lines) |
| Option A: SQL `UPDATE ... CASE WHEN` from `CANONICAL_KEY_MAP` | `build_case_when_sql()` |
| Option B: Python loop for `variant_type` detection | `detect_variant_type()` |
| Index count parity check built in | `snapshot_index_counts()` called before and after (lines 117, 140) |
| Test covers SQL generation + snapshot parity | `test_backfill_canonical.py` |

**Gap:** Cannot confirm from this session whether the backfill has been run against production. The `.env` DATABASE_URL points at `db.rmhwbbjjctzfaqjyhomu.supabase.co:5432` with a password that authentication-fails — the working prod URL uses the transaction pooler at port 6543 (per CLAUDE.md) and is not in `.env`.

Action for operator: run `python -m fee_crawler backfill-canonical --dry-run` in a prod-connected shell. If the dry-run reports zero rows to update, the backfill already ran. Otherwise it has not.

Verification query for operator:
```sql
SELECT
  COUNT(*) FILTER (WHERE canonical_fee_key IS NULL AND fee_category IS NOT NULL) AS null_with_cat,
  COUNT(*) AS total
FROM extracted_fees;
```
`null_with_cat` must be 0 for SC3 to pass.

### SC4 — NEVER_MERGE pytest runs in CI before alias expansion

**Status:** ✓ Test exists, ✗ **CI does not run it** — critical gap

| Evidence | Location |
|---|---|
| `NEVER_MERGE_PAIRS` defined with 7 required pairs | `fee_crawler/fee_analysis.py:316` |
| Comprehensive test file | `fee_crawler/tests/test_never_merge.py` (existence, pairs, alias isolation) |
| Pairs: nsf/overdraft, domestic/intl wires, atm/card_replacement, od_protection/overdraft, od_daily_cap/overdraft, nsf_daily_cap/nsf | `test_never_merge.py:35-46` |

**Gap — critical:**
`.github/workflows/e2e-tests.yml` runs pytest with marker filters only:

- Fast job: `pytest -m "e2e and not llm and not slow"`
- Slow job: `pytest -m "e2e or llm or slow"`

`test_never_merge.py` has **no pytest markers**. It is not executed by either job. `pyproject.toml:markers` only registers `e2e`, `llm`, `slow` — there is no default that would catch unmarked tests.

Impact: any alias expansion PR could introduce a NEVER_MERGE violation and CI would green. The guard is effectively off.

**Fix:** either (a) add `pytest -m "not e2e and not llm and not slow"` unit-test job to CI, or (b) add `pytestmark = pytest.mark.e2e` to `test_never_merge.py` so it rides the existing fast job. Option (a) is the right move — unit tests should always run.

### SC5 — Roomba flags 3+ stdev outliers with `flagged` status

**Status:** ✓ Logic exists, ? Prod execution unverified

| Evidence | Location |
|---|---|
| Roomba command exists | `fee_crawler/commands/roomba.py` |
| 3-stddev threshold implemented | `find_canonical_outliers()` at `roomba.py:413, 451-452` |
| `flagged` review_status in schema | `fee_crawler/db.py:133, 625` |
| Dedicated test file | `fee_crawler/tests/test_roomba_canonical.py` |
| Per-category rejection bands also defined | `REJECTION_BANDS` dict at `roomba.py:38` |

**Gap:** Cannot confirm Roomba has been run against production or that flagged rows are visible in the admin review queue. Same prod-credential blocker as SC3.

Action for operator: run `python -m fee_crawler roomba` (dry-run) against prod, then visit `/admin` review queue and confirm at least one row with `review_status = 'flagged'` appears.

## Gap List (Consolidated)

| # | Severity | Gap | Recommended fix |
|---|---|---|---|
| G1 | **High** | `test_never_merge.py` is not run in CI (no pytest marker, CI filters by marker only) | Add a unit-test CI job running `pytest -m "not e2e and not llm and not slow"`. ~10 line workflow change. |
| G2 | Medium | No Python↔TS parity test for canonical taxonomy count | Add vitest assertion in `src/lib/fee-taxonomy.test.ts` that `TAXONOMY_COUNT === 49`, and Python snapshot test asserting the same. |
| G3 | Medium | Backfill execution status against prod DB unverified | Operator runs `backfill-canonical --dry-run` in prod-connected shell, confirms zero rows to update. If non-zero, run without `--dry-run`. |
| G4 | Medium | Roomba execution status against prod unverified | Operator runs `roomba` and confirms flagged rows appear in `/admin` review queue. |
| G5 | Low | `fee_crawler/db.py` SQLite schema lacks `canonical_fee_key` / `variant_type` | Defer — `project_kill_sqlite.md` has the broader cleanup slated. |

## Recommendation

Phase 55 does not need a full-phase plan. The remaining work is one small CI change (G1), one small parity test (G2), and two operator verifications (G3, G4). Total: ~2 hours.

Suggested path:

1. `/gsd-plan-phase 55 --gaps` or a focused `/gsd-quick` that addresses G1 + G2 as code changes
2. Run G3 and G4 as operator-run verifications in a prod-connected shell (outside this session)
3. Check Phase 55 off ROADMAP.md once all four are green

## Artifacts Consulted

- `fee_crawler/fee_analysis.py` (CANONICAL_KEY_MAP, NEVER_MERGE_PAIRS)
- `fee_crawler/commands/backfill_canonical.py`
- `fee_crawler/commands/roomba.py`
- `fee_crawler/tests/test_never_merge.py`
- `fee_crawler/tests/test_backfill_canonical.py`
- `supabase/migrations/20260409_canonical_fee_key.sql`
- `src/lib/fee-taxonomy.ts`
- `.github/workflows/e2e-tests.yml`
- `pyproject.toml` (pytest markers)
- `fee_crawler/db.py` (legacy SQLite schema)
- `data/crawler.db` (local SQLite — column absent)
