"""
Modal serverless workers for Bank Fee Index pipeline.

Replaces GitHub Actions SSH cron with scalable, pay-per-use workers.
Each function runs on Modal's infrastructure with its own schedule.

Deploy: modal deploy fee_crawler/modal_app.py
Test:   modal run fee_crawler/modal_app.py::test_connection
"""

import modal

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
    Runs synchronously — Vercel does not await the response (fire-and-forget fetch).
    """
    import os
    import json
    import urllib.request
    import urllib.error
    from fee_crawler.workers.report_render import render_and_store, update_job_status

    job_id = request.get("job_id", "")
    report_type = request.get("report_type", "")
    params = request.get("params", {})

    if not job_id or not report_type:
        return {"error": "job_id and report_type are required", "status": "error"}

    try:
        # Step 1: Call Next.js assemble endpoint to get HTML
        update_job_status(job_id, "assembling")

        app_url = os.environ.get("BFI_APP_URL", "https://feeinsight.com")
        internal_secret = os.environ.get("REPORT_INTERNAL_SECRET", "")
        if not internal_secret:
            raise ValueError("REPORT_INTERNAL_SECRET not set in Modal secrets")

        assemble_url = f"{app_url.rstrip('/')}/api/reports/{job_id}/assemble"
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
        update_job_status(job_id, "rendering")
        key = await render_and_store(html, job_id, report_type)

        # Step 3: Mark complete
        update_job_status(job_id, "complete", artifact_key=key)
        return {"key": key, "status": "complete"}
    except Exception as exc:
        update_job_status(job_id, "failed", error=str(exc)[:500])
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
