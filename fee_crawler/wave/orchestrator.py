"""
Wave orchestrator engine: sequential state-agent execution with campaign management.

Enforces MAX_CONCURRENT_STATES=1 (WAVE-03 cron slot budget compliance):
  - The wave orchestrator runs via CLI, not a new Modal cron slot.
  - States execute one at a time in a synchronous loop.
  - This maximises reliability for unattended multi-hour runs (D-01).

Iterative deepening (Phase 20-02):
  - Each state runs up to DEFAULT_MAX_PASSES passes automatically.
  - Pass 1 → TIER1 (fast), Pass 2 → TIER2 (medium), Pass 3+ → TIER3 (exhaustive).
  - Early stop fires only after minimum 3 passes AND coverage >= EARLY_STOP_COVERAGE_PCT.
  - Resume restarts from last_completed_pass + 1, not pass 1.

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
from fee_crawler.agents.strategy import (
    tier_for_pass,
    DEFAULT_MAX_PASSES,
    EARLY_STOP_COVERAGE_PCT,
)
from fee_crawler.wave.models import (
    ensure_tables,
    create_wave_run,
    update_wave_state,
    update_wave_state_pass,
    get_last_completed_pass,
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

# T-20-04: CLI validates max_passes is in [1, MAX_PASSES_LIMIT] to prevent DoS.
MAX_PASSES_LIMIT = 10


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _get_coverage_pct(conn, state_code: str) -> float:
    """Return coverage percentage for a state from crawl_targets.

    Coverage = institutions with a discovered fee_schedule_url / total active.
    Returns 0.0 when the table is empty or no active targets exist.
    """
    cur = conn.cursor()
    cur.execute(
        """SELECT
             COUNT(*) FILTER (WHERE fee_schedule_url IS NOT NULL) * 100.0
             / NULLIF(COUNT(*), 0) AS coverage_pct
           FROM crawl_targets
           WHERE state_code = %s AND status = 'active'""",
        (state_code,),
    )
    row = cur.fetchone()
    if row is None:
        return 0.0
    # Handle both dict cursor (RealDictCursor) and tuple cursor
    if isinstance(row, tuple):
        val = row[0]
    else:
        val = row.get("coverage_pct") if hasattr(row, "get") else row[list(row.keys())[0]]
    return float(val or 0.0)


def _run_single_state(
    conn,
    wave_run_id: int,
    state_code: str,
    max_passes: int = DEFAULT_MAX_PASSES,
    start_pass: int = 1,
) -> dict | None:
    """Run one state agent through up to max_passes with escalating strategies.

    Each pass records its own agent_runs row with pass_number and strategy.
    update_wave_state_pass() is called after each pass for resume support.

    Early stop: fires only after >= 3 passes AND coverage >= EARLY_STOP_COVERAGE_PCT.
    This enforces ITER-01's minimum 3-pass requirement even for high-coverage states.

    Resume: start_pass > 1 skips already-completed passes. This allows resume_wave()
    to restart from exactly where the previous run left off.

    Returns the last successful pass result dict, or None if all passes failed.
    Re-raises HARD_FAILURES — callers must handle or let them propagate.

    T-20-04: max_passes is validated at CLI entry point (1–10 range).
    """
    log.info(
        "Wave #%d: starting state %s (passes %d–%d, strategy tier1→tier%d)",
        wave_run_id,
        state_code,
        start_pass,
        max_passes,
        min(max_passes, 3),
    )
    update_wave_state(conn, wave_run_id, state_code, status="running")
    t0 = time.monotonic()

    last_result: dict | None = None
    last_run_id: int | None = None

    for pass_num in range(start_pass, max_passes + 1):
        strategy = tier_for_pass(pass_num)
        log.info(
            "Wave #%d: %s pass %d/%d (strategy=%s)",
            wave_run_id,
            state_code,
            pass_num,
            max_passes,
            strategy.name,
        )

        try:
            result = run_state_agent(state_code, pass_number=pass_num, strategy=strategy)
        except HARD_FAILURES:
            # Hard failures propagate — campaign must stop immediately
            raise
        except Exception as exc:
            log.error(
                "Wave #%d: %s pass %d FAILED — %s: %s",
                wave_run_id,
                state_code,
                pass_num,
                type(exc).__name__,
                exc,
            )
            # Soft failure: log it, continue to next pass
            continue

        run_id = result.get("run_id")
        last_result = result
        last_run_id = run_id

        # Record pass completion for resume support
        update_wave_state_pass(
            conn,
            wave_run_id,
            state_code,
            last_completed_pass=pass_num,
            agent_run_id=run_id,
        )

        coverage = _get_coverage_pct(conn, state_code)
        log.info(
            "Pass %d/%d for %s: strategy=%s, coverage=%.1f%%",
            pass_num,
            max_passes,
            state_code,
            strategy.name,
            coverage,
        )

        # Early stop: minimum 3 passes enforced (ITER-01)
        if pass_num >= 3 and coverage >= EARLY_STOP_COVERAGE_PCT:
            log.info(
                "Wave #%d: %s early stop at pass %d — coverage %.1f%% >= %.0f%%",
                wave_run_id,
                state_code,
                pass_num,
                coverage,
                EARLY_STOP_COVERAGE_PCT,
            )
            break

    elapsed = time.monotonic() - t0

    if last_result is not None:
        log.info(
            "Wave #%d: %s complete in %.0fs across %d passes — "
            "discovered=%d extracted=%d failed=%d",
            wave_run_id,
            state_code,
            elapsed,
            max_passes - start_pass + 1,
            last_result.get("discovered", 0),
            last_result.get("extracted", 0),
            last_result.get("failed", 0),
        )
        update_wave_state(
            conn,
            wave_run_id,
            state_code,
            status="complete",
            agent_run_id=last_run_id,
        )
        return last_result
    else:
        log.error(
            "Wave #%d: %s FAILED after %.0fs — all %d passes raised exceptions",
            wave_run_id,
            state_code,
            elapsed,
            max_passes - start_pass + 1,
        )
        update_wave_state(
            conn,
            wave_run_id,
            state_code,
            status="failed",
            error="All passes failed",
        )
        return None


# ─── Public API ───────────────────────────────────────────────────────────────

def run_wave(
    conn,
    states: list[str],
    wave_size: int | None = None,
    campaign_id: str | None = None,
    max_passes: int = DEFAULT_MAX_PASSES,
) -> int:
    """Create and execute a wave of states SEQUENTIALLY with iterative deepening.

    Per D-01: sequential execution maximises reliability for unattended runs.
    Per WAVE-03: MAX_CONCURRENT_STATES=1 is inherent in the sequential loop.
    Per ITER-01: each state runs at least 3 passes (max_passes default = 3).

    Args:
        conn: psycopg2 connection (caller owns lifecycle).
        states: ordered list of 2-char state codes to process.
        wave_size: recorded wave_size in DB (defaults to len(states)).
        campaign_id: optional campaign grouping identifier.
        max_passes: number of iterative passes per state (default 3, max 10).

    Returns:
        wave_run_id (int) for use by caller or resume_wave().

    Raises:
        HARD_FAILURES: if DB connection is lost or critical env var is missing.
    """
    ensure_tables(conn)
    effective_wave_size = wave_size if wave_size is not None else len(states)
    wave = create_wave_run(conn, states, effective_wave_size, campaign_id)

    log.info(
        "Wave #%d started: %d states, campaign=%s, max_passes=%d",
        wave.id,
        len(states),
        campaign_id or "none",
        max_passes,
    )
    update_wave_run(conn, wave.id, status="running")

    completed = 0
    failed = 0

    try:
        for state_code in states:
            result = _run_single_state(
                conn, wave.id, state_code, max_passes=max_passes
            )
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


def resume_wave(
    conn,
    wave_run_id: int,
    max_passes: int = DEFAULT_MAX_PASSES,
) -> int:
    """Resume an interrupted wave — restarts each state from its last completed pass.

    Per WAVE-04: crash recovery skips completed states and runs only remaining ones.
    Per ITER-02: resume starts from last_completed_pass + 1, not pass 1.

    Args:
        conn: psycopg2 connection.
        wave_run_id: ID of the wave_runs row to resume.
        max_passes: number of iterative passes per state (default 3, max 10).

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
            last_pass = get_last_completed_pass(conn, wave_run_id, state_code)
            start_pass = last_pass + 1
            log.info(
                "Wave #%d: %s resuming from pass %d (last completed: %d)",
                wave_run_id,
                state_code,
                start_pass,
                last_pass,
            )
            result = _run_single_state(
                conn,
                wave_run_id,
                state_code,
                max_passes=max_passes,
                start_pass=start_pass,
            )
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
    max_passes: int = DEFAULT_MAX_PASSES,
) -> list[int]:
    """Fire-and-forget campaign: run all states sequentially across multiple waves.

    Per D-03: auto-advances through all waves without human intervention.
    Per D-04: hard failures stop the campaign; soft per-state failures are skipped.
    Per ITER-01: each state runs at least 3 passes via run_wave().

    Args:
        conn: psycopg2 connection.
        wave_size: number of states per wave chunk.
        states: explicit state codes to use. If None, calls recommend_states()
                to get all states ranked by coverage gap (lowest first, per D-02).
        max_passes: number of iterative passes per state (default 3, max 10).

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
        "Campaign %s: %d states across %d waves (wave_size=%d, max_passes=%d)",
        campaign_id,
        len(state_codes),
        len(chunks),
        wave_size,
        max_passes,
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
            wave_id = run_wave(
                conn,
                chunk,
                wave_size=wave_size,
                campaign_id=campaign_id,
                max_passes=max_passes,
            )
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
