# Phase 62a: Agent Foundation — Data Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 62a-Agent-Foundation-Data-Layer
**Areas discussed:** Three-tier materialization, Write-CRUD scope & design, agent_events schema, SQLite elimination

---

## Three-tier materialization

### Q1: How should we physically build the Raw/Business/Presentation tiers?

| Option | Description | Selected |
|--------|-------------|----------|
| Parallel new tables | fees_raw/verified/published as new tables; extracted_fees frozen; one-shot backfill. Safest rollback, cleanest schema. | ✓ |
| Views over existing + lineage columns | Add lineage cols to extracted_fees in place; tiers 2/3 as VIEWS. Minimal movement but schema drift risk. | |
| Rename + split extracted_fees | Rename extracted_fees → fees_raw; create new tier 2/3 physical tables. Touches 100+ query sites. | |

**User's choice:** Parallel new tables
**Notes:** Safest rollback path; cleanest schema; matches medallion pattern directly.

### Q2: What lineage columns live ON each Tier row?

| Option | Description | Selected |
|--------|-------------|----------|
| Denormalize heavy | Full source refs + event IDs on every tier row. OBS-02 trivial. | ✓ |
| Denormalize light + FK joins | Minimum fields, FK-join through crawl_results. Risks NULL-document_url crisis repeat. | |
| Compute via lineage_graph function | Minimum row fields, SQL function walks chain and returns JSON. | |

**User's choice:** Denormalize heavy
**Notes:** OBS-02 "one-query full trace" acceptance demands this — avoid repeating the 80.4% NULL crisis.

### Q3: How do rows flow Tier 1→Tier 2→Tier 3 within this phase?

| Option | Description | Selected |
|--------|-------------|----------|
| Darwin function + adversarial call | promote_to_tier2 SQL function; 62a ships functions + empty agent_messages; 62b wires protocol. | ✓ |
| Views + windowing | Tier 2/3 as VIEWS filtered by verified_at/published_at; promotion = UPDATE timestamp. Loses event discipline. | |
| Async queue + worker (deferred) | Ship only the queue + tables; Darwin worker lands in 62b. Hard to verify SC3 meaningfully. | |

**User's choice:** Darwin function + adversarial call
**Notes:** Keeps 62a shipping independent infra; 62b consumes without 62a blocking on runtime.

### Q4: What about existing 103k extracted_fees rows when we cut over?

| Option | Description | Selected |
|--------|-------------|----------|
| Backfill with best-effort lineage | Copy non-rejected rows; NULL-lineage get outlier_flag='lineage_missing' for Atlas re-discovery. | ✓ |
| Start clean; legacy stays | fees_raw empty; extracted_fees remains legacy until 66. Clean cut but sparse tier results until Knox runs. | |
| Dual-write during transition | Knox writes both tables during v10.0. Safety net but schema-drift risk. | |

**User's choice:** Backfill with best-effort lineage
**Notes:** Preserves historical data and turns the lineage crisis into a tractable re-discovery queue for Atlas.

---

## Write-CRUD scope & design

### Q1: Write-CRUD scope — MVP subset or all 25+ entities?

| Option | Description | Selected |
|--------|-------------|----------|
| MVP 8 + declarative scaffolding | 8 entities Knox/Darwin need; declarative registry for future 17+. Smaller phase. | |
| All 25+ entities, full CRUD | Complete AGENT-05 acceptance in one phase. Triples scope. | ✓ |
| Infrastructure only + ONE pilot entity | Framework + one entity; defer the rest to phases that need them. | |

**User's choice:** All 25+ entities, full CRUD
**Notes:** Ships the full write surface in one contract. Planner now has an authoritative 33-entity list to design against. Rationale: completeness matters for the identity-audit acceptance and avoids spreading infrastructure across phases.

### Q2: Agent authentication for write-CRUD

| Option | Description | Selected |
|--------|-------------|----------|
| Service role + agent_name header | Supabase service_role key + x-agent-name header; SEC-04 later swaps in JWT without changing call sites. | ✓ |
| Dedicated Postgres role + JWT claim | Create bfi_agent role + JWT now. Stronger isolation but couples 62a to JWT rollout owned by SEC-04. | |
| Per-agent service accounts (no JWT) | Four service_role-equivalent keys. No native Supabase support; requires custom gateway. | |

**User's choice:** Service role + agent_name header
**Notes:** Minimum net-new auth surface this phase; SEC-04 hardening path is clean.

### Q3: Tool implementation home

| Option | Description | Selected |
|--------|-------------|----------|
| Python-first + TS thin wrappers | Canonical in fee_crawler/agent_tools/; TS codegen from Pydantic. | ✓ (combined with MCP) |
| TS-first (MCP-friendly) + Python callers | Canonical in src/lib/agent-tools/ as server actions; Python calls over HTTP. Adds Modal→Vercel RTT per call. | ✓ (combined) |
| Postgres functions + thin language wrappers | Logic in SQL/PL functions; Python/TS just call. Atomic but hard to test/version. | |

**User's choice:** Python-first + TS wrappers + MCP for read-heavy data access
**User notes:** "i want 1 and 2 both. mcp would be great for data access like bankregdata.com"
**Clarified follow-up:** Three layers — Python canonical (Modal-native for Knox/Darwin/Atlas) + TS codegen wrappers (Hamilton/Pro) + read-only MCP server (external data consumers). Write surface not exposed via MCP in this phase.

### Q4: Audit payload shape

| Option | Description | Selected |
|--------|-------------|----------|
| Full before/after + reasoning hash | JSONB snapshots + sha256 of input+output. Full forensic. | ✓ |
| Before/after only, no reasoning hash | Simpler rows; loses replay capability (OBS-04 deferred). | |
| Diff-only (patch format) | RFC 6902 patches. Small rows; reconstruction cost later. | |

**User's choice:** Full before/after + reasoning hash
**Notes:** SC2 acceptance wants this verbatim.

### Q5 (follow-up): Confirm tool-layer reading + how to lock entity enumeration

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, three layers: Python + TS + MCP | Confirmed interpretation. | ✓ (tool layers) |
| MCP is canonical, others wrap | Would add RTT per Knox call. | |
| MCP as read-only projection (later phase) | Defer MCP entirely to 67/999.15. | |

**User's choice:** Three layers: Python + TS wrappers + MCP (read-only this phase)

| Option | Description | Selected |
|--------|-------------|----------|
| Enumerate now in CONTEXT.md | Inventory closed during this discussion; locked contract for planner. | ✓ |
| Delegate to gsd-phase-researcher | Researcher produces inventory as part of RESEARCH.md. | |
| Enumerate iteratively per entity group | Break into groups, lock one group per plan. | |

**User's choice:** Enumerate now in CONTEXT.md
**Notes:** Closed one of STATE.md's three pre-planning blockers; 33-entity list is in CONTEXT.md.

---

## agent_events schema

### Q1: Column shape

| Option | Description | Selected |
|--------|-------------|----------|
| Wide structured + JSONB payload | Typed columns for indexable filters + JSONB for payloads. Indexed SC1 query hits partition directly. | ✓ |
| Narrow + everything-in-JSONB | event_id, created_at, agent_name, action, payload. Painful indexing. | |
| Event-type-per-table (polymorphic) | Split into tool/loop/msg/budget tables. Worse REVIEW aggregation in 62b. | |

**User's choice:** Wide structured + JSONB payload

### Q2: Partitioning + retention

| Option | Description | Selected |
|--------|-------------|----------|
| Monthly range partitioning + 18mo retention | Range on created_at; detach + archive at 18 months. | ✓ |
| Hash partitioning on agent_name | 8 partitions by hash. Good for per-agent queries; bad for time-range pruning. | |
| Single table + aggressive indexing | Partition later. Risks painful online migration. | |

**User's choice:** Monthly range partitioning + 18mo retention

### Q3: Causality chain

| Option | Description | Selected |
|--------|-------------|----------|
| parent_event_id self-FK + correlation_id | Parent pointer + per-turn group uuid. Natural fit for OBS-02 and 5-step loop. | ✓ |
| Materialized lineage_path array | Full chain on every event. Write amplification. | |
| Graph table (agent_event_edges) | Separate edges table. Most flexible; more joins. | |

**User's choice:** parent_event_id self-FK + correlation_id

### Q4: Payload retention

| Option | Description | Selected |
|--------|-------------|----------|
| Payloads inline JSONB + 90-day size cap | Inline with 64KB cap; oversized → R2 pointer; 90-day compactor moves large payloads to R2. | ✓ |
| Always externalize payloads to R2 | All payloads in R2 from day one. Adds latency to every REVIEW query. | |
| Inline, no size cap, no archival | Simplest. TOAST tuple overflow and bloat inevitable. | |

**User's choice:** Payloads inline JSONB + 90-day size cap

---

## SQLite elimination

### Q1: fee_crawler/db.py approach

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite as Postgres-only module | Keep module path; rip out sqlite3 paths; all callers unchanged. | ✓ |
| Delete entirely; split into modules | Delete db.py; redistribute to repos/. Requires 100+ import-site rewrites. | |
| Strangler fig via import alias | pg_db.py as new canonical; db.py as deprecated shim. TIER-06 demands shim removal anyway. | |

**User's choice:** Rewrite as Postgres-only module

### Q2: Test fixtures

| Option | Description | Selected |
|--------|-------------|----------|
| Per-test Postgres schema | CREATE SCHEMA test_<uuid>; run migrations; drop after. Catches migration bugs. | ✓ |
| Pytest-postgresql session-scoped DB | Shared DB within session. Slight isolation risk. | |
| Keep SQLite for unit tests | Hybrid. Contradicts kill-SQLite. | |

**User's choice:** Per-test Postgres schema

### Q3: CLI audit pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Grep-and-rewrite as part of this phase | Every grep hit becomes a fix task; CI guard afterward. | ✓ |
| Fix only files touched by Knox/Darwin | Smaller scope; TIER-06 acceptance fails. | |
| Autofix with codemod + manual review | Fast if patterns uniform. | |

**User's choice:** Grep-and-rewrite as part of this phase

### Q4: modal_preflight.py

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite to check Postgres + R2 + agent_events | Confirm DATABASE_URL, required tables, R2 reachable, write a synthetic preflight event. | ✓ |
| Delete modal_preflight.py entirely | Lose explicit checkpoint. | |
| Move preflight into Atlas's agent_events on boot | Couples to Atlas existing (Phase 65). | |

**User's choice:** Rewrite to check Postgres + R2 + agent_events table

---

## Final gate

**Question:** Ready to create CONTEXT.md, revisit an area, or explore more gray areas?
**User's choice:** Create context
**Notes:** 33 write-CRUD entities enumerated in CONTEXT.md Entity Inventory section; three pre-planning blockers from STATE.md all closed.

---

## Claude's Discretion

- `agent_budgets` table exact column shape + window semantics (per-cycle vs per-batch vs per-report) — planner decides
- Tool registry format (Python decorator vs YAML) — default to decorator
- `pg_partman` vs cron-function partitioning — default to cron function
- Additional agent_events indexes beyond the four listed — planner decides if new query patterns emerge
- `institution_dossiers` schema details (columns listed in CONTEXT.md specifics; planner confirms during planning)

## Deferred Ideas

- MCP write surface (read-only this phase)
- User-owned entity agent impersonation (out of scope)
- pg_partman adoption (future upgrade)
- Franklin 5th adversarial agent (v11.0+)
- Smart Roomba with source re-extraction (v11.0)
- Dedicated Postgres role + JWT for agents (SEC-04, Phase 68)
