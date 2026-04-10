---
phase: 56-auto-classification-pipeline
plan: "01"
subsystem: fee-crawler
tags: [classification, canonical-keys, pipeline, tdd-scaffold]
dependency_graph:
  requires: []
  provides: [classify_fee-wired-insert, wave-0-test-scaffolds]
  affects: [fee_crawler/commands/merge_fees.py, fee_crawler/agents/state_agent.py]
tech_stack:
  added: []
  patterns: [classify_fee-before-insert, canonical-key-population]
key_files:
  created:
    - fee_crawler/tests/test_classify_nulls.py
    - fee_crawler/tests/test_snapshot.py
  modified:
    - fee_crawler/commands/merge_fees.py
    - fee_crawler/agents/state_agent.py
decisions:
  - "Discarded fee_category return value from classify_fee() in merge_fees.py with _ since categories list is already computed by crawl.py caller — no duplicate computation"
  - "Replaced normalize_fee_name() with classify_fee() in state_agent.py — classify_fee() is a strict superset, returning (category, canonical_key, variant) vs just category"
  - "normalize_fee_name import kept in state_agent.py to avoid breaking any other callers in that module"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-10"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 4
---

# Phase 56 Plan 01: Wire classify_fee() into INSERT Paths Summary

**One-liner:** Wired classify_fee() into both fee INSERT paths (merge_fees.py SQLite path and state_agent.py Postgres path) so every new fee extraction auto-populates canonical_fee_key and variant_type; created 12 Wave 0 test scaffolds for Plans 02 and 03.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wire classify_fee() into both INSERT paths | e4eb9f1 | fee_crawler/commands/merge_fees.py, fee_crawler/agents/state_agent.py |
| 2 | Create Wave 0 test scaffolds for Plans 02 and 03 | 741d54d | fee_crawler/tests/test_classify_nulls.py, fee_crawler/tests/test_snapshot.py |

## What Was Built

### Task 1: classify_fee() wiring

**merge_fees.py (SQLite/Database path):**
- Added `from fee_crawler.fee_analysis import classify_fee` import
- In the new fee INSERT branch (`else` block at line 144), calls `_, canonical_key, variant = classify_fee(fee.fee_name)` before INSERT
- INSERT statement extended with `canonical_fee_key, variant_type` columns and `canonical_key, variant` values
- The fee_category first return value is discarded (`_`) since `categories[i]` is already available from the caller-provided list

**state_agent.py (psycopg2/Postgres path):**
- Added `classify_fee` to the import from `fee_crawler.fee_analysis`
- Replaced `category = normalize_fee_name(fee_name)` with `category, canonical_key, variant = classify_fee(fee_name)` — classify_fee() is a strict superset
- INSERT statement extended with `canonical_fee_key, variant_type` columns and `canonical_key, variant` values

### Task 2: Wave 0 test scaffolds

**test_classify_nulls.py** (7 stubs for Plan 02 — LLM batch classification):
- cache hit/miss behavior
- confidence threshold gate (0.90)
- NEVER_MERGE guard at LLM write time
- batch deduplication by normalized name
- cache write idempotency (ON CONFLICT DO UPDATE)

**test_snapshot.py** (5 stubs for Plan 03 — quarterly snapshots):
- category-level snapshot row creation
- institution-level snapshot row creation
- idempotency on same-date re-run
- charter filter behavior
- QoQ delta computability

## Verification Results

```
41 passed, 12 skipped in 0.09s
```

- 41 existing classify_fee and never_merge tests: all PASSED
- 12 new scaffold tests: all SKIPPED (no ERRORs)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no stubs that block this plan's goal. The 12 test scaffolds in test_classify_nulls.py and test_snapshot.py are intentional placeholders for Plans 02 and 03 respectively, not data stubs.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. classify_fee() is pure in-memory dict lookup (T-56-02 disposition: accept per threat register). Parameterized queries (? and %s placeholders) prevent SQL injection at both INSERT sites (T-56-01 mitigated).

## Self-Check: PASSED

- [x] fee_crawler/commands/merge_fees.py — modified, contains classify_fee import and INSERT columns
- [x] fee_crawler/agents/state_agent.py — modified, contains classify_fee call and INSERT columns
- [x] fee_crawler/tests/test_classify_nulls.py — created, 7 functions present
- [x] fee_crawler/tests/test_snapshot.py — created, 5 functions present
- [x] Commit e4eb9f1 — Task 1
- [x] Commit 741d54d — Task 2
