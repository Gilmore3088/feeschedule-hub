# Phase 39: Data Layer - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Create the 6 Hamilton Pro PostgreSQL tables, an idempotent `ensureHamiltonProTables()` function, confidence tier validation, and soft-delete columns on analyses and scenarios. No API routes, no UI — pure data layer.

</domain>

<decisions>
## Implementation Decisions

### Table Creation Pattern
- **D-01:** Follow the `ensureHamiltonTables()` pattern from `src/lib/hamilton/chat-memory.ts` exactly — `CREATE TABLE IF NOT EXISTS` with `gen_random_uuid()` PKs, called once from the hamilton layout (Phase 40).
- **D-02:** All 6 tables created in a single `ensureHamiltonProTables()` function exported from a new file (e.g., `src/lib/hamilton/pro-tables.ts` or extend `chat-memory.ts`).
- **D-03:** SQL schema follows `Hamilton-Design/hamilton_revamp_package/stub/sql-schema.sql` as the starting point, with additions from decisions below.

### Confidence Tier
- **D-04:** Confidence tier on `hamilton_scenarios` is a snapshot — computed at scenario creation time and stored on the row. Does not auto-update if underlying data improves later.
- **D-05:** Tighter thresholds for simulation than the index maturity badges: strong = 20+ approved fees in category, provisional = 10-19, insufficient = below 10. Index maturity badges remain unchanged.
- **D-06:** Insufficient tier BLOCKS simulation entirely — the API must refuse to run a simulation when the fee category has insufficient data. Return an error with explanation of what threshold is needed.

### Claude's Discretion
- Whether to use a DB `CHECK` constraint or app-level validation for confidence tier values. Recommendation: CHECK constraint for data integrity at the SQL level, matching the existing `CHECK (role IN (...))` pattern on hamilton_messages.
- Whether `ensureHamiltonProTables()` lives in a new file or extends `chat-memory.ts`. Recommendation: new file to keep concerns separated.

### Soft-Delete Strategy
- **D-07:** Soft-delete uses BOTH `archived_at TIMESTAMPTZ` (NULL = active, non-NULL = timestamp of archival) AND `status TEXT` ('active'/'archived') columns on `hamilton_saved_analyses` and `hamilton_scenarios`.
- **D-08:** Default list queries filter on `WHERE status = 'active'`. Archive recovery sets `status = 'active'` and `archived_at = NULL`.
- **D-09:** `hamilton_reports`, `hamilton_watchlists`, `hamilton_signals`, and `hamilton_priority_alerts` do NOT have soft-delete — they are either immutable records or configuration.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SQL Schema
- `Hamilton-Design/hamilton_revamp_package/stub/sql-schema.sql` — Starting point for all 6 table definitions
- `Hamilton-Design/hamilton_revamp_package/05-data-model-and-persistence.md` — Field descriptions and persistence behavior by screen

### Existing Pattern
- `src/lib/hamilton/chat-memory.ts` — `ensureHamiltonTables()` pattern to replicate (CREATE TABLE IF NOT EXISTS, gen_random_uuid(), try/catch swallow)

### Type Contracts (from Phase 38)
- `src/lib/hamilton/types.ts` — Screen DTOs that the tables must support (AnalyzeResponse → hamilton_saved_analyses.response_json, SimulationResponse → hamilton_scenarios.result_json, etc.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ensureHamiltonTables()` in `chat-memory.ts` — exact pattern to follow for table creation
- `sql` template literal client from `@/lib/crawler-db/connection` — same client for all queries
- Existing index conventions: `idx_hamilton_conv_user`, `idx_hamilton_msg_conv` — follow same naming

### Established Patterns
- `gen_random_uuid()` for UUID PKs (Supabase convention)
- `TIMESTAMPTZ NOT NULL DEFAULT NOW()` for created_at/updated_at
- `REFERENCES ... ON DELETE CASCADE` for FK constraints
- `CHECK` constraints for enum-like columns (e.g., `CHECK (role IN ('user', 'assistant'))`)
- Try/catch wrapping with error swallow for cold-start safety

### Integration Points
- `ensureHamiltonProTables()` will be called from the hamilton layout in Phase 40
- Tables must support JSONB storage matching the screen DTO shapes from types.ts

</code_context>

<specifics>
## Specific Ideas

- Confidence tier thresholds for simulation are deliberately tighter than index maturity badges — simulation results must be defensible for a $5,000/yr tool
- "Insufficient" blocks the simulation entirely, not just a warning — this is a product quality decision
- Archived_at + status gives both audit trail and easy querying

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 39-data-layer*
*Context gathered: 2026-04-09*
