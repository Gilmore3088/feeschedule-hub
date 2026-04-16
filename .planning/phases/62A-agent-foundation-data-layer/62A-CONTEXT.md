# Phase 62a: Agent Foundation — Data Layer - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the durable Postgres data layer that every v10.0 agent depends on:

1. `agent_events` event log (every agent tool call writes a row) + `agent_auth_log` identity audit
2. Three-tier schema — `fees_raw` (Raw/Tier 1) → `fees_verified` (Business/Tier 2) → `fees_published` (Presentation/Tier 3) — with heavy lineage denormalization
3. Write-CRUD tool layer (Python canonical + TS codegen wrappers + read-only MCP surface) covering **all** 33 user-manipulable entities with full identity audit
4. Per-agent cost quota infrastructure (config-driven halt + `budget_halt` event)
5. SQLite fully eliminated from every production and test path (`grep better-sqlite3|sqlite3|DB_PATH` returns zero)

Nothing in this phase ships the 5-step loop runtime (that's 62b), Knox/Darwin/Atlas themselves (63-65), or Hamilton's refactor to read Tier 3 (66). This phase ships the **tables, tools, and audit plumbing** those phases assume exists.

**Not in scope:**
- 5-step loop framework code (LOG/REVIEW/DISSECT/UNDERSTAND/IMPROVE runtime → 62b)
- Inter-agent message protocol logic (Darwin↔Knox handshake → 62b)
- Knox/Darwin/Atlas agent code itself (63-65)
- RLS policies + SEC-04 JWT-based agent identity (68)
- MCP write surface (read-only this phase)
- Hamilton cutover to read only Tier 3 (66)

</domain>

<decisions>
## Implementation Decisions

### Three-tier materialization

- **D-01:** Build tiers as **parallel new tables** (`fees_raw`, `fees_verified`, `fees_published`) in Postgres, not views over existing tables. Legacy `extracted_fees` is frozen for writes post-cutover and remains read-only until Phase 66 Hamilton refactor. Rollback path: drop new tables, re-enable writes on `extracted_fees`.
- **D-02:** **Denormalize heavy lineage columns** on every tier row. Tier 1 carries `source_url`, `document_r2_key`, `extraction_confidence`, `agent_event_id`, `institution_id`, `crawl_event_id`. Tier 2 adds `canonical_fee_key`, `variant_type`, `outlier_flags` (jsonb), `verified_by_agent_event_id`. Tier 3 adds `lineage_ref` (Tier 2 FK) + `published_by_adversarial_event_id`. OBS-02's "one-query full trace" becomes trivial at the cost of some redundancy with `crawl_results`.
- **D-03:** **Promotion via Darwin SQL function + adversarial call.** Tier 1→Tier 2 is a `promote_to_tier2(fee_id, agent_name, reasoning_hash)` Postgres function, callable only by Darwin via its write-CRUD tool; writes an `agent_events` row. Tier 2→Tier 3 requires a successful `agent_messages` handshake (Darwin + Knox both attest). Phase 62a ships the SQL functions + empty `agent_messages` table; Phase 62b wires the protocol logic.
- **D-04:** **Backfill legacy data with best-effort lineage.** One-shot migration: copy non-rejected `extracted_fees` rows → `fees_raw` with `crawl_results.document_url` where present, `agent_event_id=NULL`, `source='migration_v10'`. Rows with NULL `document_url` get `outlier_flag='lineage_missing'` — Atlas (Phase 65) later routes these to Knox for re-discovery. Dual-write is explicitly rejected.

### Write-CRUD tool layer

- **D-05:** **Full scope — all 33 enumerated entities, full CRUD this phase.** Ships as one contract, not an MVP subset. Rationale: planner + researcher need a complete write surface to design against; deferring entities splits the identity-audit infrastructure across multiple phases; `AGENT-05`'s "25+ entities all with identity audit" acceptance requires completeness. See *Entity Inventory* below for the authoritative list.
- **D-06:** **Agent authentication via Supabase service_role + `x-agent-name` header.** Every tool call includes the header (`knox|darwin|atlas|hamilton|state_<abbr>`). Gateway inserts `agent_auth_log` row with `actor_type='agent'` + `agent_name`. SEC-04 (Phase 68) later hardens this with a dedicated Postgres role + JWT claim without changing tool call sites.
- **D-07:** **Three-layer tool architecture.** Python (`fee_crawler/agent_tools/`) is the canonical source (Pydantic schemas, asyncpg-native) — Knox/Darwin/Atlas run on Modal and call directly. TS wrappers (`src/lib/agent-tools/`) are **code-generated** from the Python schemas (JSON Schema → TS types); Hamilton + Pro screens call the TS wrappers. A **read-only MCP server** wraps the read surface (index/fees/institution_dossiers/Call Reports) and exposes them as discoverable tools externally — foreshadows `999.15` public API and bankregdata.com-style data-access consumers. Write tools are NOT exposed via MCP in this phase.
- **D-08:** **Audit payload is full forensic.** Every tool-triggered write inserts an `agent_auth_log` row with `before_value` (JSONB snapshot), `after_value` (JSONB), `reasoning_hash` (sha256 of input prompt + model output that caused the call), `parent_event_id` (correlation up-link), `agent_event_id` (the write event). Row size is acceptable given monthly partitioning + 18-month retention.

### agent_events schema

- **D-09:** **Wide structured columns + JSONB payload.** Top-level typed columns: `event_id` (uuid pk), `created_at` (timestamptz), `agent_name` (text), `action` (text), `tool_name` (text), `entity` (text), `entity_id` (text — polymorphic id), `status` (pending|success|error|budget_halt), `cost_cents` (int), `confidence` (numeric), `parent_event_id` (uuid FK self), `correlation_id` (uuid), `reasoning_hash` (bytea). Plus `input_payload` (jsonb), `output_payload` (jsonb), `source_refs` (jsonb), `error` (jsonb). Indexed on `(agent_name, created_at DESC)`, `(correlation_id)`, `(entity, entity_id)`, `(parent_event_id)`.
- **D-10:** **Monthly range partitioning by `created_at` + 18-month retention.** Use `pg_partman` or a cron-driven function to auto-create next month's partition. Partitions older than 18 months detach and archive to `agent_events_archive` (a cold heap table; eventually R2). SC1's recent-hour query hits only the current partition — easily sub-second at 10M+ rows.
- **D-11:** **Causality via `parent_event_id` self-FK + `correlation_id` uuid.** `parent_event_id` points to the immediate parent event (Darwin's verify → Knox's extraction → state-agent crawl). `correlation_id` groups a full reasoning turn (all child events share it). OBS-02's full-trace query walks `parent_event_id` upward; `correlation_id` gives per-turn slicing.
- **D-12:** **Payloads inline JSONB + 90-day size-based compaction.** `input_payload`/`output_payload` live inline with a per-row cap (64KB total, configurable). Oversized payloads write to R2; column stores a pointer `{r2_key, sha256, size}`. After 90 days, a compactor moves all payloads > 4KB to R2. Recent-turn queries stay fast; old audit history compresses gracefully.

### SQLite elimination

- **D-13:** **Rewrite `fee_crawler/db.py` as Postgres-only.** Keep the module path (preserves every `from fee_crawler import db` import site), rip out every `sqlite3` path. `require_postgres()` becomes a no-op. All functions switch to asyncpg. TIER-06 grep acceptance (`better-sqlite3|sqlite3|DB_PATH` → 0 matches in production paths) passes this way.
- **D-14:** **Per-test Postgres schema in pytest fixtures.** `conftest.py` creates a fresh Postgres schema (`CREATE SCHEMA test_<uuid>`), runs `supabase/migrations/` against it, drops after the test. Requires `DATABASE_URL` pointing at a local/CI Postgres (docker-compose service added this phase). Catches migration bugs that SQLite fixtures hide. TIER-06 acceptance: `pytest fee_crawler/tests/` runs green against Postgres.
- **D-15:** **Grep-and-rewrite every SQLite call site in this phase.** Inventory of every `better-sqlite3|sqlite3|DB_PATH` hit becomes a fix task in PLAN.md. CI adds a guard: `grep` in production paths must return zero. Stale commands that can't be converted in scope get deleted or marked deprecated with a follow-up task.
- **D-16:** **Rewrite `modal_preflight.py` as Postgres + R2 + agent_events readiness check.** Confirms DATABASE_URL connects, required tables exist (`fees_raw`, `fees_verified`, `fees_published`, `agent_events`, `agent_auth_log`, `agent_messages`, `agent_registry`, `agent_budgets`, `institution_dossiers`), R2 bucket reachable, MODAL_SECRET envs set. Also writes + deletes a synthetic `preflight_check` agent_events row to confirm write path. Fail-fast on cold start.

### Claude's Discretion

- **Cost quota enforcement mechanics:** `agent_budgets` table shape (columns: `agent_name`, `window` enum, `limit_cents`, `spent_cents`, `window_started_at`, `halted_at`, `halted_reason`). Check happens inside the tool gateway BEFORE each tool call; `cost_cents` accounting happens AFTER. Config source hierarchy: env var (`ATLAS_AGENT_BUDGET_KNOX_CENTS`) → `agent_budgets` table → config.yaml fallback. SC5's env-var-halts-cycle acceptance is tested end-to-end. Exact window semantics (per-cycle, per-batch, per-report) are Claude's call during planning unless you want to specify.
- **Tool registry format:** Python-side registry (e.g., `fee_crawler/agent_tools/registry.py` with decorator `@agent_tool(entity=..., crud=...)`) is Claude's default. TS codegen uses `json-schema-to-typescript` or equivalent. Can swap to YAML registry if that feels better during planning.
- **Partition management:** Whether to adopt `pg_partman` (Supabase extension support required — verify in planning) vs. a homemade cron function. Defaulting to cron function for minimum new-dependency surface; escalate to `pg_partman` if partition creation becomes painful.
- **agent_events indexes:** The four indexes listed in D-09 cover the known query patterns. Additional indexes (e.g., `(tool_name, status)` for tool-level error monitoring) are Claude's discretion unless you want them locked now.
- **`institution_dossiers` schema:** New table introduced for KNOX-03 (strategy memory per institution). Columns at minimum: `institution_id` FK, `last_url_tried`, `last_document_format`, `last_strategy`, `last_outcome`, `last_cost_cents`, `next_try_recommendation`, `updated_at`, `updated_by_agent_event_id`. 62a ships the table empty; 63 populates.

### Entity Inventory (Write-CRUD Scope Contract)

**Locked for planning — this is the authoritative list of 33 entities whose write operations get agent-accessible tools with full identity audit.**

| # | Entity | Source surface | CRUD ops (this phase) | Notes |
|---|--------|----------------|-----------------------|-------|
| 1 | `fees_raw` (NEW) | Knox state agents | insert, update (outlier_flags) | Tier 1 Raw; immutable amount fields |
| 2 | `fees_verified` (NEW) | Darwin | insert, update | Tier 2 Business; promoted from fees_raw |
| 3 | `fees_published` (NEW) | Adversarial gate | insert | Tier 3 Presentation; admin-read, no UPDATE |
| 4 | `fee_reviews` | src/lib/fee-actions.ts (13 server actions) | insert, update | Admin + Darwin both write |
| 5 | `crawl_targets` | src/app/admin/institution/[id]/actions.ts | update (status, url, last_*) | Knox dossier-driven updates |
| 6 | `crawl_results` | fee_crawler/commands/crawl.py | insert | Knox state agents |
| 7 | `crawl_runs` | fee_crawler/commands/crawl.py | insert, update | Run-level orchestration |
| 8 | `institution_dossiers` (NEW) | Knox state agents | upsert | Per-institution strategy memory (KNOX-03) |
| 9 | `jobs` | src/app/admin/pipeline/actions.ts (10 server actions) | insert, update | Pipeline job lifecycle |
| 10 | `hamilton_watchlists` | src/app/pro/(hamilton)/monitor/actions.ts | create, update, delete | Pro user state |
| 11 | `hamilton_saved_analyses` | src/app/pro/(hamilton)/analyze/actions.ts | create, update, delete | Pro user state |
| 12 | `hamilton_scenarios` | src/app/pro/(hamilton)/simulate/actions.ts | create, update, delete | Pro user state |
| 13 | `hamilton_reports` | src/app/pro/(hamilton)/reports/actions.ts | create, update, delete | Pro user state |
| 14 | `hamilton_signals` | Hamilton | insert | Derived demand reflection (HAM-05) |
| 15 | `hamilton_priority_alerts` | Hamilton | insert, update | Pro surfaces |
| 16 | `hamilton_conversations` | Hamilton research hub | insert, update | Session memory |
| 17 | `hamilton_messages` | Hamilton research hub | insert | Per-turn log |
| 18 | `published_reports` | src/app/admin/hamilton/actions.ts | insert, update | Report publication |
| 19 | `report_jobs` | src/app/admin/hamilton/actions.ts | insert, update, cancel | Report job lifecycle |
| 20 | `saved_peer_sets` | src/app/admin/peers/actions.ts | create, update, delete | Admin peer sets |
| 21 | `saved_subscriber_peer_groups` | src/app/pro/peers/actions.ts | create, update, delete | Pro peer sets |
| 22 | `articles` | src/app/admin/hamilton/research/articles/actions.ts | create, update, delete | Already full-CRUD per audit |
| 23 | `classification_cache` | fee_crawler/commands/categorize_fees.py | insert, update | Darwin feedback loop target |
| 24 | `external_intelligence` | fee_crawler/commands/ingest_*.py | insert, update | FRED/BLS/CFPB intel |
| 25 | `beige_book_themes` | fee_crawler/commands/ingest_beige_book.py | insert, update | Fed district intel |
| 26 | `fee_change_events` | Darwin + Knox | insert | Change detection (peer movement) |
| 27 | `roomba_log` | Darwin | insert | Verification results (Darwin replaces Roomba role) |
| 28 | `wave_runs` | Atlas (Phase 65 uses) | insert, update | Orchestration lineage |
| 29 | `wave_state_runs` | Atlas (Phase 65 uses) | insert, update | Per-state wave lineage |
| 30 | `agent_events` (NEW) | Framework gateway | auto-insert only | No updates — append-only |
| 31 | `agent_auth_log` (NEW) | Framework gateway | auto-insert only | No updates — append-only |
| 32 | `agent_messages` (NEW) | 62b wires, 62a ships table | insert, update (intent transitions) | Inter-agent protocol |
| 33 | `agent_registry` + `agent_budgets` (NEW) | Atlas config | upsert | Counted as one logical entity (two tables, co-managed) |

**Counted strictly by unique entity concept, this is 33 entities. If `agent_registry` and `agent_budgets` are counted separately, 34.**

**Foreshadowed but NOT in this phase's scope:**
- User-owned entities (users, sessions, api_keys, billing_customers) — keep as user-only writes; agents do not impersonate users
- `discovery_cache`, `platform_registry`, `cms_confidence` — read-only for agents in this phase
- Any crawl-time artifacts that don't need agent write surface (`document_snapshots` read-only; `fee_snapshots` read-only time-series)

### Folded Todos

None. The four UI-area todo matches from the cross-reference step (`hamilton chat PDF export`, `admin nav jumping`, `rich chat visualizations`, `sortable tables`) are all unrelated to this data-layer phase and belong elsewhere.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before planning or implementing.**

### Phase scope + audit source
- `.planning/audits/2026-04-16-pipeline-audit/SYNTHESIS.md` — 80.4% lineage loss, eight lesions, Theme 1 lineage crisis driving Tier 1 denormalization decision
- `.planning/audits/2026-04-16-pipeline-audit/AGENT-NATIVE-SYNTHESIS.md` — CRUD 4%, Action Parity 23%, Context Injection 42% — the three scores this phase unblocks
- `.planning/audits/2026-04-16-pipeline-audit/03-data-integrity.md` — R2 document_path NULL on 100%, lineage column population patterns
- `.planning/audits/2026-04-16-pipeline-audit/agent-native/05-crud-completeness.md` — 25+ entities enumeration source; cross-reference against this phase's 33-entity inventory during planning
- `.planning/audits/2026-04-16-pipeline-audit/01-fee-pipeline.md` — fetch/extract/categorize stages; source for legacy tables that get frozen

### Requirements + contract
- `.planning/REQUIREMENTS.md` §AGENT-01..05, §TIER-01..06 — the acceptance bars this phase must meet; every decision maps to a requirement ID
- `.planning/PROJECT.md` — v10.0 key decisions table, SQLite elimination, quarterly cadence, three-tier lock

### Existing code surface (read during planning)
- `src/lib/crawler-db/connection.ts` — canonical Postgres client setup; `fees_raw`/`fees_verified`/`fees_published` follow the same pattern
- `src/lib/crawler-db/fees.ts`, `fee-index.ts`, `institution.ts` — legacy `extracted_fees` query surface that will transition to Tier 3 reads in Phase 66
- `src/lib/fee-actions.ts` — 13 server actions for fee review; converts to agent-accessible tools this phase
- `src/lib/hamilton/pro-tables.ts` — hamilton_* table CREATE statements (6 tables)
- `fee_crawler/db.py` — the module being rewritten as Postgres-only (D-13)
- `fee_crawler/modal_preflight.py` — rewrite target (D-16)
- `fee_crawler/commands/` — 37 CLI scripts; grep surface for SQLite elimination (D-15)
- `supabase/migrations/` — 8 existing migrations; new tier + agent tables land here as new migrations

### Referenced docs on v10.0 decisions
- `.planning/memory/project_kill_sqlite.md` (per CLAUDE.md auto-memory) — prior context on SQLite retirement
- `.planning/memory/project_agent_team.md` — locked team composition; informs agent_name enum

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`postgres` client (src/lib/crawler-db/connection.ts):** Already configured for Supabase transaction-mode pooler (port 6543, `prepare: false`). TS-side DB layer is Postgres-only. New tier tables + agent tables slot into this client.
- **Server actions pattern (src/lib/fee-actions.ts):** 13 fee-review actions demonstrate the "action wraps DB write with validation" pattern. Write-CRUD tools borrow this contract: validate input → write target row → write agent_auth_log → return.
- **`supabase/migrations/` numbering convention (`YYYYMMDD_description.sql`):** New migrations land here; 62a introduces 5-6 migrations (tier tables, agent_events partitioned, agent_auth_log, agent_messages, agent_budgets + registry, legacy freeze trigger).
- **`geist` + `admin-card` design system:** N/A for this phase (no UI). `UI hint: no` on ROADMAP.md.
- **`vitest` + `pytest` test runners:** Existing harness; per-test Postgres schema fixture (D-14) extends pytest's conftest.py.

### Established Patterns
- **Dynamic WHERE builders (src/lib/crawler-db/market.ts, peers.ts):** Three-tier queries extend this pattern; planner reuses the builder for Tier-aware filter logic in Hamilton cutover phase.
- **Write-DB per-action lifecycle (`getWriteDb()` pattern):** Not applicable server-side in Next.js Postgres layer (singleton pool); mentioned only because Python-side agent_tools should NOT adopt a per-call connection — share a pool via asyncpg.
- **Modal secret injection at runtime (require_postgres reads env lazily):** Preserved in D-16 rewrite; preflight runs AFTER Modal secret injection.
- **Transaction wrapping (db.transaction() in fee-actions.ts):** Every write-CRUD tool wraps (target write + agent_events insert + agent_auth_log insert) in a single transaction so the three never diverge.

### Integration Points
- **fee-actions.ts callers (admin UI):** Once write-CRUD tools land, admin UI shifts to calling tools through TS wrappers — identical audit surface whether invoked by user or agent.
- **Modal cron jobs (fee_crawler/modal_app.py):** Preflight check (D-16) runs at the top of every scheduled function; one new helper in modal_app.py.
- **Cross-cutting: `canonical_fee_key` (Phase 55):** fees_verified's `canonical_fee_key` column is the Phase 55 foundation that Hamilton currently ignores; D-02 lineage denormalization preserves it through Tier 3.
- **Cost tracking:** `cost_cents` column on agent_events + tool-gateway cost calculation. Claude API usage_metadata → cents conversion happens in the gateway layer.

</code_context>

<specifics>
## Specific Ideas

- **User called out MCP for "data access like bankregdata.com."** Planning should scope the MCP server as a read-only projection of the tier-3 + institution_dossiers + Call Report surface, discoverable by external agents. Write surface stays behind service-role + agent-name header. The MCP exposure itself is part of this phase's tool-home architecture (D-07), not deferred.
- **Three pre-planning blockers (STATE.md) are now resolved:**
  1. 33 entities enumerated above (was: "identify the full list of 25+")
  2. Tier 1/2/3 column contract drafted in D-02 (was: "needs a concrete schema draft")
  3. SQLite audit approach locked in D-13..D-16 (was: "auditing every better-sqlite3, sqlite3, DB_PATH reference")
- **Phase 62b dependency preview:** This phase ships empty `agent_messages` table + promotion SQL functions. 62b's runtime layer populates the handshake protocol. Planner should write 62a with 62b's eventual callers in mind — don't over-ship runtime logic here.
- **Phase 66 cutover preview:** `extracted_fees` read-query compatibility matters until Phase 66 ships Hamilton's Tier 3 cutover. During planning, confirm no query in `src/lib/crawler-db/` is broken by freezing writes on `extracted_fees` (reads continue to work).

</specifics>

<deferred>
## Deferred Ideas

- **MCP write surface** — MCP in this phase is read-only. Writes via MCP are a later consideration (possibly Phase 67 capability discovery, or a dedicated 999.15 public API phase).
- **User-owned entity agent impersonation** — agents do not write to `users`, `sessions`, `api_keys`, `billing_customers`. Explicitly out of scope; user-only writes remain.
- **`pg_partman` adoption** — homemade cron function for monthly partitioning in this phase; `pg_partman` is a future upgrade if the cron function becomes fragile.
- **Franklin (5th adversarial agent)** — deferred to v11.0+ per PROJECT.md key decisions. Agent identity enum in this phase includes `hamilton|knox|darwin|atlas|state_<abbr>` only.
- **Smart Roomba with source re-extraction** — deferred to v11.0 per REQUIREMENTS.md. Darwin's orphan-routing happens via Atlas queue in Phase 65.
- **Dedicated Postgres role + JWT claim for agents** — that's SEC-04 in Phase 68; this phase uses service-role + header. Tool call sites are designed so 68 can swap the auth layer without changes.
- **Reviewed Todos (not folded):**
  - `2026-04-08-chat-pdf-export.md` — UI; belongs in a Pro polish phase
  - `2026-04-08-fix-admin-nav-jumping.md` — UI; admin polish
  - `2026-04-08-rich-chat-visualizations.md` — UI; Hamilton UX
  - `2026-04-08-wire-sortable-table-into-admin-pages.md` — UI; admin polish (999.1)

</deferred>

---

*Phase: 62A-agent-foundation-data-layer*
*Context gathered: 2026-04-16*
