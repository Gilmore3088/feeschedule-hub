"""
CLI command handlers for the wave orchestrator subcommand.

Commands:
  python -m fee_crawler wave run [--states WY,MT,TX] [--wave-size N] [--max-passes N]
  python -m fee_crawler wave recommend [--wave-size N]
  python -m fee_crawler wave resume <wave_id> [--max-passes N]

Connection pattern mirrors state_agent.py: DATABASE_URL from environment.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys

import psycopg2
import psycopg2.extras

from fee_crawler.wave.models import ensure_tables
from fee_crawler.wave.orchestrator import (
    run_campaign,
    run_wave,
    resume_wave,
    MAX_PASSES_LIMIT,
)
from fee_crawler.wave.recommend import recommend_states, print_recommendations

log = logging.getLogger(__name__)

_LOG_FORMAT = "%(asctime)s %(name)s %(levelname)s %(message)s"

_DEFAULT_MAX_PASSES = 3


def _connect():
    """Open a psycopg2 connection using DATABASE_URL from environment."""
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def _validate_max_passes(value: int) -> int:
    """Validate --max-passes is in [1, MAX_PASSES_LIMIT] (T-20-04 DoS mitigation)."""
    if not (1 <= value <= MAX_PASSES_LIMIT):
        print(
            f"Error: --max-passes must be between 1 and {MAX_PASSES_LIMIT} "
            f"(got {value}). Values above {MAX_PASSES_LIMIT} waste compute.",
            file=sys.stderr,
        )
        sys.exit(1)
    return value


def cmd_wave_run(args: argparse.Namespace) -> None:
    """Launch a wave campaign with iterative deepening (3 passes per state by default).

    If --states is provided, run exactly those states as a single wave.
    Otherwise, run_campaign() selects all states ranked by coverage gap (D-02).
    """
    logging.basicConfig(level=logging.INFO, format=_LOG_FORMAT)
    max_passes = _validate_max_passes(getattr(args, "max_passes", _DEFAULT_MAX_PASSES))
    conn = _connect()
    try:
        ensure_tables(conn)
        if args.states:
            state_list = [s.strip().upper() for s in args.states.split(",") if s.strip()]
            log.info(
                "Running wave for explicit states: %s (max_passes=%d)",
                ", ".join(state_list),
                max_passes,
            )
            wave_id = run_wave(conn, state_list, wave_size=args.wave_size, max_passes=max_passes)
            print(f"Wave complete. wave_run_id={wave_id}")
        else:
            log.info("Running full campaign (wave_size=%d, max_passes=%d)", args.wave_size, max_passes)
            wave_ids = run_campaign(conn, wave_size=args.wave_size, max_passes=max_passes)
            print(f"Campaign complete. wave_ids={wave_ids}")
    finally:
        conn.close()


def cmd_wave_recommend(args: argparse.Namespace) -> None:
    """Print ranked state list by coverage gap for operator review."""
    conn = _connect()
    try:
        ensure_tables(conn)
        wave_size = args.wave_size or 8
        states = recommend_states(conn, wave_size=50)
        print_recommendations(states, wave_size=wave_size)
    finally:
        conn.close()


def cmd_wave_resume(args: argparse.Namespace) -> None:
    """Resume an interrupted wave, restarting each state from its last completed pass."""
    logging.basicConfig(level=logging.INFO, format=_LOG_FORMAT)
    max_passes = _validate_max_passes(getattr(args, "max_passes", _DEFAULT_MAX_PASSES))
    conn = _connect()
    try:
        ensure_tables(conn)
        log.info("Resuming wave_run_id=%d (max_passes=%d)", args.wave_id, max_passes)
        resume_wave(conn, wave_run_id=args.wave_id, max_passes=max_passes)
        print(f"Resume complete. wave_run_id={args.wave_id}")
    finally:
        conn.close()


def cmd_wave_report(args: argparse.Namespace) -> None:
    """Generate and print a Markdown summary report for a completed wave.

    Prints to stdout. If --output is given, also writes to that file path.
    Usable for any past wave: python -m fee_crawler wave report <wave_id>
    """
    conn = _connect()
    try:
        ensure_tables(conn)
        from fee_crawler.wave.reporter import print_wave_report
        print_wave_report(conn, args.wave_id, output_path=getattr(args, "output", None))
    finally:
        conn.close()
