---
phase: 62A-agent-foundation-data-layer
plan: 04
subsystem: database
tags: [postgres, supabase, migrations, agent-registry, agent-budgets, agent-messages, institution-dossiers, AGENT-05, KNOX-03]

# Dependency graph
requires:
  - phase: 62A-agent-foundation-data-layer
    provides: "Plans 01-03 deliver agent_events, agent_auth_log, tier tables that this plan's registry references conceptually (no hard FK)"
provides:
  - "agent_messages table (empty in 62a; 62b wires handshake protocol with 7 intent values, 5 state values)"
  - "agent_registry table with 55 seeded agents (4 top-level: hamilton, knox, darwin, atlas + 51 state_<abbr>)"
  - "agent_budgets table with 55 default quota rows + FK to agent_registry ON DELETE CASCADE"
  - "institution_dossiers table (empty in 62a; Phase 63 populates) — KNOX-03 per-institution strategy memory"
affects: [62A-05 gateway budget enforcement, 62A-09..12 tool CRUD layer, 62b inter-agent protocol, 63 Knox state agents, 65 Atlas orchestration]

# Tech tracking
tech-stack:
  added: [PL/pgSQL loops for seed generation, partial indexes with WHERE clauses]
  patterns: ["Idempotent DDL via CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING seeds", "CHECK constraint enums instead of PostgreSQL enum types (schema-migration friendly)"]

key-files:
  created:
    - supabase/migrations/20260418_agent_messages.sql
    - supabase/migrations/20260419_agent_registry_and_budgets.sql
    - supabase/migrations/20260419_institution_dossiers.sql
  modified: []

key-decisions:
  - "CHECK constraint enums rather than native PostgreSQL enum types — easier schema evolution"
  - "Seed state agents via PL/pgSQL FOREACH loop — avoids 51-line INSERT VALUES clause, keeps migration readable"
  - "Composite PK (agent_name, window) on agent_budgets allows multiple windows per agent without UNIQUE constraint gymnastics"
  - "institution_dossiers.updated_by_agent_event_id is a logical FK (UUID, no REFERENCES) — agent_events is partitioned and cross-partition FKs are not supported"

patterns-established:
  - "Migration naming: YYYYMMDD_description.sql under supabase/migrations/ (8 existing; 3 new this plan)"
  - "Self-FK via REFERENCES agent_registry(agent_name) enables parent_agent hierarchy (Knox → 51 state agents)"
  - "Partial indexes for selective state (halted_at IS NOT NULL, next_try_recommendation IS NOT NULL, expires_at+state='open')"

requirements-completed:
  - AGENT-05

# Metrics
duration: 2min
completed: 2026-04-16
---

# Phase 62A Plan 04: Agent Foundation — Registry, Budgets, Messages, Dossiers Summary

**3 Supabase migrations land AGENT-05 identity infrastructure: agent_messages (empty 62a protocol table), agent_registry + agent_budgets (55 seeded agents + 55 default budgets with FK-enforced identity), and institution_dossiers (KNOX-03 per-institution strategy memory).**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-16T23:17:39Z
- **Completed:** 2026-04-16T23:19:14Z
- **Tasks:** 3
- **Files modified:** 3 (3 created, 0 modified)

## Accomplishments

- **agent_messages** table shipped empty with full 7-value intent enum (`challenge`, `prove`, `accept`, `reject`, `escalate`, `coverage_request`, `clarify`) and 5-value state enum (`open`, `answered`, `resolved`, `escalated`, `expired`). 3 indexes cover recipient+state lookup, correlation grouping, and expires-at polling.
- **agent_registry + agent_budgets** shipped with FK integrity (`agent_budgets.agent_name REFERENCES agent_registry.agent_name ON DELETE CASCADE`). Seeds: 4 top-level agents (hamilton/analyst, knox/supervisor, darwin/classifier, atlas/orchestrator) + 51 state_agents (50 states + DC) as children of knox. Default budgets: knox per_cycle $500, darwin per_batch $100, hamilton per_report $10, atlas per_month $100, each state_agent per_cycle $50.
- **institution_dossiers** shipped empty with PK REFERENCES `crawl_targets(id) ON DELETE CASCADE` and KNOX-03 required columns: last_url_tried, last_document_format (6-value enum), last_strategy, last_outcome (7-value enum), last_cost_cents, next_try_recommendation (5-value enum), updated_at, updated_by_agent_event_id (logical UUID FK to partitioned agent_events), updated_by_agent, notes JSONB.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write supabase/migrations/20260418_agent_messages.sql** — `58b2ac9` (feat)
2. **Task 2: Write supabase/migrations/20260419_agent_registry_and_budgets.sql with seeds** — `b382ec5` (feat)
3. **Task 3: Write supabase/migrations/20260419_institution_dossiers.sql** — `369809f` (feat)

_No TDD gates on this plan — pure DDL migrations committed in single-task units._

## Files Created/Modified

- `supabase/migrations/20260418_agent_messages.sql` — 35 lines. agent_messages table (empty 62a; 62b wires protocol). UUID PK with gen_random_uuid default, self-FK on parent_message_id, 7-value intent CHECK, 5-value state CHECK, 3 indexes (recipient+state+created_at, correlation_id, expires_at partial WHERE state='open').
- `supabase/migrations/20260419_agent_registry_and_budgets.sql` — 100 lines. Two tables: agent_registry (PK agent_name, 6-value role CHECK, self-FK parent_agent, state_code constraint enforced only for state_agent role) and agent_budgets (composite PK agent_name+window, 5-value window CHECK, FK with ON DELETE CASCADE). Seeds via PL/pgSQL DO blocks: 4 top-level + 51 state agents + 55 default budgets.
- `supabase/migrations/20260419_institution_dossiers.sql` — 32 lines. KNOX-03 strategy memory (empty in 62a; Phase 63 populates). PK institution_id REFERENCES crawl_targets(id) ON DELETE CASCADE, 3 CHECK enums, notes JSONB, 3 indexes including 2 partial.

## Decisions Made

- **Used CHECK constraint enums over native PostgreSQL enum types.** Rationale: ALTER TYPE ... ADD VALUE is irreversible and requires transaction isolation gymnastics in Supabase migrations. CHECK constraints can be ALTER TABLE ... DROP CONSTRAINT + ADD CONSTRAINT cleanly.
- **Loop-based seeding for state agents.** A 51-line INSERT VALUES would be hard to diff; the PL/pgSQL FOREACH loop with the state_codes array is 13 lines and easier to validate (51 unique codes asserted during migration authoring via Python one-liner).
- **updated_by_agent_event_id as logical UUID FK, not REFERENCES.** agent_events is monthly range-partitioned (per Plan 62A-01 D-10); cross-partition FKs are not supported in PostgreSQL. Documented in column comment.
- **Partial indexes on state-conditional columns.** `agent_messages_expires_idx WHERE expires_at IS NOT NULL AND state = 'open'` avoids indexing resolved/expired rows that never get polled; similar for `agent_budgets_halted_idx` and `institution_dossiers_next_try_idx`.

## Deviations from Plan

None — plan executed exactly as written. All three migrations match the RESEARCH.md §7.3-7.5 schemas byte-for-byte.

## Issues Encountered

**Prior migrations not yet applied in this worktree.** The plan's `<verification>` block runs pytest across `test_agent_events_schema.py`, `test_tier_schemas.py`, `test_agent_auth_log.py`, `test_tier_promotion.py`, and `test_sc3_tier_schema_contract.py` — these test files are authored in Plans 62A-01..03, which have not yet executed. The migrations `20260417_agent_events_partitioned.sql` and `20260418_fees_tier_tables.sql` also do not yet exist. This plan's success criteria explicitly focus on file existence and structural content, which are 100% satisfied. End-to-end migration stack verification becomes possible once Plans 62A-01..03 land.

Structural self-verification performed:
- `grep` confirms `CREATE TABLE IF NOT EXISTS` present in all 3 files
- `grep` confirms intent 7-value CHECK, state 5-value CHECK, role 6-value CHECK, window 5-value CHECK
- `grep` confirms FK `REFERENCES agent_registry(agent_name)` on agent_budgets
- `grep` confirms FK `REFERENCES crawl_targets(id) ON DELETE CASCADE` on institution_dossiers PK
- Python one-liner confirms 51 unique state codes (50 states + DC) in seed array
- `grep` confirms 3 `CREATE INDEX IF NOT EXISTS` lines in each of agent_messages and institution_dossiers

## User Setup Required

None — migrations will apply automatically when the next deploy runs `supabase db push` or the test harness creates a fresh schema. No secrets or env vars change.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260418_agent_messages.sql
- FOUND: supabase/migrations/20260419_agent_registry_and_budgets.sql
- FOUND: supabase/migrations/20260419_institution_dossiers.sql
- FOUND: 58b2ac9 (Task 1 commit)
- FOUND: b382ec5 (Task 2 commit)
- FOUND: 369809f (Task 3 commit)
- FOUND: intent CHECK with exactly 7 values (challenge,prove,accept,reject,escalate,coverage_request,clarify)
- FOUND: state CHECK with 5 values (open,answered,resolved,escalated,expired)
- FOUND: role CHECK with 6 values (supervisor,data,classifier,orchestrator,analyst,state_agent)
- FOUND: window CHECK with 5 values (per_cycle,per_batch,per_report,per_day,per_month) — covers required subset (per_cycle|per_batch|per_report)
- FOUND: 4 top-level agent seed INSERT (hamilton, knox, darwin, atlas)
- FOUND: 51-element state_codes ARRAY seeded via PL/pgSQL loop
- FOUND: institution_dossiers has all 9 KNOX-03 required columns

## Next Phase Readiness

- **Ready for Plan 62A-05 (Gateway):** agent_budgets seeded with default limits the gateway can read for cost-quota enforcement. agent_registry.is_active flag ready for gateway short-circuit logic.
- **Ready for Plans 62A-09..12 (Tool CRUD layer):** All 3 new entities (agent_messages, agent_registry/budgets, institution_dossiers) have authoring DDL in place; tool layer can define agent-accessible CRUD operations against them.
- **Ready for Phase 62b (Inter-agent protocol):** agent_messages table awaits COMMS-01..05 send/receive logic; handshake intent values lock the contract.
- **Ready for Phase 63 (Knox state agents):** institution_dossiers upsert tool has the shape to write. 51 state agents already registered with default per_cycle budgets.
- **Blocker tracked elsewhere:** Full migration-stack pytest verification (`test_adversarial_gate_exists` etc.) requires Plans 62A-01..03 to land first. Not blocking this plan's completion; blocks orchestrator's overall-phase verification.

---
*Phase: 62A-agent-foundation-data-layer*
*Completed: 2026-04-16*
