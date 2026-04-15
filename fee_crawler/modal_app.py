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
    import subprocess
    env = {**os.environ, "DATABASE_URL": os.environ["DATABASE_URL"]}
    r = subprocess.run(
        ["python3", "-m", "fee_crawler", "crawl",
         "--limit", "500", "--workers", "4", "--include-failing",
         "--doc-type", "pdf"],
        capture_output=True, text=True, env=env, timeout=7200,
    )
    output = r.stdout[-1000:] if r.stdout else r.stderr[-500:]
    return output


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
    import subprocess
    env = {**os.environ, "DATABASE_URL": os.environ["DATABASE_URL"]}
    r = subprocess.run(
        ["python3", "-m", "fee_crawler", "crawl",
         "--limit", "500", "--workers", "2", "--include-failing"],
        capture_output=True, text=True, env=env, timeout=10800,
    )
    output = r.stdout[-1000:] if r.stdout else r.stderr[-500:]
    return output


@app.function(
    schedule=modal.Cron("0 6 * * *"),
    timeout=3600,
    secrets=secrets,
    memory=1024,
)
def run_post_processing():
    """Post-extraction: validate, categorize, auto-review, snapshot."""
    import os
    import subprocess
    env = {**os.environ, "DATABASE_URL": os.environ["DATABASE_URL"]}
    commands = [
        ["python3", "-m", "fee_crawler", "categorize"],
        ["python3", "-m", "fee_crawler", "auto-review"],
        ["python3", "-m", "fee_crawler", "snapshot"],
        ["python3", "-m", "fee_crawler", "publish-index"],
    ]
    results = []
    for cmd in commands:
        r = subprocess.run(cmd, capture_output=True, text=True, env=env)
        results.append(f"{cmd[-1]}: {'OK' if r.returncode == 0 else 'FAIL'}")

    # Run data integrity checks
    from fee_crawler.workers.data_integrity import run_checks, print_report
    integrity = run_checks()
    print(print_report(integrity))

    # Generate daily report
    from fee_crawler.workers.daily_report import generate_report
    report = generate_report()
    print(report)

    return f"Pipeline: {'; '.join(results)} | Integrity: {integrity['score']}% ({integrity['passed']}/{integrity['total']} passed)"


@app.function(
    schedule=modal.Cron("0 10 * * *"),
    timeout=7200,
    secrets=secrets,
)
def ingest_data():
    """Daily + weekly data refreshes. Weekly jobs run on Mondays."""
    import os
    import subprocess
    from datetime import datetime, timezone
    env = {**os.environ, "DATABASE_URL": os.environ["DATABASE_URL"]}
    results = []

    # Daily: FRED, NYFED, BLS, OFR
    for cmd in ["ingest-fred", "ingest-nyfed", "ingest-bls", "ingest-ofr"]:
        r = subprocess.run(["python3", "-m", "fee_crawler", cmd],
                           capture_output=True, text=True, env=env)
        results.append(f"{cmd}: {'OK' if r.returncode == 0 else 'FAIL'}")

    # Weekly (Monday only): FDIC, NCUA, CFPB, SOD, Beige Book, Call Reports
    if datetime.now(timezone.utc).weekday() == 0:
        for cmd in ["ingest-fdic", "ingest-ncua", "ingest-cfpb", "ingest-sod",
                     "ingest-beige-book", "ingest-call-reports", "ingest-census-acs"]:
            r = subprocess.run(["python3", "-m", "fee_crawler", cmd],
                               capture_output=True, text=True, env=env)
            results.append(f"{cmd}: {'OK' if r.returncode == 0 else 'FAIL'}")

    # Quarterly (Feb 15, May 15, Aug 15, Nov 15): full FFIEC + NCUA ingestion
    # Runs on approximate FFIEC release dates (~45 days after quarter end).
    # No new cron added -- stays inside ingest_data to respect 5-cron limit.
    now = datetime.now(timezone.utc)
    is_quarterly = now.month in (2, 5, 8, 11) and now.day == 15
    if is_quarterly:
        for cmd in ["ingest-call-reports", "ingest-ncua"]:
            r = subprocess.run(["python3", "-m", "fee_crawler", cmd],
                               capture_output=True, text=True, env=env,
                               timeout=3600)
            results.append(f"quarterly-{cmd}: {'OK' if r.returncode == 0 else 'FAIL'}")

    return "; ".join(results)


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
    """Monthly pulse report: triggers generation on the 1st of each month at 08:00 UTC."""
    import os
    import json
    import urllib.request
    import urllib.error
    from datetime import datetime, timezone

    app_url = os.environ.get("NEXT_PUBLIC_APP_URL", "")
    cron_secret = os.environ.get("REPORT_CRON_SECRET", "")
    if not app_url:
        return {"triggered": False, "error": "NEXT_PUBLIC_APP_URL not set"}
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
