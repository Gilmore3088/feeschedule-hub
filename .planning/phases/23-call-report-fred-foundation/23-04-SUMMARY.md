---
phase: 23-call-report-fred-foundation
plan: 04
subsystem: data-layer
tags: [cfpb, complaints, postgres-migration, district-queries]
dependency_graph:
  requires: []
  provides:
    - CFPB complaint ingestion via Postgres (psycopg2)
    - getDistrictComplaintSummary() query function
    - getInstitutionComplaintProfile() query function
  affects:
    - fee_crawler/commands/ingest_cfpb.py
    - src/lib/crawler-db/complaints.ts
tech_stack:
  added: []
  patterns:
    - psycopg2 direct connection pattern (matching probe_urls.py, roomba.py)
    - TDD Red-Green workflow for TypeScript query layer
key_files:
  created:
    - src/lib/crawler-db/complaints.ts
    - src/lib/crawler-db/complaints.test.ts
  modified:
    - fee_crawler/commands/ingest_cfpb.py
    - fee_crawler/__main__.py
decisions:
  - "Used psycopg2 direct connection pattern (os.environ[DATABASE_URL] + RealDictCursor) matching existing migrated commands (probe_urls.py, roomba.py) rather than via get_db() wrapper"
  - "complaints.ts uses sql.unsafe() for district queries (dynamic reportPeriod clause) and sql template literals for institution queries"
metrics:
  duration_minutes: 12
  completed_date: "2026-04-08"
  tasks_completed: 2
  files_modified: 4
---

# Phase 23 Plan 04: CFPB Complaint Layer Summary

Migrated CFPB complaint ingestion from legacy SQLite to Postgres and created district-level and institution-level complaint query functions for the TypeScript data layer.

## What Was Built

**Task 1 — ingest_cfpb.py Postgres migration:**
- Replaced `from fee_crawler.db import Database` with `import psycopg2` / `import psycopg2.extras`
- Added `_connect()` using `os.environ["DATABASE_URL"]` + `RealDictCursor` — same pattern as `probe_urls.py` and `roomba.py`
- Changed all SQL placeholders from `?` to `%s`
- Replaced `db.execute()` / `db.fetchall()` / `db.fetchone()` / `db.commit()` with cursor equivalents
- Updated `__main__.py` `cmd_ingest_cfpb` to call `_connect()` directly instead of `get_db()`

**Task 2 — complaints.ts TypeScript query layer (TDD):**
- `getDistrictComplaintSummary(district, reportPeriod?)`: returns total complaints, fee-related complaints (filtered by 3 FEE_ISSUES categories), institution count, and top 5 products for a Fed district
- `getInstitutionComplaintProfile(targetId)`: returns total complaints, breakdown by product, breakdown by top 10 issues, and fee_related_pct (rounded to 1 decimal)
- Exported `DistrictComplaintSummary` and `InstitutionComplaintProfile` interfaces
- 9 tests covering district totals, empty district zero-counts, institution profile, fee_related_pct math

## Test Results

```
Tests  9 passed (9)
```

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints introduced. CFPB API access is read-only HTTPS to a public endpoint (T-23-11 mitigated). Complaint data is already public; no PII exposure (T-23-14 accepted). No new trust boundaries introduced beyond what the threat model documented.

## Self-Check: PASSED

- FOUND: src/lib/crawler-db/complaints.ts
- FOUND: src/lib/crawler-db/complaints.test.ts
- FOUND: fee_crawler/commands/ingest_cfpb.py
- FOUND: commit 54c57c6 (migrate ingest_cfpb to Postgres)
- FOUND: commit d1d6e7a (failing tests — RED)
- FOUND: commit 3dda1cb (implement complaints — GREEN)
