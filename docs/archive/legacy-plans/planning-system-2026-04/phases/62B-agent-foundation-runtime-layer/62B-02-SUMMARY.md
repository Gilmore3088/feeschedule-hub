---
phase: 62B
plan: 02
subsystem: agent_tools/pool
tags: [asyncpg, listen-notify, session-mode, supabase, pool]
requires: [fee_crawler/agent_tools/pool.py::get_pool, asyncpg.create_pool]
provides:
  - "fee_crawler.agent_tools.pool.get_session_pool — session-mode asyncpg pool for LISTEN/NOTIFY"
  - "fee_crawler.agent_tools.pool.close_session_pool — test teardown helper"
  - "DATABASE_URL_SESSION / DATABASE_URL_SESSION_TEST env contract"
affects:
  - "Plan 62B-05 messaging runtime — can now import get_session_pool instead of opening raw asyncpg connections"
tech_stack:
  added: []
  patterns:
    - "Two-pool topology: transaction pool (port 6543, statement_cache_size=0, max=10) for writes; session pool (port 5432, default cache, max=3) for LISTEN/NOTIFY"
    - "Shared _init_connection jsonb codec across both pools — one registration point"
key_files:
  created:
    - fee_crawler/tests/test_session_pool.py
  modified:
    - fee_crawler/agent_tools/pool.py
    - CLAUDE.md
decisions:
  - "Keep existing get_pool() fully unchanged (no refactor to share code) — session pool has different sizing, different cache semantics, different application_name, so a second function is cleaner than branching inside get_pool()."
  - "Both DATABASE_URL_SESSION and DATABASE_URL_SESSION_TEST are accepted (env cascade identical to get_pool). This keeps the conftest.py convention consistent and makes local + CI wiring symmetric."
  - "Do NOT set statement_cache_size=0 on the session pool — that flag is a transaction-pooler workaround. Session mode (port 5432) supports prepared statements natively and performance improves with the default cache."
  - "Integration tests skip when DATABASE_URL_SESSION[_TEST] is unset, but CLAUDE.md records the CI contract requiring the var so they never silently skip in CI."
metrics:
  duration_sec: 158
  tasks_completed: 2
  files_modified: 3
  tests_added: 5
  commits: 3
  completed_at: "2026-04-17T06:09:45Z"
---

# Phase 62B Plan 02: Session-Mode Pool for LISTEN/NOTIFY Summary

**One-liner:** Added `get_session_pool()` alongside the existing transaction-mode `get_pool()`; new pool reads `DATABASE_URL_SESSION` (port 5432, session-mode Supabase pooler) so Phase 62B-05 messaging can register persistent LISTEN/NOTIFY subscriptions that survive Supavisor connection multiplexing.

## What Was Built

| Task | Result | Commit |
|------|--------|--------|
| 1 — Add `get_session_pool()` + `close_session_pool()` helpers and TDD tests | RED → GREEN. 5 tests (1 unconditional, 4 integration-skip-when-DSN-missing); all pass / skip cleanly. | `2af7c7a` (RED), `cdb0d1f` (GREEN) |
| 2 — Document `DATABASE_URL_SESSION` in CLAUDE.md | Single-line addition under Configuration, immediately after the existing `DATABASE_URL` line. Records CI contract for `DATABASE_URL_SESSION_TEST`. | `b88dd31` |

## How It Works

```python
# fee_crawler/agent_tools/pool.py
_session_pool: Optional[asyncpg.Pool] = None

async def get_session_pool() -> asyncpg.Pool:
    """Session-mode pool for LISTEN/NOTIFY only. Writes still go through get_pool()."""
    global _session_pool
    if _session_pool is None:
        dsn = os.environ.get("DATABASE_URL_SESSION") or os.environ.get("DATABASE_URL_SESSION_TEST")
        if not dsn:
            raise RuntimeError("DATABASE_URL_SESSION ... must be set ...")
        _session_pool = await asyncpg.create_pool(
            dsn=dsn,
            min_size=1,
            max_size=3,                              # listeners are long-lived, few needed
            max_inactive_connection_lifetime=0,      # hold forever
            command_timeout=None,                    # don't kill long LISTEN waits
            server_settings={"application_name": "bfi-agent-messaging"},
            init=_init_connection,                   # shared jsonb codec
        )
    return _session_pool
```

**Contrast with `get_pool()`:**

| Setting | `get_pool()` (txn) | `get_session_pool()` (session) |
|---------|-------------------|-------------------------------|
| DSN env | `DATABASE_URL` / `DATABASE_URL_TEST` | `DATABASE_URL_SESSION` / `DATABASE_URL_SESSION_TEST` |
| Port | 6543 (Supavisor txn) | 5432 (Supavisor session) |
| `statement_cache_size` | `0` (Supavisor incompat) | default (session mode supports prepared stmts) |
| `max_size` | 10 | 3 |
| `max_inactive_connection_lifetime` | 60 | 0 (hold listeners forever) |
| `command_timeout` | 30 | None (LISTEN is a long wait) |
| `application_name` | `bfi-agent-tool` | `bfi-agent-messaging` |
| jsonb codec | shared `_init_connection` | shared `_init_connection` |

## Test Coverage

`fee_crawler/tests/test_session_pool.py` — 5 tests:

1. **`test_missing_env_raises`** — **Unconditional.** No DB required. Pops both env vars, asserts `RuntimeError` with message matching `DATABASE_URL_SESSION`. Guards against silent mis-config.
2. **`test_session_pool_singleton`** — Integration. Two calls return same pool object.
3. **`test_listen_notify_roundtrip`** — Integration. Opens listener, publishes `pg_notify`, asserts callback fires within 5s, payload matches.
4. **`test_pools_independent`** — Integration. Closing txn pool does not close session pool (and vice versa).
5. **`test_jsonb_codec_registered`** — Integration. `SELECT jsonb_build_object('k','v')` round-trips as a Python `dict`.

File-local `session_pool_available` fixture skips integration tests when `DATABASE_URL_SESSION[_TEST]` is unset. **CI contract (per CLAUDE.md):** `DATABASE_URL_SESSION_TEST` MUST be set so these tests fail loudly rather than silently green.

## Acceptance Criteria

- [x] `grep -c "async def get_session_pool" fee_crawler/agent_tools/pool.py` → `1`
- [x] `grep -c "DATABASE_URL_SESSION" fee_crawler/agent_tools/pool.py` → `5` (well above the required ≥2)
- [x] `grep -c "^\s*statement_cache_size=0," fee_crawler/agent_tools/pool.py` → `2` (the two original assignment lines in `get_pool` and `open_pool_from_dsn` are preserved; `get_session_pool` does **not** add a third)
- [x] `pytest fee_crawler/tests/test_session_pool.py::test_missing_env_raises -x -v` exits 0 — unconditional, no DB required
- [x] `pytest fee_crawler/tests/test_session_pool.py -x -v` exits 0 — `1 passed, 4 skipped` when no DB wired locally
- [x] `get_pool()` behavior unchanged — both original `statement_cache_size=0` assignment sites preserved (lines 38, 143)
- [x] CLAUDE.md mentions `DATABASE_URL_SESSION`, `port 5432`, and `LISTEN/NOTIFY`
- [x] CLAUDE.md documents the `DATABASE_URL_SESSION_TEST` CI contract
- [x] CLAUDE.md `git diff` shows only a single-line addition

## Configuration Surprises

**None.** The plan flagged that the summary should note whether the staging Supabase session-mode endpoint was discovered via docs or needed operator-provided DSN. Outcome:

- Port 5432 session-mode endpoint is documented behavior — research §Mechanics 2 (lines 861-928) and §Pitfall 2 (lines 316-322) already captured the exact DSN shape (same host/credentials as the transaction pooler but port 5432 instead of 6543). No new doc hunt was required.
- Integration tests remain skipped in local execution until the operator provides a value for `DATABASE_URL_SESSION_TEST`. The CLAUDE.md contract promises that value in CI, so we will learn of any auth / network gotchas the first time CI exercises the session tests — not during this plan.

## Deviations from Plan

**None — plan executed exactly as written.**

The plan's test body was slightly expanded with `close_session_pool()` calls around each integration test to guarantee a clean slate even if test ordering changes (pytest sometimes reorders). This matches the pattern already used in the unconditional test and is purely defensive. No new behavior, no new assertions.

## Threat Flags

None. The threat model covered the two obvious issues (env var leak → mitigated by server-side-only, no `NEXT_PUBLIC_` prefix; listener pool exhaustion → accepted per T-62B-02-02). No new attack surface introduced.

## Self-Check: PASSED

- Files created:
  - `fee_crawler/tests/test_session_pool.py` — FOUND
- Files modified:
  - `fee_crawler/agent_tools/pool.py` — FOUND (53 insertions)
  - `CLAUDE.md` — FOUND (1 insertion)
- Commits (all present in `git log`):
  - `2af7c7a` — test(62B-02): add failing tests for session-mode asyncpg pool
  - `cdb0d1f` — feat(62B-02): add get_session_pool for LISTEN/NOTIFY session mode
  - `b88dd31` — docs(62B-02): document DATABASE_URL_SESSION env var
- Verification commands re-run and confirmed green:
  - `grep -c "async def get_session_pool" pool.py` → `1`
  - `pytest fee_crawler/tests/test_session_pool.py -x` → `1 passed, 4 skipped`
  - All imports clean

## Handoff to Plan 62B-05

Plan 62B-05 (messaging runtime) should:

1. Import `get_session_pool` from `fee_crawler.agent_tools.pool` rather than opening raw `asyncpg.connect(dsn)` calls.
2. Rely on the shared `_init_connection` for JSONB codec (do not re-register).
3. Keep `add_listener` callbacks fast — the callback connection is exactly one of the 3 session-pool slots; blocking it blocks further notifications on that channel.
4. Treat `DATABASE_URL_SESSION` as required (raise at module import or at startup in Modal worker).
