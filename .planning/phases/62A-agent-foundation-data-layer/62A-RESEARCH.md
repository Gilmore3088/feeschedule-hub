# Phase 62a: Agent Foundation — Data Layer — Research

**Researched:** 2026-04-16
**Domain:** Postgres data layer for agent infrastructure (event log, three-tier fee schema, write-CRUD tool gateway, audit, budgets, SQLite removal)
**Confidence:** HIGH on library picks, HIGH on schema shapes, MEDIUM on pg_partman availability (Supabase still in-progress as of late 2025), HIGH on the rest

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Three-tier materialization:**
- **D-01:** Parallel new tables (`fees_raw`, `fees_verified`, `fees_published`). Legacy `extracted_fees` frozen for writes post-cutover; read-only until Phase 66. Rollback path exists.
- **D-02:** Heavy lineage denormalization on every tier row. Tier 1: `source_url`, `document_r2_key`, `extraction_confidence`, `agent_event_id`, `institution_id`, `crawl_event_id`. Tier 2: + `canonical_fee_key`, `variant_type`, `outlier_flags` (jsonb), `verified_by_agent_event_id`. Tier 3: + `lineage_ref` (Tier 2 FK), `published_by_adversarial_event_id`.
- **D-03:** Promotion via Darwin SQL function (`promote_to_tier2(fee_id, agent_name, reasoning_hash)`) + adversarial call. 62a ships SQL functions + empty `agent_messages` table; 62b wires protocol logic.
- **D-04:** One-shot backfill `extracted_fees → fees_raw` with `crawl_results.document_url`; NULL-url rows get `outlier_flag='lineage_missing'`. No dual-write.

**Write-CRUD tool layer:**
- **D-05:** Full scope — all 33 enumerated entities get CRUD this phase. No MVP subset.
- **D-06:** Supabase service_role + `x-agent-name` header. Gateway inserts `agent_auth_log` row with `actor_type='agent'` + `agent_name`.
- **D-07:** Three-layer tool architecture — Python canonical (asyncpg + Pydantic) in `fee_crawler/agent_tools/`, TS wrappers code-generated in `src/lib/agent-tools/`, read-only MCP server wraps the READ surface only. Writes are NOT exposed via MCP in 62a.
- **D-08:** Full forensic audit payload — `before_value` JSONB, `after_value` JSONB, `reasoning_hash` sha256, `parent_event_id`, `agent_event_id`.

**agent_events schema:**
- **D-09:** Wide typed columns + JSONB payload. Indexed on `(agent_name, created_at DESC)`, `(correlation_id)`, `(entity, entity_id)`, `(parent_event_id)`.
- **D-10:** Monthly range partitioning by `created_at` + 18-month retention. Old partitions detach → `agent_events_archive`.
- **D-11:** Causality via `parent_event_id` self-FK + `correlation_id` uuid.
- **D-12:** Payloads inline JSONB with 64KB cap + 90-day compactor that moves >4KB payloads to R2.

**SQLite elimination:**
- **D-13:** Rewrite `fee_crawler/db.py` as Postgres-only. Keep module path. `require_postgres()` becomes no-op. All functions switch to asyncpg.
- **D-14:** Per-test Postgres schema in pytest fixtures. `CREATE SCHEMA test_<uuid>` → run migrations → drop.
- **D-15:** Grep-and-rewrite every SQLite call site. CI grep guard.
- **D-16:** Rewrite `modal_preflight.py` as Postgres + R2 + agent_events readiness check.

### Claude's Discretion

- Cost quota mechanics (agent_budgets columns, check placement, env-var override).
- Tool registry format (Python decorator vs YAML).
- Partition management (pg_partman vs homemade cron).
- agent_events additional indexes.
- institution_dossiers schema.

### Deferred Ideas (OUT OF SCOPE)

- MCP write surface (read-only this phase).
- User-owned entity agent impersonation (users/sessions/api_keys stay user-only).
- pg_partman adoption (cron-function default; pg_partman future).
- Franklin 5th adversarial agent.
- Smart Roomba with source re-extraction.
- Dedicated Postgres role + JWT for agents (SEC-04 → Phase 68).
- Four UI todos (chat PDF export, admin nav jumping, rich visuals, sortable tables).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGENT-01 | `agent_events` exists; schema includes event_id, timestamp, agent_name, action, input_payload, output_payload, source_refs, confidence, cost_cents, parent_event_id | Domain 7 schema; Domain 1 partitioning for 10M-row performance |
| AGENT-02 | Every agent action writes exactly one `agent_events` row before side effects | Domain 5 gateway pattern (Python canonical tool wraps target write + agent_events insert in one tx) |
| AGENT-03 | Partitioned or retention-policied; sub-1s queries on agent_name + recent window at 10M rows | Domain 1 (monthly range partitioning + partition pruning + `(agent_name, created_at DESC)` local index) |
| AGENT-04 | `agent_auth_log` records every agent-triggered write (who, tool, entity, before, after, reasoning_hash) | Domain 5 gateway pattern; Domain 7 audit column types |
| AGENT-05 | Scoped write-CRUD tools for all 25+ entities with identity audit | Domain 3 codegen; Domain 7 entity scopes; Domain 5 gateway |
| TIER-01 | `fees_raw`, `crawl_events_raw`, `document_snapshots` with lineage | Domain 7 Tier 1 schema |
| TIER-02 | `fees_verified`, `institution_profiles_verified`, `category_index_business` with canonical_fee_key/variant/outlier_flags | Domain 7 Tier 2 schema; existing `20260409_canonical_fee_key.sql` integration |
| TIER-03 | `fees_published`, `index_published`, `snapshots_published` — adversarial-gated | Domain 7 Tier 3 schema; Domain 5 gateway |
| TIER-04 | Tier 1→2 promotion only via Darwin verification function; logged to agent_events | D-03 SQL function + agent_events insert in trigger body or gateway |
| TIER-05 | Tier 2→3 promotion requires adversarial review (Darwin + Knox both attest via inter-agent protocol) + coverage threshold | 62a ships the SQL function signature + empty agent_messages table; 62b wires protocol |
| TIER-06 | SQLite fully eliminated; `fee_crawler/db.py` Postgres-only; all tests run against Postgres | Domain 2 asyncpg rewrite; Domain 6 pytest fixture; Domain 8 CI grep guard |

</phase_requirements>

---

## 1. Executive Summary

1. **asyncpg over psycopg2 for everything new.** Already installed (`asyncpg>=0.29`, verified 0.31.0 is current [VERIFIED: pip registry]). Clean JSONB handling, native async, outperforms psycopg2. Must pass `statement_cache_size=0` for Supabase transaction-pooler (port 6543) compatibility [CITED: Supabase docs on prepared statements].
2. **LISTEN/NOTIFY is out on 6543; use polling or session-pool for agent_messages.** Transaction poolers fundamentally cannot support LISTEN/NOTIFY because connections reassign between transactions [CITED: pgbouncer issue #655]. 62a ships the table; 62b's protocol runtime uses session pooler (port 5432) OR application-level polling. Document this now so 62b doesn't rediscover it.
3. **pg_partman on Supabase is still "in progress" as of Oct 2025.** CONTEXT.md defaulted to homemade cron-function partitioning — research confirms this is correct. Use `pg_cron` (available on Supabase) to run a maintenance function that creates next month's partition + detaches 18-month-old ones.
4. **Postgres codegen pipeline:** Pydantic v2 (source of truth) → `model_json_schema()` → `pydantic-to-typescript` v2 (Python-side CLI `pydantic2ts`) → `src/lib/agent-tools/types.generated.ts`. CI action validates TS is up to date. Single command; well-maintained.
5. **MCP server: FastMCP (mcp>=1.x Python SDK, official).** Streamable HTTP transport. Deploy as Modal function alongside `modal_preflight.py`. Read-only: wraps existing `crawler-db/` query functions as MCP tools and resources.
6. **Gateway pattern (NOT triggers) for agent_auth_log enforcement.** Triggers add reentrancy risk, can't read the `x-agent-name` header, and complicate transaction semantics. Application-layer gateway in Python (`fee_crawler/agent_tools/gateway.py`) wraps every tool call in a single transaction: `BEGIN → target write → agent_events insert → agent_auth_log insert → COMMIT`. Service-role auth + header is enforced at the gateway entrypoint; SEC-04 later adds DB-level Postgres role without changing call sites.
7. **agent_events partitioning: monthly RANGE on `created_at`, DEFAULT partition catches late rows, local indexes per-partition + global covering index `(agent_name, created_at DESC)` for SC1 sub-second.** Partition pruning handles the "last hour for knox" query.
8. **pytest-postgresql v8 + Postgres service container in CI.** Per-test schema via `CREATE SCHEMA test_<hex>` in a session-scoped fixture, migrations applied once, DROP SCHEMA CASCADE at teardown. Existing pytest infrastructure (fee_crawler/tests/) gets a conftest.py rewrite; in-memory SQLite path in `test_transition_fee_status.py` replaced with Postgres fixture.
9. **SQLite kill surface: 46 import sites across 43 Python files + ~30 call sites that use `Database`/`PostgresDatabase` classes + 2 test files with `sqlite3.connect`.** Cleanly bounded. No better-sqlite3 in package.json (verified — grep zero). Phase is Python-only for the kill work.
10. **Entity inventory: 33 entities, 30 existing + 3 new (`institution_dossiers`, `agent_messages`, `agent_registry+agent_budgets`).** All but 3 map to existing tables whose write operations already live in Next.js server actions — tool generation is mechanical.

**Primary recommendation:** Structure as 5 waves, 12-14 plans. Land migrations + gateway foundation first (waves 0-1), then the 33 entity tools are parallel (wave 2-3), finish with SQLite kill + preflight + CI guards (wave 4).

---

## 2. Per-Domain Findings

### Domain 1 — Postgres partitioning for agent_events and agent_auth_log

**Decision: Homemade `pg_cron`-driven maintenance function. `pg_partman` deferred.**

**Why:**
- Supabase's pg_partman support is still in-progress as of late Oct 2025 [CITED: [supabase/discussions #37986](https://github.com/orgs/supabase/discussions/37986)]. Relying on it blocks 62a on an unreleased extension.
- `pg_cron` IS available on Supabase as a pre-configured extension [CITED: [Supabase docs - pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron)]. Use it.
- Monthly partition creation is ~30 lines of SQL; pg_partman would be convenient but is not worth the dependency risk this phase.

**Schema pattern (RANGE partitioning on timestamptz):**

```sql
-- Parent (no data stored here; all rows go to a partition)
CREATE TABLE agent_events (
  event_id        UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  agent_name      TEXT NOT NULL,
  action          TEXT NOT NULL,
  tool_name       TEXT,
  entity          TEXT,
  entity_id       TEXT,
  status          TEXT NOT NULL CHECK (status IN ('pending','success','error','budget_halt')),
  cost_cents      INTEGER NOT NULL DEFAULT 0,
  confidence      NUMERIC(5,4),
  parent_event_id UUID,
  correlation_id  UUID NOT NULL DEFAULT gen_random_uuid(),
  reasoning_hash  BYTEA,
  input_payload   JSONB,
  output_payload  JSONB,
  source_refs     JSONB,
  error           JSONB,
  PRIMARY KEY (event_id, created_at)  -- partition key must be part of PK
) PARTITION BY RANGE (created_at);

-- Default partition catches late-arriving or out-of-range rows
CREATE TABLE agent_events_default PARTITION OF agent_events DEFAULT;

-- First active partition (phase creates current + next month)
CREATE TABLE agent_events_2026_04 PARTITION OF agent_events
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE agent_events_2026_05 PARTITION OF agent_events
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- Local indexes per-partition (Postgres 12+ auto-propagates from parent)
CREATE INDEX ON agent_events (agent_name, created_at DESC);
CREATE INDEX ON agent_events (correlation_id);
CREATE INDEX ON agent_events (entity, entity_id);
CREATE INDEX ON agent_events (parent_event_id);
```

**Maintenance function:**

```sql
CREATE OR REPLACE FUNCTION maintain_agent_events_partitions() RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  next_month DATE := date_trunc('month', now() + interval '1 month');
  after_month DATE := next_month + interval '1 month';
  archive_cutoff DATE := date_trunc('month', now() - interval '18 months');
  partition_name TEXT;
  r RECORD;
BEGIN
  -- Create next month if missing
  partition_name := 'agent_events_' || to_char(next_month, 'YYYY_MM');
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF agent_events FOR VALUES FROM (%L) TO (%L)',
      partition_name, next_month, after_month
    );
  END IF;

  -- Detach partitions older than 18 months → archive (simple: rename; advanced: copy to cold heap)
  FOR r IN
    SELECT c.relname FROM pg_class c
    JOIN pg_inherits i ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'agent_events'
      AND c.relname ~ '^agent_events_\d{4}_\d{2}$'
      AND to_date(substring(c.relname FROM '\d{4}_\d{2}$'), 'YYYY_MM') < archive_cutoff
  LOOP
    EXECUTE format('ALTER TABLE agent_events DETACH PARTITION %I', r.relname);
    EXECUTE format('ALTER TABLE %I RENAME TO %I', r.relname, r.relname || '_archived');
    -- Optional: dump to R2 + drop via a separate Modal job
  END LOOP;
END;
$$;

-- Schedule via pg_cron (runs 1st of month at 02:00 UTC)
SELECT cron.schedule('maintain-agent-events', '0 2 1 * *',
  $$SELECT maintain_agent_events_partitions()$$);
```

**Apply the same pattern to `agent_auth_log`** (separate maintenance function or one unified function that handles both).

**SC1 query performance:** `SELECT COUNT(*) FROM agent_events WHERE agent_name='knox' AND created_at > now() - interval '1 hour'` — planner prunes to current partition + default; index `(agent_name, created_at DESC)` covers the predicate. Sub-second at 10M rows is easy [CITED: generic Postgres partition pruning guarantee — [postgresql docs ch 5.12](https://www.postgresql.org/docs/current/ddl-partitioning.html)].

**Gotchas:**
- Partition key (`created_at`) MUST be part of the PRIMARY KEY. The FK `parent_event_id` → `event_id` becomes a composite FK-less pointer; document that cross-partition FKs aren't enforced (use a CHECK trigger or accept it).
- Cross-partition unique constraints aren't supported; `event_id` alone isn't globally unique at the DB level, but UUIDs collision-free by definition.
- `gen_random_uuid()` needs `pgcrypto` extension (enabled by default on Supabase [VERIFIED]).

**Archival:** First version detaches + renames. A follow-up (62b or 65) dumps to R2 and drops. 90-day-old payload compaction (D-12) is an orthogonal cron job that updates `input_payload`/`output_payload` inline (set to R2 pointer JSON) — runs before retention cutoff.

**Confidence:** HIGH on the pattern. MEDIUM on whether pg_partman becomes available during this phase (ignore until released).

---

### Domain 2 — asyncpg + Supabase pooler + Modal serverless

**Decision: asyncpg pool, initialized at module scope, `statement_cache_size=0`, transaction pooler (port 6543) for short-lived tool calls, session pooler (port 5432) reserved for long-running Knox state-agent jobs in Phase 63.**

**Pool config for 62a:**

```python
# fee_crawler/agent_tools/pool.py
import asyncpg
import os

_pool: asyncpg.Pool | None = None

async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=os.environ["DATABASE_URL"],
            min_size=1,          # Modal cold-start friendly
            max_size=10,         # Supabase free tier pooler cap is generous
            statement_cache_size=0,             # REQUIRED for transaction pooler
            max_cached_statement_lifetime=0,    # Belt-and-suspenders
            max_inactive_connection_lifetime=60,
            command_timeout=30,
            server_settings={
                'application_name': 'bfi-agent-tool',
            },
        )
    return _pool
```

**Why these settings** [CITED: [Supabase docs on disabling prepared statements](https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL); [supabase/issues/39227](https://github.com/supabase/supabase/issues/39227)]:
- Transaction pooler (Supavisor) reassigns connections across transactions; prepared statements cached on one backend are invisible on the next. `statement_cache_size=0` disables asyncpg's default cache.
- Pool lifecycle: Modal keeps a container warm for a variable period; initializing at module scope (not per-invocation) reuses the pool across calls. Cold start creates the pool lazily on first use.
- `min_size=1` minimizes cold-start latency; `max_size=10` leaves headroom under Supabase's 200-connection pooler cap.

**Session vs transaction pooler choice:**
- 62a's write-CRUD tools: each call is short (single transaction). Use **transaction pooler (6543)**.
- Phase 63 Knox state agents may run for minutes and want LISTEN/NOTIFY: they use **session pooler (5432)**. Document this split in 62a's code so 63 doesn't relitigate.

**JSONB handling:** asyncpg returns JSONB as `str`. To auto-decode, register a codec:

```python
await pool.set_type_codec('jsonb', encoder=json.dumps, decoder=json.loads, schema='pg_catalog')
await pool.set_type_codec('json',  encoder=json.dumps, decoder=json.loads, schema='pg_catalog')
```

Register at pool creation. [CITED: [asyncpg custom type codecs](https://magicstack.github.io/asyncpg/current/usage.html)].

**Cross-thread safety:** asyncpg pool is **not thread-safe** in the same way a sync psycopg2 pool is. Every coroutine holds one connection. Current `get_worker_db()` threading pattern (thread-local db) needs rewriting — the new `fee_crawler/db.py` becomes async-only and callers convert.

**Migration of existing sync call sites:** 46 import sites use `from fee_crawler.db import Database`. Strategy:
- Rewrite `db.py` with both a sync shim (psycopg2-based, for untouched CLI commands) AND the new async surface.
- OR (cleaner): rewrite everything to async and adopt `asyncio.run()` at entrypoints.
- Given D-13 ("rewrite as Postgres-only, preserve module path"), the pragmatic answer is a **dual surface during transition** inside `db.py`: keep sync `Database` class as a psycopg2 wrapper for legacy commands, add new async `AgentDB` for tool layer. Full async conversion can be a follow-up.

**Sources:**
- [Supabase docs - Disabling Prepared statements](https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL)
- [asyncpg usage docs](https://magicstack.github.io/asyncpg/current/usage.html)
- [Supabase/asyncpg discussion #20775](https://github.com/orgs/supabase/discussions/20775)

**Confidence:** HIGH.

---

### Domain 3 — Python → TypeScript type codegen

**Decision: `pydantic-to-typescript` v2 (CLI `pydantic2ts`). Python is source of truth. Commit-time generation + CI validation.**

**Why:**
- Pydantic v2 is already the schema authority (config.py uses BaseModel 2.x).
- `pydantic2ts` v2.0.0 (Nov 2024) supports Pydantic >=2 natively [CITED: GitHub phillipdupuis/pydantic-to-typescript]. Actively maintained.
- One-command generation: `pydantic2ts --module fee_crawler.agent_tools.schemas --output src/lib/agent-tools/types.generated.ts`.
- Provides a GitHub Action for CI validation (`--fail-on-diff` equivalent).

**Alternatives considered:**
- `datamodel-code-generator` (0.56.1): excellent the OTHER direction (JSON Schema → Pydantic). For Python→TS it's not the right tool.
- `quicktype`: language-agnostic but heavier and less Pydantic-aware.
- `openapi-typescript`: requires OpenAPI; overkill for our purely-typed contract.
- Manual duplication: rejected; drift risk is exactly what codegen prevents.

**Workflow:**

```bash
# Python source (fee_crawler/agent_tools/schemas.py)
from pydantic import BaseModel

class ApproveFeeInput(BaseModel):
    fee_id: int
    notes: str | None = None

class ApproveFeeOutput(BaseModel):
    success: bool
    error: str | None = None
    new_status: str | None = None

# Generate TS (run manually or via git hook or CI)
pydantic2ts --module fee_crawler.agent_tools.schemas \
  --output src/lib/agent-tools/types.generated.ts \
  --exclude InternalBase
```

**TS runtime validation:** `pydantic2ts` produces type-only `.d.ts`-style interfaces. The TS wrapper should ALSO validate at runtime — existing `zod` 4.3.6 is already in deps (used for env vars + API inputs). Hand-write zod schemas that mirror the Pydantic ones, OR generate both with a secondary step using `zod-to-json-schema` reverse (not worth it this phase — manually mirror zod schemas for the ~40 tools).

**Decision on runtime validation:** Generated TS types only for 62a. zod schemas added on an as-needed basis per server-action call site. If drift becomes painful, revisit in Phase 67.

**CI integration:**
- Git pre-commit hook: `pydantic2ts ... && git add src/lib/agent-tools/types.generated.ts`
- CI: `pydantic2ts ... && git diff --exit-code src/lib/agent-tools/types.generated.ts` — fails if not regenerated.

**Sources:**
- [pydantic-to-typescript GitHub](https://github.com/phillipdupuis/pydantic-to-typescript) (via research; direct fetch 404'd but npm/PyPI confirm v2.x)
- [Pydantic JSON schema docs](https://docs.pydantic.dev/latest/concepts/json_schema/)
- [Pydantic+datamodel-code-generator integration](https://docs.pydantic.dev/latest/integrations/datamodel_code_generator/) (reverse direction, for reference)

**Confidence:** HIGH.

---

### Domain 4 — MCP server selection

**Decision: `mcp` Python SDK (v1.27.0 current) with FastMCP ergonomics. Deploy as a Modal FastAPI function alongside `modal_preflight.py`. Streamable HTTP transport.**

**Why:**
- Official SDK, actively maintained; Anthropic donated MCP to Linux Foundation Dec 2025 so it's now a true standard [CITED: web research on 2026 MCP state].
- FastMCP is now part of the official SDK (`from mcp.server.fastmcp import FastMCP`); no separate install.
- Python-native so it can import the existing `src/lib/crawler-db/` query patterns directly (via asyncpg → same Postgres the TS layer reads).
- Streamable HTTP replaces SSE as default transport (March 2026 spec update) — simpler to deploy behind a Modal endpoint.

**Alternatives considered:**
- Official TypeScript SDK (`@modelcontextprotocol/sdk` v1.29.0): viable, but the write-CRUD tool schemas are Python-first, so a TS MCP server duplicates schema work. Rejected.
- `fastmcp` (the standalone v2.x on PyPI) vs the official SDK's bundled FastMCP: official wins for long-term stability.

**Surface (read-only for 62a):**

```python
# fee_crawler/mcp_server/server.py
from mcp.server.fastmcp import FastMCP
from fee_crawler.agent_tools.pool import get_pool

mcp = FastMCP("bank-fee-index")

@mcp.tool()
async def get_national_index(fee_category: str | None = None) -> dict:
    """Query national fee index medians by category."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # read-only query against fees_published
        ...

@mcp.tool()
async def get_institution_dossier(institution_id: int) -> dict:
    """Read Knox's per-institution strategy memory."""
    ...

@mcp.resource("bfi://methodology")
def methodology() -> str:
    """Return the BFI methodology paper as a resource."""
    ...
```

**Read-only surface for 62a:**
1. National/peer fee index (Tier 3 reads only)
2. Institution dossiers (read-only; Knox writes via Python canonical tools in 62b)
3. Call Report / FRED / Beige Book pass-throughs
4. Agent-event trace-back for a published number (OBS-02)

**Auth:** CONTEXT.md D-07 reserves "service-role + x-agent-name header" for WRITE tools. MCP (read-only) uses a separate API-key header (`X-MCP-API-KEY`) validated against a new `mcp_api_keys` table — defer to Phase 68 for the rotation runbook. For 62a, ship with a single master key from Modal secrets.

**Deployment:** Add a `mcp_server` function to `modal_app.py` as a `@modal.fastapi_endpoint`. Access via `/mcp/*` on `bfi-mcp.modal.run` (Modal autogenerates the URL).

**Sources:**
- [MCP Python SDK GitHub](https://github.com/modelcontextprotocol/python-sdk)
- [mcp PyPI](https://pypi.org/project/mcp/) (v1.27.0 current [VERIFIED: pip registry])
- [MCP protocol spec + build-server guide](https://modelcontextprotocol.io/docs/develop/build-server)

**Confidence:** HIGH.

---

### Domain 5 — Trigger vs gateway enforcement for agent_auth_log

**Decision: Application-layer gateway. NO Postgres triggers for audit enforcement.**

**Why:**
- Triggers can't read application context (`x-agent-name` header, `reasoning_hash` from LLM prompt, `parent_event_id` from call stack). Would require session variables (`SET app.agent_name = 'knox'`) which don't survive transaction pooler.
- Triggers for audit on 30+ tables mean 30+ trigger functions, each with reentrancy risk (audit write could fire another trigger).
- Gateway pattern mirrors existing server-action style in `src/lib/fee-actions.ts` (which already wraps target write + fee_reviews insert in `sql.begin`). Agent tools are the same pattern.

**The gateway contract (Python canonical):**

```python
# fee_crawler/agent_tools/gateway.py
from contextvars import ContextVar
from datetime import datetime
import hashlib, json, uuid

_agent_context: ContextVar[dict] = ContextVar('agent_context')

async def with_agent_tool(
    tool_name: str,
    entity: str,
    entity_id: str | int | None,
    action: str,                    # 'create'|'update'|'delete'
    agent_name: str,
    parent_event_id: str | None,
    reasoning_prompt: str,
    reasoning_output: str,
    input_payload: dict,
):
    """Context manager that wraps a single write-CRUD tool call.

    Yields a transaction-bound connection + agent_event_id. Caller does
    the target-table write inside the `async with`. On success, agent_events
    and agent_auth_log rows are inserted and everything commits atomically.
    """
    pool = await get_pool()
    reasoning_hash = hashlib.sha256(
        (reasoning_prompt + reasoning_output).encode()
    ).digest()
    correlation_id = _agent_context.get({}).get('correlation_id') or uuid.uuid4()

    async with pool.acquire() as conn:
        async with conn.transaction():
            # 1. Check agent_budgets BEFORE the tool call
            await _check_budget(conn, agent_name)

            # 2. Insert agent_events (status='pending')
            event_id = await conn.fetchval(
                """INSERT INTO agent_events
                   (agent_name, action, tool_name, entity, entity_id, status,
                    parent_event_id, correlation_id, reasoning_hash, input_payload)
                   VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9)
                   RETURNING event_id""",
                agent_name, action, tool_name, entity, str(entity_id) if entity_id else None,
                parent_event_id, correlation_id, reasoning_hash, json.dumps(input_payload),
            )

            # 3. Read before_value for audit
            before_value = await _snapshot(conn, entity, entity_id) if entity_id else None

            # 4. Yield to caller for the actual target-table write
            yield conn, event_id

            # 5. Read after_value
            after_value = await _snapshot(conn, entity, entity_id) if entity_id else None

            # 6. Insert agent_auth_log
            await conn.execute(
                """INSERT INTO agent_auth_log
                   (agent_event_id, agent_name, actor_type, tool_name,
                    entity, entity_id, before_value, after_value,
                    reasoning_hash, parent_event_id)
                   VALUES ($1, $2, 'agent', $3, $4, $5, $6, $7, $8, $9)""",
                event_id, agent_name, tool_name, entity,
                str(entity_id) if entity_id else None,
                json.dumps(before_value) if before_value else None,
                json.dumps(after_value) if after_value else None,
                reasoning_hash, parent_event_id,
            )

            # 7. Update agent_events status + cost
            await conn.execute(
                """UPDATE agent_events SET status='success', cost_cents=$1, output_payload=$2
                   WHERE event_id = $3""",
                _agent_context.get({}).get('cost_cents', 0),
                json.dumps({'after': after_value}),
                event_id,
            )

            # 8. Accounting: increment agent_budgets.spent_cents
            await _account_budget(conn, agent_name)
```

**Usage example (a single CRUD tool):**

```python
# fee_crawler/agent_tools/fees.py
from pydantic import BaseModel
from .gateway import with_agent_tool
from .schemas import ApproveFeeInput, ApproveFeeOutput

async def approve_fee(
    input: ApproveFeeInput,
    agent_name: str,
    parent_event_id: str | None,
    reasoning: tuple[str, str],  # (prompt, output)
) -> ApproveFeeOutput:
    async with with_agent_tool(
        tool_name='approve_fee',
        entity='extracted_fees',
        entity_id=input.fee_id,
        action='update',
        agent_name=agent_name,
        parent_event_id=parent_event_id,
        reasoning_prompt=reasoning[0],
        reasoning_output=reasoning[1],
        input_payload=input.model_dump(),
    ) as (conn, event_id):
        row = await conn.fetchrow(
            "SELECT review_status FROM extracted_fees WHERE id=$1",
            input.fee_id,
        )
        if not row:
            return ApproveFeeOutput(success=False, error='Fee not found')
        _assert_transition(row['review_status'], 'approved')
        await conn.execute(
            "UPDATE extracted_fees SET review_status='approved' WHERE id=$1",
            input.fee_id,
        )
        # Also write fee_reviews row (existing pattern mirrored)
        ...
        return ApproveFeeOutput(success=True, new_status='approved')
```

**Why this is sufficient without triggers:**
- Service-role auth at Modal + the `x-agent-name` header enforcement live ABOVE the gateway. As long as nobody writes to the target tables directly (no SQL console bypasses), audit is complete.
- SEC-04 (Phase 68) will add a Postgres role + JWT + a DENY policy on direct SQL writes from that role. That's defense-in-depth, not 62a's job.
- The gateway is the single place to change behavior when SEC-04 lands.

**Belt-and-suspenders option (REJECTED for 62a):** Add a Postgres event trigger that refuses writes from non-service-role if `current_setting('app.agent_name', true)` is NULL. Discussed for Phase 68.

**Reentrancy avoided:** The gateway doesn't trigger another gateway call inside itself. No recursion risk.

**Confidence:** HIGH.

---

### Domain 6 — Supabase migration ordering + testing

**Decision: 6 new migrations this phase. pytest-postgresql v8 per-schema fixture. GitHub Actions Postgres service container for CI.**

**Migration files (in order, following existing `YYYYMMDD_description.sql` convention):**

```
supabase/migrations/
├── 20260417_agent_events_partitioned.sql     # Parent table + default partition + current+next month + maintain_agent_events_partitions() + pg_cron schedule
├── 20260417_agent_auth_log_partitioned.sql   # Same pattern
├── 20260418_fees_tier_tables.sql             # fees_raw, fees_verified, fees_published + indexes + promote_to_tier2() SQL function stub
├── 20260418_agent_messages.sql               # Empty table; 62b wires protocol logic
├── 20260419_agent_registry_and_budgets.sql   # agent_registry + agent_budgets + seeds
├── 20260419_institution_dossiers.sql         # KNOX-03 dossier table
├── 20260420_backfill_fees_raw.sql            # One-shot migration: extracted_fees → fees_raw with lineage_missing flag
├── 20260420_freeze_extracted_fees_writes.sql # BEFORE INSERT trigger → RAISE, with kill-switch constant
```

**Per-test schema fixture (pytest-postgresql v8):**

```python
# fee_crawler/tests/conftest.py
import os
import secrets
import pytest
import asyncpg
from pathlib import Path

@pytest.fixture(scope="session")
def postgres_dsn():
    """Base DSN for the CI or local Postgres."""
    return os.environ["DATABASE_URL_TEST"]

@pytest.fixture
async def db(postgres_dsn):
    """Per-test schema + migrations applied + drop on teardown."""
    schema = f"test_{secrets.token_hex(8)}"
    conn = await asyncpg.connect(postgres_dsn, statement_cache_size=0)
    await conn.execute(f'CREATE SCHEMA "{schema}"')
    await conn.execute(f'SET search_path TO "{schema}"')

    # Run migrations
    migrations_dir = Path(__file__).parents[2] / "supabase" / "migrations"
    for migration in sorted(migrations_dir.glob("*.sql")):
        sql = migration.read_text()
        await conn.execute(sql)

    # Open a pool for the test bound to this schema
    pool = await asyncpg.create_pool(
        postgres_dsn,
        min_size=1, max_size=3,
        statement_cache_size=0,
        server_settings={'search_path': schema},
    )
    yield pool

    # Teardown
    await pool.close()
    await conn.execute(f'DROP SCHEMA "{schema}" CASCADE')
    await conn.close()
```

**Why per-test schema vs pytest-postgresql's own process fixture:**
- pytest-postgresql v8 can manage a Postgres binary via `postgresql` fixture; we already have a running Postgres in CI (Supabase container or GitHub service container). `postgresql_noproc` + per-test schema is the right flavor [CITED: pytest-postgresql docs, [dbfixtures/pytest-postgresql](https://github.com/dbfixtures/pytest-postgresql)].
- Schema isolation is faster than DB-level isolation (no container restart per test).

**CI workflow addition:**

```yaml
# .github/workflows/test.yml
jobs:
  test:
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: bfi_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - run: pip install -r fee_crawler/requirements.txt
      - run: pip install pytest-postgresql pytest-asyncio
      - run: pytest fee_crawler/tests/
        env:
          DATABASE_URL_TEST: postgres://postgres:postgres@localhost:5432/bfi_test
```

**pg_cron in test environments:** Supabase-managed `pg_cron` is cloud-only; GitHub service container uses vanilla postgres:15 which does NOT have pg_cron. For tests, the maintenance function is called manually: `SELECT maintain_agent_events_partitions()` at the top of partition-related tests.

**Sources:**
- [pytest-postgresql](https://github.com/dbfixtures/pytest-postgresql) v8.0.0 [VERIFIED: pip registry]
- [GitHub Actions Postgres service container docs](https://docs.github.com/en/actions/use-cases-and-examples/using-containerized-services/creating-postgresql-service-containers)

**Confidence:** HIGH.

---

### Domain 7 — Schema specifics to lock

#### 7.1 agent_events (partitioned)

See Domain 1 SQL for the table. Additional detail:
- `event_id`: UUID (not bigint) — no central counter contention on partition writes.
- `cost_cents`: INTEGER (no fractional cents). Claude API usage → cents conversion in gateway.
- `confidence`: NUMERIC(5,4) — 4 decimal places, range [0.0, 1.0].
- `reasoning_hash`: BYTEA length 32 (sha256).
- `status`: TEXT + CHECK constraint (not enum — enum alterations are painful).
- Indexes (local, auto-propagated to child partitions): `(agent_name, created_at DESC)`, `(correlation_id)`, `(entity, entity_id)`, `(parent_event_id)`, `(tool_name, status) WHERE status='error'` (partial for error monitoring).

#### 7.2 agent_auth_log (partitioned)

```sql
CREATE TABLE agent_auth_log (
  auth_id          UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  agent_event_id   UUID NOT NULL,
  agent_name       TEXT NOT NULL,
  actor_type       TEXT NOT NULL CHECK (actor_type IN ('agent','user','system')),
  actor_id         TEXT,                       -- user.id if actor_type='user'
  tool_name        TEXT NOT NULL,
  entity           TEXT NOT NULL,
  entity_id        TEXT,
  before_value     JSONB,
  after_value      JSONB,
  reasoning_hash   BYTEA,
  parent_event_id  UUID,
  PRIMARY KEY (auth_id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX ON agent_auth_log (agent_event_id);
CREATE INDEX ON agent_auth_log (entity, entity_id, created_at DESC);
CREATE INDEX ON agent_auth_log (agent_name, created_at DESC);
```

- Same monthly partitioning + 18-month retention.
- FK to `agent_events.event_id`: NOT ENFORCED (cross-partition FKs aren't supported directly; comment documents). Application integrity: the gateway always inserts agent_events FIRST within the same transaction.

#### 7.3 agent_messages (empty in 62a, wired in 62b)

```sql
CREATE TABLE agent_messages (
  message_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sender_agent     TEXT NOT NULL,
  recipient_agent  TEXT NOT NULL,
  intent           TEXT NOT NULL CHECK (intent IN (
                     'challenge','prove','accept','reject','escalate',
                     'coverage_request','clarify'
                   )),
  state            TEXT NOT NULL DEFAULT 'open' CHECK (state IN (
                     'open','answered','resolved','escalated','expired'
                   )),
  correlation_id   UUID NOT NULL,       -- groups the handshake
  parent_message_id UUID REFERENCES agent_messages(message_id),
  parent_event_id  UUID,                -- links to agent_events causation
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  round_number     INTEGER NOT NULL DEFAULT 1,  -- escalation counter
  expires_at       TIMESTAMPTZ,         -- auto-escalate if unanswered
  resolved_at      TIMESTAMPTZ,
  resolved_by_event_id UUID
);

CREATE INDEX ON agent_messages (recipient_agent, state, created_at DESC);
CREATE INDEX ON agent_messages (correlation_id);
```

Intent enum values researched from CONTEXT.md + REQUIREMENTS.md (COMMS-01..05). Round counter enables the "N unresolved rounds → escalate" rule (ATLAS-04).

#### 7.4 agent_registry + agent_budgets

```sql
CREATE TABLE agent_registry (
  agent_name       TEXT PRIMARY KEY,
  display_name     TEXT NOT NULL,
  description      TEXT,
  role             TEXT NOT NULL,            -- 'supervisor'|'data'|'classifier'|'orchestrator'|'analyst'|'state_agent'
  parent_agent     TEXT REFERENCES agent_registry(agent_name),
  state_code       TEXT,                      -- NULL for non-state agents; 2-letter for state agents
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (role = 'state_agent' AND state_code IS NOT NULL) OR
    (role <> 'state_agent' AND state_code IS NULL)
  )
);

-- Seed the 5 top-level + 51 state agents
INSERT INTO agent_registry (agent_name, display_name, role, parent_agent) VALUES
  ('hamilton', 'Hamilton', 'analyst', NULL),
  ('knox',     'Knox',     'data', NULL),
  ('darwin',   'Darwin',   'classifier', NULL),
  ('atlas',    'Atlas',    'orchestrator', NULL);
-- 51 state agents seeded by code (loop in fee_crawler/commands/seed_agents.py)

CREATE TABLE agent_budgets (
  agent_name       TEXT NOT NULL REFERENCES agent_registry(agent_name),
  window           TEXT NOT NULL CHECK (window IN ('per_cycle','per_batch','per_report','per_day','per_month')),
  limit_cents      INTEGER NOT NULL,
  spent_cents      INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  halted_at        TIMESTAMPTZ,
  halted_reason    TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agent_name, window)
);
```

**Config source hierarchy** (for SC5):
1. Env var `ATLAS_AGENT_BUDGET_<AGENT>_CENTS` (read by gateway before every tool call).
2. `agent_budgets.limit_cents` row value (updated by operator via admin UI or CLI).
3. `config.yaml` fallback (hardcoded defaults: knox=50000 per_cycle, darwin=10000 per_batch, hamilton=1000 per_report).

**Enforcement logic in gateway (pseudocode):**

```python
async def _check_budget(conn, agent_name):
    env_override = os.environ.get(f'ATLAS_AGENT_BUDGET_{agent_name.upper()}_CENTS')
    if env_override is not None:
        limit = int(env_override)
        # Sum spent from agent_events in current window
        spent = await conn.fetchval(
            "SELECT COALESCE(SUM(cost_cents),0) FROM agent_events "
            "WHERE agent_name=$1 AND created_at >= $2",
            agent_name, _current_window_start(agent_name))
        if spent >= limit:
            await conn.execute(
                """INSERT INTO agent_events (agent_name, action, status, tool_name)
                   VALUES ($1, 'budget_halt', 'budget_halt', '_gateway')""",
                agent_name)
            raise BudgetExceeded(agent_name, spent, limit)
    # Otherwise check agent_budgets row (same logic with different limit source)
```

SC5 (env var halts Knox) flows through the env-var check path.

#### 7.5 institution_dossiers (KNOX-03)

```sql
CREATE TABLE institution_dossiers (
  institution_id               INTEGER PRIMARY KEY REFERENCES crawl_targets(id),
  last_url_tried               TEXT,
  last_document_format         TEXT,          -- 'pdf'|'html'|'js_rendered'|'stealth_pass_1'
  last_strategy                TEXT,          -- verbatim strategy key from state agent
  last_outcome                 TEXT,          -- 'success'|'blocked'|'404'|'no_fees'
  last_cost_cents              INTEGER NOT NULL DEFAULT 0,
  next_try_recommendation      TEXT,          -- 'retry_same'|'stealth_pass_1'|'needs_playwright_stealth'|'skip'
  notes                        JSONB,          -- free-form per-agent observations
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_agent_event_id    UUID,          -- FK-less pointer; FK is cross-partition
  updated_by_agent             TEXT
);

CREATE INDEX ON institution_dossiers (last_outcome, updated_at DESC);
CREATE INDEX ON institution_dossiers (next_try_recommendation) WHERE next_try_recommendation IS NOT NULL;
```

62a ships table empty. 63 populates.

#### 7.6 fees_raw / fees_verified / fees_published

```sql
-- TIER 1: Raw, append-only, from Knox state agents
CREATE TABLE fees_raw (
  fee_raw_id                   BIGSERIAL PRIMARY KEY,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Lineage (DENORMALIZED, required non-null)
  institution_id               INTEGER NOT NULL REFERENCES crawl_targets(id),
  crawl_event_id               INTEGER,                              -- crawl_results.id
  document_r2_key              TEXT,
  source_url                   TEXT,
  extraction_confidence        NUMERIC(5,4),
  agent_event_id               UUID NOT NULL,                        -- points to Knox's extract event
  -- Content
  fee_name                     TEXT NOT NULL,
  amount                       NUMERIC(12,2),
  frequency                    TEXT,
  conditions                   TEXT,
  -- Control
  outlier_flags                JSONB NOT NULL DEFAULT '[]'::jsonb,   -- Darwin can add flags without moving tiers
  source                       TEXT NOT NULL DEFAULT 'knox'          -- 'knox'|'migration_v10'|'manual_import'
);

CREATE INDEX ON fees_raw (institution_id, created_at DESC);
CREATE INDEX ON fees_raw (agent_event_id);
CREATE INDEX ON fees_raw ((outlier_flags->'lineage_missing')) WHERE outlier_flags ? 'lineage_missing';

-- TIER 2: Darwin-verified
CREATE TABLE fees_verified (
  fee_verified_id              BIGSERIAL PRIMARY KEY,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Lineage back to Tier 1
  fee_raw_id                   BIGINT NOT NULL REFERENCES fees_raw(fee_raw_id),
  -- Denormalized from Tier 1 (for one-query traceback)
  institution_id               INTEGER NOT NULL,
  source_url                   TEXT,
  document_r2_key              TEXT,
  extraction_confidence        NUMERIC(5,4),
  -- Tier 2-specific
  canonical_fee_key            TEXT NOT NULL,                        -- Phase 55 foundation MANDATORY here
  variant_type                 TEXT,                                  -- 'standard'|'rush'|...
  outlier_flags                JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified_by_agent_event_id   UUID NOT NULL,
  -- Content (snapshot from Tier 1; immutable)
  fee_name                     TEXT NOT NULL,
  amount                       NUMERIC(12,2),
  frequency                    TEXT,
  review_status                TEXT NOT NULL DEFAULT 'verified' CHECK (review_status IN (
                                 'verified','challenged','rejected','approved'
                               ))
);

CREATE INDEX ON fees_verified (canonical_fee_key, institution_id);
CREATE INDEX ON fees_verified (fee_raw_id);

-- TIER 3: Adversarial-gated, Hamilton-consumable
CREATE TABLE fees_published (
  fee_published_id             BIGSERIAL PRIMARY KEY,
  published_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Lineage chain
  lineage_ref                  BIGINT NOT NULL REFERENCES fees_verified(fee_verified_id),
  -- Denormalized (full traceback in one query)
  institution_id               INTEGER NOT NULL,
  canonical_fee_key            TEXT NOT NULL,
  source_url                   TEXT,
  document_r2_key              TEXT,
  extraction_confidence        NUMERIC(5,4),
  agent_event_id               UUID,                                 -- Knox's original extract event
  verified_by_agent_event_id   UUID,
  published_by_adversarial_event_id UUID NOT NULL,                   -- Darwin+Knox handshake event
  -- Content
  fee_name                     TEXT NOT NULL,
  amount                       NUMERIC(12,2),
  frequency                    TEXT,
  variant_type                 TEXT,
  coverage_tier                TEXT                                  -- 'strong'|'provisional'|'insufficient'
);

CREATE INDEX ON fees_published (canonical_fee_key, institution_id);
CREATE INDEX ON fees_published (institution_id, published_at DESC);
```

**Backfill SQL (D-04):**

```sql
INSERT INTO fees_raw (
  institution_id, crawl_event_id, source_url, document_r2_key,
  extraction_confidence, agent_event_id,
  fee_name, amount, frequency, conditions,
  outlier_flags, source
)
SELECT
  ef.crawl_target_id,
  ef.crawl_result_id,
  cr.document_url,
  cr.document_path,           -- most rows NULL; that's the crisis being backfilled best-effort
  ef.extraction_confidence,
  '00000000-0000-0000-0000-000000000000'::uuid,  -- sentinel "pre-v10" event
  ef.fee_name,
  ef.amount,
  ef.frequency,
  ef.conditions,
  CASE WHEN cr.document_url IS NULL THEN '["lineage_missing"]'::jsonb ELSE '[]'::jsonb END,
  'migration_v10'
FROM extracted_fees ef
LEFT JOIN crawl_results cr ON ef.crawl_result_id = cr.id
WHERE ef.review_status != 'rejected';
```

**Freeze trigger on extracted_fees (after backfill):**

```sql
CREATE OR REPLACE FUNCTION _block_extracted_fees_writes() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.allow_legacy_writes', true) = 'true' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'extracted_fees is frozen; writes go to fees_raw. See phase 62a.';
END;
$$;

CREATE TRIGGER extracted_fees_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON extracted_fees
  FOR EACH ROW EXECUTE FUNCTION _block_extracted_fees_writes();
```

Kill-switch via `SET app.allow_legacy_writes = 'true'` in a transaction if someone needs a one-off fix.

**`canonical_fee_key` integration:** Existing `extracted_fees.canonical_fee_key` (from migration `20260409_canonical_fee_key.sql`) is NOT moved to Tier 2 at backfill time — only new Darwin-verified rows get it. CONTEXT.md D-04 explicitly targets Tier 1 only. Hamilton's eventual Tier 3 cutover (Phase 66) gets canonical_fee_key via Darwin's verification in Phase 64.

**Confidence:** HIGH on the shapes. MEDIUM on the exact cost_cents calculation granularity (per-call vs per-batch — leave to planner).

---

### Domain 8 — pyproject / package deps

**Python (fee_crawler/requirements.txt additions):**

```diff
+ pytest-postgresql>=8.0
+ pytest-asyncio>=0.23
+ pydantic-to-typescript>=2.0
+ mcp>=1.27
- psycopg2-binary>=2.9    # keep during transition; remove after full asyncpg conversion (not 62a scope)
  asyncpg>=0.31           # bump from 0.29 to current
```

**Python removals:** sqlite3 is stdlib — can't remove, but no module should import it. CI grep guard.

**TypeScript (package.json):** No deps added for 62a (codegen is Python-driven). `postgres` client already present. `zod` already present.

**Removed from package.json:** Verified grep: `better-sqlite3` / `sqlite3` are NOT in package.json. Nothing to remove TS-side.

**Confidence:** HIGH.

---

### Domain 9 — Entity inventory verification

CONTEXT.md lists 33 entities. Cross-check against `05-crud-completeness.md` which enumerated 25:

| Entity | In audit (25) | In CONTEXT (33) | New this phase |
|--------|:-:|:-:|:-:|
| fees_raw | — | ✓ | NEW |
| fees_verified | — | ✓ | NEW |
| fees_published | — | ✓ | NEW |
| fee_reviews | ✓ | ✓ | |
| crawl_targets | ✓ | ✓ | |
| crawl_results | ✓ | ✓ | |
| crawl_runs | ✓ | ✓ | |
| institution_dossiers | — | ✓ | NEW |
| jobs | — | ✓ | existing |
| hamilton_watchlists | ✓ | ✓ | |
| hamilton_saved_analyses | ✓ | ✓ | |
| hamilton_scenarios | ✓ | ✓ | |
| hamilton_reports | ✓ | ✓ | |
| hamilton_signals | ✓ | ✓ | |
| hamilton_priority_alerts | ✓ | ✓ | |
| hamilton_conversations | ✓ | ✓ | |
| hamilton_messages | ✓ | ✓ | |
| published_reports | ✓ | ✓ | |
| report_jobs | ✓ | ✓ | |
| saved_peer_sets | ✓ | ✓ | |
| saved_subscriber_peer_groups | — | ✓ | existing |
| articles | ✓ | ✓ | (already full CRUD) |
| classification_cache | — | ✓ | existing |
| external_intelligence | ✓ | ✓ | |
| beige_book_themes | — | ✓ | existing |
| fee_change_events | — | ✓ | existing |
| roomba_log | — | ✓ | existing |
| wave_runs | — | ✓ | existing |
| wave_state_runs | — | ✓ | existing |
| agent_events | — | ✓ | NEW |
| agent_auth_log | — | ✓ | NEW |
| agent_messages | — | ✓ | NEW |
| agent_registry + agent_budgets | — | ✓ | NEW (counted as 1 logical) |

**NEW tables this phase: 8** (fees_raw, fees_verified, fees_published, institution_dossiers, agent_events, agent_auth_log, agent_messages, agent_registry, agent_budgets).

**CRUD tools to generate: ~45 operations across 33 entities** (most entities are create+read+update or create+update+delete; all 33 get coverage).

Each tool = 1 Python async function + 1 auto-generated TS wrapper + Pydantic input/output schemas.

**Confidence:** HIGH.

---

## 3. Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 8.x + pytest-asyncio + pytest-postgresql 8.0 (verified current via pip registry) |
| TS-side | vitest (existing, no new setup) |
| Config files | existing `pyproject.toml` + new `pytest.ini` or `pyproject.toml` `[tool.pytest.ini_options]` |
| Quick run command | `pytest fee_crawler/tests/ -m "not slow" --no-header -q` |
| Full suite command | `pytest fee_crawler/tests/ && npx vitest run` |
| Test DB | GitHub Actions Postgres 15 service container; local dev uses `DATABASE_URL_TEST` env var |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File |
|--------|----------|-----------|-------------------|------|
| AGENT-01 | agent_events columns exist | integration (schema probe) | `pytest fee_crawler/tests/test_agent_events_schema.py` | Wave 0 |
| AGENT-02 | Every tool call writes exactly one agent_events row | integration (fixture: call tool, assert row count delta=1) | `pytest fee_crawler/tests/test_gateway_logs.py` | Wave 1 |
| AGENT-03 | SC1 sub-second at 10M rows | perf (integration) — insert 10K rows in current partition + EXPLAIN + time query | `pytest fee_crawler/tests/test_agent_events_perf.py -m slow` | Wave 0 |
| AGENT-04 | agent_auth_log captures before/after/hash | integration | `pytest fee_crawler/tests/test_audit_log.py` | Wave 1 |
| AGENT-05 | All 33 entities have tools with audit | integration (smoke each tool + auth_log insert) | `pytest fee_crawler/tests/test_tool_coverage.py` | Wave 2-3 |
| TIER-01 | fees_raw schema + denormalization | integration | `pytest fee_crawler/tests/test_fees_raw.py` | Wave 0 |
| TIER-02 | fees_verified canonical_fee_key NOT NULL | integration | `pytest fee_crawler/tests/test_fees_verified.py` | Wave 0 |
| TIER-03 | fees_published lineage_ref chain | integration | `pytest fee_crawler/tests/test_fees_published.py` | Wave 0 |
| TIER-04 | promote_to_tier2 requires Darwin agent_event | integration | `pytest fee_crawler/tests/test_promote_to_tier2.py` | Wave 1 |
| TIER-05 | promote_to_tier3 SQL function signature exists | unit (SQL parse only; handshake is 62b) | `pytest fee_crawler/tests/test_promote_to_tier3_stub.py` | Wave 1 |
| TIER-06 | SQLite zero in production paths | CI grep | `scripts/check_no_sqlite.sh` (new) | Wave 4 |
| SC5 | env-var budget halt | integration | `pytest fee_crawler/tests/test_budget_halt_env.py` | Wave 1 |

### Sampling Rate

- **Per task commit:** `pytest fee_crawler/tests/ -m "not slow" -q` (target < 30s)
- **Per wave merge:** `pytest fee_crawler/tests/ && npx vitest run` (target < 3 min)
- **Phase gate:** Full suite green + `scripts/check_no_sqlite.sh` returns zero lines

### Wave 0 Gaps

- [ ] `fee_crawler/tests/conftest.py` rewrite — async pool fixture + per-schema isolation
- [ ] `fee_crawler/tests/test_agent_events_schema.py` — schema + index probe
- [ ] `fee_crawler/tests/test_fees_raw.py` / `_verified.py` / `_published.py` — schema + lineage chain probes
- [ ] `fee_crawler/tests/test_agent_events_perf.py` — bulk insert + `EXPLAIN (ANALYZE)` partition-pruning assertion
- [ ] `scripts/check_no_sqlite.sh` — `grep -rE "better-sqlite3|sqlite3|DB_PATH" fee_crawler/ src/ --exclude-dir=tests` asserting zero
- [ ] `.github/workflows/test.yml` Postgres service container addition
- [ ] Framework install: `pip install pytest-postgresql pytest-asyncio pydantic-to-typescript mcp` (add to requirements.txt)
- [ ] Migration ordering test: run all migrations against fresh schema, assert no errors (regression guard)

---

## 4. Open Questions (RESOLVED)

These needed a user decision OR a planner-level call during PLAN.md drafting. None blocked research. All seven are resolved below; the resolutions were locked during PLAN.md drafting (per revision Dimension 11 compliance).

1. **Exact `cost_cents` granularity per tool call.** Per-call (one sum of LLM input+output token cost) or per-subcomponent (extraction LLM cost + verification LLM cost separately)? Recommend per-call for 62a; finer granularity is a 62b/66 concern when Hamilton exposes cost analytics.

   RESOLVED: Plan 62A-05 `_calculate_cost_cents` helper captures cost per tool call from Anthropic `usage_metadata`; `cost_cents` is NULL for non-LLM tool calls. Finer subcomponent breakdown deferred to Phase 62b/66 Hamilton cost analytics.

2. **`pg_cron` alternative for local/CI Postgres.** Production Supabase has pg_cron; GitHub Actions postgres:15 container does not. Options: (a) ship the maintenance function + pg_cron schedule in the migration, accept that CI tests call it manually; (b) use GitHub Actions' own `cron:` for a separate Modal function that calls `maintain_agent_events_partitions()` daily (belt-and-suspenders against pg_cron failures). Recommend (a) for 62a simplicity.

   RESOLVED: Option (a). Plan 62A-02 ships the maintenance function + pg_cron schedule in production; CI and local tests invoke `SELECT maintain_agent_events_partitions()` manually via the `db_schema` fixture (Plan 62A-03).

3. **MCP api-key rotation in 62a vs SEC-04 in Phase 68.** Ship MCP with a single Modal-secret-managed master key in 62a; full `mcp_api_keys` table + rotation runbook in Phase 68? Or ship the table now for structural completeness? Recommend: ship the table now (empty), key-check function exists, but rotation UX waits for 68.

   RESOLVED: Deferred to Phase 68 SEC-04. In 62a, Plan 62A-12 uses a single Modal-secret-managed service-role key for the MCP server; the `mcp_api_keys` table + rotation runbook is explicitly out of scope. Reference: Plan 62A-12 threat_model entry for the service-role reuse decision.

4. **Existing `agent_runs` + `agent_run_results` tables (from audit).** These predate v10.0 (wave orchestrator) and overlap conceptually with `agent_events`. Do we migrate data? Deprecate in place? Recommend: leave them alone; Phase 65 (Atlas) decides whether to subsume into agent_events.

   RESOLVED: Deferred to Phase 65 (Atlas). CONTEXT.md §Deferred Ideas explicitly flags legacy `agent_runs` / `agent_run_results` as out of scope for 62a; Atlas decides the migration/subsume path.

5. **Dual sync/async surface in `db.py`.** Fully rewriting 46 import sites to async is aggressive. Compromise: new `AgentDB` async class + existing sync `Database` becomes psycopg2-only (no SQLite). 46 sites unchanged; tool layer uses async. Confirm this "dual surface during transition" is acceptable or user wants a full async rewrite this phase.

   RESOLVED: Plan 62A-11 accepts the dual-surface proposal. Sync psycopg2 `Database` is retained for legacy CLI call sites; new `AgentDB` async class (built on asyncpg pool) backs the tool layer. Full async rewrite of all 46 sites deferred out of 62a.

6. **Enforce `fees_raw.document_url` NOT NULL at write time?** KNOX-09 says "pre-insert assertion blocks lineage-less fees" — but that's Phase 63. In 62a, `fees_raw` allows NULL document_url (for the one-shot backfill of 80.4% lineage-missing rows). Phase 63 adds the NOT NULL constraint via ALTER TABLE after Knox's first clean crawl cycle. Document this migration path.

   RESOLVED: Plan 62A-06 makes `fees_raw.document_url` NULLABLE to enable the one-shot backfill of lineage-missing rows. Phase 63 Knox adds KNOX-09 (pre-insert assertion + ALTER TABLE ... SET NOT NULL) after the first clean crawl cycle. Migration path documented in Plan 62A-06 threat_model.

7. **`agent_messages` intent enum finalization.** Research suggests `challenge|prove|accept|reject|escalate|coverage_request|clarify`. COMMS-01..05 confirms the first five; `coverage_request` is HAM-05 demand reflection; `clarify` is a discretion add. Accept or trim?

   RESOLVED: Plan 62A-04 keeps all seven enum values — `challenge`, `prove`, `accept`, `reject`, `escalate`, `coverage_request`, `clarify`. COMMS-01..05 cover the first five; `coverage_request` ships for HAM-05 demand reflection; `clarify` remains as planner's-discretion add for inter-agent ambiguity resolution. Pruning is a Phase 62b concern once the protocol is wired.

---

## 5. Recommended Plan Breakdown

**Suggested structure — 5 waves, ~13 plans. NOT authoritative; planner adapts.**

### Wave 0 — Foundation (DB + test harness)
Parallel-safe. Land these before any tool work.

- **PLAN 62A-01**: Agent events + auth log partitioned tables + maintenance function + pg_cron schedule (migrations 20260417_*)
- **PLAN 62A-02**: Three-tier fees tables + SQL function stubs (migration 20260418_fees_tier_tables) + backfill SQL (20260420)
- **PLAN 62A-03**: pytest infrastructure rewrite — async conftest, per-schema fixture, GitHub Actions Postgres service container, `scripts/check_no_sqlite.sh`

### Wave 1 — Gateway + core abstractions (sequential after Wave 0)

- **PLAN 62A-04**: agent_registry + agent_budgets migration (20260419_*) + gateway module (`fee_crawler/agent_tools/gateway.py`) + `_check_budget` + `_account_budget` + asyncpg pool (`pool.py`)
- **PLAN 62A-05**: agent_messages + institution_dossiers migrations + Pydantic schema module (`fee_crawler/agent_tools/schemas.py`) + codegen pipeline config (pydantic2ts + npm script + CI step)

### Wave 2 — CRUD tools batch A (parallel, ~15 entities)

- **PLAN 62A-06**: Fee/crawler entity tools — fees_raw, fees_verified (insert-only stub, Darwin fleshes in 64), fees_published (insert-only stub), extracted_fees legacy tools, fee_reviews, crawl_targets, crawl_runs, crawl_results
- **PLAN 62A-07**: Knox state-agent entity tools — institution_dossiers upsert, jobs insert/update, classification_cache, fee_change_events, roomba_log, wave_runs, wave_state_runs

### Wave 3 — CRUD tools batch B (parallel with Wave 2 once Wave 1 lands)

- **PLAN 62A-08**: Hamilton user-state tools — hamilton_watchlists, hamilton_saved_analyses, hamilton_scenarios, hamilton_reports (6 CRUD ops each on average)
- **PLAN 62A-09**: Hamilton derived + research tools — hamilton_signals, hamilton_priority_alerts, hamilton_conversations, hamilton_messages, published_reports, report_jobs, articles, saved_peer_sets, saved_subscriber_peer_groups, external_intelligence, beige_book_themes

### Wave 4 — Infrastructure rewrites (sequential)

- **PLAN 62A-10**: Rewrite `fee_crawler/db.py` Postgres-only (psycopg2 for sync, asyncpg for tool layer) + rewrite `modal_preflight.py` as Postgres+R2+agent_events readiness check
- **PLAN 62A-11**: Grep-and-rewrite every remaining SQLite call site (test_transition_fee_status.py + in-module comments + CLI scripts) + CI guard integration + Dockerfile update (strip tesseract-ocr isn't needed to change but the SQLite data path is)
- **PLAN 62A-12**: Backfill SQL execution + freeze trigger on extracted_fees + one-shot migration runbook

### Wave 5 — MCP + Integration

- **PLAN 62A-13**: Read-only MCP server (`fee_crawler/mcp_server/`) — tools for tier-3 reads, institution dossiers, Call Reports; Modal deployment endpoint; smoke test from an external MCP client
- **PLAN 62A-14**: End-to-end acceptance tests for SC1..SC5 + phase verification script + docs update (`docs/agent-foundation-data-layer.md`)

**Total: 14 plans. Rough sizing: Wave 0 = 3 days; Wave 1 = 2 days; Waves 2+3 parallel = 5 days; Wave 4 = 3 days; Wave 5 = 2 days. Total ~15 dev-days elapsed; more with review/verification.**

---

## Sources

### Primary (HIGH confidence) — cited
- [Supabase - Disabling Prepared statements](https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL) — asyncpg `statement_cache_size=0` for transaction pooler
- [Supabase/supabase issue #39227](https://github.com/supabase/supabase/issues/39227) — Python asyncpg transaction pooler prepared statement errors
- [Supabase/asyncpg discussion #20775](https://github.com/orgs/supabase/discussions/20775)
- [Supabase Connect to database](https://supabase.com/docs/guides/database/connecting-to-postgres) — port 6543 (transaction) vs 5432 (session)
- [Supabase pg_cron docs](https://supabase.com/docs/guides/database/extensions/pg_cron) — scheduling engine availability
- [Supabase/discussions #37986](https://github.com/orgs/supabase/discussions/37986) — pg_partman "in progress" Oct 2025 status
- [supabase/postgres issue #1586](https://github.com/supabase/postgres/issues/1586) — pg_partman availability
- [pgbouncer/issues/655](https://github.com/pgbouncer/pgbouncer/issues/655) — LISTEN/NOTIFY + transaction pooling incompatibility
- [asyncpg usage docs](https://magicstack.github.io/asyncpg/current/usage.html) — pool lifecycle + type codecs
- [asyncpg.pool source](https://magicstack.github.io/asyncpg/current/_modules/asyncpg/pool.html)
- [pydantic-to-typescript GitHub](https://github.com/phillipdupuis/pydantic-to-typescript) — v2.0.0 + CI action
- [pytest-postgresql GitHub](https://github.com/dbfixtures/pytest-postgresql) — v8.0 per-schema fixture pattern
- [MCP Python SDK GitHub](https://github.com/modelcontextprotocol/python-sdk)
- [mcp PyPI](https://pypi.org/project/mcp/) — v1.27.0 current
- [MCP build-server guide](https://modelcontextprotocol.io/docs/develop/build-server) — FastMCP + Streamable HTTP
- [GitHub Actions Postgres service containers](https://docs.github.com/en/actions/use-cases-and-examples/using-containerized-services/creating-postgresql-service-containers)
- [Postgres Table Partitioning docs](https://www.postgresql.org/docs/current/ddl-partitioning.html) — RANGE partitioning + default partition + partition pruning

### Verified versions (as of 2026-04-16, via pip / npm registries)
- `asyncpg` 0.31.0 (installed 0.31.0) — current
- `pydantic` 2.13.1 (installed 2.10.6) — current
- `pytest-postgresql` 8.0.0 — current
- `mcp` 1.27.0 — current
- `fastmcp` 3.2.4 — current (but official `mcp` SDK has bundled FastMCP; standalone not needed)
- `datamodel-code-generator` 0.56.1 — current (wrong direction for this phase)
- `postgres` (TS) 3.4.9 — current
- `@modelcontextprotocol/sdk` (TS) 1.29.0 — current
- `json-schema-to-typescript` 15.0.4 — current (alternative codegen, not selected)
- `pydantic-to-typescript` v2.0.0 — current [CITED: GitHub README]

### Tertiary (MEDIUM; cross-verified)
- [Elephas - Audit logging with Postgres partitioning](https://elephas.io/audit-logging-with-postgres-partitioning/) — corroborates audit + partition retention patterns
- [OneUptime - Audit trails with triggers](https://oneuptime.com/blog/post/2026-01-25-postgresql-audit-trails-triggers/view) — Jan 2026; supports AFTER-vs-BEFORE trigger tradeoffs (we rejected triggers regardless)
- [Cybertec - Automatic partition creation](https://www.cybertec-postgresql.com/en/automatic-partition-creation-in-postgresql/) — cron-function pattern reference

---

## Metadata

**Confidence breakdown:**
- Library picks & versions: HIGH — all verified against live registries
- asyncpg+Supabase pooler config: HIGH — multiple Supabase-authored sources
- Partition pattern: HIGH — standard Postgres; `pg_cron` verified
- pg_partman availability: MEDIUM — still-in-progress signals; correctly deferred
- Gateway vs trigger choice: HIGH — design rationale stands regardless of tooling
- Schema column types: HIGH for shapes; MEDIUM on cost_cents granularity (open question)
- Plan breakdown: MEDIUM — planner's call; this is a starting point

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (30 days; Supabase pg_partman landing is the primary change risk)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Supabase still lacks pg_partman as of phase start | Domain 1 | Minor — cron function works either way; if pg_partman lands we could switch |
| A2 | `pg_cron` is preconfigured on this Supabase project | Domain 1, 7 | Low — confirmed available on Supabase platform; need to verify enabled on THIS project |
| A3 | Supabase free/pro tier permits `gen_random_uuid()` (pgcrypto) | Domain 7 | Very low — pgcrypto is default |
| A4 | 64KB JSONB cap is sized correctly (per-row payload) | Domain 7 / D-12 | Low — configurable at runtime |
| A5 | Modal + asyncpg pool works without IPv6 workarounds for this phase's tools | Domain 2 | Low — transaction pooler IPv4 path is used by existing psycopg2 code |
| A6 | `pydantic-to-typescript` v2 handles our Pydantic 2.10.x models cleanly | Domain 3 | Very low — officially supports Pydantic 2 |

**If this phase hits any of these, revisit in planning.**

---

## RESEARCH COMPLETE
