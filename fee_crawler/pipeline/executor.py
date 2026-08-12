"""Pipeline executor: runs stages sequentially with resume support.

No DAG, no topological sort — the pipeline is linear.
A simple ordered list with a start index gives resume.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from fee_crawler.config import Config
from fee_crawler.db import Database

PIPELINE_LOCK_ID = 0x42464950495045


@dataclass
class Stage:
    name: str
    phase: int
    command: str  # CLI command name to dispatch to


PIPELINE_STAGES = [
    # Magellan: institution registry + fee URL discovery
    Stage("seed-enrich", phase=1, command="enrich"),
    Stage("discover",    phase=1, command="discover"),
    # Magellan: collection writes immutable observations to fees_raw
    Stage("crawl",       phase=2, command="crawl"),
    # Darwin -> Knox: classify, verify, and adversarially review
    Stage("darwin-drain", phase=3, command="darwin-drain"),
    Stage("knox-review", phase=3, command="knox-review"),
    # Publish: only the verified tier can flow to Hamilton/public consumers
    Stage("publish-fees", phase=4, command="publish-fees"),
]


def acquire_lock(db: Database) -> bool:
    """Acquire the cross-container Postgres advisory lock for the pipeline."""
    row = db.fetchone(
        "SELECT pg_try_advisory_lock(?) AS acquired",
        (PIPELINE_LOCK_ID,),
    )
    return bool(row and row["acquired"])


def release_lock(db: Database) -> None:
    """Release the lock even when the pipeline left the transaction aborted."""
    db.rollback()
    db.execute("SELECT pg_advisory_unlock(?)", (PIPELINE_LOCK_ID,))
    db.commit()


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


def _restore_config(saved: object, fallback: Config) -> Config:
    """Restore a checkpoint config from either JSON text or decoded JSONB."""
    if not saved:
        return fallback
    if isinstance(saved, (str, bytes, bytearray)):
        return Config.model_validate_json(saved)
    return Config.model_validate(saved)


def _create_run(db: Database, config: Config) -> int:
    """Create a pipeline_runs record and return its ID."""
    config_json = config.model_dump_json()
    trigger_source = os.environ.get("BFI_TRIGGER_SOURCE", "manual")
    triggered_by = os.environ.get("BFI_TRIGGERED_BY", "pipeline_executor")
    ops_job_id_raw = os.environ.get("BFI_OPS_JOB_ID", "").strip()
    ops_job_id = int(ops_job_id_raw) if ops_job_id_raw.isdigit() else None
    run_id = db.insert_returning_id(
        """INSERT INTO pipeline_runs
             (ops_job_id, status, trigger_source, triggered_by, params_json,
              config_json, stages_total, stages_done, started_at)
           VALUES (?, 'running', ?, ?, ?, ?, ?, 0, NOW())""",
        (
            ops_job_id,
            trigger_source,
            triggered_by,
            config_json,
            config_json,
            len(PIPELINE_STAGES),
        ),
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
        completed_stage = next(
            (index for index, stage in enumerate(PIPELINE_STAGES, start=1)
             if stage.name == last_job),
            None,
        )
        if completed_stage is not None:
            parts.append("stages_done = GREATEST(COALESCE(stages_done, 0), ?)")
            params.append(completed_stage)
    if last_phase is not None:
        parts.append("last_completed_phase = ?")
        params.append(last_phase)
    if status is not None:
        parts.append("status = ?")
        params.append(status)
        if status in ("completed", "failed", "partial"):
            parts.append("completed_at = datetime('now')")
            parts.append("finished_at = datetime('now')")
    if error_msg is not None:
        parts.append("error_msg = ?")
        params.append(error_msg)
        parts.append("error = ?")
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

    # Each canonical tier is a separate lifecycle concept. Reporting the old
    # extracted_fees statuses here made a successful Atlas cycle look stale.
    print(f"\n  {'--- CANONICAL FEE INVENTORY ---':^50}")
    inventory = db.fetchone("""
        SELECT
          (SELECT COUNT(*) FROM fees_raw) AS raw_fees,
          (SELECT COUNT(*) FROM fees_verified WHERE review_status != 'rejected') AS verified_fees,
          (SELECT COUNT(*) FROM fees_published WHERE rolled_back_at IS NULL) AS published_fees,
          (SELECT COUNT(*) FROM fees_raw fr
            WHERE NOT EXISTS (
              SELECT 1 FROM fees_verified fv WHERE fv.fee_raw_id = fr.fee_raw_id
            )) AS awaiting_darwin
    """)
    total_fees = inventory["raw_fees"] if inventory else 0
    if inventory:
        print(f"    {'Tier 1 raw':<18s} {inventory['raw_fees']:>8,}")
        print(f"    {'Awaiting Darwin':<18s} {inventory['awaiting_darwin']:>8,}")
        print(f"    {'Tier 2 verified':<18s} {inventory['verified_fees']:>8,}")
        print(f"    {'Tier 3 published':<18s} {inventory['published_fees']:>8,}")

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
        FROM fees_raw
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
        SELECT canonical_fee_key, COUNT(*) as cnt,
               COUNT(DISTINCT institution_id) as inst_cnt,
               ROUND(AVG(CASE WHEN amount IS NOT NULL THEN amount END), 2) as avg_amt
        FROM fees_verified
        WHERE review_status != 'rejected'
        GROUP BY canonical_fee_key
        ORDER BY inst_cnt DESC
        LIMIT 15
    """)
    print(f"    {'Category':<30s} {'Inst':>6s} {'Fees':>6s} {'Avg $':>8s}")
    print(f"    {'-'*30} {'-'*6} {'-'*6} {'-'*8}")
    for row in categories:
        avg = f"${row['avg_amt']:.2f}" if row["avg_amt"] else "-"
        print(f"    {row['canonical_fee_key']:<30s} {row['inst_cnt']:>6,} {row['cnt']:>6,} {avg:>8s}")

    # Remaining uncategorized
    uncat = db.fetchone(
        """SELECT COUNT(*) as cnt FROM fees_raw fr
             WHERE NOT EXISTS (
               SELECT 1 FROM fees_verified fv WHERE fv.fee_raw_id = fr.fee_raw_id
             )"""
    )
    print(f"\n    Awaiting Darwin classification: {uncat['cnt']:,}" if uncat else "")

    # Coverage funnel
    print(f"\n  {'--- COVERAGE FUNNEL ---':^50}")
    funnel = db.fetchone("""
        SELECT
          (SELECT COUNT(*) FROM crawl_targets
            WHERE status = 'active'
              AND COALESCE(document_type, '') NOT IN ('offline', 'no_website')) as total,
          (SELECT COUNT(*) FROM crawl_targets
            WHERE status = 'active'
              AND COALESCE(document_type, '') NOT IN ('offline', 'no_website')
              AND fee_schedule_url IS NOT NULL) as with_url,
          (SELECT COUNT(DISTINCT fr.institution_id) FROM fees_raw fr
            JOIN crawl_targets ct ON ct.id = fr.institution_id
            WHERE ct.status = 'active'
              AND COALESCE(ct.document_type, '') NOT IN ('offline', 'no_website')) as with_fees,
          (SELECT COUNT(DISTINCT fp.institution_id) FROM fees_published fp
            JOIN crawl_targets ct ON ct.id = fp.institution_id
            WHERE ct.status = 'active'
              AND COALESCE(ct.document_type, '') NOT IN ('offline', 'no_website')
              AND fp.rolled_back_at IS NULL) as with_approved
    """)
    if funnel:
        t = funnel["total"]
        print(f"    Total institutions:  {t:>8,}")
        print(f"    With fee URL:        {funnel['with_url']:>8,}  ({funnel['with_url']*100//t}%)")
        print(f"    With raw fees:       {funnel['with_fees']:>8,}  ({funnel['with_fees']*100//t}%)")
        print(f"    With published fees: {funnel['with_approved']:>8,}  ({funnel['with_approved']*100//t}%)")

    # Recent change events
    changes = db.fetchone(
        "SELECT COUNT(*) as cnt FROM fee_change_events "
        "WHERE detected_at >= NOW() - INTERVAL '1 day'"
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
        run(db, config, limit=kwargs.get("limit"), state=kwargs.get("state"))
    elif cmd == "crawl":
        from fee_crawler.commands.crawl import run
        # Atlas owns freshness maintenance, so it must revisit stale targets.
        # Gap-only Magellan commands retain skip_with_fees=True explicitly.
        run(
            db,
            config,
            limit=kwargs.get("limit"),
            workers=kwargs.get("workers", 1),
            state=kwargs.get("state"),
            skip_with_fees=False,
        )
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
    elif cmd == "darwin-drain":
        args = [
            "--size", str(kwargs.get("limit") or 500),
            "--batches", "1",
        ]
        subprocess.run(
            [sys.executable, "-m", "fee_crawler", "darwin-drain", *args],
            check=True,
        )
    elif cmd == "knox-review":
        subprocess.run(
            [
                sys.executable, "-m", "fee_crawler", "knox-review", "--apply",
                "--limit", str(kwargs.get("limit") or 500),
            ],
            check=True,
        )
    elif cmd == "publish-fees":
        subprocess.run(
            [
                sys.executable, "-m", "fee_crawler", "publish-fees", "--apply",
                "--limit", str(kwargs.get("limit") or 500),
            ],
            check=True,
        )
    elif cmd == "snapshot":
        from fee_crawler.commands.snapshot_fees import run
        run(db)
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
    if not acquire_lock(db):
        raise RuntimeError("Another pipeline is already running (database lock).")

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
            config = _restore_config(row["config_json"], config)
            last_job = row["last_completed_job"]
            start_idx = 0
            if last_job:
                for i, s in enumerate(PIPELINE_STAGES):
                    if s.name == last_job:
                        start_idx = i + 1
                        break
            run_id = resume_run_id
            ops_job_id_raw = os.environ.get("BFI_OPS_JOB_ID", "").strip()
            ops_job_id = int(ops_job_id_raw) if ops_job_id_raw.isdigit() else None
            db.execute(
                """UPDATE pipeline_runs
                      SET status = 'running',
                          ops_job_id = COALESCE(?, ops_job_id),
                          completed_at = NULL,
                          finished_at = NULL,
                          error = NULL,
                          error_msg = NULL,
                          stages_done = GREATEST(COALESCE(stages_done, 0), ?)
                    WHERE id = ?""",
                (ops_job_id, start_idx, run_id),
            )
            db.commit()
        else:
            run_id = _create_run(db, config)
            start_idx = next(
                (i for i, s in enumerate(PIPELINE_STAGES) if s.phase >= from_phase),
                0,
            )

        completed_count = 0
        failed = False
        failure_detail: str | None = None

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
                # A failed stage may leave psycopg2 in an aborted transaction.
                # Roll it back before persisting the pipeline failure checkpoint.
                db.rollback()
                failure_detail = f"{stage.name}: {e}"
                _update_run(db, run_id, status="failed", error_msg=failure_detail)
                print(f"\n  FAILED at {stage.name}: {e}")
                print(f"  Resume with: pipeline --resume {run_id}")
                failed = True
                break

        if not failed:
            _update_run(db, run_id, status="completed")
            print(f"\nPipeline completed: {completed_count} stages")
        elif completed_count > 0:
            _update_run(db, run_id, status="partial")

        # Post-run report
        _print_run_report(db, run_id, pipeline_start)

        # The CLI exit code is the execution contract used by Modal. Never let
        # a partially completed pipeline look successful to its caller.
        if failed:
            raise RuntimeError(f"Pipeline failed at {failure_detail}")

        return run_id

    finally:
        release_lock(db)
