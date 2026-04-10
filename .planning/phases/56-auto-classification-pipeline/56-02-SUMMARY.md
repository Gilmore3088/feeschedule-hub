---
phase: 56-auto-classification-pipeline
plan: "02"
subsystem: fee-crawler
tags: [classification, llm, cache, postgres, psycopg2, haiku, never-merge]
dependency_graph:
  requires: [56-01]
  provides: [classification_cache migration, classify_nulls command, confidence_classify_threshold]
  affects: [extracted_fees.canonical_fee_key, fee_crawler/config.py]
tech_stack:
  added: [classification_cache (Postgres table)]
  patterns: [cache-first LLM, tool_use batch call, ON CONFLICT idempotency, NEVER_MERGE guard]
key_files:
  created:
    - supabase/migrations/20260410_classification_cache.sql
    - fee_crawler/commands/classify_nulls.py
  modified:
    - fee_crawler/config.py
    - fee_crawler/tests/test_classify_nulls.py
decisions:
  - "Dedup by normalized_name before cache lookup — avoids one DB round-trip per duplicate fee name; single LLM call covers all rows sharing the same normalized form"
  - "Cache lookup uses SELECT with exact normalized_name match; ON CONFLICT DO UPDATE keeps cache coherent if re-run after model upgrade"
  - "NEVER_MERGE check uses substring containment on normalized_name to catch partial matches (e.g. 'nsf returned item' contains 'nsf')"
  - "float() cast applied to cached_conf before >= comparison to guard against unexpected psycopg2 return types in tests"
metrics:
  duration_seconds: 186
  completed_date: "2026-04-10T16:28:09Z"
  tasks_completed: 2
  files_created: 3
  files_modified: 2
---

# Phase 56 Plan 02: Classification Cache and LLM Batch Command Summary

**One-liner:** Postgres classification_cache table (normalized_name PK) plus classify_nulls.py command — cache-first Haiku batch classification with 0.90 confidence gate, CANONICAL_KEY_MAP key validation, and NEVER_MERGE guard.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create classification_cache migration | 173ae7a | supabase/migrations/20260410_classification_cache.sql |
| 2 RED | Failing tests for classify_nulls (TDD RED) | 54ffa5a | fee_crawler/tests/test_classify_nulls.py |
| 2 GREEN | Implement classify_nulls + config threshold | 1a400e5 | fee_crawler/commands/classify_nulls.py, fee_crawler/config.py |

## What Was Built

### classification_cache migration
- `normalized_name TEXT PRIMARY KEY` — deduplicated cache key from normalize_fee_name()
- `canonical_fee_key TEXT` nullable — NULL for low-confidence or unclassifiable fees
- `confidence FLOAT NOT NULL` + `model TEXT NOT NULL` — enables cache invalidation by model
- Two partial indexes: one for non-null key lookups, one for sub-0.90 confidence entries
- COMMENT blocks document D-03 purpose and D-02 threshold

### classify_nulls command
- `classify_with_cache(conn, normalized_name)` — SELECT cache, return (key, confidence) or (None, 0.0)
- `write_cache_entry(conn, ...)` — INSERT ... ON CONFLICT DO UPDATE for idempotent writes
- `_validate_llm_result(normalized_name, suggested_key)` — two-guard validator:
  1. CANONICAL_KEY_MAP membership check (T-56-04)
  2. NEVER_MERGE_PAIRS substring guard (T-56-05)
- `_classify_batch_with_llm(names)` — Haiku tool_use call with full valid key list injected into prompt
- `run(conn, *, fix=True)` — full pipeline: dedup → cache-first → LLM batch → 0.90 gate → apply

### config.py
- Added `confidence_classify_threshold: float = 0.90` to ExtractionConfig per D-02

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dedup before cache lookup, not after**
- **Found during:** Task 2 GREEN — test_batch_deduplicates_by_normalized_name failed with TypeError
- **Issue:** Original implementation called classify_with_cache() for every raw_name including duplicates, exhausting mock cursor side_effects and causing a MagicMock >= float comparison error
- **Fix:** Moved deduplication (seen_normalized set) before the cache-lookup loop so each unique normalized_name is looked up exactly once
- **Files modified:** fee_crawler/commands/classify_nulls.py
- **Commit:** 1a400e5 (applied inline during GREEN phase before final commit)

**2. [Rule 2 - Safety] float() cast on cached_conf before threshold comparison**
- **Found during:** Same test — MagicMock returned by default fetchone could cause type errors in edge cases
- **Fix:** Added `float(cached_conf)` cast before `>= CONFIDENCE_THRESHOLD` comparison
- **Files modified:** fee_crawler/commands/classify_nulls.py

## Known Stubs

None. All functions are fully implemented. No hardcoded empty values or placeholder returns.

## Threat Surface Scan

No new network endpoints or auth paths introduced. classify_nulls.py reads `ANTHROPIC_API_KEY` from environment via the anthropic SDK (T-56-06 accepted). Fee names enter the Haiku prompt but normalize_fee_name() strips special characters before they reach the LLM (T-56-07 mitigated). All threat mitigations from the plan's threat register are present in the implementation.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| supabase/migrations/20260410_classification_cache.sql | FOUND |
| fee_crawler/commands/classify_nulls.py | FOUND |
| fee_crawler/tests/test_classify_nulls.py | FOUND |
| commit 173ae7a (migration) | FOUND |
| commit 54ffa5a (RED tests) | FOUND |
| commit 1a400e5 (GREEN impl) | FOUND |
| 7 tests passing | VERIFIED |
