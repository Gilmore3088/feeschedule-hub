"""
Modal serverless workers for Bank Fee Index pipeline.

Replaces GitHub Actions SSH cron with scalable, pay-per-use workers.
Each function runs on Modal's infrastructure with its own schedule.

Deploy: modal deploy fee_crawler/modal_app.py
Test:   modal run fee_crawler/modal_app.py::test_connection
"""

import modal

# Build the worker image with all Python dependencies
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("tesseract-ocr", "poppler-utils")
    .pip_install_from_requirements("fee_crawler/requirements.txt")
)

app = modal.App("bank-fee-index-workers", image=image)
secrets = [modal.Secret.from_name("bfi-secrets")]

DAILY_LLM_BUDGET_USD = 20.0


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
    schedule=modal.Cron("0 2 * * *"),  # 2am UTC nightly
    timeout=21600,  # 6 hour max
    secrets=secrets,
)
async def run_discovery():
    """Nightly URL discovery sweep.

    Pulls institutions without fee_schedule_url from the jobs queue,
    probes their websites for fee schedule documents using platform-aware
    path patterns and search discovery.

    No LLM cost — pure HTTP probing.
    """
    import os
    import psycopg2

    db_url = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Count pending discovery jobs
    cur.execute("SELECT COUNT(*) FROM jobs WHERE queue = 'discovery' AND status = 'pending'")
    pending = cur.fetchone()[0]

    if pending == 0:
        conn.close()
        return "No pending discovery jobs."

    # TODO: Implement async discovery worker with httpx
    # For now, log the count and exit
    conn.close()
    return f"{pending:,} discovery jobs pending. Worker not yet implemented."


@app.function(
    schedule=modal.Cron("0 3 * * *"),  # 3am UTC nightly, after discovery
    timeout=14400,  # 4 hour max
    secrets=secrets,
)
async def run_extraction():
    """Nightly fee extraction for institutions with fee URLs.

    Downloads documents, classifies them, and extracts text.
    Queues successful extractions for LLM batch processing.
    """
    import os
    import psycopg2

    db_url = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM jobs WHERE queue = 'extract' AND status = 'pending'")
    pending = cur.fetchone()[0]

    if pending == 0:
        conn.close()
        return "No pending extraction jobs."

    # TODO: Implement extraction worker
    conn.close()
    return f"{pending:,} extraction jobs pending. Worker not yet implemented."


@app.function(
    schedule=modal.Cron("0 1 * * *"),  # 1am UTC nightly
    timeout=7200,  # 2 hour max
    secrets=secrets,
)
async def run_llm_batch():
    """Nightly LLM batch extraction using Claude Haiku + Batch API.

    Collects all pending llm_batch jobs, groups by state for locality-aware
    batching, submits to Anthropic Batch API. Polls for completion and
    writes results to extracted_fees.

    Daily budget cap: $20 = ~10,000 institutions.
    """
    import os
    import psycopg2

    db_url = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM jobs WHERE queue = 'llm_batch' AND status = 'pending'")
    pending = cur.fetchone()[0]

    if pending == 0:
        conn.close()
        return "No pending LLM batch jobs."

    # TODO: Implement Haiku batch worker with budget cap
    conn.close()
    return f"{pending:,} LLM batch jobs pending. Worker not yet implemented."


@app.function(
    schedule=modal.Cron("0 6 * * *"),  # 6am UTC nightly
    timeout=3600,  # 1 hour max
    secrets=secrets,
)
async def run_post_processing():
    """Post-extraction validation, categorization, and auto-review.

    Runs after extraction completes:
    1. Validate extracted fees against amount bounds
    2. Categorize using FEE_NAME_ALIASES
    3. Auto-stage fees above confidence threshold
    4. Compute completeness scores
    5. Write coverage snapshot
    """
    import os
    import psycopg2

    db_url = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Count new unprocessed fees
    cur.execute("""
        SELECT COUNT(*) FROM extracted_fees
        WHERE review_status = 'pending'
        AND fee_category IS NULL
    """)
    unprocessed = cur.fetchone()[0]

    if unprocessed == 0:
        conn.close()
        return "No unprocessed fees."

    # TODO: Implement post-processing pipeline
    conn.close()
    return f"{unprocessed:,} unprocessed fees. Worker not yet implemented."
