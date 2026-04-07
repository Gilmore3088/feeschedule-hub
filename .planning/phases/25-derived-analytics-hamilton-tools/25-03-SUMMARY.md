---
phase: 25-derived-analytics-hamilton-tools
plan: "03"
subsystem: schema-fdic-hamilton
tags: [schema, fdic-ingestion, hamilton, security, gap-closure, DERIVE-02]
dependency_graph:
  requires: [25-01, 25-02]
  provides: [overdraft_revenue-column, RIAD4070-extraction, triggerReport-token-guard]
  affects:
    - scripts/migrate-schema.sql
    - fee_crawler/commands/ingest_fdic.py
    - src/lib/hamilton/hamilton-agent.ts
tech_stack:
  added: []
  patterns:
    - "Fail-fast env guard: extract token to variable, check before use, return descriptive error"
    - "Whole-dollars-to-thousands conversion pattern (sc_raw // 1000) extended to RIAD4070"
    - "ALTER TABLE IF NOT EXISTS migration appended after seed data for safe re-run"
key_files:
  created: []
  modified:
    - scripts/migrate-schema.sql
    - fee_crawler/commands/ingest_fdic.py
    - src/lib/hamilton/hamilton-agent.ts
decisions:
  - "RIAD4070 treated as whole-dollar like SC (RIAD4080); divided by 1000 to convert to thousands"
  - "NULL acceptable for od when FDIC API omits RIAD4070 — derived.ts already handles null overdraft_revenue"
  - "cronSecret variable extracted before fetch to satisfy TypeScript narrowing (no need for non-null assertion)"
metrics:
  duration: "15 minutes"
  completed: "2026-04-07"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 25 Plan 03: Gap Closure — overdraft_revenue Schema + Token Guard Summary

**One-liner:** Closed DERIVE-02 schema gap by adding overdraft_revenue BIGINT to institution_financials and wiring RIAD4070 extraction in FDIC ingestion; hardened triggerReport tool with fail-fast BFI_REVALIDATE_TOKEN guard.

## What Was Built

### Task 1: overdraft_revenue Column (DERIVE-02 / CR-01)

Three coordinated changes make the overdraft revenue breakdown functional end-to-end:

**scripts/migrate-schema.sql:**
- Added `overdraft_revenue BIGINT` column to the `CREATE TABLE IF NOT EXISTS institution_financials` block (after `service_charge_income`)
- Appended `ALTER TABLE institution_financials ADD COLUMN IF NOT EXISTS overdraft_revenue BIGINT` migration block after the seed data section for safe re-run on existing databases

**fee_crawler/commands/ingest_fdic.py:**
- Added `"RIAD4070"` to `FDIC_FINANCIAL_FIELDS` so the FDIC BankFind API includes it in responses
- Added `od_raw` / `od` extraction (same whole-dollar to thousands conversion as SC/RIAD4080)
- Added `overdraft_revenue` to the INSERT column list, VALUES placeholders (`od`), and ON CONFLICT DO UPDATE SET clause

### Task 2: triggerReport Token Guard (CR-02)

**src/lib/hamilton/hamilton-agent.ts:**
- Replaced `process.env.BFI_REVALIDATE_TOKEN ?? ""` empty-string fallback
- Added fail-fast guard: extract to `cronSecret`, return descriptive error object when missing
- Used `cronSecret` in the `X-Cron-Secret` header (TypeScript narrowing: string, not string|undefined)

## Verification Results

| Check | Result |
|-------|--------|
| `grep -c "overdraft_revenue" scripts/migrate-schema.sql` | 3 (CREATE TABLE + ALTER TABLE comment + ADD COLUMN) |
| `grep -c "RIAD4070" fee_crawler/commands/ingest_fdic.py` | 3 (field list + extraction comment + od_raw line) |
| No `?? ""` fallback in hamilton-agent.ts | NONE (confirmed) |
| fail-fast guard present | Yes — line 188-189 |
| TypeScript errors in production files | 0 (pre-existing test file errors only) |

## Deviations from Plan

None — plan executed exactly as written. Pre-existing TypeScript errors in test files (`derived.test.ts`, `fed.test.ts`, `fee-changes.test.ts`, `health.test.ts`, `freshness.test.ts`) confirmed pre-existing before changes via git stash verification; out of scope per deviation rule scope boundary.

## Known Stubs

None. The overdraft_revenue column will be NULL for institutions where FDIC API does not return RIAD4070 data. This is intentional and documented — `getFeeDependencyRatio()` in `derived.ts` already handles null overdraft_revenue gracefully (returns null for overdraft_share fields).

## Threat Flags

None. Both changes reduce the threat surface: the schema addition is write-only from trusted FDIC API data, and the token guard closes T-25-01 (spoofing via empty credential).

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: overdraft_revenue schema + FDIC ingestion | b5d3b7f | scripts/migrate-schema.sql, fee_crawler/commands/ingest_fdic.py |
| Task 2: triggerReport fail-fast token guard | a8dd757 | src/lib/hamilton/hamilton-agent.ts |

## Self-Check: PASSED

- `scripts/migrate-schema.sql` — modified, grep confirms 3 occurrences of overdraft_revenue
- `fee_crawler/commands/ingest_fdic.py` — modified, grep confirms 3 occurrences of RIAD4070
- `src/lib/hamilton/hamilton-agent.ts` — modified, cronSecret guard confirmed, no `?? ""` fallback
- Commits b5d3b7f and a8dd757 present in git log
