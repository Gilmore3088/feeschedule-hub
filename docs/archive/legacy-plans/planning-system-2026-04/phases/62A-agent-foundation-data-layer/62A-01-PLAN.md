---
phase: 62A
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - docker-compose.yml
  - fee_crawler/requirements.txt
  - fee_crawler/tests/conftest.py
  - fee_crawler/tests/test_agent_events_schema.py
  - fee_crawler/tests/test_tier_schemas.py
  - fee_crawler/tests/test_agent_gateway.py
  - fee_crawler/tests/test_agent_auth_log.py
  - fee_crawler/tests/test_tier_promotion.py
  - fee_crawler/tests/test_agent_tool_coverage.py
  - fee_crawler/tests/test_agent_events_performance.py
  - fee_crawler/tests/test_sc1_recent_agent_events.py
  - fee_crawler/tests/test_sc2_auth_log_coverage.py
  - fee_crawler/tests/test_sc3_tier_schema_contract.py
  - fee_crawler/tests/test_sc4_no_sqlite.py
  - fee_crawler/tests/test_sc5_budget_halt.py
  - scripts/ci-guards.sh
  - .github/workflows/test.yml
autonomous: true
requirements: []
must_haves:
  truths:
    - "Developer can run `docker compose up -d postgres` and get a local Postgres at port 5433"
    - "Developer can run `pytest fee_crawler/tests/test_agent_events_schema.py -q` and see the test fail with 'MISSING — implementation pending' (skeleton tests exist)"
    - "CI guard script `scripts/ci-guards.sh sqlite-kill` exists and can be invoked"
    - "`pytest-postgresql`, `pytest-asyncio`, `asyncpg>=0.31`, `pydantic-to-typescript>=2.0`, `mcp>=1.27` are listed in fee_crawler/requirements.txt"
  artifacts:
    - path: "docker-compose.yml"
      provides: "Local Postgres 15 service on port 5433 for test isolation"
      contains: "postgres:15"
    - path: "fee_crawler/tests/conftest.py"
      provides: "Per-test Postgres schema fixture replacing all SQLite test fixtures"
      contains: "CREATE SCHEMA"
    - path: "scripts/ci-guards.sh"
      provides: "sqlite-kill CI guard returning 0 on zero matches, 1 on any match"
      contains: "sqlite-kill"
    - path: "fee_crawler/tests/test_sc1_recent_agent_events.py"
      provides: "SC1 acceptance test stub (skipped until implementation lands)"
      contains: "sub-second"
  key_links:
    - from: "fee_crawler/tests/conftest.py"
      to: "supabase/migrations/"
      via: "fixture reads and applies migration files sorted alphabetically"
      pattern: "migrations_dir.*glob"
    - from: ".github/workflows/test.yml"
      to: "postgres:15 service container"
      via: "GitHub Actions service container on port 5432"
      pattern: "postgres:15"
---

<objective>
Land the test + CI infrastructure that every other Wave 0+ plan depends on: local docker-compose Postgres, per-test schema pytest fixture, Wave 0 test stubs for every REQ-ID (per 62A-VALIDATION.md), dependency additions, and the `sqlite-kill` CI guard skeleton.

Purpose: Without this, no downstream plan can write tests against a real Postgres schema — the SQLite-era `conftest.py` is what the v10.0 data layer is replacing. We must have the fixture + CI harness ready before schema migrations or gateway code land.

Output: A working `pytest fee_crawler/tests/` run against Postgres (all new tests skipped/xfailed pending implementation), docker-compose.yml, CI-guard script, and a GitHub Actions workflow step that spins up postgres:15 and runs the suite.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md
@.planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md
@.planning/phases/62A-agent-foundation-data-layer/62A-VALIDATION.md
@fee_crawler/requirements.txt
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Developer machine → local Postgres | Unprivileged local DB; test schemas isolated per-test |
| CI runner → service-container Postgres | Ephemeral, never holds real data |
| Test fixture → migrations directory | File reads only, no network |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-62A01-01 | Information Disclosure | conftest.py `DATABASE_URL_TEST` env var | mitigate | Fixture refuses to run if DSN contains `supabase.co` or `pooler.` — assert in the session-scoped fixture body; test: `test_conftest_refuses_production_dsn` |
| T-62A01-02 | Tampering | CI guard script mis-configured to return 0 when matches exist | mitigate | Script exits non-zero if grep returns ANY line; unit test calls script in fixture-dir with a seeded `sqlite3` import and asserts exit=1 |
| T-62A01-03 | Denial of Service | pytest-postgresql consuming all CI runner resources | accept | Schema-level isolation is lightweight; CI timeout of 240s caps impact |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Add docker-compose.yml for local Postgres + pytest deps to requirements.txt</name>
  <files>docker-compose.yml, fee_crawler/requirements.txt</files>
  <read_first>
    - fee_crawler/requirements.txt (existing)
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §2 (asyncpg pool config), §6 (pytest-postgresql v8), §8 (dep additions)
  </read_first>
  <action>
Create `docker-compose.yml` at repo root with exactly this content:

```yaml
# Local Postgres for pytest + agent_tools development.
# Port 5433 to avoid conflicts with any host-level Postgres.
# Set DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/bfi_test for pytest.
services:
  postgres:
    image: postgres:15
    container_name: bfi-postgres-local
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: bfi_test
    ports:
      - "5433:5432"
    volumes:
      - bfi_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d bfi_test"]
      interval: 10s
      timeout: 5s
      retries: 5
volumes:
  bfi_postgres_data:
```

Update `fee_crawler/requirements.txt`: add these lines (preserve existing content, append):

```
# Phase 62a — agent data layer
asyncpg>=0.31
pytest-postgresql>=8.0
pytest-asyncio>=0.23
pydantic-to-typescript>=2.0
mcp>=1.27
```

Do NOT remove `psycopg2-binary` or `sqlite3` (sqlite3 is stdlib, cannot be removed; psycopg2 stays during transition per D-13).
  </action>
  <verify>
    <automated>docker compose config --quiet && grep -q "asyncpg>=0.31" fee_crawler/requirements.txt && grep -q "pytest-postgresql>=8.0" fee_crawler/requirements.txt && grep -q "mcp>=1.27" fee_crawler/requirements.txt</automated>
  </verify>
  <acceptance_criteria>
    - `docker-compose.yml` exists and `docker compose config --quiet` exits 0
    - `grep -c "asyncpg>=0.31\|pytest-postgresql>=8.0\|pytest-asyncio>=0.23\|pydantic-to-typescript>=2.0\|mcp>=1.27" fee_crawler/requirements.txt` returns 5
    - `grep -c "postgres:15" docker-compose.yml` returns 1
    - `grep -c "5433:5432" docker-compose.yml` returns 1
  </acceptance_criteria>
  <done>docker-compose.yml boots Postgres 15 on localhost:5433 with credentials postgres/postgres and DB bfi_test; requirements.txt lists all Phase 62a Python deps.</done>
</task>

<task type="auto">
  <name>Task 2: Write per-test Postgres schema fixture in fee_crawler/tests/conftest.py</name>
  <files>fee_crawler/tests/conftest.py</files>
  <read_first>
    - fee_crawler/tests/conftest.py (existing — will be rewritten, preserve any shared helpers)
    - fee_crawler/tests/e2e/conftest.py (uses sqlite3 — audit pattern)
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §6 (per-test schema fixture pattern)
    - .planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md §D-14 (per-test schema decision)
  </read_first>
  <action>
REWRITE `fee_crawler/tests/conftest.py` entirely. Preserve any fixtures from the old file that are still useful (mock config, etc.) but REMOVE every sqlite3/SQLite path. Required content:

```python
"""pytest fixtures for fee_crawler test suite.

Phase 62a: SQLite fixtures removed. Every test runs against a throwaway
Postgres schema, applied migrations, dropped on teardown.

Set DATABASE_URL_TEST to a Postgres DSN (e.g., postgres://postgres:postgres@localhost:5433/bfi_test).
"""

from __future__ import annotations

import os
import secrets
from pathlib import Path
from typing import AsyncGenerator

import asyncpg
import pytest
import pytest_asyncio


REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = REPO_ROOT / "supabase" / "migrations"


def _test_dsn() -> str:
    dsn = os.environ.get("DATABASE_URL_TEST")
    if not dsn:
        pytest.skip(
            "DATABASE_URL_TEST not set; "
            "start docker compose up -d postgres and set "
            "DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/bfi_test"
        )
    # Refuse production/pooler DSNs — test writes would be destructive.
    if "supabase.co" in dsn or "pooler." in dsn:
        pytest.fail(
            f"DATABASE_URL_TEST refuses pooler/supabase host: {dsn!r}. "
            "Use a disposable local/CI Postgres only."
        )
    return dsn


@pytest_asyncio.fixture
async def db_schema() -> AsyncGenerator[tuple[str, asyncpg.Pool], None]:
    """Per-test Postgres schema + applied migrations + async pool bound to it.

    Yields (schema_name, pool). Drops the schema on teardown.
    """
    dsn = _test_dsn()
    schema = f"test_{secrets.token_hex(8)}"

    # Bootstrap: create schema + run migrations via a dedicated connection.
    boot = await asyncpg.connect(dsn, statement_cache_size=0)
    try:
        await boot.execute(f'CREATE SCHEMA "{schema}"')
        await boot.execute(f'SET search_path TO "{schema}", public')
        # Apply every migration in order.
        for migration in sorted(MIGRATIONS_DIR.glob("*.sql")):
            sql = migration.read_text()
            if not sql.strip():
                continue
            await boot.execute(sql)
    finally:
        await boot.close()

    # Create a pool for the test, pinned to the schema.
    pool = await asyncpg.create_pool(
        dsn,
        min_size=1,
        max_size=3,
        statement_cache_size=0,
        server_settings={"search_path": f"{schema}, public"},
    )

    try:
        yield schema, pool
    finally:
        await pool.close()
        cleanup = await asyncpg.connect(dsn, statement_cache_size=0)
        try:
            await cleanup.execute(f'DROP SCHEMA "{schema}" CASCADE')
        finally:
            await cleanup.close()


@pytest.fixture
def migrations_dir() -> Path:
    """Path to supabase/migrations/ for tests that inspect migration files."""
    return MIGRATIONS_DIR
```

If the current `conftest.py` contains unrelated sync fixtures for legacy SQLite tests (e.g., a `MockConfig` class mentioned in MEMORY.md), DELETE them — callers will be moved to Postgres in Wave 4. Leave a comment:

```python
# NOTE: Legacy SQLite fixtures removed in Phase 62a per D-13. Callers that
# still need sync DB access should use psycopg2 directly against db_schema's
# dsn; async callers use the pool yielded above.
```

Also update `fee_crawler/tests/e2e/conftest.py`: if it exists and contains `sqlite3`, DELETE the file (e2e suite will be migrated in Wave 4).
  </action>
  <verify>
    <automated>python -c "import ast, pathlib; t=pathlib.Path('fee_crawler/tests/conftest.py').read_text(); ast.parse(t); assert 'sqlite3' not in t and 'CREATE SCHEMA' in t and 'db_schema' in t, 'fixture missing required elements'"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'sqlite3\|sqlite' fee_crawler/tests/conftest.py` returns 0
    - `grep -c 'db_schema\|CREATE SCHEMA\|DROP SCHEMA' fee_crawler/tests/conftest.py` returns 3 or more
    - `grep -c 'statement_cache_size=0' fee_crawler/tests/conftest.py` returns at least 2 (connect + create_pool)
    - `grep -c 'supabase.co\|pooler\.' fee_crawler/tests/conftest.py` returns at least 2 (the refusal check)
    - `python -c "import ast; ast.parse(open('fee_crawler/tests/conftest.py').read())"` exits 0
  </acceptance_criteria>
  <done>conftest.py provides a per-test `db_schema` async fixture that creates a throwaway Postgres schema, applies every migration, and drops the schema on teardown. No sqlite3 imports remain.</done>
</task>

<task type="auto">
  <name>Task 3: Create Wave 0 + SC test stub files (14 pytest files from VALIDATION.md)</name>
  <files>fee_crawler/tests/test_agent_events_schema.py, fee_crawler/tests/test_tier_schemas.py, fee_crawler/tests/test_agent_gateway.py, fee_crawler/tests/test_agent_auth_log.py, fee_crawler/tests/test_tier_promotion.py, fee_crawler/tests/test_agent_tool_coverage.py, fee_crawler/tests/test_agent_events_performance.py, fee_crawler/tests/test_sc1_recent_agent_events.py, fee_crawler/tests/test_sc2_auth_log_coverage.py, fee_crawler/tests/test_sc3_tier_schema_contract.py, fee_crawler/tests/test_sc4_no_sqlite.py, fee_crawler/tests/test_sc5_budget_halt.py</files>
  <read_first>
    - .planning/phases/62A-agent-foundation-data-layer/62A-VALIDATION.md (Per-Task Verification Map + Wave 0 Requirements)
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §3 (Validation Architecture)
  </read_first>
  <action>
Create ALL 12 stub test files. Each file follows this template — stub tests assert on the shape the downstream plan will deliver and use `pytest.xfail("implementation pending in plan 62A-NN")` for anything not yet implementable. This lets CI stay green while keeping the contract visible.

### fee_crawler/tests/test_agent_events_schema.py (AGENT-01, AGENT-03)

```python
"""Schema probes for agent_events — migrations plan 62A-02 delivers."""
import pytest

REQUIRED_COLUMNS = {
    "event_id", "created_at", "agent_name", "action", "tool_name",
    "entity", "entity_id", "status", "cost_cents", "confidence",
    "parent_event_id", "correlation_id", "reasoning_hash",
    "input_payload", "output_payload", "source_refs", "error",
}


@pytest.mark.asyncio
async def test_agent_events_has_required_columns(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'agent_events'"
        )
    present = {r["column_name"] for r in rows}
    missing = REQUIRED_COLUMNS - present
    assert not missing, f"agent_events missing columns: {missing}"


@pytest.mark.asyncio
async def test_agent_events_is_partitioned(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT partstrat FROM pg_partitioned_table pt "
            "JOIN pg_class c ON pt.partrelid = c.oid "
            "WHERE c.relname = 'agent_events'"
        )
    assert row is not None, "agent_events must be partitioned"
    assert row["partstrat"] == "r", "expected RANGE partitioning"


@pytest.mark.asyncio
async def test_agent_events_has_required_indexes(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT indexdef FROM pg_indexes WHERE tablename = 'agent_events'"
        )
    indexdefs = " ".join(r["indexdef"] for r in rows)
    assert "agent_name" in indexdefs and "created_at" in indexdefs
    assert "correlation_id" in indexdefs
    assert "parent_event_id" in indexdefs
```

### fee_crawler/tests/test_tier_schemas.py (TIER-01, TIER-02, TIER-03)

```python
"""Schema probes for fees_raw / fees_verified / fees_published — plan 62A-03."""
import pytest

TIER1_REQUIRED = {
    "fee_raw_id", "institution_id", "crawl_event_id", "document_r2_key",
    "source_url", "extraction_confidence", "agent_event_id",
    "fee_name", "amount", "frequency", "outlier_flags", "source",
}
TIER2_REQUIRED = {
    "fee_verified_id", "fee_raw_id", "canonical_fee_key", "variant_type",
    "outlier_flags", "verified_by_agent_event_id",
    "institution_id", "source_url", "document_r2_key",
}
TIER3_REQUIRED = {
    "fee_published_id", "lineage_ref", "institution_id",
    "canonical_fee_key", "published_by_adversarial_event_id",
    "source_url", "document_r2_key", "agent_event_id",
    "verified_by_agent_event_id",
}


async def _cols(pool, table):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = $1", table)
    return {r["column_name"] for r in rows}


@pytest.mark.asyncio
async def test_tier1(db_schema):
    cols = await _cols(db_schema[1], "fees_raw")
    assert TIER1_REQUIRED - cols == set(), f"fees_raw missing: {TIER1_REQUIRED - cols}"


@pytest.mark.asyncio
async def test_tier2(db_schema):
    cols = await _cols(db_schema[1], "fees_verified")
    assert TIER2_REQUIRED - cols == set(), f"fees_verified missing: {TIER2_REQUIRED - cols}"


@pytest.mark.asyncio
async def test_tier3(db_schema):
    cols = await _cols(db_schema[1], "fees_published")
    assert TIER3_REQUIRED - cols == set(), f"fees_published missing: {TIER3_REQUIRED - cols}"
```

### fee_crawler/tests/test_agent_gateway.py (AGENT-02)

```python
"""Gateway contract: every tool call writes exactly one agent_events row before target write."""
import pytest


@pytest.mark.asyncio
async def test_tool_writes_event_before_target(db_schema):
    pytest.xfail("gateway.with_agent_tool — delivered by plan 62A-05")
```

### fee_crawler/tests/test_agent_auth_log.py (AGENT-04)

```python
"""agent_auth_log row per tool call with before/after/reasoning_hash."""
import pytest


@pytest.mark.asyncio
async def test_auth_log_captures_before_and_after(db_schema):
    pytest.xfail("gateway writes auth_log — delivered by plan 62A-05")


@pytest.mark.asyncio
async def test_auth_log_has_required_columns(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'agent_auth_log'")
    present = {r["column_name"] for r in rows}
    required = {
        "auth_id", "created_at", "agent_event_id", "agent_name",
        "actor_type", "actor_id", "tool_name", "entity", "entity_id",
        "before_value", "after_value", "reasoning_hash", "parent_event_id",
    }
    assert required - present == set(), f"agent_auth_log missing: {required - present}"
```

### fee_crawler/tests/test_tier_promotion.py (TIER-04, TIER-05)

```python
"""Promotion SQL functions — plan 62A-06."""
import pytest


@pytest.mark.asyncio
async def test_promote_to_tier2_function_exists(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT proname FROM pg_proc WHERE proname = 'promote_to_tier2'")
    assert row is not None, "promote_to_tier2 SQL function must exist"


@pytest.mark.asyncio
async def test_promote_to_tier3_function_exists(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT proname FROM pg_proc WHERE proname = 'promote_to_tier3'")
    assert row is not None, "promote_to_tier3 SQL function stub must exist"


@pytest.mark.asyncio
async def test_darwin_only(db_schema):
    pytest.xfail("promotion identity check — delivered by plan 62A-06")


@pytest.mark.asyncio
async def test_adversarial_gate_exists(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT to_regclass('agent_messages') AS t")
    assert row["t"] is not None, "agent_messages table must exist (empty in 62a)"
```

### fee_crawler/tests/test_agent_tool_coverage.py (AGENT-05)

```python
"""All 33 entities have a registered tool — plan 62A-09..12."""
import pytest

ENTITIES_33 = [
    "fees_raw", "fees_verified", "fees_published", "fee_reviews",
    "crawl_targets", "crawl_results", "crawl_runs", "institution_dossiers",
    "jobs", "hamilton_watchlists", "hamilton_saved_analyses",
    "hamilton_scenarios", "hamilton_reports", "hamilton_signals",
    "hamilton_priority_alerts", "hamilton_conversations",
    "hamilton_messages", "published_reports", "report_jobs",
    "saved_peer_sets", "saved_subscriber_peer_groups", "articles",
    "classification_cache", "external_intelligence", "beige_book_themes",
    "fee_change_events", "roomba_log", "wave_runs", "wave_state_runs",
    "agent_events", "agent_auth_log", "agent_messages", "agent_registry",
]


def test_every_entity_has_tool():
    pytest.xfail("tool registry — delivered by plans 62A-09, 10, 11, 12")
```

### fee_crawler/tests/test_agent_events_performance.py (AGENT-03)

```python
"""SC1 sub-second query at 10K-row volume (scaled down for CI)."""
import pytest
import time


@pytest.mark.asyncio
@pytest.mark.slow
async def test_recent_hour_query_sub_second(db_schema):
    pytest.xfail("perf test — plan 62A-02 delivers partition + index, plan 62A-13 seeds data")
```

### fee_crawler/tests/test_sc1_recent_agent_events.py (SC1)

```python
"""SC1: SELECT COUNT(*) FROM agent_events WHERE agent_name='knox' AND recent — sub-second."""
import pytest


@pytest.mark.asyncio
async def test_sc1_recent_query_uses_partition_pruning(db_schema):
    pytest.xfail("SC1 end-to-end — plan 62A-13 delivers acceptance")
```

### fee_crawler/tests/test_sc2_auth_log_coverage.py (SC2)

```python
"""SC2: agent_auth_log row per tool call across all 33 entities."""
import pytest


def test_sc2_all_33_entities_audited():
    pytest.xfail("SC2 end-to-end — plan 62A-13")
```

### fee_crawler/tests/test_sc3_tier_schema_contract.py (SC3)

```python
"""SC3: fees_raw + fees_verified + fees_published all resolve with lineage columns."""
import pytest


@pytest.mark.asyncio
async def test_sc3_three_tiers_resolve(db_schema):
    _, pool = db_schema
    async with pool.acquire() as conn:
        for tbl in ("fees_raw", "fees_verified", "fees_published"):
            r = await conn.fetchrow("SELECT to_regclass($1) AS t", tbl)
            assert r["t"] is not None, f"{tbl} must exist"
```

### fee_crawler/tests/test_sc4_no_sqlite.py (SC4 / TIER-06)

```python
"""SC4: grep production paths returns zero sqlite hits."""
import subprocess


def test_sc4_grep_returns_zero():
    result = subprocess.run(
        ["bash", "scripts/ci-guards.sh", "sqlite-kill"],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, (
        f"sqlite-kill guard failed:\nSTDOUT:{result.stdout}\nSTDERR:{result.stderr}"
    )
```

### fee_crawler/tests/test_sc5_budget_halt.py (SC5)

```python
"""SC5: ATLAS_AGENT_BUDGET_KNOX_CENTS=1000 halts Knox with budget_halt event."""
import pytest


@pytest.mark.asyncio
async def test_sc5_env_var_halts_knox(db_schema, monkeypatch):
    pytest.xfail("SC5 end-to-end — plan 62A-13")
```

Every file MUST be valid Python (`python -c "import ast; ast.parse(open(f).read())"` exits 0). Every file uses `@pytest.mark.asyncio` where applicable and the `db_schema` fixture for DB-backed tests.
  </action>
  <verify>
    <automated>for f in fee_crawler/tests/test_agent_events_schema.py fee_crawler/tests/test_tier_schemas.py fee_crawler/tests/test_agent_gateway.py fee_crawler/tests/test_agent_auth_log.py fee_crawler/tests/test_tier_promotion.py fee_crawler/tests/test_agent_tool_coverage.py fee_crawler/tests/test_agent_events_performance.py fee_crawler/tests/test_sc1_recent_agent_events.py fee_crawler/tests/test_sc2_auth_log_coverage.py fee_crawler/tests/test_sc3_tier_schema_contract.py fee_crawler/tests/test_sc4_no_sqlite.py fee_crawler/tests/test_sc5_budget_halt.py; do python -c "import ast; ast.parse(open('$f').read())" || { echo "SYNTAX FAIL: $f"; exit 1; }; done</automated>
  </verify>
  <acceptance_criteria>
    - All 12 files exist under fee_crawler/tests/
    - Every file parses as valid Python (ast.parse succeeds)
    - `grep -l "db_schema" fee_crawler/tests/test_agent_events_schema.py fee_crawler/tests/test_tier_schemas.py fee_crawler/tests/test_agent_auth_log.py fee_crawler/tests/test_tier_promotion.py fee_crawler/tests/test_sc3_tier_schema_contract.py` returns all 5 files
    - `grep -c "xfail\|x_fail" fee_crawler/tests/test_agent_gateway.py fee_crawler/tests/test_agent_auth_log.py fee_crawler/tests/test_tier_promotion.py fee_crawler/tests/test_sc1_recent_agent_events.py fee_crawler/tests/test_sc2_auth_log_coverage.py fee_crawler/tests/test_sc5_budget_halt.py fee_crawler/tests/test_agent_tool_coverage.py fee_crawler/tests/test_agent_events_performance.py` returns 8 (one xfail per stubbed-implementation file)
  </acceptance_criteria>
  <done>All 12 test stub files exist with valid Python syntax; DB-backed tests use db_schema fixture; stubs for pending implementations use pytest.xfail.</done>
</task>

<task type="auto">
  <name>Task 4: Create scripts/ci-guards.sh with sqlite-kill subcommand + update .github/workflows/test.yml</name>
  <files>scripts/ci-guards.sh, .github/workflows/test.yml</files>
  <read_first>
    - scripts/ (existing — confirm no ci-guards.sh yet)
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §3 (CI integration) and §6 (GitHub Actions Postgres service container)
    - .planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md §D-15 (CI grep guard)
  </read_first>
  <action>
Create `scripts/ci-guards.sh`:

```bash
#!/usr/bin/env bash
# Phase 62a CI guards.
# Usage: scripts/ci-guards.sh <subcommand>
# Subcommands:
#   sqlite-kill   Fail if any sqlite3|better-sqlite3|DB_PATH reference remains in production paths.

set -euo pipefail

SUBCOMMAND="${1:-}"

sqlite_kill() {
  # Production paths only — tests are exempt during transition (removed in Wave 4 plans).
  local include_dirs=("fee_crawler" "src")
  local exclude_dirs=(
    ":(exclude)fee_crawler/tests"
    ":(exclude)fee_crawler/**/__pycache__"
    ":(exclude)src/app/api/_archive"
  )

  # Use git grep if in a repo (faster + respects .gitignore), else plain grep.
  local hits=""
  if git rev-parse --git-dir >/dev/null 2>&1; then
    hits=$(git grep -nE 'better-sqlite3|sqlite3|DB_PATH' -- \
      "${include_dirs[@]}" "${exclude_dirs[@]}" \
      | grep -v '^Binary file' || true)
  else
    hits=$(grep -rnE 'better-sqlite3|sqlite3|DB_PATH' \
      --include='*.py' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
      --exclude-dir=__pycache__ --exclude-dir=node_modules --exclude-dir=tests \
      "${include_dirs[@]}" 2>/dev/null || true)
  fi

  if [[ -n "$hits" ]]; then
    echo "sqlite-kill: production SQLite references remain:" >&2
    echo "$hits" >&2
    exit 1
  fi

  echo "sqlite-kill: OK (zero production matches)"
  exit 0
}

case "$SUBCOMMAND" in
  sqlite-kill) sqlite_kill ;;
  "")
    echo "Usage: $0 <sqlite-kill>" >&2
    exit 2
    ;;
  *)
    echo "Unknown subcommand: $SUBCOMMAND" >&2
    echo "Usage: $0 <sqlite-kill>" >&2
    exit 2
    ;;
esac
```

Make it executable: `chmod +x scripts/ci-guards.sh`.

Now create/update `.github/workflows/test.yml` (check if it exists first — if it does, ADD the new `pg-tests` job; do NOT overwrite existing jobs):

```yaml
# Phase 62a CI: Postgres service container + pytest run against real schema.
name: tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  pg-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: bfi_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL_TEST: postgres://postgres:postgres@localhost:5432/bfi_test
    steps:
      - uses: actions/checkout@v4
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Install dependencies
        run: pip install -r fee_crawler/requirements.txt
      - name: Run sqlite-kill guard
        run: bash scripts/ci-guards.sh sqlite-kill
        continue-on-error: true  # Wave 4 removes continue-on-error after SQLite elimination
      - name: Run pytest
        run: pytest fee_crawler/tests/ -v --no-header
```

`continue-on-error: true` on the guard step is INTENTIONAL for Wave 0 — SQLite is still in the codebase until Wave 4. Plan 62A-11 removes this flag.
  </action>
  <verify>
    <automated>test -x scripts/ci-guards.sh && bash -n scripts/ci-guards.sh && test -f .github/workflows/test.yml && grep -q "postgres:15" .github/workflows/test.yml && grep -q "sqlite-kill" .github/workflows/test.yml</automated>
  </verify>
  <acceptance_criteria>
    - `scripts/ci-guards.sh` exists and is executable (`test -x scripts/ci-guards.sh` exits 0)
    - `bash -n scripts/ci-guards.sh` exits 0 (syntax valid)
    - `grep -c 'sqlite-kill' scripts/ci-guards.sh` returns at least 2 (function definition + case arm)
    - `grep -c 'better-sqlite3\|sqlite3\|DB_PATH' scripts/ci-guards.sh` returns at least 1 (the grep pattern)
    - `.github/workflows/test.yml` contains `postgres:15`, `DATABASE_URL_TEST`, `sqlite-kill`, and `pytest fee_crawler/tests/`
    - Running `bash scripts/ci-guards.sh sqlite-kill` currently exits 1 (SQLite still in codebase — this is expected; Wave 4 fixes)
  </acceptance_criteria>
  <done>CI guard script + GitHub Actions workflow exist; sqlite-kill guard is runnable but `continue-on-error: true` lets CI pass until Wave 4 removes the last SQLite references.</done>
</task>

</tasks>

<verification>
Manual: Run `docker compose up -d postgres` and confirm Postgres 15 starts on port 5433. Then `export DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/bfi_test && pytest fee_crawler/tests/ -v --no-header`. Expect: conftest fixture skips gracefully if DATABASE_URL_TEST not set; with it set, tests against db_schema fail because migrations don't exist yet (that's Plan 62A-02); xfail tests show as XFAIL.

Automated: Every acceptance criterion above is grep/file-check verifiable; running the test suite against the bootstrapped Postgres should execute `test_agent_events_schema.py` and fail with a clear "relation agent_events does not exist" error since migrations haven't landed — expected, unblocks Plan 62A-02.
</verification>

<success_criteria>
- docker-compose.yml boots local Postgres 15 cleanly
- conftest.py provides per-test schema fixture with zero sqlite3 references
- 12 test stub files exist with valid Python syntax
- ci-guards.sh provides sqlite-kill subcommand (reports remaining SQLite for now)
- GitHub Actions workflow spins up postgres:15 service container and runs pytest
- fee_crawler/requirements.txt lists asyncpg>=0.31, pytest-postgresql>=8.0, pytest-asyncio>=0.23, pydantic-to-typescript>=2.0, mcp>=1.27
</success_criteria>

<output>
After completion, create `.planning/phases/62A-agent-foundation-data-layer/62A-01-SUMMARY.md` noting:
- docker-compose.yml bootstrapped
- conftest.py per-schema fixture landed
- 12 test stubs created (mapping each to its REQ-ID)
- CI guard + workflow file in place
- Known blocker: all schema tests will fail until Plan 62A-02 lands migrations (expected)
</output>
