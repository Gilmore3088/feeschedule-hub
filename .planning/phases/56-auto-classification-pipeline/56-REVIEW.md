---
phase: 56-auto-classification-pipeline
reviewed: 2026-04-10T20:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - fee_crawler/__main__.py
  - fee_crawler/agents/state_agent.py
  - fee_crawler/commands/classify_nulls.py
  - fee_crawler/commands/merge_fees.py
  - fee_crawler/commands/roomba.py
  - fee_crawler/commands/snapshot_fees.py
  - fee_crawler/config.py
  - fee_crawler/modal_app.py
  - fee_crawler/tests/test_classify_nulls.py
  - fee_crawler/tests/test_roomba_canonical.py
  - fee_crawler/tests/test_snapshot.py
  - supabase/migrations/20260410_classification_cache.sql
  - supabase/migrations/20260410_snapshot_tables.sql
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 56: Code Review Report

**Reviewed:** 2026-04-10T20:00:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Phase 56 introduces three new commands (classify-nulls, snapshot, roomba enhancements) and two migration files for the auto-classification pipeline. The architecture is sound: cache-first LLM classification, NEVER_MERGE guard rails, idempotent snapshot tables, and pure-function Roomba helpers for testability. One critical off-by-one bug in `classify_with_cache` will cause an IndexError at runtime, blocking the entire classify-nulls pipeline. Three warnings flag missing error handling and a cache bypass logic issue.

## Critical Issues

### CR-01: Off-by-one IndexError in classify_with_cache tuple access

**File:** `fee_crawler/commands/classify_nulls.py:103`
**Issue:** The SQL query `SELECT canonical_fee_key, confidence` returns 2 columns (indices 0 and 1 for a plain psycopg2 tuple cursor). The code accesses `row[1]` (confidence) and `row[2]` (IndexError). The connection passed from `cmd_classify_nulls` in `__main__.py:331` is a plain `psycopg2.connect()` without `RealDictCursor`, so rows are tuples. This will raise `IndexError: tuple index out of range` on every cache hit, making the cache entirely non-functional and forcing all lookups to the LLM.
**Fix:**
```python
# Line 103: change row[1], row[2] to row[0], row[1]
if row is None:
    return None, 0.0
return row[0], row[1]
```

## Warnings

### WR-01: Cache hit detection logic may skip valid cached null classifications

**File:** `fee_crawler/commands/classify_nulls.py:291`
**Issue:** The condition `if cached_key is not None or cached_conf > 0.0` is used to detect cache hits. However, when a fee was cached with `canonical_fee_key=NULL` and `confidence=0.0` (meaning "LLM could not classify at all"), this condition evaluates to `False`, treating it as a cache miss. This causes a redundant LLM API call for fees that were already determined to be unclassifiable. While not incorrect behavior (the LLM call will produce the same result and re-cache), it wastes API budget.
**Fix:**
```python
# Query the cache and check for row existence rather than value content.
# Change classify_with_cache to return a 3-tuple: (key, confidence, found)
# Or simpler: check if the row was found separately from the values
cached_key, cached_conf = classify_with_cache(conn, normalized)
# A dedicated cache-hit check:
if cached_key is not None or cached_conf > 0.0:
    # This misses (None, 0.0) cached entries. Consider returning a sentinel.
```
A minimal fix: change `classify_with_cache` to return `(None, -1.0)` on miss and `(None, 0.0)` when a null classification was cached. Then check `cached_conf >= 0.0` for cache hit.

### WR-02: snapshot_fees P25/P75 calculation uses floor indexing, off by one for small N

**File:** `fee_crawler/commands/snapshot_fees.py:79-80`
**Issue:** P25 and P75 are computed as `sorted_amounts[int(n * 0.25)]` and `sorted_amounts[int(n * 0.75)]`. When `n=1`, `int(1 * 0.75) = 0` which works. But when `n=4`, `int(4 * 0.75) = 3` which is the last element (max), not the 75th percentile. For small category groups (common in early pipeline stages), this produces inaccurate quartile values. The `statistics.quantiles` function handles this correctly.
**Fix:**
```python
import statistics
# Replace lines 79-80 with:
quantiles = statistics.quantiles(sorted_amounts, n=4) if n >= 2 else [sorted_amounts[0], sorted_amounts[0], sorted_amounts[0]]
p25 = quantiles[0]
p75 = quantiles[2]
```

### WR-03: roomba sweep_recategorize uses sys.path.insert(0, ".") hack

**File:** `fee_crawler/commands/roomba.py:301-302`
**Issue:** `sys.path.insert(0, ".")` followed by `from fee_crawler.fee_analysis import FEE_FAMILIES` is fragile and unnecessary. The import already works without the sys.path hack since `fee_crawler` is a package. This same pattern appears again at line 582. The sys.path mutation is a side effect that persists for the rest of the process and could cause import resolution issues.
**Fix:**
```python
# Remove lines 301-302 and replace with direct import at module level or inline:
from fee_crawler.fee_analysis import FEE_FAMILIES
# Remove the sys.path.insert(0, ".") call entirely
```

## Info

### IN-01: merge_fees standalone run() is a placeholder

**File:** `fee_crawler/commands/merge_fees.py:229-237`
**Issue:** The standalone `run()` function's for-loop body just does `total_new += 1` per row without actually performing any merge logic. The comment says "This is a placeholder" but the command is registered in `__main__.py` and callable by users, which could be misleading.
**Fix:** Add a `print("WARNING: standalone merge is a placeholder")` or raise `NotImplementedError` until the full implementation is ready.

### IN-02: snapshot_fees foreign key not enforced at DB level

**File:** `supabase/migrations/20260410_snapshot_tables.sql:28`
**Issue:** `institution_fee_snapshots.crawl_target_id` is declared as `INTEGER NOT NULL` but has no `REFERENCES crawl_targets(id)` foreign key constraint. This allows orphaned snapshot rows if a crawl_target is deleted. The category-level table similarly lacks a foreign key on `fee_category` to any taxonomy table (though no such reference table may exist).
**Fix:** Add `REFERENCES crawl_targets(id)` to the column definition if referential integrity is desired.

### IN-03: Test file uses DISTINCT fee_name query but tests return duplicates

**File:** `fee_crawler/tests/test_classify_nulls.py:177-179`
**Issue:** `test_batch_deduplicates_by_normalized_name` returns 5 identical tuples from the mock `fetchall`, but the real SQL uses `SELECT DISTINCT fee_name`, which would only return 1 row. The test still validates the dedup logic correctly (the code handles duplicate raw names mapping to the same normalized form), but the mock setup does not match the actual DB behavior. This is a minor test fidelity issue.
**Fix:** No action required; the test logic is correct for its purpose. For improved fidelity, return 5 rows with slightly different raw names that normalize to the same value.

---

_Reviewed: 2026-04-10T20:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
