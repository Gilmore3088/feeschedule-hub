"""Orchestrate all research data ingestion commands.

Runs each data source in dependency order with error isolation --
a failure in one source doesn't stop the rest.

Cadence tiers:
  daily:     OFR stress index, NY Fed rates
  weekly:    FRED macro, BLS CPI, CFPB complaints, Fed content
  quarterly: FDIC financials, NCUA financials
  annual:    SOD branches, Census ACS, Census tracts, Beige Book
"""

from __future__ import annotations

import time
from datetime import datetime

from fee_crawler.config import Config
from fee_crawler.db import Database

# Each stage: (name, callable, cadence)
# Ordered by dependency (census-tracts needs census-acs data)
STAGES: list[tuple[str, str]] = [
    ("ofr", "daily"),
    ("nyfed", "daily"),
    ("fred", "weekly"),
    ("bls", "weekly"),
    ("cfpb", "weekly"),
    ("fed-content", "weekly"),
    ("fdic", "quarterly"),
    ("ncua", "quarterly"),
    ("beige-book", "annual"),
    ("sod", "annual"),
    ("census-acs", "annual"),
    ("census-tracts", "annual"),
]


def _run_stage(name: str, db: Database, config: Config) -> bool:
    """Run a single ingestion stage. Returns True on success."""
    try:
        if name == "ofr":
            from fee_crawler.commands.ingest_ofr import run
            run(db, config, start_date="2020-01-01")

        elif name == "nyfed":
            from fee_crawler.commands.ingest_nyfed import run
            run(db, config)

        elif name == "fred":
            from fee_crawler.commands.ingest_fred import run
            run(db, config)

        elif name == "bls":
            from fee_crawler.commands.ingest_bls import run
            run(db, config)

        elif name == "cfpb":
            from fee_crawler.commands.ingest_cfpb import run
            current_year = str(datetime.now().year)
            run(db, config, years=[current_year])

        elif name == "fed-content":
            from fee_crawler.commands.ingest_fed_content import run
            run(db, config)

        elif name == "fdic":
            from fee_crawler.commands.ingest_fdic import run
            run(db, config, quarters=2)

        elif name == "ncua":
            from fee_crawler.commands.ingest_ncua import run
            run(db, config)

        elif name == "beige-book":
            from fee_crawler.commands.ingest_beige_book import run
            run(db, config)

        elif name == "sod":
            from fee_crawler.commands.ingest_sod import run
            run(db, config, year=datetime.now().year)

        elif name == "census-acs":
            from fee_crawler.commands.ingest_census_acs import run
            run(db, config, year=2022)

        elif name == "census-tracts":
            from fee_crawler.commands.ingest_census_tracts import run
            run(db, config, year=2022)

        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def run(
    db: Database,
    config: Config,
    *,
    cadence: str | None = None,
    only: str | None = None,
) -> dict:
    """Run data refresh for all or selected sources.

    Args:
        cadence: Filter by cadence tier (daily/weekly/quarterly/annual).
        only: Run a single named stage.
    """
    if only:
        stages = [(s, c) for s, c in STAGES if s == only]
        if not stages:
            print(f"Unknown stage: {only}")
            print(f"Available: {', '.join(s for s, _ in STAGES)}")
            return {}
    elif cadence:
        stages = [(s, c) for s, c in STAGES if c == cadence]
    else:
        stages = STAGES

    print(f"=== Data Refresh: {len(stages)} sources ===\n")
    run_start = time.monotonic()
    results: dict[str, dict] = {}

    for name, tier in stages:
        print(f"\n--- {name} ({tier}) ---")
        stage_start = time.monotonic()
        success = _run_stage(name, db, config)
        elapsed = round(time.monotonic() - stage_start, 1)
        results[name] = {
            "status": "success" if success else "failed",
            "cadence": tier,
            "elapsed_s": elapsed,
        }
        print(f"  [{name}] {'done' if success else 'FAILED'} ({elapsed}s)")

    total_elapsed = round(time.monotonic() - run_start, 1)

    # Summary
    succeeded = sum(1 for r in results.values() if r["status"] == "success")
    failed = sum(1 for r in results.values() if r["status"] == "failed")

    print(f"\n=== Refresh Complete ({total_elapsed}s) ===")
    print(f"  Succeeded: {succeeded} | Failed: {failed}")

    for name, r in results.items():
        icon = "ok" if r["status"] == "success" else "FAIL"
        print(f"  {icon:>4s}  {name:<20s} {r['elapsed_s']:>6.1f}s  ({r['cadence']})")

    return {"stages": results, "total_elapsed_s": total_elapsed}
