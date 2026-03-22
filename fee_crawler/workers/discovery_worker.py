"""Async URL discovery worker.

Sweeps institutions with website_url but no fee_schedule_url.
Uses httpx + asyncio with platform-aware path probing.
Pulls work from the jobs table using FOR UPDATE SKIP LOCKED.
"""

import asyncio
import os
import logging

import httpx
import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)

COMMON_FEE_PATHS = [
    "/fee-schedule",
    "/fees",
    "/personal/fee-schedule",
    "/resources/fee-schedule",
    "/disclosures/fee-schedule",
    "/personal-banking/fees",
    "/about/fee-schedule",
    "/consumer-fee-schedule",
    "/wp-content/uploads/fee-schedule.pdf",
    "/wp-content/uploads/fees.pdf",
    "/sites/default/files/fee-schedule.pdf",
    "/sites/default/files/fees.pdf",
]

FEE_SCHEDULE_INDICATORS = [
    "fee schedule", "schedule of fees", "fee disclosure",
    "service charges", "account fees",
]


async def probe_url(client: httpx.AsyncClient, base_url: str, path: str) -> dict | None:
    """Probe a single URL path for a fee schedule."""
    url = f"{base_url.rstrip('/')}{path}"
    try:
        resp = await client.head(url, follow_redirects=True, timeout=10)
        if resp.status_code == 200:
            content_type = resp.headers.get("content-type", "")
            if "pdf" in content_type or "html" in content_type or "text" in content_type:
                return {"url": url, "content_type": content_type, "path": path}
    except (httpx.TimeoutException, httpx.ConnectError, httpx.TooManyRedirects):
        pass
    return None


async def discover_one(client: httpx.AsyncClient, institution: dict) -> str | None:
    """Try to discover the fee schedule URL for one institution."""
    website = institution.get("website_url")
    if not website:
        return None

    # Get platform-specific paths if CMS is known
    platform = institution.get("cms_platform")
    paths = list(COMMON_FEE_PATHS)

    # TODO: look up platform_registry for platform-specific paths

    tasks = [probe_url(client, website, p) for p in paths]
    results = await asyncio.gather(*tasks)

    for result in results:
        if result:
            return result["url"]

    return None


async def run(concurrency: int = 20, limit: int = 5000):
    """Main discovery worker loop."""
    db_url = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Claim a batch of jobs using FOR UPDATE SKIP LOCKED
    cur.execute("""
        UPDATE jobs SET status = 'running', locked_at = NOW(), locked_by = 'discovery-worker'
        WHERE id IN (
            SELECT id FROM jobs
            WHERE queue = 'discovery' AND status = 'pending'
            ORDER BY priority DESC, id ASC
            LIMIT %s
            FOR UPDATE SKIP LOCKED
        )
        RETURNING entity_id
    """, (limit,))
    job_rows = cur.fetchall()
    conn.commit()

    if not job_rows:
        conn.close()
        return "No pending discovery jobs."

    entity_ids = [r["entity_id"] for r in job_rows]
    logger.info("Claimed %d discovery jobs", len(entity_ids))

    # Fetch institution details
    cur.execute("""
        SELECT id, institution_name, website_url, cms_platform
        FROM crawl_targets
        WHERE id = ANY(%s)
    """, (entity_ids,))
    institutions = cur.fetchall()

    discovered = 0
    async with httpx.AsyncClient(
        limits=httpx.Limits(max_connections=concurrency),
        follow_redirects=True,
    ) as client:
        sem = asyncio.Semaphore(concurrency)

        async def process(inst):
            nonlocal discovered
            async with sem:
                url = await discover_one(client, inst)
                if url:
                    discovered += 1
                    return (inst["id"], url)
                return (inst["id"], None)

        tasks = [process(inst) for inst in institutions]
        results = await asyncio.gather(*tasks)

    # Write results back
    for target_id, fee_url in results:
        if fee_url:
            cur.execute("""
                UPDATE crawl_targets
                SET fee_schedule_url = %s
                WHERE id = %s AND fee_schedule_url IS NULL
            """, (fee_url, target_id))
            cur.execute("""
                UPDATE jobs SET status = 'completed', completed_at = NOW()
                WHERE queue = 'discovery' AND entity_id = %s
            """, (str(target_id),))
        else:
            cur.execute("""
                UPDATE jobs SET status = 'completed', completed_at = NOW(),
                       error = 'no_fee_url_found'
                WHERE queue = 'discovery' AND entity_id = %s
            """, (str(target_id),))

    conn.commit()
    conn.close()

    return f"Discovery complete. {discovered}/{len(institutions)} URLs found."
