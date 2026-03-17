"""Pipeline executor: runs stages sequentially with resume support.

No DAG, no topological sort — the pipeline is linear.
A simple ordered list with a start index gives resume.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path

from fee_crawler.config import Config
from fee_crawler.db import Database

LOCK_FILE = Path("data/pipeline.lock")


@dataclass
class Stage:
    name: str
    phase: int
    command: str  # CLI command name to dispatch to


PIPELINE_STAGES = [
    # Phase 1: Discovery
    Stage("seed-enrich", phase=1, command="enrich"),
    Stage("discover",    phase=1, command="discover"),
    # Phase 2: Extraction
    Stage("crawl",       phase=2, command="crawl"),
    Stage("merge-fees",  phase=2, command="merge-fees"),
    # Phase 3: Hygiene
    Stage("categorize",  phase=3, command="categorize"),
    Stage("validate",    phase=3, command="validate"),
    Stage("auto-review", phase=3, command="auto-review"),
    # Phase 4: Publishing
    Stage("snapshot",    phase=4, command="snapshot"),
    Stage("publish",     phase=4, command="publish-index"),
]


def acquire_lock() -> bool:
    """Acquire PID-file lock. Returns True if acquired."""
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    if LOCK_FILE.exists():
        try:
            pid = int(LOCK_FILE.read_text().strip())
            os.kill(pid, 0)
            return False  # process still running
        except (ProcessLookupError, ValueError):
            pass  # stale lock
    LOCK_FILE.write_text(str(os.getpid()))
    return True


def release_lock() -> None:
    LOCK_FILE.unlink(missing_ok=True)


def _create_run(db: Database, config: Config) -> int:
    """Create a pipeline_runs record and return its ID."""
    run_id = db.insert_returning_id(
        """INSERT INTO pipeline_runs (status, config_json)
           VALUES ('running', ?)""",
        (config.model_dump_json(),),
    )
    db.commit()
    return run_id


def _update_run(
    db: Database, run_id: int, *,
    last_job: str | None = None,
    last_phase: int | None = None,
    status: str | None = None,
    error_msg: str | None = None,
) -> None:
    """Update a pipeline_runs record."""
    parts = []
    params: list = []
    if last_job is not None:
        parts.append("last_completed_job = ?")
        params.append(last_job)
    if last_phase is not None:
        parts.append("last_completed_phase = ?")
        params.append(last_phase)
    if status is not None:
        parts.append("status = ?")
        params.append(status)
        if status in ("completed", "failed", "partial"):
            parts.append("completed_at = datetime('now')")
    if error_msg is not None:
        parts.append("error_msg = ?")
        params.append(error_msg)
    if not parts:
        return
    params.append(run_id)
    db.execute(f"UPDATE pipeline_runs SET {', '.join(parts)} WHERE id = ?", tuple(params))
    db.commit()


def _execute_stage(stage: Stage, db: Database, config: Config, **kwargs) -> None:
    """Execute a single pipeline stage by importing and calling its run() function."""
    cmd = stage.command
    if cmd == "enrich":
        from fee_crawler.commands.enrich import run
        run(db, config)
    elif cmd == "discover":
        from fee_crawler.commands.discover_urls import run
        run(db, config, limit=kwargs.get("limit"))
    elif cmd == "crawl":
        from fee_crawler.commands.crawl import run
        run(db, config, limit=kwargs.get("limit"), workers=kwargs.get("workers", 1))
    elif cmd == "merge-fees":
        from fee_crawler.commands.merge_fees import run
        run(db, config)
    elif cmd == "categorize":
        from fee_crawler.commands.categorize_fees import run
        run(db)
    elif cmd == "validate":
        from fee_crawler.commands.backfill_validation import run
        run(db, config)
    elif cmd == "auto-review":
        from fee_crawler.commands.auto_review import run
        run(db, config)
    elif cmd == "snapshot":
        from fee_crawler.commands.snapshot_fees import run
        run(db, config)
    elif cmd == "publish-index":
        from fee_crawler.commands.publish_index import run
        run(db, config)
    else:
        raise ValueError(f"Unknown pipeline stage: {cmd}")


def run_pipeline(
    db: Database,
    config: Config,
    *,
    from_phase: int = 1,
    resume_run_id: int | None = None,
    skip: frozenset[str] = frozenset(),
    dry_run: bool = False,
    **kwargs,
) -> int:
    """Execute pipeline stages sequentially. Returns the run ID."""
    if not acquire_lock():
        raise RuntimeError("Another pipeline is already running (PID lock).")

    try:
        # Determine start index
        if resume_run_id:
            row = db.fetchone(
                "SELECT last_completed_job, config_json FROM pipeline_runs WHERE id = ?",
                (resume_run_id,),
            )
            if not row:
                raise ValueError(f"Pipeline run {resume_run_id} not found.")
            if row["config_json"]:
                config = Config.model_validate_json(row["config_json"])
            last_job = row["last_completed_job"]
            start_idx = 0
            if last_job:
                for i, s in enumerate(PIPELINE_STAGES):
                    if s.name == last_job:
                        start_idx = i + 1
                        break
            run_id = resume_run_id
            _update_run(db, run_id, status="running")
        else:
            run_id = _create_run(db, config)
            start_idx = next(
                (i for i, s in enumerate(PIPELINE_STAGES) if s.phase >= from_phase),
                0,
            )

        completed_count = 0
        failed = False

        for stage in PIPELINE_STAGES[start_idx:]:
            if stage.name in skip:
                print(f"  Skipping {stage.name}")
                continue

            print(f"\n{'='*60}")
            print(f"  Stage: {stage.name} (phase {stage.phase})")
            print(f"{'='*60}")

            if dry_run:
                print(f"  [DRY RUN] Would execute {stage.command}")
                _update_run(db, run_id, last_job=stage.name, last_phase=stage.phase)
                completed_count += 1
                continue

            try:
                t0 = time.time()
                _execute_stage(stage, db, config, **kwargs)
                elapsed = time.time() - t0
                _update_run(db, run_id, last_job=stage.name, last_phase=stage.phase)
                completed_count += 1
                print(f"  Completed in {elapsed:.1f}s")
            except Exception as e:
                _update_run(db, run_id, status="failed", error_msg=f"{stage.name}: {e}")
                print(f"\n  FAILED at {stage.name}: {e}")
                print(f"  Resume with: run-pipeline --resume {run_id}")
                failed = True
                break

        if not failed:
            _update_run(db, run_id, status="completed")
            print(f"\nPipeline completed: {completed_count} stages")
        elif completed_count > 0:
            _update_run(db, run_id, status="partial")

        return run_id

    finally:
        release_lock()
