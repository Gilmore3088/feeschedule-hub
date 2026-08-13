---
phase: 62A
plan: 11
type: execute
wave: 4
depends_on:
  - 62A-05
  - 62A-10
files_modified:
  - fee_crawler/SQLITE_AUDIT.md
  - fee_crawler/db.py
  - fee_crawler/modal_preflight.py
  - fee_crawler/config.py
  - fee_crawler/commands/crawl.py
  - fee_crawler/commands/discover_urls.py
  - fee_crawler/tests/test_transition_fee_status.py
  - fee_crawler/tests/e2e/conftest.py
  - fee_crawler/requirements.txt
  - scripts/ci-guards.sh
  - .github/workflows/test.yml
autonomous: true
requirements:
  - TIER-06
must_haves:
  truths:
    - "`git grep -nE 'better-sqlite3|sqlite3|DB_PATH' -- fee_crawler/ src/ ':(exclude)fee_crawler/SQLITE_AUDIT.md'` returns ZERO lines"
    - "`bash scripts/ci-guards.sh sqlite-kill` exits 0"
    - ".github/workflows/test.yml no longer carries `continue-on-error: true` on the sqlite-kill step"
    - "`fee_crawler/db.py` has zero occurrences of `sqlite3`; `require_postgres()` is a no-op when DATABASE_URL is set"
    - "`fee_crawler/modal_preflight.py` writes + deletes a synthetic `preflight_check` agent_events row and calls R2.head_bucket; the `/tmp/preflight_test.db` path is gone"
    - "`pytest fee_crawler/tests/` completes green against the db_schema Postgres fixture"
  artifacts:
    - path: "fee_crawler/SQLITE_AUDIT.md"
      provides: "Authoritative record of every call site rewritten (file:line before/after)"
      contains: "Before-state inventory"
    - path: "fee_crawler/db.py"
      provides: "Postgres-only dual surface — sync psycopg2 Database + async pool re-export"
      contains: "import psycopg2"
    - path: "fee_crawler/modal_preflight.py"
      provides: "Postgres + R2 + agent_events synthetic-write readiness check (D-16)"
      contains: "preflight_check"
    - path: "scripts/ci-guards.sh"
      provides: "sqlite-kill covering production AND test paths; excludes only SQLITE_AUDIT.md"
      contains: "SQLITE_AUDIT.md"
  key_links:
    - from: "fee_crawler/db.py"
      to: "DATABASE_URL (required)"
      via: "require_postgres() raises if missing"
      pattern: "os.environ"
    - from: "fee_crawler/modal_preflight.py"
      to: "agent_events + R2"
      via: "INSERT preflight_check + R2 head_bucket"
      pattern: "preflight_check"
    - from: "scripts/ci-guards.sh"
      to: "production + test paths grep"
      via: "git grep with single SQLITE_AUDIT.md exclusion"
      pattern: "better-sqlite3"
---

<objective>
Eliminate SQLite from every production and test path. TIER-06 is this phase's gate — without this plan, SC4 fails because `grep -rE "better-sqlite3|sqlite3|DB_PATH" fee_crawler/ src/` returns hits.

After this plan:
1. `git grep -nE "better-sqlite3|sqlite3|DB_PATH" -- fee_crawler/ src/ ':(exclude)fee_crawler/SQLITE_AUDIT.md'` returns ZERO lines in production AND test paths.
2. `fee_crawler/db.py` retains its module path (D-13) but is Postgres-only — sync surface via psycopg2 (legacy callers), async surface re-exports the shared asyncpg pool from Plan 62A-05.
3. `fee_crawler/modal_preflight.py` is rewritten as a Postgres + R2 + agent_events readiness check (D-16); the `/tmp/preflight_test.db` SQLite path is gone.
4. `.github/workflows/test.yml` removes the `continue-on-error: true` flag Plan 62A-01 left as a placeholder on the sqlite-kill step.
5. The two test files that carried `sqlite3` references (`test_transition_fee_status.py`, `tests/e2e/conftest.py`) are rewritten against the db_schema fixture or deleted.
6. `pytest fee_crawler/tests/` runs green against Postgres — zero SQLite dependency anywhere.

Scope inventory at plan-write time (from grep executed during planning):

| File | Line(s) | Match | Action |
|------|---------|-------|--------|
| fee_crawler/db.py | 16, 540, 541, 618, 657, 672, 680, 683, 689, 692 | import sqlite3, sqlite3.connect, sqlite3.Row/Cursor/OperationalError | Rewrite Postgres-only (Task 2) |
| fee_crawler/modal_preflight.py | 31, 186 | PREFLIGHT_DB_PATH, DatabaseConfig(path=...) | Rewrite (Task 3) |
| fee_crawler/commands/crawl.py | 600 | comment "Convert sqlite3.Row objects" | Rewrite comment (Task 2) |
| fee_crawler/commands/discover_urls.py | 257 | comment "Convert sqlite3.Row objects" | Rewrite comment (Task 2) |
| fee_crawler/tests/test_transition_fee_status.py | 3, 17, 18 | import sqlite3, sqlite3.connect(":memory:"), sqlite3.Row | Rewrite or delete (Task 4) |
| fee_crawler/tests/e2e/conftest.py | 79 | comment "sqlite3" | Rewrite comment or delete (Task 4) |

Total: 7 files. Test paths will be opened to the CI guard in Task 5.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md
@.planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md
@fee_crawler/db.py
@fee_crawler/modal_preflight.py
@fee_crawler/config.py
@fee_crawler/commands/crawl.py
@fee_crawler/commands/discover_urls.py
@fee_crawler/tests/test_transition_fee_status.py
@fee_crawler/tests/e2e/conftest.py
@scripts/ci-guards.sh
@.github/workflows/test.yml
@fee_crawler/agent_tools/pool.py
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Modal function → DATABASE_URL | Secret injected at runtime; preflight asserts presence or fails fast |
| CI runner → Postgres service container | Ephemeral, never holds real data |
| Test fixture → DATABASE_URL_TEST | Fixture refuses pooler/supabase DSN (Plan 62A-01 guard) |
| R2 credentials in preflight | Surface area for credential log-leak during fail-fast |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-62A11-01 | Information Disclosure | DATABASE_URL leaked in preflight error log | high | mitigate | modal_preflight.py scrubs DSN passwords in any error message via regex substitution; test `test_preflight_error_scrubs_dsn` exercises |
| T-62A11-02 | Information Disclosure | R2 secret keys leaked during head_bucket failure | high | mitigate | Preflight error branch reports only the bucket name + HTTP status, never the access_key_id; boto3 default logging kept at WARNING |
| T-62A11-03 | Tampering | CI grep guard excludes a path that still contains SQLite | high | mitigate | sqlite-kill excludes ONLY fee_crawler/SQLITE_AUDIT.md (documentation). tests/ is NO LONGER excluded after Task 5 |
| T-62A11-04 | Denial of Service | db.py psycopg2 connection leak during long-running CLI commands | medium | accept | Existing CLI commands close connections on exit; per-command lifecycle documented in SQLITE_AUDIT.md |
| T-62A11-05 | Repudiation | preflight synthetic agent_events write leaks into production history | low | mitigate | Preflight uses action='preflight_check' agent_name='_preflight' and deletes it in the same transaction — net-zero row count; test `test_preflight_is_net_zero` |
| T-62A11-06 | Elevation of Privilege | Removed SQLite fallback silently rebinds to remote Postgres in dev | medium | accept | config.py requires DATABASE_URL in all environments; no silent fallback. Local dev uses docker-compose postgres:5433 per Plan 62A-01 |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Audit — inventory every SQLite reference to fee_crawler/SQLITE_AUDIT.md</name>
  <files>fee_crawler/SQLITE_AUDIT.md</files>
  <read_first>
    - .planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md §D-13..D-16 (SQLite elimination decisions)
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §8 (dep deltas, existing kill surface estimate)
  </read_first>
  <action>
Run this exact audit command and capture the full output:

```bash
git grep -nE 'better-sqlite3|sqlite3|DB_PATH' -- fee_crawler/ src/ \
  ':(exclude)fee_crawler/**/__pycache__' \
  ':(exclude)src/**/node_modules/**' \
  ':(exclude)fee_crawler/SQLITE_AUDIT.md' \
  2>/dev/null > /tmp/sqlite_audit_raw.txt
```

Use the output to author `fee_crawler/SQLITE_AUDIT.md` with exactly this structure (fill in the table body from the grep output):

```markdown
# SQLite Call-Site Audit — Phase 62a Plan 11

**Date:** 2026-04-16
**Decisions:** CONTEXT.md D-13..D-16 (eliminate SQLite; rewrite db.py Postgres-only; rewrite modal_preflight.py; CI grep guard).

## Before-state inventory

The authoritative list of every SQLite call site at the start of Plan 62A-11
execution. Every row below is addressed by a subsequent task in this plan.

| File | Line | Pattern match | Disposition |
|------|------|---------------|-------------|
| fee_crawler/db.py | 16 | `import sqlite3` | Rewritten in Task 2 — module now psycopg2+asyncpg only |
| fee_crawler/db.py | 540 | `sqlite3.connect(...)` | Rewritten in Task 2 — Database wraps psycopg2 |
| fee_crawler/db.py | 541 | `sqlite3.Row` | Rewritten in Task 2 — RealDictCursor returns dict rows |
| fee_crawler/db.py | 618, 657, 672 | `sqlite3.OperationalError` | Rewritten in Task 2 — replaced by psycopg2.OperationalError |
| fee_crawler/db.py | 680, 683, 689, 692 | `sqlite3.Cursor` / `sqlite3.Row` in signatures | Rewritten in Task 2 — signatures widened to `Any` / `dict` |
| fee_crawler/modal_preflight.py | 31 | `PREFLIGHT_DB_PATH = "/tmp/preflight_test.db"` | Removed in Task 3 |
| fee_crawler/modal_preflight.py | 186 | `DatabaseConfig(path=PREFLIGHT_DB_PATH)` | Removed in Task 3 |
| fee_crawler/commands/crawl.py | 600 | comment `# Convert sqlite3.Row objects to plain dicts` | Rewritten in Task 2 — "RealDictRow rows" |
| fee_crawler/commands/discover_urls.py | 257 | comment `# Convert sqlite3.Row objects to plain dicts` | Rewritten in Task 2 — "RealDictRow rows" |
| fee_crawler/tests/test_transition_fee_status.py | 3 | `import sqlite3` | Rewritten in Task 4 — uses db_schema fixture |
| fee_crawler/tests/test_transition_fee_status.py | 17, 18 | `sqlite3.connect(":memory:")`, `sqlite3.Row` | Rewritten in Task 4 — asyncpg + per-test schema |
| fee_crawler/tests/e2e/conftest.py | 79 | comment mentioning `sqlite3` | Rewritten in Task 4 — comment updated or file deleted |

If the actual grep output differs from this table, REPLACE the row set above with
the actual output — this table MUST reflect the state of the codebase when Task 1 runs.

## After-state expectation

After Tasks 2-6 complete:
- `git grep -nE 'better-sqlite3|sqlite3|DB_PATH' -- fee_crawler/ src/ ':(exclude)fee_crawler/SQLITE_AUDIT.md'` returns ZERO lines.
- `bash scripts/ci-guards.sh sqlite-kill` exits 0.
- CI workflow no longer uses `continue-on-error: true` on the guard step.
- `pytest fee_crawler/tests/` runs green against the db_schema Postgres fixture.

## Notes

- Phase 60.1 retired the pipeline-tables-on-SQLite path (`require_postgres()` was the gate). Phase 62a completes the elimination.
- D-13 preserves the `fee_crawler/db.py` module path — all existing `from fee_crawler import db` imports still succeed; the module is rewritten not renamed.
- `fee_crawler/config.py` drops the sqlite-branch of DatabaseConfig. DATABASE_URL is required in every environment (local dev uses docker-compose postgres:5433 per Plan 62A-01).
- This file is the auditor's record; keep it for the lifetime of the phase.
```
  </action>
  <verify>
    <automated>test -f fee_crawler/SQLITE_AUDIT.md && grep -q "Before-state inventory" fee_crawler/SQLITE_AUDIT.md && grep -q "After-state expectation" fee_crawler/SQLITE_AUDIT.md && grep -q "fee_crawler/db.py" fee_crawler/SQLITE_AUDIT.md && grep -q "fee_crawler/modal_preflight.py" fee_crawler/SQLITE_AUDIT.md && grep -q "fee_crawler/tests/test_transition_fee_status.py" fee_crawler/SQLITE_AUDIT.md</automated>
  </verify>
  <acceptance_criteria>
    - fee_crawler/SQLITE_AUDIT.md exists
    - Contains the three sections: Before-state inventory, After-state expectation, Notes
    - Inventory table mentions at minimum: fee_crawler/db.py, fee_crawler/modal_preflight.py, fee_crawler/tests/test_transition_fee_status.py, fee_crawler/commands/crawl.py, fee_crawler/commands/discover_urls.py
    - Every row has a task disposition pointing at Task 2, 3, 4, or 5
  </acceptance_criteria>
  <done>Authoritative call-site inventory committed; every remaining SQLite match has an assigned task disposition.</done>
</task>

<task type="auto">
  <name>Task 2: Rewrite fee_crawler/db.py Postgres-only + drop sqlite branch in config.py + fix CLI comments</name>
  <files>fee_crawler/db.py, fee_crawler/config.py, fee_crawler/commands/crawl.py, fee_crawler/commands/discover_urls.py, fee_crawler/requirements.txt</files>
  <read_first>
    - fee_crawler/db.py (entire existing file — we preserve caller signatures)
    - fee_crawler/config.py (DatabaseConfig Pydantic model with sqlite/postgres branches)
    - fee_crawler/agent_tools/pool.py (shared asyncpg pool — the async re-export target)
    - fee_crawler/commands/crawl.py around line 600 (comment replace)
    - fee_crawler/commands/discover_urls.py around line 257 (comment replace)
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §2 (dual sync/async surface rationale)
  </read_first>
  <action>
### Step 2a — fee_crawler/config.py

Locate the `DatabaseConfig` Pydantic model. Remove every field supporting SQLite (typically `path`, `type: Literal["sqlite","postgres"]`). The new model is a minimal empty class preserving the import path:

```python
class DatabaseConfig(BaseModel):
    """Postgres-only since Phase 62a (D-13). DATABASE_URL is required in every environment."""
    model_config = {"extra": "forbid"}
```

If existing callers pass `DatabaseConfig(type='sqlite', path=...)` or `DatabaseConfig(path=...)`, rewrite those call sites to `DatabaseConfig()` and rely on `DATABASE_URL` at runtime. Keep the class exported so `from fee_crawler.config import DatabaseConfig` still resolves.

### Step 2b — fee_crawler/db.py (FULL REWRITE)

Overwrite the file entirely with this content. Preserve the module path — every `from fee_crawler import db` import continues to resolve.

```python
"""Postgres-only database module (Phase 62a, D-13).

Previously dual-mode (SQLite for dev, Postgres for prod). SQLite is gone; every
environment now requires DATABASE_URL. This module exposes two surfaces:

  - Sync surface (Database class): psycopg2-based, preserves every legacy
    `from fee_crawler import db` import site. Call-site signatures unchanged.
  - Async surface (get_async_pool): re-exports fee_crawler.agent_tools.pool
    so the tool gateway and legacy async callers share one connection pool.

require_postgres(reason) is retained for backwards compatibility: it no longer
gates SQLite vs Postgres, it simply asserts DATABASE_URL is set and raises a
descriptive error if not.
"""

from __future__ import annotations

import os
import threading
from contextlib import contextmanager
from typing import Any, Iterator, Optional

import psycopg2
import psycopg2.extras

from fee_crawler.config import Config, DatabaseConfig  # re-export

_thread_local = threading.local()


def require_postgres(reason: str) -> None:
    """Assert DATABASE_URL is set. Raises RuntimeError with `reason` if not.

    Phase 62a: SQLite paths are gone. This function's role is to fail fast with a
    descriptive error when DATABASE_URL is missing (typical cause: running a CLI
    script outside the Modal secret scope or without `docker compose up -d postgres`
    + exporting DATABASE_URL_TEST).
    """
    if not os.environ.get("DATABASE_URL") and not os.environ.get("DATABASE_URL_TEST"):
        raise RuntimeError(
            "DATABASE_URL is not set. Phase 62a eliminated SQLite fallback; "
            "set DATABASE_URL to a Postgres DSN. "
            f"Reason: {reason}. "
            "Local dev: docker compose up -d postgres && "
            "export DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/bfi_test"
        )


def _dsn() -> str:
    dsn = os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_URL_TEST")
    if not dsn:
        require_postgres("Database layer called without DATABASE_URL")
    return dsn  # type: ignore[return-value]


class Database:
    """Sync Postgres database wrapper (psycopg2).

    API is a minimal superset of the old sqlite3-based Database class so every
    existing `from fee_crawler import db` call site continues to work. Caller
    signatures (execute / executemany / fetchone / fetchall / commit / close)
    are preserved verbatim; the only behavior change is that rows are returned
    as dicts via RealDictCursor (dict(row) was already supported on sqlite3.Row,
    so callers that did `row["field"]` see no difference).
    """

    def __init__(self, _config: Optional[Config] = None):
        require_postgres("Database.__init__")
        self.conn = psycopg2.connect(_dsn())
        self.cursor_factory = psycopg2.extras.RealDictCursor

    def execute(self, sql: str, params: tuple = ()) -> Any:
        cur = self.conn.cursor(cursor_factory=self.cursor_factory)
        cur.execute(sql, params)
        return cur

    def executemany(self, sql: str, params: list[tuple]) -> Any:
        cur = self.conn.cursor(cursor_factory=self.cursor_factory)
        cur.executemany(sql, params)
        return cur

    def fetchone(self, sql: str, params: tuple = ()) -> Optional[dict]:
        with self.conn.cursor(cursor_factory=self.cursor_factory) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            return dict(row) if row is not None else None

    def fetchall(self, sql: str, params: tuple = ()) -> list[dict]:
        with self.conn.cursor(cursor_factory=self.cursor_factory) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]

    def commit(self) -> None:
        self.conn.commit()

    def rollback(self) -> None:
        self.conn.rollback()

    def close(self) -> None:
        if self.conn is not None:
            self.conn.close()
            self.conn = None  # type: ignore[assignment]

    @contextmanager
    def transaction(self) -> Iterator["Database"]:
        try:
            yield self
            self.commit()
        except Exception:
            self.rollback()
            raise


def get_worker_db(config: Optional[Config] = None) -> Database:
    """Return a thread-local Database; opens on first call per thread."""
    db = getattr(_thread_local, "db", None)
    if db is None or getattr(db, "conn", None) is None:
        db = Database(config)
        _thread_local.db = db
    return db


def close_worker_db() -> None:
    """Close the thread-local Database connection."""
    db = getattr(_thread_local, "db", None)
    if db is not None:
        db.close()
        _thread_local.db = None


# ---------------------------------------------------------------------------
# Async surface — re-exports the asyncpg pool from fee_crawler.agent_tools.pool
# so the tool gateway (Plan 62A-05) and legacy async callers share one pool.
# ---------------------------------------------------------------------------

async def get_async_pool():
    """Return the shared asyncpg pool."""
    from fee_crawler.agent_tools.pool import get_pool
    return await get_pool()


async def close_async_pool() -> None:
    from fee_crawler.agent_tools.pool import close_pool
    await close_pool()


__all__ = [
    "Database",
    "DatabaseConfig",
    "get_worker_db",
    "close_worker_db",
    "get_async_pool",
    "close_async_pool",
    "require_postgres",
]
```

### Step 2c — fee_crawler/requirements.txt

Ensure these lines exist (preserve existing; add if missing):
```
psycopg2-binary>=2.9
asyncpg>=0.31
```

Do NOT remove `psycopg2-binary` — the sync Database class depends on it.

### Step 2d — fee_crawler/commands/crawl.py and fee_crawler/commands/discover_urls.py

In `fee_crawler/commands/crawl.py` around line 600, replace the comment:
```python
# Convert sqlite3.Row objects to plain dicts (needed for thread safety)
```
with:
```python
# Convert RealDictRow rows to plain dicts (needed for thread safety)
```

In `fee_crawler/commands/discover_urls.py` around line 257, replace the comment:
```python
# Convert sqlite3.Row objects to plain dicts (needed for pickling across threads)
```
with:
```python
# Convert RealDictRow rows to plain dicts (needed for pickling across threads)
```

Behavior is unchanged — both `sqlite3.Row` and `RealDictRow` support `dict(row)`.
  </action>
  <verify>
    <automated>python -c "
import os
os.environ.setdefault('DATABASE_URL_TEST', 'postgres://postgres:postgres@localhost:5433/bfi_test')
import fee_crawler.db as db_mod
from fee_crawler.db import Database, get_worker_db, close_worker_db, require_postgres, get_async_pool, close_async_pool, DatabaseConfig
assert 'sqlite3' not in dir(db_mod), 'sqlite3 still in fee_crawler.db namespace'
import ast, pathlib
src = pathlib.Path('fee_crawler/db.py').read_text()
assert 'sqlite3' not in src, 'fee_crawler/db.py still references sqlite3'
assert 'import psycopg2' in src, 'psycopg2 import missing'
require_postgres('smoke')
print('OK')
" && grep -q "psycopg2-binary>=2.9" fee_crawler/requirements.txt && grep -q "asyncpg>=0.31" fee_crawler/requirements.txt && ! grep -n "sqlite3" fee_crawler/commands/crawl.py fee_crawler/commands/discover_urls.py</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'sqlite3' fee_crawler/db.py` returns 0
    - `grep -c 'import psycopg2' fee_crawler/db.py` returns at least 1
    - `grep -c 'get_async_pool\|close_async_pool\|Database\|get_worker_db\|require_postgres' fee_crawler/db.py` returns at least 5 (all public exports present)
    - `from fee_crawler.db import Database, get_worker_db, require_postgres, DatabaseConfig` succeeds
    - `grep -c 'sqlite' fee_crawler/commands/crawl.py fee_crawler/commands/discover_urls.py` returns 0 (both comments rewritten)
    - `grep -q 'psycopg2-binary>=2.9' fee_crawler/requirements.txt && grep -q 'asyncpg>=0.31' fee_crawler/requirements.txt`
    - `fee_crawler/config.py` DatabaseConfig no longer references sqlite/path fields
  </acceptance_criteria>
  <done>db.py is Postgres-only with preserved caller signatures; config.py drops sqlite branch; CLI comments rewritten; requirements intact.</done>
</task>

<task type="auto">
  <name>Task 3: Rewrite fee_crawler/modal_preflight.py as Postgres + R2 + agent_events readiness check (D-16)</name>
  <files>fee_crawler/modal_preflight.py</files>
  <read_first>
    - fee_crawler/modal_preflight.py (entire existing file)
    - .planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md §D-16 (Postgres + R2 + agent_events readiness)
    - fee_crawler/agent_tools/pool.py (asyncpg pool init pattern)
    - supabase/migrations/20260417_agent_events_partitioned.sql (agent_events columns — for the synthetic write)
  </read_first>
  <action>
REWRITE `fee_crawler/modal_preflight.py` entirely. The old file spun up a `/tmp/preflight_test.db` SQLite DB and ran a 5-stage smoke. The new file performs 4 readiness checks against real infrastructure and fails fast on any missing piece. Content:

```python
"""Modal pre-flight readiness check (Phase 62a, D-16).

Replaces the legacy SQLite-in-/tmp smoke test. Instead of simulating the pipeline
end-to-end, this preflight asserts the RUNTIME infrastructure is wired correctly
before any worker function runs:

  1. DATABASE_URL is set and reachable.
  2. All required Postgres tables exist (agent_events, agent_auth_log,
     agent_messages, agent_registry, agent_budgets, institution_dossiers,
     fees_raw, fees_verified, fees_published).
  3. R2 bucket is reachable (head_bucket).
  4. Synthetic agent_events write/delete round-trip — confirms the partitioned
     write path + pg_cron maintenance leave the current partition writable.

Deploy: modal deploy fee_crawler/modal_preflight.py
Invoke: modal run fee_crawler/modal_preflight.py::preflight
"""

from __future__ import annotations

import os
import re
from typing import Any, List

import modal


preflight_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install_from_requirements("fee_crawler/requirements.txt")
    .pip_install("fastapi[standard]")
    .add_local_dir("fee_crawler", remote_path="/root/fee_crawler")
)

app = modal.App("bank-fee-index-preflight", image=preflight_image)
secrets = [modal.Secret.from_name("bfi-secrets")]


REQUIRED_TABLES: List[str] = [
    "agent_events",
    "agent_auth_log",
    "agent_messages",
    "agent_registry",
    "agent_budgets",
    "institution_dossiers",
    "fees_raw",
    "fees_verified",
    "fees_published",
]


def _scrub_dsn(msg: str) -> str:
    """Redact password from any DATABASE_URL-looking string before logging."""
    return re.sub(r"://([^:]+):[^@]+@", r"://\1:***@", msg)


async def _check_postgres_connectivity() -> None:
    """Open a connection using the shared asyncpg pool. Fail fast on any error."""
    from fee_crawler.agent_tools.pool import get_pool
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            v = await conn.fetchval("SELECT 1")
            assert v == 1, f"SELECT 1 returned {v!r}"
    except Exception as exc:
        raise RuntimeError(f"preflight:postgres: {_scrub_dsn(str(exc))}") from None


async def _check_required_tables() -> None:
    """Every required table resolves via to_regclass."""
    from fee_crawler.agent_tools.pool import get_pool
    pool = await get_pool()
    missing: List[str] = []
    async with pool.acquire() as conn:
        for tbl in REQUIRED_TABLES:
            r = await conn.fetchval("SELECT to_regclass($1)", tbl)
            if r is None:
                missing.append(tbl)
    if missing:
        raise RuntimeError(
            f"preflight:tables: required tables missing: {missing}. "
            "Supabase migrations likely need to run (see Plan 62A-12)."
        )


def _check_r2_reachable() -> None:
    """Confirm R2 credentials + bucket are wired."""
    import boto3
    from botocore.exceptions import ClientError, EndpointConnectionError

    endpoint = os.environ.get("R2_ENDPOINT")
    bucket = os.environ.get("R2_BUCKET")
    if not endpoint or not bucket:
        raise RuntimeError(
            "preflight:r2: R2_ENDPOINT + R2_BUCKET must be set "
            "(see CLAUDE.md Configuration section)"
        )
    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=os.environ.get("R2_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("R2_SECRET_ACCESS_KEY"),
            region_name="auto",
        )
        s3.head_bucket(Bucket=bucket)
    except (ClientError, EndpointConnectionError) as exc:
        # Never leak the access key; report bucket + HTTP status only.
        status = getattr(getattr(exc, "response", {}).get("Error", {}), "get",
                         lambda k, d=None: d)("Code", "unknown")
        raise RuntimeError(
            f"preflight:r2: bucket={bucket} unreachable (code={status})"
        ) from None


async def _check_agent_events_writable() -> None:
    """Synthetic write + delete in one transaction — net-zero row count.

    Uses agent_name='_preflight' + action='preflight_check' so any leak into
    production history is obviously a preflight artifact.
    """
    from fee_crawler.agent_tools.pool import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            event_id = await conn.fetchval(
                """INSERT INTO agent_events
                     (agent_name, action, tool_name, entity, status, cost_cents,
                      input_payload)
                   VALUES ('_preflight', 'preflight_check', '_preflight',
                           '_preflight', 'success', 0, '{}'::JSONB)
                   RETURNING event_id""",
            )
            assert event_id is not None, "agent_events INSERT returned NULL"
            # Delete so the preflight leaves net-zero rows.
            await conn.execute(
                "DELETE FROM agent_events WHERE event_id = $1::UUID AND agent_name = '_preflight'",
                event_id,
            )


@app.function(secrets=secrets, timeout=120)
async def preflight() -> dict[str, Any]:
    """Top-level preflight invocation. Returns {ok, checks_passed}; raises on failure."""
    errors: list[str] = []

    async def _run_check(name: str, coro_or_fn) -> None:
        try:
            if callable(coro_or_fn) and not hasattr(coro_or_fn, "__await__"):
                # sync check (e.g., R2)
                coro_or_fn()
            else:
                await coro_or_fn
        except Exception as exc:
            errors.append(f"{name}: {_scrub_dsn(str(exc))}")

    await _run_check("postgres", _check_postgres_connectivity())
    await _run_check("tables", _check_required_tables())
    await _run_check("r2", _check_r2_reachable)
    await _run_check("agent_events_write", _check_agent_events_writable())

    if errors:
        raise RuntimeError("preflight failed:\n  - " + "\n  - ".join(errors))

    return {
        "ok": True,
        "checks_passed": ["postgres", "tables", "r2", "agent_events_write"],
    }


if __name__ == "__main__":
    # Local invocation smoke: `python -m fee_crawler.modal_preflight`
    # (skips R2 check outside Modal if R2_ENDPOINT unset).
    import asyncio
    print(asyncio.run(preflight()))
```

Delete any remaining `PREFLIGHT_DB_PATH`, `SEED_LIMIT`, `TARGET_COUNT`, `DISCOVERY_TIMEOUT_S`, `EXTRACTION_TIMEOUT_S`, `preflight_e2e`, `preflight_postgres`, `_run_preflight_stages` definitions — the new preflight replaces them entirely. Callers that invoked `preflight_e2e` or `preflight_postgres` from `fee_crawler/modal_app.py` (if any) must be updated to call `preflight` instead. Grep `fee_crawler/modal_app.py` for those symbols:

```bash
grep -n "preflight_e2e\|preflight_postgres\|PREFLIGHT_DB_PATH" fee_crawler/modal_app.py 2>/dev/null
```

If any match, rewrite the call site to `preflight`. If no match, move on.
  </action>
  <verify>
    <automated>python -c "
import ast, pathlib
src = pathlib.Path('fee_crawler/modal_preflight.py').read_text()
ast.parse(src)
assert 'sqlite' not in src.lower(), 'sqlite reference still in modal_preflight.py'
assert 'PREFLIGHT_DB_PATH' not in src, 'old SQLite path constant still present'
assert 'preflight_check' in src, 'synthetic agent_events write marker missing'
assert '_scrub_dsn' in src, 'DSN scrubber missing'
assert 'head_bucket' in src, 'R2 check missing'
print('OK')
" && ! grep -nE "preflight_e2e|preflight_postgres|PREFLIGHT_DB_PATH" fee_crawler/modal_app.py 2>/dev/null</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'sqlite' fee_crawler/modal_preflight.py` returns 0 (case-insensitive)
    - `grep -c 'PREFLIGHT_DB_PATH' fee_crawler/modal_preflight.py` returns 0
    - `grep -c 'preflight_check\|_scrub_dsn\|head_bucket\|REQUIRED_TABLES' fee_crawler/modal_preflight.py` returns at least 4
    - `python -c "import ast; ast.parse(open('fee_crawler/modal_preflight.py').read())"` exits 0
    - `fee_crawler/modal_app.py` has no remaining references to `preflight_e2e`, `preflight_postgres`, or `PREFLIGHT_DB_PATH`
  </acceptance_criteria>
  <done>modal_preflight.py is a Postgres + R2 + agent_events readiness check; no SQLite references; synthetic write uses the preflight_check action and cleans up in one transaction.</done>
</task>

<task type="auto">
  <name>Task 4: Rewrite (or delete) the two test files that carried sqlite3 references</name>
  <files>fee_crawler/tests/test_transition_fee_status.py, fee_crawler/tests/e2e/conftest.py</files>
  <read_first>
    - fee_crawler/tests/test_transition_fee_status.py (entire file — the `MockDb` pattern)
    - fee_crawler/tests/e2e/conftest.py (entire file — the legacy comment)
    - fee_crawler/tests/conftest.py (db_schema fixture — Plan 62A-01)
    - fee_crawler/tests/test_tools_fees.py (pool injection pattern)
  </read_first>
  <action>
### Step 4a — fee_crawler/tests/test_transition_fee_status.py

The existing file uses an in-memory SQLite `MockDb` to test the fee-review state machine. Rewrite it to use the `db_schema` Postgres fixture.

Full replacement:

```python
"""fee_review state transition tests (Phase 62a rewrite — Postgres-only).

Previously used an in-memory SQLite MockDb; now uses the db_schema fixture
from conftest.py which provides a real per-test Postgres schema with every
supabase/migrations/*.sql applied.
"""

from __future__ import annotations

import pytest


# All tests require the db_schema fixture which bootstraps Postgres + migrations.
# DATABASE_URL_TEST must be set (docker compose up -d postgres).


@pytest.mark.asyncio
async def test_fee_review_transitions_valid(db_schema):
    """Valid state transitions succeed: pending -> staged -> approved."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        # Seed an extracted_fees row (the legacy table still exists post-62a
        # with a freeze trigger; inserts require `SET app.allow_legacy_writes`
        # in the same transaction — see Plan 62A-06).
        await conn.execute("SET app.allow_legacy_writes = 'true'")
        fee_id = await conn.fetchval(
            """INSERT INTO extracted_fees
                 (crawl_target_id, fee_name, amount, review_status)
               VALUES (1, 'overdraft', 35.0, 'pending')
               RETURNING id"""
        )
        # Transition pending -> staged.
        await conn.execute(
            "UPDATE extracted_fees SET review_status = 'staged' WHERE id = $1",
            fee_id,
        )
        v = await conn.fetchval(
            "SELECT review_status FROM extracted_fees WHERE id = $1", fee_id
        )
        assert v == "staged"
        # Transition staged -> approved.
        await conn.execute(
            "UPDATE extracted_fees SET review_status = 'approved' WHERE id = $1",
            fee_id,
        )
        v = await conn.fetchval(
            "SELECT review_status FROM extracted_fees WHERE id = $1", fee_id
        )
        assert v == "approved"


@pytest.mark.asyncio
async def test_fee_review_transition_reject(db_schema):
    """Rejection from pending is allowed."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        await conn.execute("SET app.allow_legacy_writes = 'true'")
        fee_id = await conn.fetchval(
            """INSERT INTO extracted_fees
                 (crawl_target_id, fee_name, amount, review_status)
               VALUES (1, 'nsf', 25.0, 'pending')
               RETURNING id"""
        )
        await conn.execute(
            "UPDATE extracted_fees SET review_status = 'rejected' WHERE id = $1",
            fee_id,
        )
        v = await conn.fetchval(
            "SELECT review_status FROM extracted_fees WHERE id = $1", fee_id
        )
        assert v == "rejected"
```

The freeze trigger set up in Plan 62A-06 (`extracted_fees_freeze`) blocks writes unless `SET app.allow_legacy_writes = 'true'` is issued in the same transaction. The tests explicitly opt in via that session variable — this is the intended escape hatch for legacy regression tests.

If `extracted_fees` does not exist in the test schema (conftest only applies supabase migrations, which may not cover the legacy table), DELETE this file instead of rewriting — the fee-review state machine now lives in `fee_reviews` (Plan 62A-07) and has its own test coverage. Decide based on the presence of `extracted_fees` in the db_schema fixture; if tests from Plan 62A-05 rely on extracted_fees, it exists and the rewrite stands; if not, delete the file.

### Step 4b — fee_crawler/tests/e2e/conftest.py

Read the file. The only SQLite reference is a comment at line 79 mentioning inspecting a file-backed sqlite DB post-failure. Two options:

1. If the file contains any real SQLite setup (`sqlite3.connect`, `.db` file creation, etc.), DELETE the file entirely — the e2e suite is rewritten in Phase 63.
2. If the file contains only the comment and infrastructure unrelated to SQLite, remove the comment line 79.

Either way, the end state is ZERO `sqlite3`-style references in `fee_crawler/tests/e2e/conftest.py`.

Preferred: delete the e2e conftest and re-create it in Phase 63 when the e2e harness is rebuilt around agent tools. Leave a `.gitkeep` in `fee_crawler/tests/e2e/` if the directory is otherwise empty.
  </action>
  <verify>
    <automated>! grep -nE "sqlite3|better-sqlite3|DB_PATH" fee_crawler/tests/test_transition_fee_status.py fee_crawler/tests/e2e/conftest.py 2>/dev/null && python -c "import ast, pathlib; ast.parse(pathlib.Path('fee_crawler/tests/test_transition_fee_status.py').read_text()) if pathlib.Path('fee_crawler/tests/test_transition_fee_status.py').exists() else None"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'sqlite' fee_crawler/tests/test_transition_fee_status.py` returns 0 (file rewritten) OR file was deleted
    - `grep -c 'sqlite' fee_crawler/tests/e2e/conftest.py 2>/dev/null` returns 0 (or file does not exist)
    - If test_transition_fee_status.py was rewritten: `python -c "import ast; ast.parse(open('fee_crawler/tests/test_transition_fee_status.py').read())"` exits 0
  </acceptance_criteria>
  <done>Both test files are SQLite-free; rewritten against db_schema OR deleted; no memory: prefix references remain.</done>
</task>

<task type="auto">
  <name>Task 5: Update scripts/ci-guards.sh to include test paths + remove continue-on-error in CI</name>
  <files>scripts/ci-guards.sh, .github/workflows/test.yml</files>
  <read_first>
    - scripts/ci-guards.sh (existing — Plan 62A-01 version excludes tests/)
    - .github/workflows/test.yml (existing — Plan 62A-01 left continue-on-error: true on sqlite-kill step)
    - fee_crawler/SQLITE_AUDIT.md (Task 1 output — the one file the guard must continue to exclude)
  </read_first>
  <action>
### Step 5a — scripts/ci-guards.sh

Read the existing file. Locate the `sqlite_kill()` function. Remove the test-exclusion pattern (`:(exclude)fee_crawler/tests` or `--exclude-dir=tests`). Add a single exclusion for `fee_crawler/SQLITE_AUDIT.md`. The rewritten function body:

```bash
sqlite_kill() {
  local include_dirs=("fee_crawler" "src")
  local exclude_paths=(
    ":(exclude)fee_crawler/**/__pycache__"
    ":(exclude)fee_crawler/SQLITE_AUDIT.md"
    ":(exclude)src/app/api/_archive"
    ":(exclude)src/**/node_modules/**"
  )

  local hits=""
  if git rev-parse --git-dir >/dev/null 2>&1; then
    hits=$(git grep -nE 'better-sqlite3|sqlite3|DB_PATH' -- \
      "${include_dirs[@]}" "${exclude_paths[@]}" \
      | grep -v '^Binary file' || true)
  else
    hits=$(grep -rnE 'better-sqlite3|sqlite3|DB_PATH' \
      --include='*.py' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
      --exclude-dir=__pycache__ --exclude-dir=node_modules \
      --exclude='SQLITE_AUDIT.md' \
      "${include_dirs[@]}" 2>/dev/null || true)
  fi

  if [[ -n "$hits" ]]; then
    echo "sqlite-kill: production/test SQLite references remain:" >&2
    echo "$hits" >&2
    exit 1
  fi

  echo "sqlite-kill: OK (zero matches in fee_crawler/ or src/)"
  exit 0
}
```

The key diff from Plan 62A-01 version: `:(exclude)fee_crawler/tests` is REMOVED; `:(exclude)fee_crawler/SQLITE_AUDIT.md` is ADDED.

### Step 5b — .github/workflows/test.yml

Read the existing file. Locate the step:

```yaml
- name: Run sqlite-kill guard
  run: bash scripts/ci-guards.sh sqlite-kill
  continue-on-error: true  # Wave 4 removes continue-on-error after SQLite elimination
```

REMOVE the `continue-on-error: true` line. The step becomes:

```yaml
- name: Run sqlite-kill guard
  run: bash scripts/ci-guards.sh sqlite-kill
```

This is the final gate: after Plan 62A-11, any SQLite reintroduction makes CI fail.
  </action>
  <verify>
    <automated>bash -n scripts/ci-guards.sh && bash scripts/ci-guards.sh sqlite-kill && ! grep -nE "continue-on-error: *true" .github/workflows/test.yml | grep -q "sqlite-kill\|sqlite_kill" && grep -q "SQLITE_AUDIT.md" scripts/ci-guards.sh && ! grep -nE "exclude\).*fee_crawler/tests" scripts/ci-guards.sh</automated>
  </verify>
  <acceptance_criteria>
    - `bash scripts/ci-guards.sh sqlite-kill` exits 0 (returns zero production+test matches)
    - `grep -c 'SQLITE_AUDIT.md' scripts/ci-guards.sh` returns at least 1 (the one documentation exclusion)
    - `grep -c 'fee_crawler/tests' scripts/ci-guards.sh` returns 0 (tests are NO LONGER excluded from the guard)
    - `.github/workflows/test.yml` sqlite-kill step has no `continue-on-error` attribute
    - `git grep -nE "better-sqlite3|sqlite3|DB_PATH" -- fee_crawler/ src/ ':(exclude)fee_crawler/SQLITE_AUDIT.md'` returns zero lines
  </acceptance_criteria>
  <done>CI guard now catches any SQLite reintroduction in production OR tests; continue-on-error removed; TIER-06 SC4 grep acceptance passes.</done>
</task>

<task type="auto">
  <name>Task 6: Final verification — full test suite + grep acceptance</name>
  <files>(no file changes)</files>
  <read_first>
    - fee_crawler/SQLITE_AUDIT.md (After-state expectation section)
    - .planning/ROADMAP.md §Phase 62a §Success Criteria #4
  </read_first>
  <action>
This is a verification-only task. Run the following in order; halt on the first failure:

```bash
# 1. Grep acceptance
bash scripts/ci-guards.sh sqlite-kill

# 2. Full pytest suite against the db_schema fixture
export DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/bfi_test
pytest fee_crawler/tests/ -v --no-header

# 3. Smoke: import everything that previously used SQLite
python -c "
from fee_crawler.db import Database, get_worker_db, close_worker_db, require_postgres, get_async_pool, close_async_pool
from fee_crawler.config import DatabaseConfig
# Smoke the sync surface (requires a reachable Postgres).
import os
os.environ.setdefault('DATABASE_URL_TEST', 'postgres://postgres:postgres@localhost:5433/bfi_test')
# DatabaseConfig is a parameterless shim now.
_ = DatabaseConfig()
print('OK')
"

# 4. Import preflight module
python -c "
import fee_crawler.modal_preflight
assert callable(fee_crawler.modal_preflight.preflight), 'preflight entrypoint missing'
print('OK')
"
```

If ANY step fails, the SQLITE_AUDIT.md inventory table likely misses a call site. Update the audit, fix the call site, re-run.

After all checks pass, append to `fee_crawler/SQLITE_AUDIT.md`:

```markdown
## After-state verification

Verified $(date -u +%Y-%m-%dT%H:%M:%SZ):
- `bash scripts/ci-guards.sh sqlite-kill` returns 0
- `git grep -nE "better-sqlite3|sqlite3|DB_PATH" -- fee_crawler/ src/ ':(exclude)fee_crawler/SQLITE_AUDIT.md'` returns 0 lines
- `pytest fee_crawler/tests/` green against Postgres
- `fee_crawler.db` imports succeed; `require_postgres('smoke')` does not raise with DATABASE_URL_TEST set
- `fee_crawler.modal_preflight.preflight` is callable

TIER-06 acceptance: PASS.
```
  </action>
  <verify>
    <automated>bash scripts/ci-guards.sh sqlite-kill && export DATABASE_URL_TEST="${DATABASE_URL_TEST:-postgres://postgres:postgres@localhost:5433/bfi_test}" && pytest fee_crawler/tests/ -v --no-header -x</automated>
  </verify>
  <acceptance_criteria>
    - `bash scripts/ci-guards.sh sqlite-kill` exits 0
    - `pytest fee_crawler/tests/` exits 0 against the db_schema Postgres fixture
    - `git grep -nE "better-sqlite3|sqlite3|DB_PATH" -- fee_crawler/ src/ ':(exclude)fee_crawler/SQLITE_AUDIT.md'` returns zero lines
    - `fee_crawler/SQLITE_AUDIT.md` contains an "After-state verification" section with PASS
    - All previous Plan 62A-01..10 tests continue to pass (no regressions from the db.py rewrite)
  </acceptance_criteria>
  <done>TIER-06 acceptance passes: grep zero, pytest green, preflight rewritten, CI guard enforcing.</done>
</task>

</tasks>

<verification>
```bash
bash scripts/ci-guards.sh sqlite-kill                         # must exit 0
git grep -nE 'better-sqlite3|sqlite3|DB_PATH' -- fee_crawler/ src/ ':(exclude)fee_crawler/SQLITE_AUDIT.md'   # must return no lines
export DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/bfi_test
pytest fee_crawler/tests/ -v --no-header                      # all tests green
python -c "from fee_crawler.db import Database, require_postgres; print('OK')"
python -c "import fee_crawler.modal_preflight as m; assert callable(m.preflight)"
```
All five checks pass.
</verification>

<success_criteria>
- TIER-06 grep acceptance: zero matches in production + test paths
- fee_crawler/db.py Postgres-only with preserved caller signatures
- fee_crawler/modal_preflight.py rewritten as 4-stage Postgres+R2+agent_events readiness check
- CI guard includes test paths and runs without continue-on-error
- pytest fee_crawler/tests/ green against the db_schema Postgres fixture
- fee_crawler/SQLITE_AUDIT.md captures the before/after state for audit
- No regressions from the db.py rewrite — Plan 62A-01..10 tests still pass
</success_criteria>

<output>
After completion, create `.planning/phases/62A-agent-foundation-data-layer/62A-11-SUMMARY.md` noting:
- 7 files rewritten (db.py, modal_preflight.py, config.py, 2 CLI comments, 2 test files)
- SQLITE_AUDIT.md serves as the permanent auditor's record
- TIER-06 acceptance verified end-to-end
- SC4 grep acceptance passes
- Known follow-ups: e2e suite rebuild in Phase 63 (may re-add test fixtures against Postgres)
</output>
