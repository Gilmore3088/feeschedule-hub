"""
Wave persistence models: DB schema helpers and CRUD operations.

All functions take a psycopg2 connection as first argument and never create
connections internally — callers own the connection lifecycle.

Parameterized queries are used exclusively (no f-string SQL) per T-19-01.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


# ─── Dataclasses ─────────────────────────────────────────────────────────────

@dataclass
class WaveRun:
    id: int
    states: list[str]
    wave_size: int
    total_states: int
    completed_states: int = 0
    failed_states: int = 0
    status: str = "pending"
    created_at: datetime | None = None
    completed_at: datetime | None = None
    campaign_id: str | None = None


@dataclass
class WaveStateRun:
    id: int
    wave_run_id: int
    state_code: str
    status: str = "pending"
    agent_run_id: int | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error: str | None = None
    last_completed_pass: int = 0


# ─── Schema bootstrap ─────────────────────────────────────────────────────────

_CREATE_WAVE_RUNS = """
CREATE TABLE IF NOT EXISTS wave_runs (
  id               SERIAL PRIMARY KEY,
  states           TEXT[]      NOT NULL,
  wave_size        INTEGER     NOT NULL,
  total_states     INTEGER     NOT NULL,
  completed_states INTEGER     DEFAULT 0,
  failed_states    INTEGER     DEFAULT 0,
  status           TEXT        DEFAULT 'pending',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  campaign_id      TEXT
)
"""

_CREATE_WAVE_STATE_RUNS = """
CREATE TABLE IF NOT EXISTS wave_state_runs (
  id            SERIAL PRIMARY KEY,
  wave_run_id   INTEGER     NOT NULL REFERENCES wave_runs(id),
  state_code    TEXT        NOT NULL,
  status        TEXT        DEFAULT 'pending',
  agent_run_id  INTEGER,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  error         TEXT,
  UNIQUE(wave_run_id, state_code)
)
"""


def ensure_tables(conn) -> None:
    """Create wave tables if they don't exist (for envs where migration hasn't run).

    Also applies iterative deepening columns (20260408 migration) so both the
    migration and runtime bootstrap paths stay in sync.
    """
    cur = conn.cursor()
    cur.execute(_CREATE_WAVE_RUNS)
    cur.execute(_CREATE_WAVE_STATE_RUNS)
    # Phase 20-01: iterative deepening columns — safe to re-run (IF NOT EXISTS)
    cur.execute("ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS pass_number INTEGER DEFAULT 1")
    cur.execute("ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS strategy TEXT DEFAULT 'tier1'")
    cur.execute("ALTER TABLE wave_state_runs ADD COLUMN IF NOT EXISTS last_completed_pass INTEGER DEFAULT 0")
    conn.commit()


# ─── CRUD operations ──────────────────────────────────────────────────────────

def create_wave_run(
    conn,
    states: list[str],
    wave_size: int,
    campaign_id: str | None = None,
) -> WaveRun:
    """Insert a wave_runs row and one wave_state_runs row per state.

    Returns a WaveRun dataclass with the assigned id. Uses parameterized
    queries throughout (T-19-01).
    """
    cur = conn.cursor()

    cur.execute(
        """INSERT INTO wave_runs
           (states, wave_size, total_states, completed_states, failed_states,
            status, campaign_id)
           VALUES (%s, %s, %s, 0, 0, 'pending', %s)
           RETURNING id""",
        (states, wave_size, len(states), campaign_id),
    )
    wave_run_id = cur.fetchone()["id"]

    for state_code in states:
        cur.execute(
            """INSERT INTO wave_state_runs (wave_run_id, state_code, status)
               VALUES (%s, %s, 'pending')""",
            (wave_run_id, state_code),
        )

    conn.commit()

    return WaveRun(
        id=wave_run_id,
        states=states,
        wave_size=wave_size,
        total_states=len(states),
        completed_states=0,
        failed_states=0,
        status="pending",
        campaign_id=campaign_id,
    )


def update_wave_state(
    conn,
    wave_run_id: int,
    state_code: str,
    status: str,
    agent_run_id: int | None = None,
    error: str | None = None,
) -> None:
    """Update a wave_state_runs row status, agent_run_id, error, and timestamps.

    Sets started_at on first transition to 'running', completed_at when
    status is 'complete', 'failed', or 'skipped'.
    """
    from datetime import timezone

    now = datetime.now(timezone.utc)
    sets: list[str] = ["status = %s"]
    vals: list[Any] = [status]

    if status == "running":
        sets.append("started_at = %s")
        vals.append(now)

    if status in ("complete", "failed", "skipped"):
        sets.append("completed_at = %s")
        vals.append(now)

    if agent_run_id is not None:
        sets.append("agent_run_id = %s")
        vals.append(agent_run_id)

    if error is not None:
        sets.append("error = %s")
        vals.append(error)

    vals.extend([wave_run_id, state_code])

    cur = conn.cursor()
    cur.execute(
        f"UPDATE wave_state_runs SET {', '.join(sets)} WHERE wave_run_id = %s AND state_code = %s",
        vals,
    )
    conn.commit()


def update_wave_run(conn, wave_run_id: int, **kwargs) -> None:
    """Generic UPDATE wave_runs SET helper.

    Accepts keyword args corresponding to wave_runs columns. Uses the
    same pattern as _update_run in state_agent.py. Parameterized — no
    f-string interpolation of values (T-19-01). Column names are
    controlled by internal callers only (not user input).
    """
    if not kwargs:
        return
    sets = ", ".join(f"{k} = %s" for k in kwargs)
    vals = list(kwargs.values()) + [wave_run_id]
    conn.cursor().execute(
        f"UPDATE wave_runs SET {sets} WHERE id = %s",
        vals,
    )
    conn.commit()


def get_wave_run(conn, wave_run_id: int) -> WaveRun | None:
    """Return a WaveRun for the given id, or None if not found."""
    cur = conn.cursor()
    cur.execute(
        """SELECT id, states, wave_size, total_states, completed_states,
                  failed_states, status, created_at, completed_at, campaign_id
           FROM wave_runs
           WHERE id = %s""",
        (wave_run_id,),
    )
    row = cur.fetchone()
    if row is None:
        return None
    return _row_to_wave_run(row)


def get_incomplete_states(conn, wave_run_id: int) -> list[str]:
    """Return state_codes for states not yet complete or skipped."""
    cur = conn.cursor()
    cur.execute(
        """SELECT state_code FROM wave_state_runs
           WHERE wave_run_id = %s
             AND status NOT IN ('complete', 'skipped')
           ORDER BY id""",
        (wave_run_id,),
    )
    rows = cur.fetchall()
    return [r["state_code"] for r in rows]


def get_latest_wave(conn) -> WaveRun | None:
    """Return the most recently created WaveRun, or None if none exist."""
    cur = conn.cursor()
    cur.execute(
        """SELECT id, states, wave_size, total_states, completed_states,
                  failed_states, status, created_at, completed_at, campaign_id
           FROM wave_runs
           ORDER BY id DESC
           LIMIT 1""",
    )
    row = cur.fetchone()
    if row is None:
        return None
    return _row_to_wave_run(row)


def update_wave_state_pass(
    conn,
    wave_run_id: int,
    state_code: str,
    last_completed_pass: int,
    agent_run_id: int | None = None,
) -> None:
    """Update last_completed_pass (and optionally agent_run_id) on wave_state_runs.

    Called after each pass completes so resume_wave() can restart from pass N+1.
    Parameterized query per T-19-01.
    """
    sets: list[str] = ["last_completed_pass = %s"]
    vals: list[Any] = [last_completed_pass]

    if agent_run_id is not None:
        sets.append("agent_run_id = %s")
        vals.append(agent_run_id)

    vals.extend([wave_run_id, state_code])

    cur = conn.cursor()
    cur.execute(
        f"UPDATE wave_state_runs SET {', '.join(sets)} WHERE wave_run_id = %s AND state_code = %s",
        vals,
    )
    conn.commit()


def get_last_completed_pass(conn, wave_run_id: int, state_code: str) -> int:
    """Return last_completed_pass for a given (wave_run_id, state_code), or 0 if not found.

    Used by resume_wave() to restart multi-pass iteration from the correct pass.
    """
    cur = conn.cursor()
    cur.execute(
        "SELECT last_completed_pass FROM wave_state_runs WHERE wave_run_id = %s AND state_code = %s",
        (wave_run_id, state_code),
    )
    row = cur.fetchone()
    if row is None:
        return 0
    return row["last_completed_pass"] or 0


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _row_to_wave_run(row: dict) -> WaveRun:
    return WaveRun(
        id=row["id"],
        states=list(row["states"]) if row["states"] else [],
        wave_size=row["wave_size"],
        total_states=row["total_states"],
        completed_states=row["completed_states"] or 0,
        failed_states=row["failed_states"] or 0,
        status=row["status"],
        created_at=row.get("created_at"),
        completed_at=row.get("completed_at"),
        campaign_id=row.get("campaign_id"),
    )
