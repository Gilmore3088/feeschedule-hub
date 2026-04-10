---
phase: 58-ffiec-pipeline-institution-data
plan: 01
subsystem: fee-crawler-pipeline
tags: [ingestion, postgres, ffiec, ncua, backfill, modal]
dependency_graph:
  requires: []
  provides: [institution_financials-nullable-fk, ffiec-postgres-ingestion, ncua-postgres-ingestion, quarterly-modal-gate]
  affects: [institution_financials, crawl_targets]
tech_stack:
  added: []
  patterns: [psycopg2-direct-connection, fdic-bankfind-api, retry-with-backoff, nullable-fk-with-partial-index]
key_files:
  created:
    - scripts/migrations/058_nullable_crawl_target_id.sql
  modified:
    - fee_crawler/commands/ingest_call_reports.py
    - fee_crawler/commands/ingest_ncua.py
    - fee_crawler/__main__.py
    - fee_crawler/modal_app.py
    - scripts/migrate-schema.sql
decisions:
  - Used FDIC BankFind REST API instead of FFIEC CDR bulk ZIP for bank backfill (simpler, no auth, same data)
  - Quarterly Modal gate added inside existing ingest_data function (no new cron, respects 5-cron limit)
  - Unmatched institutions stored with crawl_target_id=NULL and source_cert_number for future matching
metrics:
  duration: 5m 23s
  completed: 2026-04-10T20:39:51Z
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 5
---

# Phase 58 Plan 01: FFIEC/NCUA Postgres Migration + Backfill Summary

Ported FFIEC CDR and NCUA 5300 ingestion from SQLite Database class to direct psycopg2 Postgres connections, added nullable crawl_target_id FK for unmatched institutions, historical backfill from 2010, retry with exponential backoff, and quarterly auto-ingestion via Modal date gate.

## What Was Built

### Schema Migration (058_nullable_crawl_target_id.sql)
- Makes `crawl_target_id` nullable on `institution_financials` (was NOT NULL)
- Adds `source_cert_number` TEXT column for deduplication of unmatched rows
- Creates partial unique index `idx_financials_unmatched` on `(source_cert_number, report_date, source) WHERE crawl_target_id IS NULL`
- Creates lookup index `idx_financials_cert` on `source_cert_number`
- Backfills `source_cert_number` from `crawl_targets.cert_number` for existing matched rows
- Updated `scripts/migrate-schema.sql` for fresh deployments

### ingest_call_reports.py (Complete Rewrite)
- Replaced SQLite `Database` class with `psycopg2.connect(DATABASE_URL)`
- Uses FDIC BankFind REST API (`banks.data.fdic.gov/api/financials`) for data fetching
- Matches institutions by cert_number first, fuzzy name+state fallback (D-09)
- Inserts ALL institutions: matched with `crawl_target_id`, unmatched with `NULL` + `source_cert_number` (D-10)
- `--backfill --from-year 2010` downloads all quarters from 2010 to present
- Standard mode fetches latest 4 quarters
- HTTP retry: 3 attempts with exponential backoff (2s, 4s, 8s)
- Commits after each quarter to avoid losing progress
- Prints summary report with matched/unmatched/error counts

### ingest_ncua.py (Complete Rewrite)
- Replaced SQLite `Database` class with `psycopg2.connect(DATABASE_URL)`
- Preserves all FS220/FS220A field mappings and NCUA whole-dollar-to-thousands conversion
- Matches credit unions by charter_number (D-09)
- Inserts ALL credit unions: matched and unmatched with partial unique index dedup (D-10)
- `--backfill --from-year 2010` iterates quarterly ZIPs (months 3, 6, 9, 12)
- ZIP download retry: 3 attempts with exponential backoff
- Commits after each quarter
- Prints summary report

### Modal Quarterly Gate
- Added date-gated quarterly block inside existing `ingest_data()` function
- Triggers on Feb 15, May 15, Aug 15, Nov 15 (approximate FFIEC release dates)
- Runs `ingest-call-reports` and `ingest-ncua` with 3600s subprocess timeout
- No new cron job added (stays at 5 crons total)

### CLI Updates (__main__.py)
- `ingest-call-reports`: removed old --csv/--report-date/--source/--gaps args, added --backfill and --from-year
- `ingest-ncua`: added --backfill and --from-year alongside existing --quarter and --limit
- Command handlers connect directly to Postgres (no Database/Config dependency)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 306a99d | Port FFIEC/NCUA ingestion to Postgres with nullable FK, backfill, and retry |
| 2 | a2a329f | Add quarterly date gate to Modal ingest_data for FFIEC/NCUA |

## Decisions Made

1. **FDIC BankFind API over FFIEC CDR bulk ZIP** -- The FDIC REST API provides all needed income fields (SC, NONII, INTINC, etc.) with simple pagination, no form POST auth, and historical data back to 2010. Matches the pattern already established in `ingest_fdic.py`.

2. **Quarterly gate inside ingest_data** -- Added as a date-checked branch inside the existing daily `ingest_data()` function rather than a new `@app.function(schedule=...)` to stay within the Modal 5-cron limit.

3. **Direct psycopg2 instead of Database class** -- Both scripts now connect directly via `psycopg2.connect(os.environ["DATABASE_URL"])` rather than going through the `Database` adapter, matching the Phase 56 migration pattern.

## Deviations from Plan

None -- plan executed exactly as written.

## Threat Surface Scan

No new threat surface introduced. All SQL uses `%s` parameterized queries via psycopg2 (T-58-01, T-58-02). DATABASE_URL read from `os.environ` only (T-58-03). No new network endpoints or auth paths added.

## Self-Check: PASSED
