"""
Wave orchestrator engine: sequential state-agent execution with campaign management.

Enforces MAX_CONCURRENT_STATES=1 (WAVE-03 cron slot budget compliance):
  - The wave orchestrator runs via CLI, not a new Modal cron slot.
  - States execute one at a time in a synchronous loop.
  - This maximises reliability for unattended multi-hour runs (D-01).

Hard failures (DB connection loss, missing API key) stop the campaign immediately.
Per-state soft failures are caught, logged, and skipped — the campaign continues.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

from fee_crawler.agents.state_agent import run_state_agent
from fee_crawler.wave.models import (
    ensure_tables,
    create_wave_run,
    update_wave_state,
    update_wave_run,
    get_wave_run,
    get_incomplete_states,
)
from fee_crawler.wave.recommend import recommend_states

log = logging.getLogger(__name__)

# Sequential execution: one state agent at a time.
# This is the cron slot budget enforcement mechanism (WAVE-03).
# Modal has 5 existing cron slots (all used). The wave orchestrator does NOT
# consume a cron slot — it runs via CLI and calls run_state_agent() directly
# as a Python function. Sequential execution means at most 1 state agent
# is active at any time, preventing resource contention.
MAX_CONCURRENT_STATES = 1

# Hard failure types that stop the entire campaign immediately.
# KeyboardInterrupt is not listed — Python propagates it automatically.
HARD_FAILURES = (
    psycopg2.OperationalError,
    psycopg2.InterfaceError,
    KeyError,
)


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _run_single_state(conn, wave_run_id: int, state_code: str) -> dict | None:
    """Run one state agent and record outcome in wave_state_runs.

    Returns the agent result dict on success, None on soft failure.
    Re-raises HARD_FAILURES — callers must handle or let them propagate.

    Timing: wall-clock seconds are logged for operator visibility.
    """
    log.info("Wave #%d: starting state %s", wave_run_id, state_code)
    update_wave_state(conn, wave_run_id, state_code, status="running")
    t0 = time.monotonic()

    try:
        result = run_state_agent(state_code)
        elapsed = time.monotonic() - t0
        log.info(
            "Wave #%d: %s complete in %.0fs — discovered=%d extracted=%d failed=%d",
            wave_run_id,
            state_code,
            elapsed,
            result.get("discovered", 0),
            result.get("extracted", 0),
            result.get("failed", 0),
        )
        update_wave_state(
            conn,
            wave_run_id,
            state_code,
            status="complete",
            agent_run_id=result.get("run_id"),
        )
        return result

    except HARD_FAILURES:
        # Hard failures propagate — campaign must stop
        raise

    except Exception as exc:
        elapsed = time.monotonic() - t0
        log.error(
            "Wave #%d: %s FAILED after %.0fs — %s: %s",
            wave_run_id,
            state_code,
            elapsed,
            type(exc).__name__,
            exc,
        )
        update_wave_state(
            conn,
            wave_run_id,
            state_code,
            status="failed",
            error=str(exc)[:500],
        )
        return None


# ─── Public API ───────────────────────────────────────────────────────────────

def run_wave(
    conn,
    states: list[str],
    wave_size: int | None = None,
    campaign_id: str | None = None,
) -> int:
    """Create and execute a wave of states SEQUENTIALLY.

    Per D-01: sequential execution maximises reliability for unattended runs.
    Per WAVE-03: MAX_CONCURRENT_STATES=1 is inherent in the sequential loop.

    Args:
        conn: psycopg2 connection (caller owns lifecycle).
        states: ordered list of 2-char state codes to process.
        wave_size: recorded wave_size in DB (defaults to len(states)).
        campaign_id: optional campaign grouping identifier.

    Returns:
        wave_run_id (int) for use by caller or resume_wave().

    Raises:
        HARD_FAILURES: if DB connection is lost or critical env var is missing.
    """
    ensure_tables(conn)
    effective_wave_size = wave_size if wave_size is not None else len(states)
    wave = create_wave_run(conn, states, effective_wave_size, campaign_id)

    log.info(
        "Wave #%d started: %d states, campaign=%s",
        wave.id,
        len(states),
        campaign_id or "none",
    )
    update_wave_run(conn, wave.id, status="running")

    completed = 0
    failed = 0

    try:
        for state_code in states:
            result = _run_single_state(conn, wave.id, state_code)
            if result is not None:
                completed += 1
            else:
                failed += 1
            update_wave_run(
                conn,
                wave.id,
                completed_states=completed,
                failed_states=failed,
            )

    except HARD_FAILURES:
        update_wave_run(conn, wave.id, status="failed")
        log.error("Wave #%d: hard failure — campaign stopped", wave.id)
        raise

    now = datetime.now(timezone.utc).isoformat()
    update_wave_run(conn, wave.id, status="complete", completed_at=now)
    log.info(
        "Wave #%d complete: %d/%d states succeeded, %d failed",
        wave.id,
        completed,
        len(states),
        failed,
    )
    return wave.id


def resume_wave(conn, wave_run_id: int) -> int:
    """Resume an interrupted wave — skips states already complete or skipped.

    Per WAVE-04: crash recovery skips completed states and runs only remaining ones.

    Args:
        conn: psycopg2 connection.
        wave_run_id: ID of the wave_runs row to resume.

    Returns:
        wave_run_id (same as input, for chaining).
    """
    incomplete = get_incomplete_states(conn, wave_run_id)

    if not incomplete:
        log.info("Wave #%d: all states already complete — nothing to resume", wave_run_id)
        return wave_run_id

    log.info(
        "Wave #%d: resuming with %d incomplete states: %s",
        wave_run_id,
        len(incomplete),
        ", ".join(incomplete),
    )
    update_wave_run(conn, wave_run_id, status="running")

    completed = 0
    failed = 0

    try:
        for state_code in incomplete:
            result = _run_single_state(conn, wave_run_id, state_code)
            if result is not None:
                completed += 1
            else:
                failed += 1
            update_wave_run(
                conn,
                wave_run_id,
                completed_states=completed,
                failed_states=failed,
            )

    except HARD_FAILURES:
        update_wave_run(conn, wave_run_id, status="failed")
        log.error("Wave #%d: hard failure during resume — campaign stopped", wave_run_id)
        raise

    now = datetime.now(timezone.utc).isoformat()
    update_wave_run(conn, wave_run_id, status="complete", completed_at=now)
    log.info(
        "Wave #%d resume complete: %d states succeeded, %d failed",
        wave_run_id,
        completed,
        failed,
    )
    return wave_run_id


def run_campaign(
    conn,
    wave_size: int = 8,
    states: list[str] | None = None,
) -> list[int]:
    """Fire-and-forget campaign: run all states sequentially across multiple waves.

    Per D-03: auto-advances through all waves without human intervention.
    Per D-04: hard failures stop the campaign; soft per-state failures are skipped.

    Args:
        conn: psycopg2 connection.
        wave_size: number of states per wave chunk.
        states: explicit state codes to use. If None, calls recommend_states()
                to get all states ranked by coverage gap (lowest first, per D-02).

    Returns:
        List of wave_run_ids in execution order.
    """
    t_campaign_start = time.monotonic()
    campaign_id = f"campaign-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"

    if states is None:
        # Auto-select: rank all states by coverage gap (lowest coverage first)
        all_coverage = recommend_states(conn, wave_size=50)
        state_codes = [sc.state_code for sc in all_coverage]
    else:
        state_codes = list(states)

    if not state_codes:
        log.info("Campaign %s: no states to run", campaign_id)
        return []

    # Split into wave-sized chunks
    chunks = [
        state_codes[i : i + wave_size]
        for i in range(0, len(state_codes), wave_size)
    ]

    log.info(
        "Campaign %s: %d states across %d waves (wave_size=%d)",
        campaign_id,
        len(state_codes),
        len(chunks),
        wave_size,
    )

    wave_ids: list[int] = []

    for wave_num, chunk in enumerate(chunks, start=1):
        log.info(
            "Campaign %s: starting wave %d/%d (%s)",
            campaign_id,
            wave_num,
            len(chunks),
            ", ".join(chunk),
        )
        try:
            wave_id = run_wave(conn, chunk, wave_size=wave_size, campaign_id=campaign_id)
            wave_ids.append(wave_id)
        except HARD_FAILURES:
            log.error(
                "Campaign %s: hard failure on wave %d — campaign stopped after %d waves",
                campaign_id,
                wave_num,
                len(wave_ids),
            )
            raise

    elapsed = time.monotonic() - t_campaign_start
    log.info(
        "Campaign %s complete: %d waves, %d total states, %.0fs elapsed",
        campaign_id,
        len(wave_ids),
        len(state_codes),
        elapsed,
    )
    return wave_ids
