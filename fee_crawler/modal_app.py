"""
Modal serverless workers for Bank Fee Index pipeline.

Replaces GitHub Actions SSH cron with scalable, pay-per-use workers.
Each function runs on Modal's infrastructure with its own schedule.

Deploy: modal deploy fee_crawler/modal_app.py
Test:   modal run fee_crawler/modal_app.py::test_connection
"""

import subprocess as _subprocess

import modal


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
secrets = [modal.Secret.from_name("bfi-secrets")]


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
    schedule=modal.Cron("0 2 * * *"),
    timeout=21600,
    secrets=secrets,
    memory=2048,
)
async def run_discovery():
    """Nightly URL discovery: sweep institutions with website but no fee URL."""
    from fee_crawler.workers.discovery_worker import run
    return await run(concurrency=20)


@app.function(
    schedule=modal.Cron("0 3 * * *"),
    timeout=10800,
    secrets=secrets,
    memory=1024,
    image=pdf_image,
)
def run_pdf_extraction():
    """Nightly PDF extraction: fast, cheap worker (no browser needed)."""
    import os
    env = {**os.environ, "DATABASE_URL": os.environ["DATABASE_URL"]}
    result = run_checked(
        ["python3", "-m", "fee_crawler", "crawl",
         "--limit", "500", "--workers", "4", "--include-failing",
         "--doc-type", "pdf"],
        env=env, timeout=7200,
    )
    return result.stdout[-1000:] if result.stdout else ""


@app.function(
    schedule=modal.Cron("0 4 * * *"),
    timeout=14400,
    secrets=secrets,
    memory=2048,
    image=browser_image,
)
def run_browser_extraction():
    """Nightly browser extraction: Playwright for JS-rendered pages."""
    import os
    env = {**os.environ, "DATABASE_URL": os.environ["DATABASE_URL"]}
    result = run_checked(
        ["python3", "-m", "fee_crawler", "crawl",
         "--limit", "500", "--workers", "2", "--include-failing"],
        env=env, timeout=10800,
    )
    return result.stdout[-1000:] if result.stdout else ""


# D-05 pivot (Phase 62b, Plan 62B-08): Modal Starter tier caps at 5 cron slots.
# Rather than add a 6th slot for review_dispatcher, this function now ticks every
# minute — calling dispatch_ticks() first (LOOP-03 agent review dispatch), then
# running the original daily post-processing pipeline only at 06:00. See research
# §Mechanics 3 / Pitfall 1 and 62B-08-SUMMARY.md for the decision rationale.
@app.function(
    schedule=modal.Cron("* * * * *"),
    timeout=3600,
    secrets=secrets,
    memory=1024,
)
async def run_post_processing():
    """Every-minute dispatcher for agent review_ticks + once-daily post-processing pipeline."""
    import os
    import psycopg2
    from datetime import datetime, timezone, timedelta

    # Every minute: dispatch pending agent review_ticks (LOOP-03 D-05 pivot).
    try:
        from fee_crawler.agent_base.dispatcher import dispatch_ticks
        dispatched = await dispatch_ticks()
        if dispatched:
            print(f"dispatch_ticks: invoked {dispatched} agent review(s)")
    except Exception as exc:
        # Never let tick dispatch block the daily pipeline.
        print(f"dispatch_ticks failed (non-fatal): {exc}")

    now = datetime.now(timezone.utc)

    # 05:00-05:09 UTC window: Magellan rescue + Knox review.
    # Piggybacks on the every-minute dispatcher so we stay inside the 5-cron Modal
    # Starter cap. Gated on workers_last_run markers so each runs once per day.
    today_0500 = now.replace(hour=5, minute=0, second=0, microsecond=0)
    if today_0500 <= now < today_0500 + timedelta(minutes=10):
        await _run_0500_jobs(now, today_0500)

    # WR-05 fix: widen the trigger window to 06:00-06:09 UTC to absorb Modal
    # cron jitter, and gate actual work on a workers_last_run marker so we
    # run at most once per UTC day (idempotent catch-up if we missed 06:00).
    today_0600 = now.replace(hour=6, minute=0, second=0, microsecond=0)
    if now < today_0600 or now >= today_0600 + timedelta(minutes=10):
        return "dispatch_only"

    db_url = os.environ["DATABASE_URL"]
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute(
            "SELECT completed_at FROM workers_last_run WHERE job_name = %s",
            ("daily_pipeline",),
        )
        row = cur.fetchone()
        last_completed = row[0] if row else None
        cur.close()
        conn.close()
    except Exception as exc:
        # If we can't read the marker, fall through rather than silently skipping.
        print(f"workers_last_run read failed (proceeding anyway): {exc}")
        last_completed = None

    if last_completed is not None and last_completed >= today_0600:
        return "dispatch_only"

    # If we're past 06:01 and still about to run, log a WARNING so missed
    # windows are observable in the Modal dashboard.
    if now >= today_0600 + timedelta(minutes=2):
        delay_s = int((now - today_0600).total_seconds())
        print(
            f"WARNING: daily_pipeline running {delay_s}s after 06:00 UTC "
            "(cron jitter or catch-up)"
        )

    env = {**os.environ, "DATABASE_URL": db_url}
    commands = [
        ["python3", "-m", "fee_crawler", "categorize"],
        ["python3", "-m", "fee_crawler", "auto-review"],
        # Drain fees_verified -> fees_published before snapshot/publish-index
        # so the index cache reflects newly-published rows in the same cycle.
        ["python3", "-m", "fee_crawler", "publish-fees", "--apply", "--limit", "2000"],
        ["python3", "-m", "fee_crawler", "snapshot"],
        ["python3", "-m", "fee_crawler", "publish-index"],
    ]
    results = []
    for cmd in commands:
        run_checked(cmd, env=env)
        results.append(f"{cmd[-1]}: OK")

    # Run data integrity checks
    from fee_crawler.workers.data_integrity import run_checks, print_report
    integrity = run_checks()
    print(print_report(integrity))

    # Generate daily report
    from fee_crawler.workers.daily_report import generate_report
    report = generate_report()
    print(report)

    # Record completion so subsequent minute-ticks skip until tomorrow.
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO workers_last_run (job_name, completed_at, status)
               VALUES (%s, NOW(), %s)
               ON CONFLICT (job_name) DO UPDATE
                 SET completed_at = EXCLUDED.completed_at,
                     status       = EXCLUDED.status""",
            ("daily_pipeline", "ok"),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as exc:
        # Marker write failures should not mask a successful pipeline, but
        # leave a breadcrumb so operators notice recurring double-runs.
        print(f"workers_last_run write failed (pipeline still succeeded): {exc}")

    return f"Pipeline: {'; '.join(results)} | Integrity: {integrity['score']}% ({integrity['passed']}/{integrity['total']} passed)"


async def _run_0500_jobs(now, today_0500) -> None:
    """05:00 UTC daily jobs: Magellan URL rescue + Knox adversarial review.

    Piggybacks on run_post_processing's every-minute dispatcher so we don't
    exceed Modal Starter's 5-cron cap. Each job is gated by its own
    workers_last_run marker so it runs once per UTC day.
    """
    import os
    import psycopg2
    import asyncpg

    db_url = os.environ["DATABASE_URL"]

    def _already_ran(job_name: str) -> bool:
        try:
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute(
                "SELECT completed_at FROM workers_last_run WHERE job_name = %s",
                (job_name,),
            )
            row = cur.fetchone()
            cur.close()
            conn.close()
            return row is not None and row[0] is not None and row[0] >= today_0500
        except Exception as exc:
            print(f"[{job_name}] marker read failed (running anyway): {exc}")
            return False

    def _mark_ran(job_name: str, status: str = "ok") -> None:
        try:
            conn = psycopg2.connect(db_url)
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
            print(f"[{job_name}] marker write failed: {exc}")

    # --- Magellan URL rescue ---
    if not _already_ran("magellan_rescue"):
        try:
            from fee_crawler.agents.magellan.orchestrator import rescue_batch
            conn = await asyncpg.connect(db_url)
            try:
                result = await rescue_batch(conn, size=200)
                print(f"magellan_rescue: {result.to_dict() if hasattr(result, 'to_dict') else result}")
            finally:
                await conn.close()
            _mark_ran("magellan_rescue", "ok")
        except Exception as exc:
            print(f"magellan_rescue failed (non-fatal): {exc}")
            _mark_ran("magellan_rescue", "failed")

    # --- Knox adversarial review ---
    if not _already_ran("knox_review"):
        try:
            from fee_crawler.agents.knox.orchestrator import review_batch
            result = await review_batch(limit=500)
            print(f"knox_review: {result.to_dict()}")
            _mark_ran("knox_review", "ok")
        except Exception as exc:
            print(f"knox_review failed (non-fatal): {exc}")
            _mark_ran("knox_review", "failed")


@app.function(
    schedule=modal.Cron("0 10 * * *"),
    timeout=7200,
    secrets=secrets,
)
def ingest_data():
    """Daily + weekly data refreshes. Weekly jobs run on Mondays."""
    import os
    from datetime import datetime, timezone
    env = {**os.environ, "DATABASE_URL": os.environ["DATABASE_URL"]}
    results = []
    failures = []

    # Daily: FRED, NYFED, BLS, OFR
    for cmd in ["ingest-fred", "ingest-nyfed", "ingest-bls", "ingest-ofr"]:
        try:
            run_checked(["python3", "-m", "fee_crawler", cmd], env=env)
            results.append(f"{cmd}: OK")
        except SubprocessFailed as exc:
            results.append(f"{cmd}: FAIL ({exc.returncode})")
            failures.append(cmd)

    # Weekly (Monday only): FDIC, NCUA, CFPB, SOD, Beige Book, Call Reports
    if datetime.now(timezone.utc).weekday() == 0:
        for cmd in ["ingest-fdic", "ingest-ncua", "ingest-cfpb", "ingest-sod",
                     "ingest-beige-book", "ingest-call-reports", "ingest-census-acs"]:
            try:
                run_checked(["python3", "-m", "fee_crawler", cmd], env=env)
                results.append(f"{cmd}: OK")
            except SubprocessFailed as exc:
                results.append(f"{cmd}: FAIL ({exc.returncode})")
                failures.append(cmd)

    # Quarterly (Feb 15, May 15, Aug 15, Nov 15): full FFIEC + NCUA ingestion
    # Runs on approximate FFIEC release dates (~45 days after quarter end).
    # No new cron added -- stays inside ingest_data to respect 5-cron limit.
    now = datetime.now(timezone.utc)
    is_quarterly = now.month in (2, 5, 8, 11) and now.day == 15
    if is_quarterly:
        for cmd in ["ingest-call-reports", "ingest-ncua"]:
            try:
                run_checked(["python3", "-m", "fee_crawler", cmd], env=env, timeout=3600)
                results.append(f"quarterly-{cmd}: OK")
            except SubprocessFailed as exc:
                results.append(f"quarterly-{cmd}: FAIL ({exc.returncode})")
                failures.append(f"quarterly-{cmd}")

    summary = "; ".join(results)
    if failures:
        raise RuntimeError(
            f"ingest_data: {len(failures)} ingestor(s) failed: "
            f"{', '.join(failures)}. Full summary: {summary}"
        )
    return summary


@app.function(timeout=300, secrets=secrets)
def check_integrity():
    """On-demand data integrity check."""
    from fee_crawler.workers.data_integrity import run_checks, print_report
    results = run_checks()
    report = print_report(results)
    print(report)
    return f"Score: {results['score']}% ({results['passed']}/{results['total']} passed)"


from pydantic import BaseModel as _BaseModel


class DiscoverRequest(_BaseModel):
    website_url: str
    institution_id: int | None = None


class StateAgentRequest(_BaseModel):
    state_code: str


class ExtractRequest(_BaseModel):
    target_id: int


@app.function(secrets=secrets, timeout=180, memory=2048, image=browser_image)
@modal.fastapi_endpoint(method="POST")
def extract_single(item: ExtractRequest) -> dict:
    """HTTP endpoint to extract fees from a single institution by ID."""
    import os
    import json
    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(
        os.environ["DATABASE_URL"],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    cur = conn.cursor()
    cur.execute("SELECT * FROM crawl_targets WHERE id = %s", (item.target_id,))
    inst = cur.fetchone()

    if not inst:
        conn.close()
        return {"error": "Institution not found", "ok": False}
    if not inst["fee_schedule_url"]:
        conn.close()
        return {"error": "No fee schedule URL set", "ok": False}

    from fee_crawler.agents.classify import classify_document
    from fee_crawler.agents.extract_pdf import extract_pdf
    from fee_crawler.agents.extract_html import extract_html
    from fee_crawler.agents.extract_js import extract_js
    from fee_crawler.agents.state_agent import _write_fees

    url = inst["fee_schedule_url"]
    doc_type = classify_document(url)

    if doc_type == "pdf":
        fees = extract_pdf(url, inst)
    elif doc_type == "js_rendered":
        fees = extract_js(url, inst)
    else:
        fees = extract_html(url, inst)

    if fees:
        _write_fees(conn, inst["id"], fees)

    conn.close()
    return {"ok": True, "feeCount": len(fees), "docType": doc_type}


@app.function(secrets=secrets, timeout=120)
@modal.fastapi_endpoint(method="POST")
def discover_url(item: DiscoverRequest) -> dict:
    """HTTP endpoint for single-institution URL discovery."""
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
    from fee_crawler.agents.state_agent import run_state_agent as _run

    state_code = item.state_code.upper()
    if len(state_code) != 2:
        return {"error": "state_code must be a 2-letter code"}

    return _run(state_code)


@app.function(secrets=secrets, timeout=600, image=browser_image, memory=2048)
@modal.fastapi_endpoint(method="POST")
async def generate_report(request: dict) -> dict:
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


@app.function(
    # Cron removed — Modal free tier limited to 5 cron jobs.
    # Trigger manually from /admin/hamilton or merge with existing cron.
    timeout=60,
    secrets=secrets,
)
def run_monthly_pulse():
    """Manual-only trigger for the monthly pulse report.

    NOT scheduled. Modal free tier is capped at 5 cron jobs and all five
    slots are taken by run_discovery, run_pdf_extraction, run_browser_extraction,
    run_post_processing, and ingest_data. Invoke this function manually:

        modal run fee_crawler/modal_app.py::run_monthly_pulse

    Or trigger from /admin/hamilton. Reads BFI_APP_URL (the same env var
    used by the rest of the report stack — see src/app/api/reports/*).
    """
    import os
    import json
    import urllib.request
    import urllib.error
    from datetime import datetime, timezone

    app_url = os.environ.get("BFI_APP_URL", "")
    cron_secret = os.environ.get("REPORT_CRON_SECRET", "")
    if not app_url:
        return {"triggered": False, "error": "BFI_APP_URL not set"}
    if not cron_secret:
        return {"triggered": False, "error": "REPORT_CRON_SECRET not set"}

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


# ----------------------------------------------------------------------
# Darwin v1 — nightly drain + sidecar web endpoint
# ----------------------------------------------------------------------

@app.function(
    image=image,
    secrets=secrets,
    timeout=3600,
)
async def darwin_nightly_drain():
    """Drain up to 500 unpromoted fees_raw rows via Darwin classifier.

    Manual only — `modal run fee_crawler/modal_app.py::darwin_nightly_drain`.
    Not scheduled because the Modal free-plan cron limit (5) is saturated."""
    import asyncpg
    import os
    import logging

    logging.basicConfig(level=logging.INFO)
    log = logging.getLogger(__name__)

    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        from fee_crawler.agents.darwin import classify_batch

        result = await classify_batch(conn, size=500)
        log.info("darwin nightly drain: %s", result.to_dict())
    finally:
        await conn.close()


@app.function(
    image=image,
    secrets=secrets,
    timeout=600,
    min_containers=1,  # avoid cold-start on UI clicks
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
    min_containers=1,
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
    import json
    import psycopg2

    dsn = os.environ["DATABASE_URL"]

    def _update(status: str, result: dict | None = None, error: str | None = None):
        try:
            conn = psycopg2.connect(dsn)
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE ops_jobs
                          SET status = %s,
                              result_json = COALESCE(%s::JSONB, result_json),
                              error = %s,
                              updated_at = NOW()
                        WHERE id = %s""",
                    (status, json.dumps(result) if result else None, error, job_id),
                )
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"ops_jobs update failed job={job_id} status={status}: {e}")

    _update("running")
    try:
        env = {**os.environ, "DATABASE_URL": dsn}
        result = run_checked(
            ["python3", "-m", "fee_crawler", command, *args],
            env=env, timeout=7000,
        )
        stdout_tail = (result.stdout or "")[-2000:]
        _update("completed", result={"stdout_tail": stdout_tail, "returncode": result.returncode})
        return {"status": "completed", "returncode": result.returncode, "stdout_tail": stdout_tail}
    except Exception as e:
        _update("failed", error=str(e)[:500])
        raise


class RunCommandRequest(_BaseModel):
    """Body of POST /ops/run_command."""
    command: str
    args: list[str] = []
    job_id: int


@app.function(
    image=image,
    secrets=secrets,
    timeout=60,
)
@modal.fastapi_endpoint(method="POST")
def ops_run(request: RunCommandRequest) -> dict:
    """Web endpoint — fires ops_run_command in the background, returns immediately."""
    call = ops_run_command.spawn(request.command, request.args, request.job_id)
    return {"ok": True, "call_id": call.object_id, "job_id": request.job_id}
