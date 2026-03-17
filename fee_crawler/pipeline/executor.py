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


def cleanup_old_logs(max_age_days: int = 30) -> int:
    """Delete log and result files older than max_age_days. Returns count deleted."""
    logs_dir = Path("data/logs")
    if not logs_dir.exists():
        return 0
    import time as _time
    cutoff = _time.time() - (max_age_days * 86400)
    deleted = 0
    for f in logs_dir.iterdir():
        if f.suffix in (".log", ".json") and f.stat().st_mtime < cutoff:
            f.unlink()
            deleted += 1
    return deleted


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


def _print_run_report(db: Database, run_id: int, start_time: float) -> None:
    """Print a comprehensive post-run report."""
    elapsed = time.time() - start_time
    minutes = int(elapsed // 60)
    seconds = int(elapsed % 60)

    print("\n" + "=" * 70)
    print("  PIPELINE RUN REPORT")
    print("=" * 70)

    # Duration
    print(f"\n  Run ID:     #{run_id}")
    print(f"  Duration:   {minutes}m {seconds}s")

    # Run status
    run = db.fetchone("SELECT * FROM pipeline_runs WHERE id = ?", (run_id,))
    if run:
        print(f"  Status:     {run['status']}")
        if run["last_completed_job"]:
            print(f"  Last stage: {run['last_completed_job']} (phase {run['last_completed_phase']})")
        if run["error_msg"]:
            print(f"  Error:      {run['error_msg']}")

    # Fee totals
    print(f"\n  {'--- FEE INVENTORY ---':^50}")
    status_counts = db.fetchall(
        "SELECT review_status, COUNT(*) as cnt FROM extracted_fees GROUP BY review_status ORDER BY cnt DESC"
    )
    total_fees = 0
    for row in status_counts:
        total_fees += row["cnt"]
        label = row["review_status"]
        print(f"    {label:<12s} {row['cnt']:>8,}")
    print(f"    {'TOTAL':<12s} {total_fees:>8,}")

    # Confidence distribution
    print(f"\n  {'--- CONFIDENCE DISTRIBUTION ---':^50}")
    conf_ranges = db.fetchall("""
        SELECT
          CASE
            WHEN extraction_confidence >= 0.95 THEN '0.95+'
            WHEN extraction_confidence >= 0.90 THEN '0.90-0.94'
            WHEN extraction_confidence >= 0.85 THEN '0.85-0.89'
            WHEN extraction_confidence >= 0.70 THEN '0.70-0.84'
            ELSE '<0.70'
          END as range,
          COUNT(*) as cnt
        FROM extracted_fees
        WHERE review_status != 'rejected'
        GROUP BY range
        ORDER BY range DESC
    """)
    for row in conf_ranges:
        bar_len = min(40, row["cnt"] // max(1, total_fees // 40))
        bar = "#" * bar_len
        print(f"    {row['range']:<12s} {row['cnt']:>6,}  {bar}")

    # Category coverage
    print(f"\n  {'--- CATEGORY COVERAGE (top 15) ---':^50}")
    categories = db.fetchall("""
        SELECT fee_category, COUNT(*) as cnt,
               COUNT(DISTINCT crawl_target_id) as inst_cnt,
               ROUND(AVG(CASE WHEN amount IS NOT NULL THEN amount END), 2) as avg_amt
        FROM extracted_fees
        WHERE fee_category IS NOT NULL AND review_status != 'rejected'
        GROUP BY fee_category
        ORDER BY inst_cnt DESC
        LIMIT 15
    """)
    print(f"    {'Category':<30s} {'Inst':>6s} {'Fees':>6s} {'Avg $':>8s}")
    print(f"    {'-'*30} {'-'*6} {'-'*6} {'-'*8}")
    for row in categories:
        avg = f"${row['avg_amt']:.2f}" if row["avg_amt"] else "-"
        print(f"    {row['fee_category']:<30s} {row['inst_cnt']:>6,} {row['cnt']:>6,} {avg:>8s}")

    # Remaining uncategorized
    uncat = db.fetchone(
        "SELECT COUNT(*) as cnt FROM extracted_fees WHERE fee_category IS NULL AND review_status != 'rejected'"
    )
    print(f"\n    Uncategorized remaining: {uncat['cnt']:,}" if uncat else "")

    # Coverage funnel
    print(f"\n  {'--- COVERAGE FUNNEL ---':^50}")
    funnel = db.fetchone("""
        SELECT
          (SELECT COUNT(*) FROM crawl_targets) as total,
          (SELECT COUNT(*) FROM crawl_targets WHERE fee_schedule_url IS NOT NULL) as with_url,
          (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees WHERE review_status != 'rejected') as with_fees,
          (SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees WHERE review_status = 'approved') as with_approved
    """)
    if funnel:
        t = funnel["total"]
        print(f"    Total institutions:  {t:>8,}")
        print(f"    With fee URL:        {funnel['with_url']:>8,}  ({funnel['with_url']*100//t}%)")
        print(f"    With extracted fees: {funnel['with_fees']:>8,}  ({funnel['with_fees']*100//t}%)")
        print(f"    With approved fees:  {funnel['with_approved']:>8,}  ({funnel['with_approved']*100//t}%)")

    # Recent change events
    changes = db.fetchone(
        "SELECT COUNT(*) as cnt FROM fee_change_events WHERE detected_at >= date('now', '-1 day')"
    )
    if changes and changes["cnt"] > 0:
        print(f"\n    Price changes (last 24h): {changes['cnt']}")

    print("\n" + "=" * 70)


def _execute_stage(stage: Stage, db: Database, config: Config, **kwargs) -> None:
    """Execute a single pipeline stage by importing and calling its run() function."""
    cmd = stage.command
    if cmd == "enrich":
        from fee_crawler.commands.enrich import run
        run(db)
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
        pipeline_start = time.time()

        # Housekeeping: clean old logs
        deleted = cleanup_old_logs(30)
        if deleted:
            print(f"Cleaned up {deleted} old log files (>30 days).")

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

        # Post-run report
        _print_run_report(db, run_id, pipeline_start)

        return run_id

    finally:
        release_lock()
