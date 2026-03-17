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
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from fee_crawler.config import Config
from fee_crawler.db import Database


@dataclass
class IngestStage:
    name: str
    cadence: str
    module: str
    kwargs: dict[str, Any] = field(default_factory=dict)


def _current_year() -> int:
    return datetime.now().year


STAGES: list[IngestStage] = [
    IngestStage("ofr",           "daily",     "fee_crawler.commands.ingest_ofr",           {"start_date": "2020-01-01"}),
    IngestStage("nyfed",         "daily",     "fee_crawler.commands.ingest_nyfed"),
    IngestStage("fred",          "weekly",    "fee_crawler.commands.ingest_fred"),
    IngestStage("bls",           "weekly",    "fee_crawler.commands.ingest_bls"),
    IngestStage("cfpb",          "weekly",    "fee_crawler.commands.ingest_cfpb"),
    IngestStage("fed-content",   "weekly",    "fee_crawler.commands.ingest_fed_content"),
    IngestStage("fdic",          "quarterly", "fee_crawler.commands.ingest_fdic",           {"quarters": 2}),
    IngestStage("ncua",          "quarterly", "fee_crawler.commands.ingest_ncua"),
    IngestStage("beige-book",    "annual",    "fee_crawler.commands.ingest_beige_book"),
    IngestStage("sod",           "annual",    "fee_crawler.commands.ingest_sod"),
    IngestStage("census-acs",    "annual",    "fee_crawler.commands.ingest_census_acs",     {"year": 2022}),
    IngestStage("census-tracts", "annual",    "fee_crawler.commands.ingest_census_tracts",  {"year": 2022}),
]


def _run_stage(stage: IngestStage, db: Database, config: Config) -> bool:
    """Run a single ingestion stage. Returns True on success."""
    import importlib
    try:
        mod = importlib.import_module(stage.module)
        # Build kwargs: some stages need dynamic values
        kwargs = dict(stage.kwargs)
        if stage.name == "cfpb":
            year = _current_year()
            kwargs["years"] = [str(year - 1), str(year)]
        elif stage.name == "sod" and "year" not in kwargs:
            kwargs["year"] = _current_year()

        mod.run(db, config, **kwargs)
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
        stages = [s for s in STAGES if s.name == only]
        if not stages:
            print(f"Unknown stage: {only}")
            print(f"Available: {', '.join(s.name for s in STAGES)}")
            return {}
    elif cadence:
        stages = [s for s in STAGES if s.cadence == cadence]
    else:
        stages = STAGES

    print(f"=== Data Refresh: {len(stages)} sources ===\n")
    run_start = time.monotonic()
    results: dict[str, dict] = {}

    for stage in stages:
        print(f"\n--- {stage.name} ({stage.cadence}) ---")
        stage_start = time.monotonic()
        success = _run_stage(stage, db, config)
        elapsed = round(time.monotonic() - stage_start, 1)
        results[stage.name] = {
            "status": "success" if success else "failed",
            "cadence": stage.cadence,
            "elapsed_s": elapsed,
        }
        print(f"  [{stage.name}] {'done' if success else 'FAILED'} ({elapsed}s)")

    total_elapsed = round(time.monotonic() - run_start, 1)

    succeeded = sum(1 for r in results.values() if r["status"] == "success")
    failed = sum(1 for r in results.values() if r["status"] == "failed")

    print(f"\n=== Refresh Complete ({total_elapsed}s) ===")
    print(f"  Succeeded: {succeeded} | Failed: {failed}")

    for name, r in results.items():
        icon = "ok" if r["status"] == "success" else "FAIL"
        print(f"  {icon:>4s}  {name:<20s} {r['elapsed_s']:>6.1f}s  ({r['cadence']})")

    return {"stages": results, "total_elapsed_s": total_elapsed}
