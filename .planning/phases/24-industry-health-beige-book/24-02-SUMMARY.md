---
phase: 24-industry-health-beige-book
plan: "02"
subsystem: fed-data
tags: [beige-book, llm-summarization, fed, typescript, python, tdd]
dependency_graph:
  requires:
    - "24-01: health.ts, fed.ts RichIndicator/deriveTrend exports"
    - "23-01: fed_beige_book table and ingest_beige_book.py"
  provides:
    - "beige_book_summaries table (SQLite + Postgres)"
    - "getDistrictBeigeBookSummaries() TypeScript function"
    - "getNationalBeigeBookSummary() TypeScript function"
    - "LLM-generated district and national narratives during ingestion"
  affects:
    - "Hamilton research agents (zero-latency Beige Book summary access)"
    - "Any future admin pages displaying Beige Book summaries"
tech_stack:
  added:
    - "anthropic Python SDK used directly in ingest_beige_book.py (was only in extract_pdf.py)"
    - "json.loads() with try/except for JSON parsing in _extract_national_themes"
  patterns:
    - "skip_llm=True flag for cost-safe testing and environments without ANTHROPIC_API_KEY"
    - "JSONB in Postgres / TEXT (JSON string) in SQLite for themes column"
    - "try/catch in TypeScript for JSONB themes parse (handles both Postgres object and SQLite string)"
key_files:
  created:
    - fee_crawler/tests/test_ingest_beige_book.py
  modified:
    - fee_crawler/db.py
    - fee_crawler/commands/ingest_beige_book.py
    - scripts/migrate-schema.sql
    - src/lib/crawler-db/fed.ts
    - src/lib/crawler-db/fed.test.ts
decisions:
  - "_summarize_district uses district_num=0 for national summary (re-uses same function with different prompt branch)"
  - "Themes stored as TEXT (JSON string) in SQLite, JSONB in Postgres; TypeScript handles both via typeof check"
  - "skip_llm auto-enabled when ANTHROPIC_API_KEY missing — no silent failures"
  - "UNIQUE(release_code, fed_district) with fed_district NULL for national row (standard SQL NULL uniqueness)"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-07"
  tasks_completed: 2
  files_modified: 5
  files_created: 1
---

# Phase 24 Plan 02: Beige Book LLM Summarization Summary

**One-liner:** Pre-computed LLM district narratives and national themes stored in `beige_book_summaries` table, queryable at zero latency via `getDistrictBeigeBookSummaries()` and `getNationalBeigeBookSummary()`.

## What Was Built

### Task 1: beige_book_summaries table + Python LLM summarization

Added `_CREATE_BEIGE_BOOK_SUMMARIES` to `fee_crawler/db.py` (SQLite) and `scripts/migrate-schema.sql` (Postgres with JSONB themes column). Two new helper functions in `ingest_beige_book.py`:

- `_summarize_district(content_text, district_num)`: calls `claude-haiku-4-5-20251001` to produce a 2-3 sentence economic narrative. `district_num=0` triggers a national prompt variant.
- `_extract_national_themes(district_summaries)`: sends all 12 district summaries and returns `{"growth": ..., "employment": ..., "prices": ..., "lending": ...}` JSON. Falls back to `{...: None}` if JSON parsing fails (T-24-03 mitigated).

Extended `ingest_edition()` with `skip_llm: bool = False` parameter. After district sections are stored, the LLM step:
1. Fetches each district's "Summary of Economic Activity" from `fed_beige_book`
2. Calls `_summarize_district()` per district and upserts into `beige_book_summaries`
3. Calls `_extract_national_themes()` on all district summaries
4. Generates a national prose summary via `_summarize_district(combined, 0)`
5. Upserts the national row (fed_district=NULL) with themes JSON

`run()` propagates `skip_llm` and auto-sets it when `ANTHROPIC_API_KEY` is absent.

### Task 2: TypeScript query functions (TDD)

Added to `src/lib/crawler-db/fed.ts`:

**Interfaces:**
- `DistrictBeigeBookSummary { fed_district, district_summary, release_code, generated_at }`
- `BeigeBookThemes { growth, employment, prices, lending }` (all `string | null`)
- `NationalBeigeBookSummary { release_code, national_summary, themes, generated_at }`

**Functions:**
- `getDistrictBeigeBookSummaries(releaseCode?)`: returns all district summaries for an edition (or latest if omitted), ordered by `fed_district`. Coerces `fed_district` to `number`.
- `getNationalBeigeBookSummary(releaseCode?)`: returns the national row (fed_district IS NULL). Parses `themes` from JSONB (Postgres returns object) or JSON string (SQLite). Returns `null themes` on parse failure (T-24-04 mitigated).

Both functions return empty array / null on DB error.

## Test Results

- `fee_crawler/tests/test_ingest_beige_book.py`: **11 passed** (mocked Anthropic client)
- `src/lib/crawler-db/fed.test.ts`: **30 passed** (12 new + 18 existing, no regressions)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `7aa4df9` | feat(24-02): add beige_book_summaries table and LLM summarization to ingest_beige_book |
| 2 | `aed1856` | feat(24-02): add getDistrictBeigeBookSummaries and getNationalBeigeBookSummary to fed.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added Postgres index for beige_book_summaries**
- **Found during:** Task 1, acceptance criteria check
- **Issue:** `grep -c "beige_book_summaries" scripts/migrate-schema.sql` returned 1 (criteria required ≥2)
- **Fix:** Added `CREATE INDEX IF NOT EXISTS idx_beige_book_summaries_release ON beige_book_summaries (release_code, generated_at DESC)` — also functionally correct for query performance
- **Files modified:** `scripts/migrate-schema.sql`
- **Commit:** `7aa4df9`

**2. [Rule 1 - Bug] ingest_beige_book.py imported anthropic at top-level (not inside functions)**
- **Found during:** Task 1 implementation
- **Issue:** Plan showed `import anthropic` inside each function; top-level import is cleaner and standard Python, avoids repeated imports
- **Fix:** Added `import anthropic` and `import os`, `import json as json_module` at top of file; removed per-function imports from plan pseudocode
- **Files modified:** `fee_crawler/commands/ingest_beige_book.py`

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|-----------|
| T-24-03 | `_extract_national_themes` wraps `json.loads()` in try/except, returns `{...: None}` fallback |
| T-24-04 | `getNationalBeigeBookSummary` wraps themes parse in try/catch, returns `null` on failure |
| T-24-05 | API key read via `os.environ.get("ANTHROPIC_API_KEY")`, never hardcoded or logged |
| T-24-06 | `skip_llm` flag auto-enabled when key missing; documented cost ~$0.15/edition |

## Self-Check: PASSED

- `fee_crawler/db.py` modified: FOUND
- `scripts/migrate-schema.sql` modified: FOUND
- `fee_crawler/commands/ingest_beige_book.py` modified: FOUND
- `fee_crawler/tests/test_ingest_beige_book.py` created: FOUND
- `src/lib/crawler-db/fed.ts` modified: FOUND
- `src/lib/crawler-db/fed.test.ts` modified: FOUND
- Commit `7aa4df9`: FOUND
- Commit `aed1856`: FOUND
