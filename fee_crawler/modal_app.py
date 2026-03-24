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
    .add_local_dir("fee_crawler", remote_path="/root/fee_crawler")
)

browser_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("tesseract-ocr", "poppler-utils")
    .pip_install_from_requirements("fee_crawler/requirements.txt")
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
    timeout=3600,
    secrets=secrets,
)
def ingest_daily():
    """Daily data refreshes: FRED, NYFED, BLS, OFR."""
    import os
    import subprocess
    env = {**os.environ, "DATABASE_URL": os.environ["DATABASE_URL"]}
    results = []
    for cmd in ["ingest-fred", "ingest-nyfed", "ingest-bls", "ingest-ofr"]:
        r = subprocess.run(["python3", "-m", "fee_crawler", cmd],
                           capture_output=True, text=True, env=env)
        results.append(f"{cmd}: {'OK' if r.returncode == 0 else 'FAIL'}")
    return "; ".join(results)


@app.function(
    schedule=modal.Cron("0 10 * * 1"),
    timeout=7200,
    secrets=secrets,
)
def ingest_weekly():
    """Weekly data refreshes: FDIC, NCUA, CFPB, SOD, Beige Book, Call Reports."""
    import os
    import subprocess
    env = {**os.environ, "DATABASE_URL": os.environ["DATABASE_URL"]}
    results = []
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
