---
phase: 24-industry-health-beige-book
plan: "02"
subsystem: data-layer
tags: [beige-book, theme-extraction, llm, claude-haiku, fed-districts]
dependency_graph:
  requires: []
  provides: [beige-book-themes-table, theme-extraction-pipeline, getBeigeBookThemes-query]
  affects: [fee_crawler/commands/ingest_beige_book.py, src/lib/crawler-db/fed.ts]
tech_stack:
  added: []
  patterns: [anthropic SDK for Claude Haiku extraction, JSON validation of LLM output, upsert with ON CONFLICT]
key_files:
  created:
    - scripts/migrations/025-beige-book-themes.sql
    - fee_crawler/tests/test_beige_book_themes.py
  modified:
    - fee_crawler/commands/ingest_beige_book.py
    - src/lib/crawler-db/fed.ts
    - src/lib/crawler-db/fed.test.ts
decisions:
  - "Migration numbered 025 (not 024 per plan) because 024-migrate-asset-tier-keys.sql already existed"
  - "Theme extraction validates LLM output against fixed taxonomy and clamps confidence to 0.0-1.0 range"
  - "ANTHROPIC_API_KEY env guard skips theme extraction gracefully when not set"
metrics:
  duration: "24s (verification only -- code pre-existed in base)"
  completed: "2026-04-08"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 24 Plan 02: Beige Book Theme Extraction Summary

LLM-based theme extraction from Beige Book reports via Claude Haiku with pre-computation at ingestion time, stored in beige_book_themes table, queryable via getBeigeBookThemes for Hamilton.

## What Was Done

### Task 1: Migration + Python Pipeline + Tests

- **Migration (025-beige-book-themes.sql):** Created `beige_book_themes` table with BIGSERIAL PK, release_code, fed_district, theme_category, sentiment, summary, confidence, extracted_at, model_used. Unique constraint on (release_code, fed_district, theme_category). Indexes on district+release and category.
- **extract_themes_for_district():** Uses Anthropic SDK to call Claude Haiku with structured prompt. Extracts exactly 4 themes (growth, employment, prices, lending_conditions) with sentiment and confidence. Validates categories against fixed taxonomy (T-24-03 mitigated). Clamps confidence to 0.0-1.0. Returns empty list on any error.
- **store_themes():** Upserts themes into beige_book_themes with ON CONFLICT DO UPDATE for idempotent re-ingestion.
- **ingest_edition() integration:** After storing district sections, loops through districts to extract themes from "Summary of Economic Activity" sections. Guarded by ANTHROPIC_API_KEY env check (T-24-04 mitigated). 1-second delay between API calls for rate limiting.
- **Python tests (13 passing):** Mocked Anthropic client, validates 4-theme extraction, invalid sentiment defaults, unknown category filtering, API error graceful handling, store_themes SQL pattern verification.
- **Commit:** 96fc163

### Task 2: TypeScript Query + Test Audit

- **BeigeBookTheme interface:** Typed with union literals for theme_category and sentiment.
- **getBeigeBookThemes():** Fetches latest release_code if none provided, queries beige_book_themes table, maps fed_district to district_name via DISTRICT_NAMES constant. Returns empty array on error.
- **TypeScript tests (5 new tests in 2 describe blocks):** Shape validation, district name mapping, empty DB handling, release_code filtering, DB error graceful handling.
- **BEIGE-01 audit tests (4 tests):** Verify getDistrictBeigeBookSummaries returns correct shape with keyword-based themes.
- **Commit:** b223cdc

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migration file number adjusted**
- **Found during:** Task 1 verification
- **Issue:** Plan specified `024-beige-book-themes.sql` but `024-migrate-asset-tier-keys.sql` already existed
- **Fix:** Migration created as `025-beige-book-themes.sql` instead
- **Files modified:** scripts/migrations/025-beige-book-themes.sql

## Verification Results

| Check | Result |
|-------|--------|
| Python tests (13) | All passing |
| TypeScript tests (19) | All passing |
| TypeScript compilation (fed.ts) | Clean (pre-existing errors in unrelated files only) |
| Python import check | extract_themes_for_district, store_themes importable |
| Migration file exists | scripts/migrations/025-beige-book-themes.sql |
| getBeigeBookThemes exported | Yes |
| BeigeBookTheme exported | Yes |
| describe blocks >= 5 | 5 describe blocks |

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|-----------|
| T-24-03 (Tampering) | LLM JSON validated against fixed taxonomy. Unknown categories filtered. Confidence clamped to 0.0-1.0. Invalid sentiments default to "neutral". |
| T-24-04 (DoS) | ANTHROPIC_API_KEY env guard. 1-second delay between calls. try/except prevents pipeline crash. |
| T-24-06 (Spoofing) | Content from trusted Fed source. System prompt hardcoded. No user input in extraction prompt. |

## Self-Check: PASSED

- [x] scripts/migrations/025-beige-book-themes.sql exists
- [x] fee_crawler/tests/test_beige_book_themes.py exists (13 tests passing)
- [x] src/lib/crawler-db/fed.test.ts exists (19 tests passing)
- [x] Commits 96fc163 and b223cdc exist in history
- [x] All acceptance criteria verified
