---
phase: 24-industry-health-beige-book
fixed_at: 2026-04-07T20:36:13Z
review_path: .planning/phases/24-industry-health-beige-book/24-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 5
skipped: 1
status: partial
---

# Phase 24: Code Review Fix Report

**Fixed at:** 2026-04-07T20:36:13Z
**Source review:** .planning/phases/24-industry-health-beige-book/24-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (CR-01, CR-02, WR-01, WR-02, WR-03, WR-04)
- Fixed: 5
- Skipped: 1 (WR-04 resolved as part of CR-02)

## Fixed Issues

### CR-01: SQL Injection via Dynamic Field Interpolation in `health.ts`

**Files modified:** `src/lib/crawler-db/health.ts`
**Commit:** 7bfba76
**Applied fix:** Added a module-level `ALLOWED_METRIC_FIELDS` Set constant (`'roa' | 'roe' | 'efficiency_ratio'`). Both `fetchIndustryMetric` and `fetchCharterMetric` now throw `Error('Invalid metric field: ...')` at runtime before any SQL is constructed if the field value is not in the allowlist. This provides defense-in-depth beyond the TypeScript type constraint, which is erased at runtime.

---

### CR-02: ON CONFLICT Clause Silently Fails on PostgreSQL for `beige_book_summaries` National Row

**Files modified:** `fee_crawler/commands/ingest_beige_book.py`, `scripts/migrate-schema.sql`
**Commit:** 12aab2c
**Applied fix:**
- Removed the inline `UNIQUE(release_code, fed_district)` table constraint from `beige_book_summaries` in `migrate-schema.sql` (which does not catch NULL duplicates in PostgreSQL).
- Added two partial unique indexes: `idx_bbs_district_unique` on `(release_code, fed_district) WHERE fed_district IS NOT NULL` for district rows, and `idx_bbs_national_unique` on `(release_code) WHERE fed_district IS NULL` for the national row.
- Updated the district upsert ON CONFLICT clause to `ON CONFLICT (release_code, fed_district) WHERE fed_district IS NOT NULL`, targeting the partial index.
- Updated the national upsert ON CONFLICT clause to `ON CONFLICT (release_code) WHERE fed_district IS NULL`, targeting the partial index.
- Both DO UPDATE SET clauses now use `NOW()` instead of `datetime('now')` (also resolves WR-04).

---

### WR-01: Silent Exception Swallowing Hides DB Failures

**Files modified:** `src/lib/crawler-db/health.ts`, `src/lib/crawler-db/fed.ts`
**Commit:** 9da5056
**Applied fix:** Added `console.error('[module] functionName failed:', err)` to every bare `catch { return null/[]; }` block in both files. Functions updated in `health.ts`: `getIndustryHealthMetrics`, `getDepositGrowthTrend`, `getLoanGrowthTrend`, `getInstitutionCountTrend`, `getHealthMetricsByCharter`. Functions updated in `fed.ts`: `getLatestBeigeBook`, `getBeigeBookEditions`, `getBeigeBookHeadline`, `getDistrictContent`, `getRecentSpeeches`, `getDistrictIndicators`, `getBeigeBookHeadlines`, `fetchRichIndicator`, `fetchCpiYoyIndicator`, `getNationalEconomicSummary`, `getDistrictBeigeBookSummaries`, `getNationalBeigeBookSummary`, `getDistrictUnemployment`, `getFredSummary`.

---

### WR-02: `_extract_national_themes` Does Not Validate LLM-Returned JSON Keys

**Files modified:** `fee_crawler/commands/ingest_beige_book.py`
**Commit:** 0ca30c1
**Applied fix:** Replaced `return json_module.loads(response.content[0].text)` with explicit key normalization: the parsed dict is accessed via `.get()` for each expected key (`growth`, `employment`, `prices`, `lending`), using `or None` to coerce empty strings to `None`. This ensures the returned dict always has exactly the four expected keys regardless of what keys the LLM returns.

---

### WR-03: `_sqlite_to_pg` Regex Does Not Handle `hours`/`minutes`/`months` Variants

**Files modified:** `fee_crawler/db.py`
**Commit:** af7b6c8
**Applied fix:** Replaced the narrow `days?` pattern with a broader alternation `(days?|hours?|minutes?|months?)` captured as group 2, and updated the replacement to `r"NOW() + INTERVAL '\1 \2'"` so the time unit is preserved in the output. This prevents silent SQL syntax errors if any command module uses `datetime('now', '-1 hours')` or similar.

---

## Skipped Issues

### WR-04: `ingest_beige_book.py` Uses SQLite-Syntax `datetime('now')` in Upsert

**File:** `fee_crawler/commands/ingest_beige_book.py:291`, `324`
**Reason:** Resolved as part of CR-02. Both DO UPDATE SET clauses were updated to use `NOW()` directly (portable, explicit, no dependency on `_sqlite_to_pg` translation) when fixing the ON CONFLICT partial-index targeting. No separate commit needed.
**Original issue:** `generated_at = datetime('now')` in the DO UPDATE clauses depended on `_sqlite_to_pg` translation at runtime; if the translation failed, raw SQLite syntax would reach PostgreSQL and cause a silent error.

---

_Fixed: 2026-04-07T20:36:13Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
