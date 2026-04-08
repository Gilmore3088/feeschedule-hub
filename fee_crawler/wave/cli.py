"""
CLI command handlers for the wave orchestrator subcommand.

Commands:
  python -m fee_crawler wave run [--states WY,MT,TX] [--wave-size N]
  python -m fee_crawler wave recommend [--wave-size N]
  python -m fee_crawler wave resume <wave_id>

Connection pattern mirrors state_agent.py: DATABASE_URL from environment.
"""
from __future__ import annotations

import argparse
import logging
import os

import psycopg2
import psycopg2.extras

from fee_crawler.wave.models import ensure_tables
from fee_crawler.wave.orchestrator import run_campaign, run_wave, resume_wave
from fee_crawler.wave.recommend import recommend_states, print_recommendations

log = logging.getLogger(__name__)

_LOG_FORMAT = "%(asctime)s %(name)s %(levelname)s %(message)s"


def _connect():
    """Open a psycopg2 connection using DATABASE_URL from environment."""
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def cmd_wave_run(args: argparse.Namespace) -> None:
    """Launch a wave campaign.

    If --states is provided, run exactly those states as a single wave.
    Otherwise, run_campaign() selects all states ranked by coverage gap (D-02).
    """
    logging.basicConfig(level=logging.INFO, format=_LOG_FORMAT)
    conn = _connect()
    try:
        ensure_tables(conn)
        if args.states:
            state_list = [s.strip().upper() for s in args.states.split(",") if s.strip()]
            log.info("Running wave for explicit states: %s", ", ".join(state_list))
            wave_id = run_wave(conn, state_list, wave_size=args.wave_size)
            print(f"Wave complete. wave_run_id={wave_id}")
        else:
            log.info("Running full campaign (wave_size=%d)", args.wave_size)
            wave_ids = run_campaign(conn, wave_size=args.wave_size)
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
    """Resume an interrupted wave, skipping already-complete states."""
    logging.basicConfig(level=logging.INFO, format=_LOG_FORMAT)
    conn = _connect()
    try:
        ensure_tables(conn)
        log.info("Resuming wave_run_id=%d", args.wave_id)
        resume_wave(conn, wave_run_id=args.wave_id)
        print(f"Resume complete. wave_run_id={args.wave_id}")
    finally:
        conn.close()
