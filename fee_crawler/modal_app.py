"""
Modal serverless workers for Bank Fee Index pipeline.

Replaces GitHub Actions SSH cron with scalable, pay-per-use workers.
Each function runs on Modal's infrastructure with its own schedule.

Deploy: modal deploy fee_crawler/modal_app.py
Test:   modal run fee_crawler/modal_app.py::test_connection
"""

import modal

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("tesseract-ocr", "poppler-utils")
    .pip_install_from_requirements("fee_crawler/requirements.txt")
    .add_local_dir("fee_crawler", remote_path="/root/fee_crawler")
)

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
def run_discovery():
    """Nightly URL discovery: sweep institutions with website but no fee URL."""
    import os
    import subprocess
    env = {**os.environ, "DATABASE_URL": os.environ["DATABASE_URL"]}
    r = subprocess.run(
        ["python3", "-m", "fee_crawler", "discover-urls", "--limit", "500"],
        capture_output=True, text=True, env=env, timeout=18000,
    )
    return r.stdout[-500:] if r.stdout else r.stderr[-500:]


@app.function(
    schedule=modal.Cron("0 1 * * *"),
    timeout=7200,
    secrets=secrets,
    memory=1024,
)
def run_llm_batch():
    """Nightly LLM batch extraction via Anthropic Batch API."""
    from fee_crawler.workers.llm_batch_worker import run
    return run(daily_budget_usd=20.0)


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

    # Generate daily report
    from fee_crawler.workers.daily_report import generate_report
    report = generate_report()
    print(report)

    return "; ".join(results)


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
def daily_report():
    """On-demand performance report. Also runs as part of post_processing."""
    from fee_crawler.workers.daily_report import generate_report
    report = generate_report()
    print(report)
    return report
