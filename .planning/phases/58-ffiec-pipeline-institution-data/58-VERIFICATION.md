---
phase: 58-ffiec-pipeline-institution-data
verified: 2026-04-10T21:15:00Z
status: human_needed
score: 6/6
overrides_applied: 0
human_verification:
  - test: "Run ingest-call-reports against live DB and verify rows appear in institution_financials"
    expected: "Rows with source='ffiec' inserted for matched and unmatched banks"
    why_human: "Requires live DATABASE_URL and FDIC API access"
  - test: "Visit /admin/institution/[id] for an institution with financial data"
    expected: "Six hero cards (Total Assets, Total Deposits, SC Income, Net Income, Efficiency Ratio, Fee/Deposit Ratio) with sparklines, QoQ deltas, and peer context badges"
    why_human: "Visual layout, sparkline rendering, and color-coded deltas need visual inspection"
  - test: "Visit /admin/institution/[id] for an institution WITHOUT financial data"
    expected: "No hero cards section rendered (graceful empty state)"
    why_human: "Empty state handling requires browser verification"
---

# Phase 58: FFIEC Pipeline + Institution Data Verification Report

**Phase Goal:** FFIEC CDR and NCUA 5300 quarterly Call Report data is ingested into the database and surfaced on institution-specific admin pages -- institution financial profiles are visible without navigating to bankregdata.com
**Verified:** 2026-04-10T21:15:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | FFIEC Call Report data can be ingested into Postgres via CLI | VERIFIED | `fee_crawler/commands/ingest_call_reports.py` (411 lines) uses FDIC BankFind REST API, psycopg2 direct connection, parameterized upserts with ON CONFLICT. CLI `ingest-call-reports --help` confirms `--backfill` and `--from-year` args. |
| 2 | NCUA 5300 data can be ingested into Postgres via CLI | VERIFIED | `fee_crawler/commands/ingest_ncua.py` (457 lines) downloads quarterly ZIPs, parses FS220/FS220A CSVs, converts whole-dollars to thousands, upserts via psycopg2. CLI `ingest-ncua --help` confirms `--quarter`, `--limit`, `--backfill`, `--from-year` args. |
| 3 | Historical backfill from 2010 supported for both sources | VERIFIED | `_iter_quarters(from_year)` in ingest_call_reports.py generates dates from 2010; `_iter_ncua_quarters(from_year)` in ingest_ncua.py does the same. Both accept `--backfill --from-year 2010`. |
| 4 | Quarterly auto-ingestion scheduled via Modal | VERIFIED | `fee_crawler/modal_app.py` lines 167-177: date-gated block triggers on Feb 15, May 15, Aug 15, Nov 15 for `ingest-call-reports` and `ingest-ncua` with 3600s timeout. No new cron added (stays within 5-cron limit). |
| 5 | Institution admin pages show financial profile hero cards | VERIFIED | `hero-cards.tsx` (245 lines) renders 6 cards (Total Assets, Total Deposits, SC Income, Net Income, Efficiency Ratio, Fee/Deposit Ratio) with sparklines, DeltaIndicator, staleness badge. Imported and rendered in `page.tsx` line 18 (import) and line 164 (render). `getFinancialsByInstitution` queried in parallel Promise.all (line 42). |
| 6 | Unmatched institutions stored with nullable FK | VERIFIED | Migration `058_nullable_crawl_target_id.sql` drops NOT NULL, adds `source_cert_number`, creates partial unique index for dedup. Fresh-deploy `migrate-schema.sql` line 139 shows nullable FK. Both ingest scripts have `_upsert_unmatched` functions using `crawl_target_id=NULL`. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/migrations/058_nullable_crawl_target_id.sql` | Schema migration for nullable FK | VERIFIED | 27 lines, ALTER + ADD COLUMN + backfill UPDATE + partial unique index + lookup index |
| `fee_crawler/commands/ingest_call_reports.py` | FFIEC ingestion via FDIC BankFind API | VERIFIED | 411 lines, real API calls with retry, cert_number + fuzzy matching, upsert matched/unmatched |
| `fee_crawler/commands/ingest_ncua.py` | NCUA 5300 ingestion from quarterly ZIPs | VERIFIED | 457 lines, ZIP parsing, FS220+FS220A field mapping, dollar-to-thousands conversion |
| `src/app/admin/institution/[id]/hero-cards.tsx` | Financial profile hero cards component | VERIFIED | 245 lines, server component (no "use client"), 6 cards with sparklines, delta indicators, peer badges |
| `fee_crawler/__main__.py` | CLI command registration | VERIFIED | `ingest-call-reports` (line 846) and `ingest-ncua` (line 879) registered with correct args |
| `fee_crawler/modal_app.py` | Quarterly ingestion gate | VERIFIED | Lines 167-177: date-gated quarterly execution inside existing ingest_data function |
| `scripts/migrate-schema.sql` | Fresh-deploy schema updated | VERIFIED | Line 139: nullable crawl_target_id, line 140: source_cert_number, lines 672-673: partial indexes |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| hero-cards.tsx | page.tsx | import + JSX render | WIRED | Import line 18, render line 164, financials + peerRanking props passed |
| page.tsx | getFinancialsByInstitution | import + Promise.all | WIRED | Import line 17, called in parallel query line 42 |
| page.tsx | getInstitutionPeerRanking | import + Promise.all | WIRED | Already wired from prior phase, peerRanking passed to HeroCards |
| ingest_call_reports.py | __main__.py | CLI parser registration | WIRED | cmd_ingest_call_reports at line 163, subparser at line 846 |
| ingest_ncua.py | __main__.py | CLI parser registration | WIRED | cmd_ingest_ncua at line 185, subparser at line 879 |
| modal_app.py | ingest commands | subprocess call | WIRED | Lines 173-176: subprocess.run with ingest-call-reports and ingest-ncua |
| getFinancialsByInstitution | institution_financials table | SQL query | WIRED | SQL SELECT FROM institution_financials WHERE crawl_target_id = $targetId |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| hero-cards.tsx | financials prop | getFinancialsByInstitution() | SQL query to institution_financials table | FLOWING |
| hero-cards.tsx | peerRanking prop | getInstitutionPeerRanking() | SQL query with peer comparison | FLOWING |
| ingest_call_reports.py | API records | FDIC BankFind REST API | External API with pagination | FLOWING |
| ingest_ncua.py | ZIP data | NCUA quarterly bulk files | External download | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| FFIEC CLI registered | `python3 -m fee_crawler ingest-call-reports --help` | Shows --backfill, --from-year args | PASS |
| NCUA CLI registered | `python3 -m fee_crawler ingest-ncua --help` | Shows --quarter, --limit, --backfill, --from-year args | PASS |
| TypeScript compiles | `npx tsc --noEmit` | No errors in Phase 58 files (only pre-existing test mock type issues) | PASS |
| Old code removed | grep for getInstitutionRevenueTrend in page.tsx | No matches | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| COV-03 | Phase 58 | Not found in REQUIREMENTS.md | N/A | Requirement ID not defined in REQUIREMENTS.md -- appears to be an ad-hoc phase outside formal v7.0 milestone |
| ADM-05 | Phase 58 | Not found in REQUIREMENTS.md | N/A | Same as above |

Phase 58 is not tracked in ROADMAP.md or REQUIREMENTS.md. This appears to be an ad-hoc infrastructure phase executed outside the formal milestone structure. No requirement coverage gaps since no formal requirements exist.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | - | - | - | No TODOs, FIXMEs, placeholders, or stub patterns in any Phase 58 files |

### Human Verification Required

### 1. Live Ingestion Test

**Test:** Run `python3 -m fee_crawler ingest-call-reports` with a live DATABASE_URL and verify rows appear in institution_financials
**Expected:** Rows with source='ffiec' for both matched (with crawl_target_id) and unmatched (with source_cert_number) banks
**Why human:** Requires live database connection and FDIC API access

### 2. Hero Cards Visual Inspection

**Test:** Visit `/admin/institution/[id]` for an institution that has financial data
**Expected:** Six hero stat cards with sparklines, color-coded QoQ/YoY deltas, peer percentile badges on SC Income, staleness badge if data > 95 days old
**Why human:** Visual layout, sparkline rendering, responsive grid, and color-coded delta indicators need visual inspection

### 3. Empty State Verification

**Test:** Visit `/admin/institution/[id]` for an institution WITHOUT financial data
**Expected:** No hero cards section rendered (component returns null)
**Why human:** Empty state handling and page layout integrity need browser verification

### Gaps Summary

No code-level gaps found. All 6 observable truths verified at all four levels (existence, substance, wiring, data flow). The phase is not tracked in ROADMAP.md or REQUIREMENTS.md but all claimed deliverables are present and properly connected. Three items need human verification: live ingestion against real DB/API, visual inspection of hero cards, and empty state behavior.

---

_Verified: 2026-04-10T21:15:00Z_
_Verifier: Claude (gsd-verifier)_
