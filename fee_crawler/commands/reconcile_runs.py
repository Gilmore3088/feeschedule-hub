"""Reconcile execution telemetry that can no longer make progress."""

from __future__ import annotations

from fee_crawler.db import Database


def run(db: Database) -> dict[str, int]:
    """Move stale envelopes and telemetry rows to explicit terminal states."""
    counts: dict[str, int] = {}

    cursor = db.execute(
        """UPDATE ops_jobs
              SET status = 'timed_out',
                  error_summary = COALESCE(error_summary, 'Job heartbeat expired'),
                  completed_at = COALESCE(completed_at, NOW()),
                  updated_at = NOW()
            WHERE (status = 'queued' AND created_at < NOW() - INTERVAL '15 minutes')
               OR (status IN ('running', 'cancel_requested')
                   AND COALESCE(heartbeat_at, started_at, created_at)
                       < NOW() - INTERVAL '3 hours')"""
    )
    counts["ops_jobs"] = cursor.rowcount

    cursor = db.execute(
        """UPDATE pipeline_runs AS pipeline
              SET status = CASE ops.status
                             WHEN 'completed' THEN 'completed'
                             WHEN 'cancelled' THEN 'cancelled'
                             WHEN 'timed_out' THEN 'timed_out'
                             ELSE 'failed'
                           END,
                  completed_at = COALESCE(pipeline.completed_at, ops.completed_at, NOW()),
                  finished_at = COALESCE(pipeline.finished_at, ops.completed_at, NOW()),
                  error_msg = COALESCE(pipeline.error_msg, ops.error_summary),
                  error = COALESCE(pipeline.error, ops.error_summary)
             FROM ops_jobs AS ops
            WHERE pipeline.ops_job_id = ops.id
              AND pipeline.status IN ('queued', 'running')
              AND ops.status IN ('completed', 'failed', 'cancelled', 'timed_out')"""
    )
    counts["linked_pipeline_runs"] = cursor.rowcount

    cursor = db.execute(
        """UPDATE pipeline_runs
              SET status = 'timed_out',
                  completed_at = COALESCE(completed_at, NOW()),
                  finished_at = COALESCE(finished_at, NOW()),
                  error_msg = COALESCE(error_msg, 'Pipeline checkpoint expired'),
                  error = COALESCE(error, 'Pipeline checkpoint expired')
            WHERE status IN ('queued', 'running')
              AND started_at < NOW() - INTERVAL '6 hours'"""
    )
    counts["pipeline_runs"] = cursor.rowcount

    cursor = db.execute(
        """UPDATE crawl_runs
              SET status = 'error',
                  completed_at = COALESCE(completed_at, NOW())
            WHERE status = 'running'
              AND COALESCE(heartbeat_at, started_at)
                  < NOW() - INTERVAL '15 minutes'"""
    )
    counts["crawl_runs"] = cursor.rowcount

    cursor = db.execute(
        """UPDATE report_jobs AS report
              SET status = 'failed',
                  error = COALESCE(report.error, 'Remote report job timed out'),
                  completed_at = COALESCE(report.completed_at, NOW())
             FROM ops_jobs AS ops
            WHERE report.ops_job_id = ops.id
              AND ops.status = 'timed_out'
              AND report.status IN (
                'pending', 'assembling', 'rendering', 'cancel_requested'
              )"""
    )
    counts["report_jobs"] = cursor.rowcount

    cursor = db.execute(
        """WITH latest_atlas AS (
               SELECT id, status, completed_at
                 FROM ops_jobs
                WHERE command = 'pipeline'
                  AND agent_name = 'atlas'
                  AND status IN ('completed', 'failed', 'cancelled', 'timed_out')
                  AND completed_at IS NOT NULL
                ORDER BY completed_at DESC
                LIMIT 1
           )
           INSERT INTO workers_last_run (job_name, completed_at, status, notes)
           SELECT 'atlas_cycle', completed_at,
                  CASE WHEN status = 'completed' THEN 'ok' ELSE 'failed' END,
                  'Reconciled from canonical ops job #' || id
             FROM latest_atlas
            WHERE TRUE
           ON CONFLICT (job_name) DO UPDATE SET
             completed_at = EXCLUDED.completed_at,
             status = EXCLUDED.status,
             notes = EXCLUDED.notes
           WHERE workers_last_run.completed_at IS NULL
              OR EXCLUDED.completed_at >= workers_last_run.completed_at"""
    )
    counts["atlas_health_marker"] = cursor.rowcount

    db.commit()
    return counts
