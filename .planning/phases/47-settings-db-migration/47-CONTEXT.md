# Phase 47: Settings DB Migration - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Run migration 041 to add `fed_district` column to the users table, then restore `fed_district` in the auth SQL queries so institutional context flows correctly to all Hamilton screens.

</domain>

<decisions>
## Implementation Decisions

### Migration
- **D-01:** Migration file already exists at `scripts/migrations/041-user-fed-district.sql` — use it as-is (idempotent `ADD COLUMN IF NOT EXISTS`)
- **D-02:** No new migration needed — just ensure 041 runs on production DB

### Auth Query Fix
- **D-03:** Two SQL queries in `src/lib/auth.ts` (lines ~97 and ~154) omit `fed_district` from their SELECT statements — add it back so the User type is fully populated
- **D-04:** The `User` TypeScript type at `src/lib/auth.ts:56` already includes `fed_district: number | null` — no type changes needed

### Claude's Discretion
- Migration execution approach (manual SQL, startup check, or script) — pick what fits the existing pattern

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Migration
- `scripts/migrations/041-user-fed-district.sql` — The migration to run (1 line, idempotent ALTER TABLE)

### Auth
- `src/lib/auth.ts` — Contains User type (line ~56) and both SQL queries that need fed_district restored (lines ~97 and ~154)

### Settings
- `src/app/pro/(hamilton)/settings/actions.ts` — Already saves fed_district; confirms the write path works

### Handoff
- `.planning/MILESTONE_8_HANDOFF.md` — Section "Known Technical Issues" item 1 describes this exact issue

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Migration 041 already written and idempotent
- User TypeScript type already includes fed_district
- Settings save action already writes fed_district to DB

### Established Patterns
- Auth uses `postgres` template literal SQL (no ORM)
- SELECT queries list columns explicitly (not SELECT *)
- 44 files reference fed_district — all expect it in the User type

### Integration Points
- `getCurrentUser()` and `validateSession()` in auth.ts are the two functions whose queries need fixing
- Once fixed, fed_district flows through session to all Hamilton screens via the User object
- HamiltonContextBar reads user.fed_district for display

</code_context>

<specifics>
## Specific Ideas

No specific requirements — straightforward migration + query fix.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 47-settings-db-migration*
*Context gathered: 2026-04-09*
