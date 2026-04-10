---
phase: 55-canonical-taxonomy-foundation
plan: "02"
subsystem: fee-pipeline
tags: [backfill, canonical-taxonomy, psycopg2, typescript, tdd]
dependency_graph:
  requires: [55-01]
  provides: [backfill-canonical-command, fee-instance-canonical-fields]
  affects: [fee_crawler/commands, src/lib/crawler-db/fees.ts]
tech_stack:
  added: [psycopg2 (backfill_canonical.py)]
  patterns: [CASE WHEN SQL backfill, expand-and-contract migration, TDD red-green]
key_files:
  created:
    - fee_crawler/commands/backfill_canonical.py
    - fee_crawler/tests/test_backfill_canonical.py
  modified:
    - fee_crawler/__main__.py
    - src/lib/crawler-db/fees.ts
decisions:
  - "CASE WHEN in single SQL UPDATE (not Python loop) for canonical_fee_key — faster for 15K rows, atomic"
  - "Python loop used only for variant_type — requires detect_variant_type() call per row"
  - "Dry-run is default — operator must explicitly pass live flag; prevents accidental production mutations"
  - "fee-index.ts not modified — expand-and-contract pattern: index stays on fee_category until backfill verified"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-10T06:03:03Z"
  tasks_completed: 2
  files_changed: 4
---

# Phase 55 Plan 02: Canonical Backfill & TypeScript Types Summary

Backfill script, index count snapshot verification, and FeeInstance TypeScript type update for canonical_fee_key and variant_type.

## What Was Built

**Task 1: Backfill script with index count snapshot verification** (`ec2c8f3`)

- `fee_crawler/commands/backfill_canonical.py` — production backfill script with:
  - `build_case_when_sql()` — generates a single SQL UPDATE with CASE WHEN covering all 56 CANONICAL_KEY_MAP entries; uses Postgres syntax (no `?` placeholders)
  - `snapshot_index_counts(conn)` — captures institution_count per fee_category before/after backfill, mirrors getNationalIndex() logic
  - `compare_snapshots(before, after)` — returns zero diffs when backfill is safe; flags any institution_count regression
  - `backfill_canonical_keys(conn, dry_run=True)` — runs Option A (SQL CASE WHEN), commits, compares snapshots
  - `backfill_variant_types(conn, dry_run=True)` — runs Option B (Python loop), calls detect_variant_type() per row, batches at 1000 rows
  - `run(dry_run=True)` — CLI entry point connecting to DATABASE_URL

- `fee_crawler/tests/test_backfill_canonical.py` — 16 tests (TDD red-green):
  - SQL generation covers all CANONICAL_KEY_MAP keys
  - WHERE clause excludes NULL fee_category rows
  - Identity mapping verified (overdraft -> overdraft)
  - Synonym mapping verified (rush_card_delivery -> rush_card)
  - variant_type detection for rush, express, daily_cap, standard (None)
  - Snapshot comparison: zero diff, regression detection, new/dropped categories

- `fee_crawler/__main__.py` — wired `backfill-canonical` command with `--dry-run` flag

**Task 2: TypeScript FeeInstance type** (`8cb5cab`)

- `src/lib/crawler-db/fees.ts` — added two nullable fields to `FeeInstance`:
  - `canonical_fee_key: string | null`
  - `variant_type: string | null`
- Updated `getFeeCategoryDetail` SELECT to include `ef.canonical_fee_key, ef.variant_type`
- `fee-index.ts` is confirmed unmodified (expand-and-contract pattern preserved)

## Verification Results

```
python -m pytest fee_crawler/tests/test_backfill_canonical.py -v
=> 16 passed in 0.08s

npx tsc --noEmit | grep "fees.ts"
=> No errors in fees.ts

git diff src/lib/crawler-db/fee-index.ts
=> (empty — file not touched)

grep -n "canonical_fee_key" src/lib/crawler-db/fees.ts
=> 31: canonical_fee_key: string | null;
=> 154: ef.canonical_fee_key, ef.variant_type
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The backfill script connects to production DATABASE_URL. canonical_fee_key and variant_type columns exist in DB from Plan 01 migration and will be NULL until `python -m fee_crawler backfill-canonical` is run (without `--dry-run`).

## Self-Check: PASSED

- `fee_crawler/commands/backfill_canonical.py` — FOUND
- `fee_crawler/tests/test_backfill_canonical.py` — FOUND
- `src/lib/crawler-db/fees.ts` with canonical_fee_key — FOUND
- Commit ec2c8f3 — FOUND
- Commit 8cb5cab — FOUND
- fee-index.ts unmodified — CONFIRMED
