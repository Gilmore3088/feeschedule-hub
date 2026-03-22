"""Async discovery worker.

Pulls from jobs.queue='discovery' using FOR UPDATE SKIP LOCKED.
Processes 20 institutions concurrently.
Respects per-domain rate limits (0.1s between probes to same domain).
Updates platform_registry hit counts.

Usage:
    DATABASE_URL=[pg] python3 -c \
        "import asyncio; from fee_crawler.workers.discovery_worker import run; asyncio.run(run(concurrency=5))"
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from urllib.parse import urlparse, urljoin

import asyncpg
import httpx

from fee_crawler.pipeline.cms_fingerprint import fingerprint, get_cms_paths
from fee_crawler.pipeline.url_discoverer import (
    COMMON_PATHS,
    FEE_LINK_KEYWORDS,
    FEE_PDF_URL_KEYWORDS,
    FEE_PDF_SINGLE_KEYWORDS,
    NON_FEE_PDF_KEYWORDS,
)

logger = logging.getLogger(__name__)

CONCURRENCY = 20
MAX_PROBES_PER_INSTITUTION = 60
INTER_PROBE_DELAY = 0.1  # seconds between probes to the same domain
USER_AGENT = "Mozilla/5.0 (compatible; BankFeeIndexBot/2.0)"
WORKER_ID = f"discovery-{os.getpid()}"


class DomainRateLimiter:
    """Enforces a minimum delay between requests to the same domain."""

    def __init__(self, min_interval: float = INTER_PROBE_DELAY) -> None:
        self._min_interval = min_interval
        self._last_request: dict[str, float] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    def _get_lock(self, domain: str) -> asyncio.Lock:
        if domain not in self._locks:
            self._locks[domain] = asyncio.Lock()
        return self._locks[domain]

    async def wait(self, url: str) -> None:
        """Wait until it is safe to make a request to this domain."""
        domain = urlparse(url).netloc.lower()
        lock = self._get_lock(domain)
        async with lock:
            now = time.monotonic()
            last = self._last_request.get(domain, 0.0)
            elapsed = now - last
            if elapsed < self._min_interval:
                await asyncio.sleep(self._min_interval - elapsed)
            self._last_request[domain] = time.monotonic()


def _is_fee_url(url: str) -> bool:
    """Check whether a URL path looks like a fee schedule document."""
    path_lower = urlparse(url).path.lower()
    for kw in NON_FEE_PDF_KEYWORDS:
        if kw in path_lower:
            return False
    for kw in FEE_PDF_URL_KEYWORDS:
        if kw in path_lower:
            return True
    for kw in FEE_PDF_SINGLE_KEYWORDS:
        if kw in path_lower:
            return True
    # Broad match on common keywords in URL
    for kw in FEE_LINK_KEYWORDS[:10]:
        slug = kw.replace(" ", "-")
        if slug in path_lower:
            return True
    return False


def _looks_like_fee_document(url: str, content_type: str) -> bool:
    """Determine if the response at this URL is likely a fee schedule."""
    ct = content_type.lower()
    if "pdf" in ct:
        return _is_fee_url(url)
    if "html" in ct or "text" in ct:
        url_lower = url.lower()
        return any(
            kw in url_lower
            for kw in ["fee", "schedule", "disclosure", "pricing", "service-charge"]
        )
    return False


async def claim_job(conn: asyncpg.Connection) -> dict | None:
    """Atomically claim a pending discovery job."""
    row = await conn.fetchrow("""
        UPDATE jobs
        SET status = 'running',
            locked_by = $1,
            locked_at = NOW(),
            attempts = attempts + 1
        WHERE id = (
            SELECT id FROM jobs
            WHERE queue = 'discovery'
              AND status = 'pending'
              AND run_at <= NOW()
              AND attempts < max_attempts
            ORDER BY priority DESC, id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        )
        RETURNING *
    """, WORKER_ID)
    return dict(row) if row else None


async def _update_platform_registry(
    conn: asyncpg.Connection, platform: str
) -> None:
    """Increment the institution count for a CMS platform."""
    await conn.execute("""
        INSERT INTO platform_registry (platform, institution_count)
        VALUES ($1, 1)
        ON CONFLICT (platform) DO UPDATE
        SET institution_count = platform_registry.institution_count + 1,
            last_updated = NOW()
    """, platform)


async def _get_platform_paths(
    conn: asyncpg.Connection, platform: str
) -> list[str]:
    """Look up platform-specific fee paths from the registry."""
    row = await conn.fetchrow(
        "SELECT fee_paths FROM platform_registry WHERE platform = $1",
        platform,
    )
    if row and row["fee_paths"]:
        return list(row["fee_paths"])
    return []


async def _probe_path(
    client: httpx.AsyncClient,
    rate_limiter: DomainRateLimiter,
    base_url: str,
    path: str,
) -> str | None:
    """Probe a single path via HEAD. Returns the final URL if it looks like a fee doc."""
    url = urljoin(base_url, path)
    await rate_limiter.wait(url)
    try:
        resp = await client.head(url, timeout=8, follow_redirects=True)
        if resp.status_code != 200:
            return None
        content_type = resp.headers.get("content-type", "")
        final_url = str(resp.url)
        if _looks_like_fee_document(final_url, content_type):
            return final_url
        # Also check the original path in case redirect obscured it
        if _looks_like_fee_document(url, content_type):
            return final_url
    except (httpx.TimeoutException, httpx.ConnectError, httpx.TooManyRedirects):
        pass
    except Exception as exc:
        logger.debug("Probe error for %s: %s", url, exc)
    return None


async def process_institution(
    inst_id: str,
    pool: asyncpg.Pool,
    client: httpx.AsyncClient,
    rate_limiter: DomainRateLimiter,
) -> bool:
    """Discover fee schedule URL for one institution.

    Returns True if a fee URL was found and saved.
    """
    async with pool.acquire() as conn:
        inst = await conn.fetchrow(
            "SELECT * FROM crawl_targets WHERE id = $1", int(inst_id)
        )
        if not inst:
            logger.debug("Institution %s not found in crawl_targets", inst_id)
            await conn.execute(
                "UPDATE jobs SET status='completed', completed_at=NOW() "
                "WHERE entity_id=$1 AND queue='discovery'",
                inst_id,
            )
            return False

        website_url = inst["website_url"]
        if not website_url:
            await conn.execute(
                "UPDATE jobs SET status='completed', completed_at=NOW(), "
                "error='no_website_url' "
                "WHERE entity_id=$1 AND queue='discovery'",
                inst_id,
            )
            return False

        # Normalize: ensure scheme
        parsed = urlparse(website_url)
        if not parsed.scheme:
            website_url = "https://" + website_url
        base_url = f"{urlparse(website_url).scheme}://{urlparse(website_url).netloc}"

        # -----------------------------------------------------------------
        # Step 1: Fetch homepage, fingerprint CMS
        # -----------------------------------------------------------------
        platform = None
        try:
            await rate_limiter.wait(website_url)
            resp = await client.get(website_url, timeout=10, follow_redirects=True)
            cms_result = fingerprint(
                website_url,
                headers=dict(resp.headers),
                html=resp.text[:50_000],
            )
            platform = cms_result.platform

            if platform:
                await conn.execute("""
                    UPDATE crawl_targets
                    SET cms_platform = $1, cms_confidence = $2
                    WHERE id = $3
                """, platform, cms_result.confidence, int(inst_id))

                await _update_platform_registry(conn, platform)

        except httpx.TimeoutException:
            logger.debug("Homepage timeout for %s", website_url)
        except httpx.ConnectError:
            logger.debug("Homepage connect error for %s", website_url)
        except Exception as exc:
            logger.debug("Homepage fetch failed for %s: %s", website_url, exc)

        # -----------------------------------------------------------------
        # Step 2: Build the path list (platform-specific first, then common)
        # -----------------------------------------------------------------
        paths: list[str] = []

        # CMS-specific paths from the fingerprint module
        if platform:
            paths.extend(get_cms_paths(platform))

        # Platform-specific paths from the registry DB
        if platform:
            try:
                registry_paths = await _get_platform_paths(conn, platform)
                for p in registry_paths:
                    if p not in paths:
                        paths.append(p)
            except Exception:
                pass

        # Append common paths (deduplicated)
        for p in COMMON_PATHS:
            if p not in paths:
                paths.append(p)

        # -----------------------------------------------------------------
        # Step 3: Probe paths sequentially with rate limiting
        # -----------------------------------------------------------------
        found_url = None
        for path in paths[:MAX_PROBES_PER_INSTITUTION]:
            result = await _probe_path(client, rate_limiter, base_url, path)
            if result:
                found_url = result
                break

        # -----------------------------------------------------------------
        # Step 4: Update DB inside a transaction
        # -----------------------------------------------------------------
        async with conn.transaction():
            if found_url:
                await conn.execute("""
                    UPDATE crawl_targets
                    SET fee_schedule_url = $1, last_crawl_at = NOW()
                    WHERE id = $2
                """, found_url, int(inst_id))

                # Push to extraction queue
                asset_size = inst.get("asset_size") or 0
                priority = int(asset_size) // 1_000_000
                await conn.execute("""
                    INSERT INTO jobs (queue, entity_id, priority)
                    VALUES ('extract', $1, $2)
                    ON CONFLICT DO NOTHING
                """, inst_id, priority)

            status = "completed" if found_url else "failed"
            error_msg = None if found_url else "no_fee_url_found"

            if error_msg:
                await conn.execute("""
                    UPDATE jobs
                    SET status = $1, completed_at = NOW(), error = $2
                    WHERE entity_id = $3 AND queue = 'discovery'
                """, status, error_msg, inst_id)
            else:
                await conn.execute("""
                    UPDATE jobs
                    SET status = $1, completed_at = NOW()
                    WHERE entity_id = $2 AND queue = 'discovery'
                """, status, inst_id)

    return found_url is not None


async def run(concurrency: int = CONCURRENCY) -> str:
    """Main discovery worker loop.

    Continuously claims and processes discovery jobs until the queue is empty.
    Returns a summary string.
    """
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL environment variable is required")

    pool = await asyncpg.create_pool(db_url, min_size=5, max_size=concurrency + 5)
    if pool is None:
        raise RuntimeError("Failed to create database connection pool")

    rate_limiter = DomainRateLimiter(min_interval=INTER_PROBE_DELAY)
    semaphore = asyncio.Semaphore(concurrency)
    processed = 0
    found = 0
    tasks: set[asyncio.Task] = set()

    async with httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT},
        limits=httpx.Limits(max_connections=concurrency + 10, max_keepalive_connections=concurrency),
        timeout=15,
        follow_redirects=True,
    ) as client:

        idle_cycles = 0

        while True:
            # Claim a job
            async with pool.acquire() as conn:
                job = await claim_job(conn)

            if not job:
                # No job available right now
                if tasks:
                    # Wait for in-flight tasks to finish, then try again
                    done, tasks = await asyncio.wait(tasks, timeout=5)
                    for t in done:
                        try:
                            if t.result():
                                found += 1
                        except Exception as exc:
                            logger.error("Task failed: %s", exc)
                    idle_cycles += 1
                    if idle_cycles < 3:
                        continue
                # Queue is empty and no in-flight tasks (or we've waited long enough)
                break

            idle_cycles = 0

            async def _process_with_semaphore(j: dict = job) -> bool:
                async with semaphore:
                    try:
                        return await process_institution(
                            j["entity_id"], pool, client, rate_limiter
                        )
                    except Exception as exc:
                        logger.error(
                            "Error processing institution %s: %s",
                            j.get("entity_id", "?"),
                            exc,
                        )
                        # Mark job as failed so it can be retried
                        try:
                            async with pool.acquire() as err_conn:
                                await err_conn.execute(
                                    "UPDATE jobs SET status='failed', error=$1, completed_at=NOW() "
                                    "WHERE entity_id=$2 AND queue='discovery' AND status='running'",
                                    str(exc)[:500],
                                    j["entity_id"],
                                )
                        except Exception:
                            pass
                        return False

            task = asyncio.create_task(_process_with_semaphore())
            tasks.add(task)
            task.add_done_callback(tasks.discard)
            processed += 1

            # Reap completed tasks periodically
            done_tasks = {t for t in tasks if t.done()}
            for t in done_tasks:
                tasks.discard(t)
                try:
                    if t.result():
                        found += 1
                except Exception as exc:
                    logger.error("Task failed: %s", exc)

            # Progress logging every 100 institutions
            if processed % 100 == 0:
                try:
                    async with pool.acquire() as log_conn:
                        total_with_url = await log_conn.fetchval(
                            "SELECT COUNT(*) FROM crawl_targets WHERE fee_schedule_url IS NOT NULL"
                        )
                    logger.info(
                        "Progress: %d processed, %d found this run, %d total with fee URL",
                        processed,
                        found,
                        total_with_url,
                    )
                except Exception:
                    logger.info("Progress: %d processed, %d found this run", processed, found)

        # Wait for any remaining in-flight tasks
        if tasks:
            done, _ = await asyncio.wait(tasks)
            for t in done:
                try:
                    if t.result():
                        found += 1
                except Exception as exc:
                    logger.error("Task failed: %s", exc)

    await pool.close()

    summary = f"Discovery complete. Processed: {processed}, Found: {found}"
    logger.info(summary)
    return summary
