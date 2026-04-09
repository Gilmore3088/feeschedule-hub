---
phase: 47-settings-db-migration
verified: 2026-04-09T00:00:00Z
status: human_needed
score: 4/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Save a Fed district in Settings and reload Hamilton"
    expected: "The HamiltonContextBar shows the saved Fed district value on next page load without re-login"
    why_human: "Full end-to-end flow (Settings form save → DB write → getCurrentUser() on next request → HamiltonShell render) requires a live browser session against a running server with a real DB connection"
---

# Phase 47: Settings DB Migration Verification Report

**Phase Goal:** The production database has the fed_district column on the users table so institutional context flows correctly to all Hamilton screens
**Verified:** 2026-04-09
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Migration 041 runs without error on a database that lacks fed_district | VERIFIED | `scripts/migrations/041-user-fed-district.sql` contains exactly `ALTER TABLE users ADD COLUMN IF NOT EXISTS fed_district INT;` — the `IF NOT EXISTS` guard ensures clean execution on a fresh DB |
| 2 | Migration 041 is idempotent — re-running on a database that already has fed_district produces no error | VERIFIED | `IF NOT EXISTS` clause on the `ALTER TABLE` statement is the standard PostgreSQL idiom for idempotent column addition; SUMMARY confirms re-run produced NOTICE only with exit code 0 |
| 3 | After login, the User object includes the fed_district value from the database | VERIFIED | `src/lib/auth.ts` line 101: `fed_district, job_role, interests` is present in the login() SELECT after `state_code`; matches exact acceptance criteria position |
| 4 | After page load (getCurrentUser), the User object includes the fed_district value from the database | VERIFIED | `src/lib/auth.ts` line 157: `u.state_code, u.fed_district, u.job_role, u.interests` present in the getCurrentUser() JOIN query; 3 total occurrences of `fed_district` in auth.ts confirmed by grep count |
| 5 | A user who saves fed_district in Settings sees that value in the Hamilton context bar on next page load | ? UNCERTAIN | Static analysis confirms the wiring: `settings/actions.ts` writes `fed_district` to the DB via UPDATE; `(hamilton)/layout.tsx` line 63 reads `user.fed_district ?? null` from `getCurrentUser()` and passes it as `fedDistrict` into `HamiltonShell`. The chain is fully coded. Cannot confirm end-to-end without a live browser session. |

**Score:** 4/5 truths verified (truth 5 needs human confirmation)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/migrations/041-user-fed-district.sql` | Idempotent ALTER TABLE adding fed_district | VERIFIED | File exists, single line: `ALTER TABLE users ADD COLUMN IF NOT EXISTS fed_district INT;` |
| `src/lib/auth.ts` | Auth queries returning fed_district in User object | VERIFIED | 3 occurrences: type definition (line 56), login() SELECT (line 101), getCurrentUser() SELECT (line 157) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/auth.ts` | users table | SQL SELECT including `fed_district` | WIRED | Both `login()` and `getCurrentUser()` SELECT statements include `fed_district` in position between `state_code` and `job_role` |
| `src/app/pro/(hamilton)/settings/actions.ts` | `src/lib/auth.ts` | `getCurrentUser()` returns fed_district after settings save | WIRED | `actions.ts` imports and calls `getCurrentUser()` on lines 30, 90, 120, 140; after `updateInstitutionProfile()` writes `fed_district` to the DB, the next `getCurrentUser()` call will retrieve the updated value |
| `src/app/pro/(hamilton)/layout.tsx` | `HamiltonShell` | `fedDistrict: user.fed_district ?? null` | WIRED | Line 63 of layout.tsx passes `fed_district` from the User object into `institutionContext` which flows into `HamiltonShell` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/app/pro/(hamilton)/layout.tsx` | `user.fed_district` | `getCurrentUser()` SQL JOIN query against sessions+users tables | Yes — SQL query reads real DB column | FLOWING |
| `src/app/pro/(hamilton)/settings/actions.ts` | `fed_district` (write path) | `ProfileSchema` parsed form input → `UPDATE users SET fed_district = ${fed_district}` | Yes — writes to real DB column | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED for truths 1-4 (DB migration cannot be re-run against live production DB without risk; auth query checks are static analysis only). Truth 5 routed to human verification.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SET-01 | 47-01-PLAN.md | User's fed_district column exists in production DB (migration 041 runs) | SATISFIED | Migration file exists with correct idempotent DDL; auth queries confirmed to return `fed_district`; wiring through layout confirmed |

No orphaned requirements — REQUIREMENTS.md maps only SET-01 to Phase 47.

### Anti-Patterns Found

Scanned `src/lib/auth.ts` and `scripts/migrations/041-user-fed-district.sql`.

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/app/pro/(hamilton)/settings/actions.ts` line 58-62 | `try { await sql\`ALTER TABLE users ADD COLUMN IF NOT EXISTS fed_district INT\` } catch { }` — inline migration DDL in a server action | Info | This duplicates migration 041 inline. Not a stub, not blocking, but it means the migration runs on every profile save (no-op after first run). Silent catch could mask real DB errors. Low risk for this column. |

No blockers found. The inline migration is a belt-and-suspenders pattern, not a stub.

### Human Verification Required

#### 1. End-to-End Fed District Persistence

**Test:** Log in as a Pro user. Navigate to `/pro/settings`. Set the Federal Reserve District to any value (e.g., "2 — New York"). Save the form. Navigate away to `/pro/monitor` or `/pro/home`. Observe the HamiltonContextBar (institutional context strip at the top of the Hamilton shell).

**Expected:** The HamiltonContextBar displays the saved Fed district value (e.g., "District 2") without requiring a re-login. Refreshing the page should retain the value.

**Why human:** Requires a live browser session with a running Next.js server connected to a real Postgres database where the `fed_district` column exists. The static code analysis confirms all wiring is present and correct — auth queries select the column, the settings action writes to it, and the layout passes it to HamiltonShell — but the actual DB state cannot be verified programmatically without a live connection.

### Gaps Summary

No gaps blocking goal achievement. All five truths are supported by the codebase — four are fully verified by static analysis; one (Settings → Hamilton context bar persistence) requires a live end-to-end test to confirm the DB column is actually populated in the target environment.

The migration file is correct and idempotent. The auth queries are correctly updated with `fed_district` in both `login()` and `getCurrentUser()`. The Hamilton layout correctly reads the field and passes it downstream.

---

_Verified: 2026-04-09T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
