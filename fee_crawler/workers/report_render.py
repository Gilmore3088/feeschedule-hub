"""
Report render worker — HTML → PDF → R2.

Three helpers:
    update_job_status()  — write job status to Supabase via psycopg2
    upload_to_r2()       — upload PDF bytes to Cloudflare R2 via boto3
    render_and_store()   — Playwright: set_content → pdf() → upload_to_r2

Called by generate_report() in modal_app.py. Never called from Next.js routes.
"""

from __future__ import annotations

import os
import re
from typing import Optional

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

TERMINAL_STATUSES = {"complete", "failed"}

# R2 key pattern per D-03: reports/{report_type}/{job_id}.pdf
R2_KEY_TEMPLATE = "reports/{report_type}/{job_id}.pdf"


def _validate_job_id(job_id: str) -> None:
    """Raise ValueError if job_id is not a valid UUID (T-13-05 mitigation)."""
    if not _UUID_RE.match(job_id):
        raise ValueError(f"job_id is not a valid UUID: {job_id!r}")


def update_job_status(
    job_id: str,
    status: str,
    artifact_key: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    """
    Write job status to the report_jobs table in Supabase.

    Sets completed_at only for terminal statuses ('complete', 'failed').
    Credentials come from the DATABASE_URL environment variable.
    """
    import psycopg2  # noqa: PLC0415 — imported inside fn for Modal cold-start clarity

    _validate_job_id(job_id)

    database_url = os.environ["DATABASE_URL"]

    if status in TERMINAL_STATUSES:
        sql = """
            UPDATE report_jobs
               SET status       = %s,
                   artifact_key = %s,
                   error        = %s,
                   completed_at = NOW()
             WHERE id = %s
        """
    else:
        sql = """
            UPDATE report_jobs
               SET status       = %s,
                   artifact_key = %s,
                   error        = %s
             WHERE id = %s
        """

    conn = psycopg2.connect(database_url)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, (status, artifact_key, error, job_id))
    finally:
        conn.close()


def upload_to_r2(pdf_bytes: bytes, key: str) -> str:
    """
    Upload PDF bytes to Cloudflare R2 and return the object key.

    Credentials are read from environment variables — never hardcoded.
    Returns the key, not a URL (per D-03; presigned URLs generated at download time).
    """
    import boto3  # noqa: PLC0415

    r2_endpoint = os.environ["R2_ENDPOINT"]
    access_key = os.environ["R2_ACCESS_KEY_ID"]
    secret_key = os.environ["R2_SECRET_ACCESS_KEY"]
    bucket = os.environ.get("R2_BUCKET", "bfi-reports")

    client = boto3.client(
        "s3",
        endpoint_url=r2_endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )

    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=pdf_bytes,
        ContentType="application/pdf",
    )

    return key


async def render_and_store(html: str, job_id: str, report_type: str) -> str:
    """
    Render HTML to PDF via Playwright (Chromium) and upload the result to R2.

    Steps:
        1. Launch headless Chromium via playwright.async_api
        2. Load the assembled HTML (wait_until='networkidle' for font/CSS settle)
        3. Export Letter-format PDF with 0.75in margins and background printing
        4. Upload PDF bytes to R2 under reports/{report_type}/{job_id}.pdf
        5. Return the R2 key

    Caller (generate_report in modal_app.py) is responsible for calling
    update_job_status() before and after this function.
    """
    from playwright.async_api import async_playwright  # noqa: PLC0415

    _validate_job_id(job_id)

    r2_key = R2_KEY_TEMPLATE.format(report_type=report_type, job_id=job_id)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            page = await browser.new_page()
            await page.set_content(html, wait_until="networkidle")
            pdf_bytes: bytes = await page.pdf(
                format="Letter",
                print_background=True,
                margin={
                    "top": "0.75in",
                    "right": "0.75in",
                    "bottom": "0.75in",
                    "left": "0.75in",
                },
            )
        finally:
            await browser.close()

    upload_to_r2(pdf_bytes, r2_key)
    return r2_key
