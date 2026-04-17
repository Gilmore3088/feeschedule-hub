---
phase: 62B
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - fee_crawler/agent_tools/pool.py
  - fee_crawler/tests/test_session_pool.py
  - CLAUDE.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "A new env var DATABASE_URL_SESSION points at port 5432 (session mode) separate from DATABASE_URL (port 6543 transaction-pool)"
    - "get_session_pool() returns an asyncpg pool that supports LISTEN/NOTIFY"
    - "get_pool() for transaction-mode writes continues to work unchanged"
    - "Test asserts add_listener succeeds on session pool and rejects (or gracefully falls back) on transaction pool"
    - "CLAUDE.md documents the new env var under Configuration"
  artifacts:
    - path: fee_crawler/agent_tools/pool.py
      provides: "Adds get_session_pool() alongside existing get_pool(); session pool uses DATABASE_URL_SESSION with statement_cache_size default (not 0)"
      contains: "async def get_session_pool"
    - path: fee_crawler/tests/test_session_pool.py
      provides: "Verifies session pool works for LISTEN/NOTIFY and is wired differently from transaction pool"
  key_links:
    - from: "get_session_pool()"
      to: "os.environ['DATABASE_URL_SESSION']"
      via: "asyncpg.create_pool on port 5432 DSN"
      pattern: "DATABASE_URL_SESSION"
---

<objective>
Add a second asyncpg pool helper `get_session_pool()` for LISTEN/NOTIFY usage, backed by a new env var `DATABASE_URL_SESSION` (Supabase session-mode pooler, port 5432). The existing transaction-mode `get_pool()` stays as-is for write traffic. This unblocks 62B-05 messaging runtime, which cannot reuse the transaction-mode pool (research §Pitfall 2 — LISTEN does not persist across Supavisor transaction-mode connection multiplexing).

Purpose: LISTEN/NOTIFY requires session semantics. Without this helper, plan 62B-05 would either silently fail or be forced to open raw asyncpg connections bypassing conftest fixtures.

Output: One added function (~25 LOC), one test file, one CLAUDE.md section update.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md
@.planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md
@fee_crawler/agent_tools/pool.py
@CLAUDE.md

<interfaces>
Existing `fee_crawler/agent_tools/pool.py` (full file, 97 lines):
- `get_pool() -> asyncpg.Pool` — reads `DATABASE_URL` or `DATABASE_URL_TEST`; `statement_cache_size=0`, `max_cached_statement_lifetime=0`; min_size=1, max_size=10
- `_init_connection(conn)` — registers jsonb/json codecs
- `close_pool()` — test teardown
- `open_pool_from_dsn(dsn, *, server_settings)` — per-test schema-scoped pool factory

Research §Mechanics 2 (lines 861-928) defines the required pattern:
- DSN env var: `DATABASE_URL_SESSION` (points at Supabase session-mode endpoint, port 5432)
- Use `statement_cache_size` default (not 0) — session mode supports prepared statements
- Must register the same jsonb codec via the init callback
- Size: min=1, max=3 (listeners are long-lived, don't need many connections)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add get_session_pool() + DATABASE_URL_SESSION env var helper</name>
  <files>fee_crawler/agent_tools/pool.py, fee_crawler/tests/test_session_pool.py</files>
  <read_first>
    - fee_crawler/agent_tools/pool.py (full existing file)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Mechanics 2 (full pattern, lines 861-928) + §Pitfall 2 (why transaction mode breaks LISTEN) + §Risks R2
    - fee_crawler/tests/conftest.py (to understand DATABASE_URL_TEST convention and how to add DATABASE_URL_SESSION_TEST)
  </read_first>
  <behavior>
    - Test 1: `get_session_pool()` raises RuntimeError when DATABASE_URL_SESSION is not set
    - Test 2: `get_session_pool()` returns an asyncpg.Pool and caches as module-level singleton `_session_pool`
    - Test 3: Returned pool's connections support `add_listener(channel, callback)` without error (use a test channel, send pg_notify, assert callback fires within 5s)
    - Test 4: Module-level `get_pool()` and `get_session_pool()` are independent — closing one does not affect the other
    - Test 5: JSONB codec registered on session-pool connections (round-trip a dict through a SELECT jsonb_build_object and assert type == dict)
  </behavior>
  <action>
Edit `fee_crawler/agent_tools/pool.py`. Keep existing `get_pool()`, `_init_connection()`, `close_pool()`, `open_pool_from_dsn()` unchanged.

**Add at module top:**
```python
_session_pool: Optional[asyncpg.Pool] = None
```

**Add new function after `get_pool()`:**
```python
async def get_session_pool() -> asyncpg.Pool:
    """Return a process-scoped asyncpg pool configured for SESSION-MODE Postgres.

    Use ONLY for LISTEN/NOTIFY. Writes MUST continue to use get_pool() (transaction mode).
    Supavisor transaction pooler (port 6543) multiplexes connections between transactions —
    LISTEN registrations do not survive. Session mode (port 5432) preserves connection
    state for the lifetime of the listener.

    Env var DATABASE_URL_SESSION MUST be set to a port-5432 DSN. Distinct from DATABASE_URL.

    Reference: Phase 62b research §Mechanics 2 + §Pitfall 2.
    """
    global _session_pool
    if _session_pool is None:
        dsn = os.environ.get("DATABASE_URL_SESSION") or os.environ.get("DATABASE_URL_SESSION_TEST")
        if not dsn:
            raise RuntimeError(
                "DATABASE_URL_SESSION (or DATABASE_URL_SESSION_TEST for tests) must be set "
                "before calling get_session_pool(). Required for LISTEN/NOTIFY in Phase 62b COMMS."
            )
        _session_pool = await asyncpg.create_pool(
            dsn=dsn,
            min_size=1,
            max_size=3,
            # Session mode supports prepared statements — use default cache.
            max_inactive_connection_lifetime=0,   # Listeners hold forever
            command_timeout=None,
            server_settings={"application_name": "bfi-agent-messaging"},
            init=_init_connection,
        )
    return _session_pool


async def close_session_pool() -> None:
    """Close the session pool. For test teardown."""
    global _session_pool
    if _session_pool is not None:
        await _session_pool.close()
        _session_pool = None
```

**Test file: `fee_crawler/tests/test_session_pool.py`**

Imports: `asyncio, os, uuid, pytest`, `from fee_crawler.agent_tools.pool import get_session_pool, close_session_pool, get_pool, close_pool`.

Use `pytest.mark.asyncio` on async tests. Skip cleanly with `pytest.skip` if `DATABASE_URL_SESSION_TEST` not set (match existing conftest.py convention).

Tests:
```python
@pytest.mark.asyncio
async def test_missing_env_raises():
    await close_session_pool()  # ensure clean slate
    orig = os.environ.pop("DATABASE_URL_SESSION", None)
    orig_test = os.environ.pop("DATABASE_URL_SESSION_TEST", None)
    try:
        with pytest.raises(RuntimeError, match="DATABASE_URL_SESSION"):
            await get_session_pool()
    finally:
        if orig is not None: os.environ["DATABASE_URL_SESSION"] = orig
        if orig_test is not None: os.environ["DATABASE_URL_SESSION_TEST"] = orig_test

@pytest.mark.asyncio
async def test_session_pool_singleton(session_pool_available):
    p1 = await get_session_pool()
    p2 = await get_session_pool()
    assert p1 is p2

@pytest.mark.asyncio
async def test_listen_notify_roundtrip(session_pool_available):
    pool = await get_session_pool()
    channel = f"pool_smoke_{uuid.uuid4().hex[:8]}"
    received = asyncio.Event()
    captured = {}
    async def cb(conn, pid, ch, payload):
        captured["payload"] = payload
        received.set()
    async with pool.acquire() as conn:
        await conn.add_listener(channel, cb)
        async with pool.acquire() as sender:
            await sender.execute("SELECT pg_notify($1, $2)", channel, "hello")
        try:
            await asyncio.wait_for(received.wait(), timeout=5)
        finally:
            await conn.remove_listener(channel, cb)
    assert captured["payload"] == "hello"

@pytest.mark.asyncio
async def test_pools_independent(session_pool_available):
    s = await get_session_pool()
    await close_session_pool()
    # Transaction pool not affected (if DATABASE_URL_TEST set)
    if os.environ.get("DATABASE_URL_TEST") or os.environ.get("DATABASE_URL"):
        t = await get_pool()
        assert t is not None
        await close_pool()

@pytest.mark.asyncio
async def test_jsonb_codec_registered(session_pool_available):
    pool = await get_session_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchval("SELECT jsonb_build_object('k','v')")
    assert isinstance(row, dict)
    assert row == {"k": "v"}
```

Add conftest fixture `session_pool_available`:
```python
@pytest.fixture
def session_pool_available():
    if not (os.environ.get("DATABASE_URL_SESSION") or os.environ.get("DATABASE_URL_SESSION_TEST")):
        pytest.skip("DATABASE_URL_SESSION[_TEST] not set; session pool tests skipped")
```

This fixture can live at the top of the test file (not conftest.py) to avoid polluting other tests.
  </action>
  <verify>
    <automated>pytest fee_crawler/tests/test_session_pool.py -x -v</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "async def get_session_pool" fee_crawler/agent_tools/pool.py` returns exactly 1 match
    - `grep -n "DATABASE_URL_SESSION" fee_crawler/agent_tools/pool.py` returns at least 2 matches (env read + error message)
    - `grep -n "statement_cache_size" fee_crawler/agent_tools/pool.py` returns 2 matches (get_pool has it set to 0; get_session_pool does NOT set it to 0 — session mode supports prepared statements)
    - `pytest fee_crawler/tests/test_session_pool.py::test_missing_env_raises -x -v` exits 0 (does not require a DB — must pass unconditionally)
    - `pytest fee_crawler/tests/test_session_pool.py -x -v` exits 0 (other tests may skip cleanly when DATABASE_URL_SESSION_TEST not set; no errors)
    - `get_pool()` behavior unchanged: `grep -n "statement_cache_size=0" fee_crawler/agent_tools/pool.py` still returns the original 2 lines from existing `get_pool()` and `open_pool_from_dsn()`
  </acceptance_criteria>
  <done>Session pool helper added, pytest green including the listen/notify roundtrip when env set; transaction-mode pool untouched.</done>
</task>

<task type="auto">
  <name>Task 2: Document DATABASE_URL_SESSION in CLAUDE.md</name>
  <files>CLAUDE.md</files>
  <read_first>
    - CLAUDE.md (find the Configuration section under Technology Stack — contains existing `DATABASE_URL`, `DB_PATH`, `NEXT_PUBLIC_SUPABASE_URL` entries)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Risks R2 (document why this is required)
  </read_first>
  <action>
In `CLAUDE.md` under the Configuration section, insert a new bullet immediately after the existing `- Database: `DATABASE_URL` (Postgres), `DB_PATH` (legacy SQLite)` line:

```
- Session-mode DB: `DATABASE_URL_SESSION` (Supabase session pooler, port 5432) — required for Phase 62b LISTEN/NOTIFY agent messaging. Transaction-mode pool (port 6543) does NOT support LISTEN registrations (research §Pitfall 2).
```

If that exact `- Database: ...` line is not found, add the new bullet at the end of the first bullet group under "## Configuration" heading within the Technology Stack section.

Do not modify any other line in CLAUDE.md.
  </action>
  <verify>
    <automated>grep -n "DATABASE_URL_SESSION" CLAUDE.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "DATABASE_URL_SESSION" CLAUDE.md` returns at least 1
    - The sentence mentions "port 5432" and "LISTEN/NOTIFY"
    - No other sections of CLAUDE.md modified (verify via `git diff CLAUDE.md` showing only additions)
  </acceptance_criteria>
  <done>CLAUDE.md documents the new env var in the Configuration section.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Python runtime ← env var `DATABASE_URL_SESSION` | New secret; must be kept server-side only |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-62B-02-01 | Information Disclosure | DATABASE_URL_SESSION leaks via client bundle | mitigate | `.env.example` and CLAUDE.md note this as server-only; Next.js would refuse the var since it lacks `NEXT_PUBLIC_` prefix; fee_crawler is Python-only, no bundle exposure. |
| T-62B-02-02 | Denial of Service | Listener pool exhaustion (max_size=3) blocks messaging | accept | Listeners are long-lived; 3 is sufficient for listener + 2 publisher sessions during Phase 62b. Can widen to 10 in Phase 65 when Atlas scales. |
</threat_model>

<verification>
- `get_session_pool()` function exists in pool.py with correct body
- `pytest fee_crawler/tests/test_session_pool.py -x -v` exits 0 (no errors; tests may skip when DATABASE_URL_SESSION_TEST not set in local run)
- CLAUDE.md mentions DATABASE_URL_SESSION
</verification>

<success_criteria>
- [ ] Function added, tests green
- [ ] Existing `get_pool()` behavior preserved
- [ ] CLAUDE.md updated
</success_criteria>

<output>
After completion, create `.planning/phases/62B-agent-foundation-runtime-layer/62B-02-SUMMARY.md` noting any configuration surprises (e.g., whether staging Supabase session-mode endpoint was discovered via docs or requires operator-provided DSN).
</output>
