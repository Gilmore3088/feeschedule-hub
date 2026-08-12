"""
Modal serverless workers for Bank Fee Index pipeline.

Replaces GitHub Actions SSH cron with scalable, pay-per-use workers.
Each function runs on Modal's infrastructure with its own schedule.

Deploy: modal deploy fee_crawler/modal_app.py
Test:   modal run fee_crawler/modal_app.py::test_connection
"""

import subprocess as _subprocess

import modal
from pydantic import BaseModel as _BaseModel


class SubprocessFailed(RuntimeError):
    """Raised when a Modal scheduled subprocess exits non-zero.

    The exception message embeds tails of stdout and stderr so the
    Modal dashboard surfaces the root cause without requiring log dives.
    """

    def __init__(self, cmd, returncode, stdout_tail, stderr_tail):
        self.cmd = cmd
        self.returncode = returncode
        self.stdout_tail = stdout_tail
        self.stderr_tail = stderr_tail
        super().__init__(
            f"subprocess failed: {' '.join(cmd)} exited {returncode}\n"
            f"--- stdout tail ---\n{stdout_tail}\n"
            f"--- stderr tail ---\n{stderr_tail}"
        )


def run_checked(cmd, *, cwd=None, env=None, timeout=None, tail_lines=40):
    """Run a subprocess and raise SubprocessFailed on non-zero exit.

    Captures stdout/stderr, keeps the last `tail_lines` lines of each in
    the raised exception. Returns the CompletedProcess on success.
    """
    result = _subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=cwd,
        env=env,
        timeout=timeout,
    )
    if result.returncode != 0:
        stdout_tail = "\n".join((result.stdout or "").splitlines()[-tail_lines:])
        stderr_tail = "\n".join((result.stderr or "").splitlines()[-tail_lines:])
        raise SubprocessFailed(list(cmd), result.returncode, stdout_tail, stderr_tail)
    return result

pdf_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("tesseract-ocr", "poppler-utils")
    .pip_install_from_requirements("fee_crawler/requirements.txt")
    .pip_install("fastapi[standard]")
    .add_local_dir("fee_crawler", remote_path="/root/fee_crawler")
)

browser_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("tesseract-ocr", "poppler-utils")
    .pip_install_from_requirements("fee_crawler/requirements.txt")
    .pip_install("fastapi[standard]")
    .run_commands(["playwright install --with-deps chromium"])
    .add_local_dir("fee_crawler", remote_path="/root/fee_crawler")
)

# Default image includes browser for backward compat with non-extraction workers
image = browser_image

app = modal.App("bank-fee-index-workers", image=image)
secrets = [
    modal.Secret.from_name("bfi-secrets"),
    modal.Secret.from_name("bfi-r2-secrets"),
    modal.Secret.from_name("bfi-app-runtime"),
]


async def _connect_asyncpg(db_url: str):
    """Connect with prepared statements disabled for Supabase transaction pooling."""
    import asyncpg

    return await asyncpg.connect(db_url, statement_cache_size=0)


def _mark_job_completion(job_name: str, status: str = "ok") -> None:
    """Write a workers_last_run row so the /admin/pipeline health dashboard
    can tell whether this scheduled job has actually completed recently.

    Marker persistence is part of the execution contract. If it fails, the
    Modal run must fail too rather than leaving an unobservable false-green.
    """
    import os
    try:
        import psycopg2
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO workers_last_run (job_name, completed_at, status)
               VALUES (%s, NOW(), %s)
               ON CONFLICT (job_name) DO UPDATE
                 SET completed_at = EXCLUDED.completed_at,
                     status       = EXCLUDED.status""",
            (job_name, status),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as exc:
        raise RuntimeError(
            f"workers_last_run write failed for {job_name}: {exc}"
        ) from exc


class _ScheduledEnvelopeState:
    def __init__(self, job_id: int, started: bool, message: str | None = None):
        self.job_id = job_id
        self.started = started
        self.message = message


def _reconcile_stale_execution_rows() -> int:
    """Terminalize stale envelopes even when no new scheduled job starts."""
    import os

    import psycopg2

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE ops_jobs
                      SET status = 'timed_out',
                          error_summary = 'Job heartbeat expired',
                          completed_at = NOW(),
                          updated_at = NOW()
                    WHERE (status = 'queued'
                           AND created_at < NOW() - INTERVAL '15 minutes')
                       OR (status IN ('running', 'cancel_requested')
                           AND COALESCE(heartbeat_at, started_at, created_at)
                               < NOW() - INTERVAL '3 hours')"""
            )
            reconciled = cur.rowcount
            cur.execute(
                """UPDATE report_jobs AS report
                      SET status = 'failed',
                          error = COALESCE(report.error, 'Remote report job timed out'),
                          completed_at = NOW()
                     FROM ops_jobs AS ops
                    WHERE report.ops_job_id = ops.id
                      AND ops.status = 'timed_out'
                      AND report.status IN (
                        'pending', 'assembling', 'rendering', 'cancel_requested'
                      )"""
            )
        conn.commit()
        return reconciled
    finally:
        conn.close()


def _scheduled_job(
    command: str,
    agent_name: str,
    idempotency_key: str,
    args: list[str],
    *,
    trigger_source: str = "schedule",
    triggered_by: str = "modal-schedule",
):
    """Context manager that gives direct Modal invocations the ops_jobs lifecycle."""
    import json
    import os
    import threading
    from contextlib import contextmanager

    import psycopg2

    @contextmanager
    def _envelope():
        from fee_crawler.ai_usage import (
            EmergencyStopActive,
            assert_automation_enabled,
        )

        try:
            assert_automation_enabled(f"scheduled {command}")
        except EmergencyStopActive as exc:
            yield _ScheduledEnvelopeState(0, False, str(exc))
            return

        call_id = modal.current_function_call_id()
        _reconcile_stale_execution_rows()
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        job_id = 0
        started = False
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT id, status
                         FROM ops_jobs
                        WHERE modal_call_id = %s
                          AND command = %s
                        ORDER BY created_at DESC
                        LIMIT 1
                        FOR UPDATE""",
                    (call_id, command),
                )
                retry_row = cur.fetchone()
                if retry_row and retry_row[1] in ("failed", "timed_out"):
                    job_id = int(retry_row[0])
                    cur.execute(
                        """UPDATE ops_jobs
                              SET status = 'running',
                                  completed_at = NULL,
                                  error_summary = NULL,
                                  heartbeat_at = NOW(),
                                  updated_at = NOW()
                            WHERE id = %s""",
                        (job_id,),
                    )
                    conn.commit()
                    started = True
                elif retry_row:
                    job_id = int(retry_row[0])
                else:
                    cur.execute(
                        """INSERT INTO ops_jobs
                         (command, params_json, status, triggered_by, agent_name,
                          trigger_source, modal_call_id, idempotency_key,
                          started_at, heartbeat_at, updated_at)
                       VALUES (%s, %s::JSONB, 'running', %s, %s,
                               %s, %s, %s, NOW(), NOW(), NOW())
                    RETURNING id""",
                    (
                        command,
                        json.dumps({"args": args}),
                        triggered_by,
                        agent_name,
                        trigger_source,
                        call_id,
                        idempotency_key,
                    ),
                    )
                    job_id = int(cur.fetchone()[0])
                    conn.commit()
                    started = True
        except psycopg2.errors.UniqueViolation:
            conn.rollback()
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT id FROM ops_jobs
                        WHERE idempotency_key = %s
                          AND status IN ('queued', 'running', 'cancel_requested')
                        ORDER BY created_at DESC LIMIT 1""",
                    (idempotency_key,),
                )
                row = cur.fetchone()
                job_id = int(row[0]) if row else 0
        finally:
            conn.close()

        state = _ScheduledEnvelopeState(job_id, started)
        if not started:
            yield state
            return

        stop = threading.Event()

        def _heartbeat() -> None:
            while not stop.wait(60):
                heartbeat_conn = None
                try:
                    heartbeat_conn = psycopg2.connect(os.environ["DATABASE_URL"])
                    with heartbeat_conn.cursor() as cur:
                        cur.execute(
                            """UPDATE ops_jobs
                                  SET heartbeat_at = NOW(), updated_at = NOW()
                                WHERE id = %s AND status = 'running'""",
                            (job_id,),
                        )
                    heartbeat_conn.commit()
                except Exception as exc:
                    print(f"scheduled heartbeat failed job={job_id}: {exc}")
                finally:
                    if heartbeat_conn is not None:
                        heartbeat_conn.close()

        heartbeat = threading.Thread(target=_heartbeat, daemon=True)
        heartbeat.start()
        try:
            yield state
        except BaseException as exc:
            error = str(exc).strip() or type(exc).__name__
            _finish_scheduled_job(job_id, "failed", error)
            raise
        else:
            _finish_scheduled_job(job_id, "completed")
        finally:
            stop.set()
            heartbeat.join(timeout=2)

    return _envelope()


def _finish_scheduled_job(job_id: int, status: str, error: str | None = None) -> None:
    import os
    import psycopg2

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE ops_jobs
                      SET status = %s,
                          error_summary = %s,
                          completed_at = NOW(),
                          heartbeat_at = NOW(),
                          updated_at = NOW()
                    WHERE id = %s AND status = 'running'""",
                (status, error[:1000] if error else None, job_id),
            )
        conn.commit()
    finally:
        conn.close()


def _update_scheduled_job_progress(job_id: int, summary: str) -> None:
    """Expose the active child step without weakening heartbeat semantics."""
    import os

    import psycopg2

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE ops_jobs
                      SET result_summary = %s,
                          heartbeat_at = NOW(),
                          updated_at = NOW()
                    WHERE id = %s AND status = 'running'""",
                (summary[:1000], job_id),
            )
        conn.commit()
    finally:
        conn.close()


@app.function(
    schedule=modal.Cron("0 2 * * *"),
    timeout=21600,
    secrets=secrets,
    memory=2048,
)
def run_atlas_cycle():
    """Canonical scheduled cycle; manual and scheduled runs share one lock/key."""
    import os

    args = ["--limit", "100", "--workers", "4"]
    with _scheduled_job("pipeline", "atlas", "atlas:full-cycle", args) as job:
        if not job.started:
            return job.message or f"Atlas cycle #{job.job_id} is already active"
        try:
            result = run_checked(
                ["python3", "-m", "fee_crawler", "pipeline", *args],
                env={
                    **os.environ,
                    "DATABASE_URL": os.environ["DATABASE_URL"],
                    "BFI_TRIGGER_SOURCE": "schedule",
                    "BFI_TRIGGERED_BY": "atlas",
                    "BFI_OPS_JOB_ID": str(job.job_id),
                },
                timeout=18000,
            )
            _mark_job_completion("atlas_cycle", "ok")
            return result.stdout[-2000:] if result.stdout else "Atlas cycle completed"
        except Exception:
            _mark_job_completion("atlas_cycle", "failed")
            raise


@app.function(timeout=900, secrets=secrets, memory=1024)
def reconcile_execution_state():
    """Audited repair for stale canonical envelopes and execution telemetry."""
    import os

    with _scheduled_job(
        "reconcile-runs",
        "atlas",
        "atlas:reconcile-execution-state",
        [],
        trigger_source="admin",
        triggered_by="atlas-repair",
    ) as job:
        if not job.started:
            return job.message or f"Reconciliation job #{job.job_id} is already active"
        result = run_checked(
            ["python3", "-m", "fee_crawler", "reconcile-runs"],
            env={
                **os.environ,
                "DATABASE_URL": os.environ["DATABASE_URL"],
                "BFI_TRIGGER_SOURCE": "admin",
                "BFI_TRIGGERED_BY": "atlas-repair",
                "BFI_OPS_JOB_ID": str(job.job_id),
            },
            timeout=600,
        )
        return result.stdout[-2000:] if result.stdout else "Execution state reconciled"


@app.function(timeout=1800, secrets=secrets, memory=2048)
def run_magellan_repair(target_id: int):
    """Audited single-institution extraction repair for Magellan."""
    import os

    args = ["--target-id", str(target_id), "--workers", "1"]
    with _scheduled_job(
        "crawl",
        "magellan",
        f"magellan:extract:{target_id}",
        args,
        trigger_source="admin",
        triggered_by="magellan-repair",
    ) as job:
        if not job.started:
            return job.message or f"Magellan repair job #{job.job_id} is already active"
        result = run_checked(
            ["python3", "-m", "fee_crawler", "crawl", *args],
            env={
                **os.environ,
                "DATABASE_URL": os.environ["DATABASE_URL"],
                "BFI_TRIGGER_SOURCE": "admin",
                "BFI_TRIGGERED_BY": "magellan-repair",
                "BFI_OPS_JOB_ID": str(job.job_id),
            },
            timeout=1500,
        )
        return result.stdout[-2000:] if result.stdout else "Magellan repair completed"


@app.function(secrets=secrets, timeout=300)
async def test_connection():
    """Verify Modal can connect to Supabase."""
    import os
    import psycopg2
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM crawl_targets")
    count = cur.fetchone()[0]
    conn.close()
    return f"Connected. {count:,} institutions in database."


@app.function(
    timeout=21600,
    secrets=secrets,
    memory=2048,
)
async def run_discovery():
    """Manual Magellan discovery repair; routine work runs through Atlas."""
    from fee_crawler.workers.discovery_worker import run
    try:
        result = await run(concurrency=20)
        _mark_job_completion("run_discovery", "ok")
        return result
    except Exception:
        _mark_job_completion("run_discovery", "failed")
        raise


@app.function(
    timeout=10800,
    secrets=secrets,
    memory=1024,
    image=pdf_image,
)
def run_pdf_extraction():
    """Manual PDF extraction repair; routine work runs through Atlas."""
    import os
    env = {**os.environ, "DATABASE_URL": os.environ["DATABASE_URL"]}
    try:
        result = run_checked(
            ["python3", "-m", "fee_crawler", "crawl",
             "--limit", "500", "--workers", "4", "--include-failing",
             "--doc-type", "pdf"],
            env=env, timeout=7200,
        )
        _mark_job_completion("run_pdf_extraction", "ok")
        return result.stdout[-1000:] if result.stdout else ""
    except Exception:
        _mark_job_completion("run_pdf_extraction", "failed")
        raise


@app.function(
    timeout=14400,
    secrets=secrets,
    memory=2048,
    image=browser_image,
)
def run_browser_extraction():
    """Manual browser extraction repair; routine work runs through Atlas."""
    import os
    env = {**os.environ, "DATABASE_URL": os.environ["DATABASE_URL"]}
    try:
        result = run_checked(
            ["python3", "-m", "fee_crawler", "crawl",
             "--limit", "500", "--workers", "2", "--include-failing"],
            env=env, timeout=10800,
        )
        _mark_job_completion("run_browser_extraction", "ok")
        return result.stdout[-1000:] if result.stdout else ""
    except Exception:
        _mark_job_completion("run_browser_extraction", "failed")
        raise


# The review dispatcher retains the minute schedule while routine pipeline work
# is owned by the single daily Atlas cycle above.
@app.function(
    schedule=modal.Cron("* * * * *"),
    timeout=3600,
    secrets=secrets,
    memory=1024,
)
async def run_post_processing():
    """Dispatch due agent review ticks; Atlas owns the routine daily pipeline."""
    reconciled = _reconcile_stale_execution_rows()
    if reconciled:
        print(f"reconciled {reconciled} stale ops job(s)")
    try:
        from fee_crawler.agent_base.dispatcher import dispatch_ticks
        dispatched = await dispatch_ticks()
        if dispatched:
            print(f"dispatch_ticks: invoked {dispatched} agent review(s)")
    except Exception as exc:
        _mark_job_completion("review_dispatcher", "failed")
        raise RuntimeError(f"dispatch_ticks failed: {exc}") from exc

    _mark_job_completion("review_dispatcher", "ok")
    return f"dispatched {dispatched} agent review(s)"


def _ingest_data_body(job_id: int):
    """Daily + weekly data refreshes. Weekly jobs run on Mondays."""
    import os
    from datetime import datetime, timezone
    env = {**os.environ, "DATABASE_URL": os.environ["DATABASE_URL"]}
    results: list[str] = []
    failures: list[str] = []

    commands = ["ingest-fred", "ingest-nyfed", "ingest-bls", "ingest-ofr"]

    # Weekly (Monday only): FDIC, NCUA, CFPB, SOD, Beige Book, Call Reports
    if datetime.now(timezone.utc).weekday() == 0:
        commands.extend(
            [
                "ingest-fdic",
                "ingest-ncua",
                "ingest-cfpb",
                "ingest-sod",
                "ingest-beige-book",
                "ingest-call-reports",
            ]
        )
        if os.environ.get("CENSUS_API_KEY", "").strip():
            commands.append("ingest-census-acs")
        else:
            results.append("ingest-census-acs: SKIPPED (CENSUS_API_KEY not configured)")

    for index, cmd in enumerate(commands, start=1):
        _update_scheduled_job_progress(
            job_id,
            f"Running {cmd} ({index}/{len(commands)}); "
            f"completed: {', '.join(results) or 'none'}",
        )
        try:
            run_checked(
                ["python3", "-m", "fee_crawler", cmd],
                env=env,
                timeout=3600,
            )
            results.append(f"{cmd}: OK")
        except SubprocessFailed as exc:
            detail = (exc.stderr_tail or exc.stdout_tail or "no child output").strip()
            detail = " ".join(detail.split())[-400:]
            failure = f"{cmd}: FAIL ({exc.returncode}) - {detail}"
            print(failure)
            results.append(failure)
            failures.append(f"{cmd}: {detail}")
        _update_scheduled_job_progress(job_id, "; ".join(results))

    # Quarterly (Feb 15, May 15, Aug 15, Nov 15): full FFIEC + NCUA ingestion
    # Runs on approximate FFIEC release dates (~45 days after quarter end).
    # No new cron added -- stays inside ingest_data to respect 5-cron limit.
    now = datetime.now(timezone.utc)
    is_quarterly = now.month in (2, 5, 8, 11) and now.day == 15
    if is_quarterly:
        for cmd in ["ingest-call-reports", "ingest-ncua"]:
            _update_scheduled_job_progress(job_id, f"Running quarterly-{cmd}")
            try:
                run_checked(["python3", "-m", "fee_crawler", cmd], env=env, timeout=3600)
                results.append(f"quarterly-{cmd}: OK")
            except SubprocessFailed as exc:
                detail = (exc.stderr_tail or exc.stdout_tail or "no child output").strip()
                detail = " ".join(detail.split())[-400:]
                failure = f"quarterly-{cmd}: FAIL ({exc.returncode}) - {detail}"
                print(failure)
                results.append(failure)
                failures.append(f"quarterly-{cmd}: {detail}")

    summary = "; ".join(results)
    # Mark BEFORE raising so the health dashboard sees partial-failure runs
    # as 'failed' rather than 'never ran'. A fully-clean run writes 'ok'.
    _mark_job_completion("ingest_data", "failed" if failures else "ok")
    if failures:
        raise RuntimeError(
            f"ingest_data: {len(failures)} ingestor(s) failed: "
            f"{', '.join(failures)}. Full summary: {summary}"
        )
    return summary


@app.function(
    schedule=modal.Cron("0 10 * * *"),
    timeout=7200,
    secrets=secrets,
)
def ingest_data():
    """Canonical scheduled envelope for federal and market data ingestion."""
    from datetime import datetime, timezone

    key = f"schedule:ingest-data:{datetime.now(timezone.utc).date().isoformat()}"
    with _scheduled_job("ingest-data", "hamilton", key, []) as job:
        if not job.started:
            return job.message or f"Ingest job #{job.job_id} is already active"
        return _ingest_data_body(job.job_id)


@app.function(timeout=300, secrets=secrets)
def check_integrity():
    """On-demand data integrity check."""
    from fee_crawler.workers.data_integrity import run_checks, print_report
    results = run_checks()
    report = print_report(results)
    print(report)
    return f"Score: {results['score']}% ({results['passed']}/{results['total']} passed)"


class DiscoverRequest(_BaseModel):
    website_url: str
    institution_id: int | None = None
    internal_secret: str


class StateAgentRequest(_BaseModel):
    state_code: str
    internal_secret: str


class ExtractRequest(_BaseModel):
    target_id: int
    internal_secret: str


@app.function(secrets=secrets, timeout=180, memory=2048, image=browser_image)
@modal.fastapi_endpoint(method="POST")
def extract_single(item: ExtractRequest) -> dict:
    """Compatibility endpoint that queues the canonical Magellan repair."""
    _verify_internal_secret(item.internal_secret)
    _require_automation_http("single-institution extraction")
    call = run_magellan_repair.spawn(item.target_id)
    return {
        "ok": True,
        "accepted": True,
        "target_id": item.target_id,
        "call_id": call.object_id,
    }


@app.function(secrets=secrets, timeout=120)
@modal.fastapi_endpoint(method="POST")
def discover_url(item: DiscoverRequest) -> dict:
    """HTTP endpoint for single-institution URL discovery."""
    _verify_internal_secret(item.internal_secret)
    _require_automation_http("single-institution discovery")
    from fee_crawler.pipeline.url_discoverer import UrlDiscoverer
    from fee_crawler.config import Config

    if not item.website_url:
        return {"found": False, "error": "website_url required"}

    config = Config()
    discoverer = UrlDiscoverer(config)
    result = discoverer.discover(item.website_url)

    return {
        "found": result.found,
        "fee_schedule_url": result.fee_schedule_url,
        "document_type": result.document_type,
        "method": result.method,
        "confidence": result.confidence,
        "pages_checked": result.pages_checked,
        "error": result.error,
        "methods_tried": result.methods_tried,
    }


@app.function(secrets=secrets, timeout=7200, memory=2048, image=browser_image)
@modal.fastapi_endpoint(method="POST")
def run_state_agent(item: StateAgentRequest) -> dict:
    """HTTP endpoint to run the full state agent."""
    _verify_internal_secret(item.internal_secret)
    _require_automation_http("state-agent collection")
    from fee_crawler.agents.state_agent import run_state_agent as _run

    state_code = item.state_code.upper()
    if len(state_code) != 2:
        return {"error": "state_code must be a 2-letter code"}

    return _run(state_code)


@app.function(secrets=secrets, timeout=600, image=browser_image, memory=2048)
async def generate_report_command(request: dict) -> dict:
    """Full report pipeline: assemble HTML via Next.js, render PDF, upload to R2.

    Accepts POST JSON: { job_id, report_type, params }
    Called by Next.js /api/reports/generate route.

    Status updates use HTTP calls to /api/reports/[id]/status (PATCH) instead of
    direct psycopg2 — browser_image containers can't reach Supabase via IPv6.
    """
    import os
    import json
    import urllib.request
    import urllib.error
    from fee_crawler.workers.report_render import render_and_store
    from fee_crawler.ai_usage import assert_automation_enabled

    assert_automation_enabled("Hamilton report worker")

    job_id = request.get("job_id", "")
    report_type = request.get("report_type", "")
    params = request.get("params", {})

    if not job_id or not report_type:
        return {"error": "job_id and report_type are required", "status": "error"}

    app_url = os.environ.get("BFI_APP_URL", "https://feeinsight.com").rstrip("/")
    internal_secret = os.environ.get("REPORT_INTERNAL_SECRET", "")
    if not internal_secret:
        return {"error": "REPORT_INTERNAL_SECRET not set", "status": "error"}

    def _update_status(status, artifact_key=None, error=None):
        """Update job status via Vercel API instead of direct DB."""
        body = {"status": status}
        if artifact_key:
            body["artifact_key"] = artifact_key
        if error:
            body["error"] = error[:500]
        req = urllib.request.Request(
            f"{app_url}/api/reports/{job_id}/status",
            data=json.dumps(body).encode(),
            headers={
                "Content-Type": "application/json",
                "X-Internal-Secret": internal_secret,
            },
            method="PATCH",
        )
        try:
            urllib.request.urlopen(req, timeout=10)
        except Exception as e:
            print(f"[generate_report] status update to '{status}' failed: {e}")

    try:
        # Step 1: Call Next.js assemble endpoint to get HTML
        # assembleAndRender sets status to 'assembling' internally
        assemble_url = f"{app_url}/api/reports/{job_id}/assemble"
        payload = json.dumps(params).encode()

        req = urllib.request.Request(
            assemble_url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "X-Internal-Secret": internal_secret,
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                body = json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode()[:500]
            raise RuntimeError(
                f"Assemble endpoint returned {exc.code}: {error_body}"
            ) from exc

        html = body.get("html", "")
        if not html:
            raise ValueError("Assemble endpoint returned empty HTML")

        # Step 2: Render PDF and upload to R2
        _update_status("rendering")
        key = await render_and_store(html, job_id, report_type)

        # Step 3: Mark complete
        _update_status("complete", artifact_key=key)
        return {"key": key, "status": "complete"}
    except Exception as exc:
        _update_status("failed", error=str(exc)[:500])
        raise


@app.function(secrets=secrets, timeout=60, image=browser_image)
@modal.fastapi_endpoint(method="POST")
def generate_report(request: dict) -> dict:
    """Queue report rendering and return the cancellable Modal call ID."""
    _verify_internal_secret(str(request.get("internal_secret", "")))
    _require_automation_http("Hamilton report trigger")
    if not request.get("job_id") or not request.get("report_type"):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="job_id and report_type are required")
    worker_request = {key: value for key, value in request.items() if key != "internal_secret"}
    call = generate_report_command.spawn(worker_request)
    return {
        "ok": True,
        "call_id": call.object_id,
        "job_id": request["job_id"],
    }


def _trigger_monthly_pulse_request() -> dict:
    """Submit one monthly-pulse report request to the canonical report API."""
    import os
    import json
    import urllib.request
    import urllib.error
    from datetime import datetime, timezone
    from fee_crawler.ai_usage import assert_automation_enabled

    assert_automation_enabled("Hamilton monthly pulse trigger")

    app_url = os.environ.get("BFI_APP_URL", "").strip()
    cron_secret = (
        os.environ.get("REPORT_CRON_SECRET")
        or os.environ.get("BFI_REVALIDATE_TOKEN", "")
    ).strip()
    if not app_url:
        return {"triggered": False, "error": "BFI_APP_URL not set"}
    if not cron_secret:
        return {
            "triggered": False,
            "error": "REPORT_CRON_SECRET or BFI_REVALIDATE_TOKEN not set",
        }

    endpoint = f"{app_url.rstrip('/')}/api/reports/generate"
    payload = json.dumps({"report_type": "monthly_pulse"}).encode()

    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-Cron-Secret": cron_secret,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode())
            period = datetime.now(timezone.utc).strftime("%B %Y")
            return {"triggered": True, "job_id": body.get("jobId"), "period": period}
    except urllib.error.HTTPError as exc:
        return {"triggered": False, "error": exc.read().decode()[:500], "status_code": exc.code}
    except Exception as exc:
        return {"triggered": False, "error": str(exc)[:500]}


@app.function(
    schedule=modal.Cron("0 7 1 * *"),
    timeout=60,
    secrets=secrets,
)
def run_monthly_pulse():
    """Explicit monthly Hamilton pulse schedule."""
    result = _trigger_monthly_pulse_request()
    if not result.get("triggered"):
        _mark_job_completion("monthly_pulse", "failed")
        raise RuntimeError(
            f"monthly pulse trigger failed: {result.get('error', 'unknown error')}"
        )
    _mark_job_completion("monthly_pulse", "ok")
    return result


# ----------------------------------------------------------------------
# Darwin v1 — nightly drain + sidecar web endpoint
# ----------------------------------------------------------------------

@app.function(
    image=image,
    secrets=secrets,
    timeout=3600,
)
async def darwin_nightly_drain(size: int = 500):
    """Drain up to 500 unpromoted fees_raw rows via Darwin classifier.

    Manual only — `modal run fee_crawler/modal_app.py::darwin_nightly_drain`.
    Routine classification runs inside the scheduled Atlas cycle."""
    import os
    import logging
    from fee_crawler.ai_usage import assert_automation_enabled_async

    await assert_automation_enabled_async("Darwin manual drain")

    logging.basicConfig(level=logging.INFO)
    log = logging.getLogger(__name__)

    conn = await _connect_asyncpg(os.environ["DATABASE_URL"])
    try:
        from fee_crawler.agents.darwin import classify_batch

        result = await classify_batch(conn, size=size)
        summary = result.to_dict()
        log.info("darwin nightly drain: %s", summary)
        if summary.get("failures") or summary.get("circuit_tripped"):
            raise RuntimeError(f"Darwin drain failed: {summary}")
        return summary
    finally:
        await conn.close()


@app.function(
    image=image,
    secrets=secrets,
    timeout=600,
)
@modal.asgi_app()
def darwin_api():
    """Serve FastAPI sidecar as a Modal web endpoint."""
    from fee_crawler.darwin_api import app as fastapi_app

    return fastapi_app


# ----------------------------------------------------------------------
# Magellan v1 — coverage rescue web endpoint
# ----------------------------------------------------------------------

@app.function(
    image=image,
    secrets=secrets,
    timeout=600,
)
@modal.asgi_app()
def magellan_api():
    """Serve Magellan FastAPI sidecar as a Modal web endpoint."""
    from fee_crawler.magellan_api import app as fastapi_app
    return fastapi_app


# ----------------------------------------------------------------------
# Ops generic runner — invoked from Next.js /admin/ops buttons.
# Replaces the old child_process.spawn path that can't run on Vercel.
# ----------------------------------------------------------------------

@app.function(
    image=image,
    secrets=secrets,
    timeout=7200,  # 2h max for long crawls
    memory=2048,
)
def ops_run_command(command: str, args: list[str], job_id: int) -> dict:
    """Run `python -m fee_crawler <command> <args>` and update ops_jobs row.

    Called via spawn from the web endpoint below. Not web-accessible directly.
    """
    import os
    import psycopg2
    import threading

    dsn = os.environ["DATABASE_URL"]

    def _update(
        status: str,
        *,
        exit_code: int | None = None,
        stdout_tail: str | None = None,
        result_summary: str | None = None,
        error_summary: str | None = None,
    ):
        try:
            conn = psycopg2.connect(dsn)
            with conn.cursor() as cur:
                if status == "running":
                    cur.execute(
                        """UPDATE ops_jobs
                              SET status = 'running',
                                  started_at = COALESCE(started_at, NOW()),
                                  heartbeat_at = NOW(),
                                  updated_at = NOW()
                            WHERE id = %s AND status = 'queued'""",
                        (job_id,),
                    )
                else:
                    cur.execute(
                        """UPDATE ops_jobs
                              SET status = %s,
                                  completed_at = NOW(),
                                  heartbeat_at = NOW(),
                                  exit_code = %s,
                                  stdout_tail = COALESCE(%s, stdout_tail),
                                  result_summary = COALESCE(%s, result_summary),
                                  error_summary = %s,
                                  updated_at = NOW()
                            WHERE id = %s
                              AND status IN ('queued', 'running')""",
                        (
                            status,
                            exit_code,
                            stdout_tail,
                            result_summary,
                            error_summary,
                            job_id,
                        ),
                    )
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"ops_jobs update failed job={job_id} status={status}: {e}")

    from fee_crawler.ai_usage import EmergencyStopActive, assert_automation_enabled
    try:
        assert_automation_enabled(f"Modal {command} worker")
    except EmergencyStopActive as exc:
        _update("cancelled", error_summary=str(exc))
        return {"status": "cancelled", "reason": str(exc)}

    _update("running")
    heartbeat_stop = threading.Event()

    def _heartbeat() -> None:
        while not heartbeat_stop.wait(60):
            try:
                conn = psycopg2.connect(dsn)
                with conn.cursor() as cur:
                    cur.execute(
                        """UPDATE ops_jobs
                              SET heartbeat_at = NOW(), updated_at = NOW()
                            WHERE id = %s AND status IN ('running', 'cancel_requested')""",
                        (job_id,),
                    )
                conn.commit()
                conn.close()
            except Exception as exc:
                print(f"ops_jobs heartbeat failed job={job_id}: {exc}")

    heartbeat = threading.Thread(target=_heartbeat, daemon=True)
    heartbeat.start()
    try:
        env = {
            **os.environ,
            "DATABASE_URL": dsn,
            "BFI_TRIGGER_SOURCE": "admin",
            "BFI_TRIGGERED_BY": f"ops_job:{job_id}",
            "BFI_OPS_JOB_ID": str(job_id),
        }
        result = run_checked(
            ["python3", "-m", "fee_crawler", command, *args],
            env=env, timeout=7000,
        )
        stdout_tail = (result.stdout or "")[-2000:]
        if command == "pipeline":
            _mark_job_completion("atlas_cycle", "ok")
        _update(
            "completed",
            exit_code=result.returncode,
            stdout_tail=stdout_tail,
            result_summary=f"{command} completed successfully",
        )
        return {"status": "completed", "returncode": result.returncode, "stdout_tail": stdout_tail}
    except Exception as e:
        if command == "pipeline":
            try:
                _mark_job_completion("atlas_cycle", "failed")
            except Exception as marker_error:
                print(f"atlas_cycle failure marker write failed: {marker_error}")
        exit_code = e.returncode if isinstance(e, SubprocessFailed) else None
        stdout_tail = e.stdout_tail if isinstance(e, SubprocessFailed) else None
        if isinstance(e, SubprocessFailed):
            detail = e.stderr_tail or e.stdout_tail or str(e)
            error_summary = (
                f"{command} exited {e.returncode}: "
                + " ".join(detail.split())[-900:]
            )
        else:
            error_summary = str(e)[:1000]
        _update(
            "failed",
            exit_code=exit_code,
            stdout_tail=stdout_tail,
            error_summary=error_summary,
        )
        raise
    finally:
        heartbeat_stop.set()
        heartbeat.join(timeout=2)


class RunCommandRequest(_BaseModel):
    """Body of POST /ops/run_command."""
    command: str
    args: list[str] = []
    job_id: int
    internal_secret: str


class CancelCommandRequest(_BaseModel):
    """Body of POST /ops/cancel."""
    job_id: int
    call_id: str
    internal_secret: str


def _verify_internal_secret(provided: str) -> None:
    import hmac
    import os
    from fastapi import HTTPException

    configured = os.environ.get("MODAL_INTERNAL_SECRET") or os.environ.get(
        "REPORT_INTERNAL_SECRET"
    )
    if not configured:
        raise HTTPException(status_code=503, detail="internal secret is not configured")
    if not hmac.compare_digest(provided, configured):
        raise HTTPException(status_code=401, detail="unauthorized")


def _require_automation_http(context: str) -> None:
    """Block trigger endpoints with an explicit status while the safety gate is closed."""
    from fastapi import HTTPException
    from fee_crawler.ai_usage import EmergencyStopActive, assert_automation_enabled

    try:
        assert_automation_enabled(context)
    except EmergencyStopActive as exc:
        raise HTTPException(status_code=423, detail=str(exc)) from exc


SAFE_OPS_COMMANDS = {
    "crawl", "discover", "validate", "categorize", "auto-review", "analyze",
    "enrich", "outlier-detect", "stats", "ingest-call-reports", "ingest-fdic",
    "ingest-ncua", "ingest-cfpb", "ingest-beige-book", "ingest-fed-content",
    "ingest-fred", "ingest-bls", "ingest-nyfed", "refresh-data", "ingest-ofr",
    "ingest-sod", "ingest-census-acs", "ingest-census-tracts", "snapshot", "seed",
    "backfill-ncua-urls", "merge-fees", "publish-index", "pipeline",
    "rediscover-failed",
    "darwin-drain", "magellan-rescue", "reconcile-runs",
}


@app.function(
    image=image,
    secrets=secrets,
    timeout=60,
)
@modal.fastapi_endpoint(method="POST")
def ops_run(request: RunCommandRequest) -> dict:
    """Web endpoint — fires ops_run_command in the background, returns immediately."""
    _verify_internal_secret(request.internal_secret)
    if request.command not in SAFE_OPS_COMMANDS:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="command is not allowed")
    import json
    import os
    import psycopg2
    from fastapi import HTTPException

    _require_automation_http(f"Modal {request.command} trigger")

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT command, params_json, status FROM ops_jobs WHERE id = %s",
                (request.job_id,),
            )
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="job not found")
    stored_params = row[1] if isinstance(row[1], dict) else json.loads(row[1] or "{}")
    if row[0] != request.command or stored_params.get("args", []) != request.args:
        raise HTTPException(status_code=409, detail="request does not match queued job")
    if row[2] != "queued":
        raise HTTPException(status_code=409, detail=f"job is already {row[2]}")
    call = ops_run_command.spawn(request.command, request.args, request.job_id)
    return {"ok": True, "call_id": call.object_id, "job_id": request.job_id}


@app.function(
    image=image,
    secrets=secrets,
    timeout=60,
)
@modal.fastapi_endpoint(method="POST")
def ops_cancel(request: CancelCommandRequest) -> dict:
    """Cancel the exact Modal call recorded for an active ops_jobs row."""
    _verify_internal_secret(request.internal_secret)
    import os
    import psycopg2
    from fastapi import HTTPException

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT modal_call_id, status
                     FROM ops_jobs
                    WHERE id = %s
                    FOR UPDATE""",
                (request.job_id,),
            )
            row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="job not found")
        if row[0] != request.call_id:
            raise HTTPException(status_code=409, detail="call ID does not match job")
        if row[1] not in ("queued", "running", "cancel_requested"):
            raise HTTPException(status_code=409, detail=f"job is already {row[1]}")

        call = modal.FunctionCall.from_id(request.call_id)
        call.cancel(terminate_containers=False)

        with conn.cursor() as cur:
            cur.execute(
                """UPDATE ops_jobs
                      SET status = 'cancelled',
                          completed_at = NOW(),
                          updated_at = NOW()
                    WHERE id = %s
                      AND status IN ('queued', 'running', 'cancel_requested')
                  RETURNING status""",
                (request.job_id,),
            )
            cancelled = cur.fetchone()
            cur.execute(
                """UPDATE pipeline_runs
                      SET status = 'cancelled',
                          completed_at = COALESCE(completed_at, NOW()),
                          finished_at = COALESCE(finished_at, NOW()),
                          error_msg = COALESCE(
                            error_msg, 'Cancelled through canonical job service'
                          ),
                          error = COALESCE(
                            error, 'Cancelled through canonical job service'
                          )
                    WHERE ops_job_id = %s
                      AND status IN ('queued', 'running')""",
                (request.job_id,),
            )
        if not cancelled or cancelled[0] != "cancelled":
            raise HTTPException(status_code=409, detail="job completed before cancellation was recorded")
        conn.commit()
        return {
            "ok": True,
            "status": "cancelled",
            "job_id": request.job_id,
            "call_id": request.call_id,
        }
    finally:
        conn.close()
