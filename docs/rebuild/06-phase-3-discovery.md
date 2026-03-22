# Phase 3 — Discovery at Scale

> **Duration:** Weeks 3–5 development + 5–10 days compute  
> **Goal:** 12,000+ institutions have a `fee_schedule_url`. The discovery funnel is no longer the bottleneck.  
> **Risk:** See [R4](./02-risk-register.md#r4) (bot protection)

---

## The Problem This Phase Solves

63,000 institutions have a `website_url` but no `fee_schedule_url`. Discovery has never been run at real scale. The current approach uses `requests` + 2 sync threads with a 2-second delay = ~1,800 institutions/day maximum, and has never been run for more than 100 institutions at a time.

This phase builds async discovery that can process 500–1,000 institutions/hour and runs it against the full backlog.

---

## 3A — Async Discovery Worker

Create `fee_crawler/workers/discovery_worker.py`:

```python
"""
Async discovery worker.

Pulls from jobs.queue='discovery' using FOR UPDATE SKIP LOCKED.
Processes 20 institutions concurrently.
Respects per-domain rate limits.
Updates platform_registry hit counts.
"""

import asyncio
import logging
import os
from urllib.parse import urlparse, urljoin

import asyncpg
import httpx

from fee_crawler.pipeline.cms_fingerprint import fingerprint
from fee_crawler.pipeline.url_discoverer import COMMON_PATHS, FEE_LINK_KEYWORDS

logger = logging.getLogger(__name__)

CONCURRENCY = 20
WORKER_ID = f"discovery-{os.getpid()}"


async def claim_job(conn) -> dict | None:
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


async def process_institution(inst_id: str, pool, client: httpx.AsyncClient):
    """Discover fee schedule URL for one institution."""
    async with pool.acquire() as conn:
        inst = await conn.fetchrow(
            "SELECT * FROM crawl_targets WHERE id = $1", int(inst_id)
        )
        if not inst:
            return

        website_url = inst['website_url']
        if not website_url:
            await conn.execute(
                "UPDATE jobs SET status='completed', completed_at=NOW() WHERE entity_id=$1 AND queue='discovery'",
                inst_id
            )
            return

        # Step 1: Fetch homepage, fingerprint CMS
        platform = None
        try:
            resp = await client.get(website_url, timeout=10, follow_redirects=True)
            cms_result = fingerprint(
                website_url,
                headers=dict(resp.headers),
                html=resp.text[:50_000]
            )
            platform = cms_result.platform

            if platform:
                await conn.execute("""
                    UPDATE crawl_targets
                    SET cms_platform = $1, cms_confidence = $2
                    WHERE id = $3
                """, platform, cms_result.confidence, int(inst_id))

                await conn.execute("""
                    INSERT INTO platform_registry (platform, institution_count)
                    VALUES ($1, 1)
                    ON CONFLICT (platform) DO UPDATE
                    SET institution_count = platform_registry.institution_count + 1,
                        last_updated = NOW()
                """, platform)

        except Exception as e:
            logger.debug("Homepage fetch failed for %s: %s", website_url, e)

        # Step 2: Choose path list (platform-specific paths first)
        if platform:
            platform_paths_row = await conn.fetchrow(
                "SELECT fee_paths FROM platform_registry WHERE platform = $1", platform
            )
            paths = list(platform_paths_row['fee_paths'] or []) if platform_paths_row else []
            # Append common paths for fallback (deduplicated)
            paths += [p for p in COMMON_PATHS if p not in paths]
        else:
            paths = COMMON_PATHS

        # Step 3: Probe paths
        found_url = None
        base = f"{urlparse(website_url).scheme}://{urlparse(website_url).netloc}"

        for path in paths[:60]:  # Cap at 60 probes per institution
            try:
                url = urljoin(base, path)
                r = await client.head(url, timeout=8, follow_redirects=True)
                if r.status_code == 200:
                    # Verify it looks like a fee document
                    content_type = r.headers.get('content-type', '')
                    if 'pdf' in content_type or any(kw in url.lower() for kw in ['fee', 'schedule', 'disclosure']):
                        found_url = str(r.url)
                        break
                await asyncio.sleep(0.1)  # gentle per-path delay
            except Exception:
                continue

        # Step 4: Update DB
        async with conn.transaction():
            if found_url:
                await conn.execute("""
                    UPDATE crawl_targets
                    SET fee_schedule_url = $1, last_crawl_at = NOW()
                    WHERE id = $2
                """, found_url, int(inst_id))

                # Push to extraction queue
                await conn.execute("""
                    INSERT INTO jobs (queue, entity_id, priority)
                    VALUES ('extract', $1, $2)
                    ON CONFLICT DO NOTHING
                """, inst_id, int(inst.get('asset_size') or 0) // 1_000_000)

            await conn.execute("""
                UPDATE jobs
                SET status = $1, completed_at = NOW()
                WHERE entity_id = $2 AND queue = 'discovery'
            """, 'completed' if found_url else 'failed', inst_id)


async def run(concurrency: int = CONCURRENCY):
    """Main discovery worker loop."""
    db_url = os.environ['DATABASE_URL']
    pool = await asyncpg.create_pool(db_url, min_size=5, max_size=concurrency + 5)

    processed = 0
    found = 0

    async with httpx.AsyncClient(
        headers={"User-Agent": "Mozilla/5.0 (compatible; BankFeeIndexBot/2.0)"},
        timeout=15,
        follow_redirects=True,
    ) as client:
        semaphore = asyncio.Semaphore(concurrency)
        tasks = set()

        while True:
            async with pool.acquire() as conn:
                job = await claim_job(conn)

            if not job:
                if not tasks:
                    logger.info("Queue empty. Discovery complete. Processed: %d, Found: %d", processed, found)
                    break
                await asyncio.sleep(5)
                continue

            async def process_with_semaphore(j=job):
                async with semaphore:
                    await process_institution(j['entity_id'], pool, client)

            task = asyncio.create_task(process_with_semaphore())
            tasks.add(task)
            task.add_done_callback(tasks.discard)
            processed += 1

            if processed % 100 == 0:
                async with pool.acquire() as conn:
                    count = await conn.fetchval(
                        "SELECT COUNT(*) FROM crawl_targets WHERE fee_schedule_url IS NOT NULL"
                    )
                logger.info("Progress: %d processed, %d total with fee URL", processed, count)

    await pool.close()
```

### Tasks
- [ ] Create `fee_crawler/workers/discovery_worker.py` (above)
- [ ] Add `httpx>=0.27` and `asyncpg>=0.29` to `requirements.txt`
- [ ] Update `fee_crawler/modal_app.py` to import and call the worker
- [ ] Local test: `DATABASE_URL=[pg] python3 -c "import asyncio; from fee_crawler.workers.discovery_worker import run; asyncio.run(run(concurrency=5))"` on 10 institutions
- [ ] Modal test: `modal run fee_crawler/modal_app.py::run_discovery` (will pull from jobs queue)

---

## 3B — Seed the Discovery Queue

Run this once after Phase 2 is complete:

```sql
-- Seed ALL institutions with website but no fee URL, ordered by asset size
INSERT INTO jobs (queue, entity_id, priority, status)
SELECT
    'discovery',
    id::TEXT,
    COALESCE(asset_size, 0) / 1000000,
    'pending'
FROM crawl_targets
WHERE website_url IS NOT NULL
  AND (fee_schedule_url IS NULL OR fee_schedule_url = '')
ORDER BY asset_size DESC NULLS LAST
ON CONFLICT DO NOTHING;

-- Check how many seeded:
SELECT COUNT(*) FROM jobs WHERE queue = 'discovery' AND status = 'pending';
-- Expected: ~63,000
```

---

## 3C — NCUA Website Enrichment

~5,900 credit unions have no `website_url`. The NCUA mapping API has URLs for most of them.

```bash
# Run NCUA URL backfill (already built in the codebase)
DATABASE_URL=[pg] python3 -m fee_crawler backfill-ncua-urls

# After backfill, seed newly-found institutions into discovery queue:
INSERT INTO jobs (queue, entity_id, priority)
SELECT 'discovery', id::TEXT, 0
FROM crawl_targets
WHERE website_url IS NOT NULL
  AND fee_schedule_url IS NULL
  AND id::TEXT NOT IN (SELECT entity_id FROM jobs WHERE queue = 'discovery');
```

Expected yield: 2,000–4,000 additional website URLs.

---

## 3D — Run Full Discovery Sweep

```bash
# Monitor progress (run in Supabase SQL editor or local psql):
SELECT
    status,
    COUNT(*) as jobs,
    MAX(completed_at) as last_completed
FROM jobs
WHERE queue = 'discovery'
GROUP BY status
ORDER BY status;

-- Coverage check:
SELECT
    COUNT(*) as total,
    COUNT(fee_schedule_url) as with_fee_url,
    ROUND(100.0 * COUNT(fee_schedule_url) / COUNT(*), 1) as coverage_pct
FROM crawl_targets;
```

Expected runtime: 5–10 days at 20 concurrent tasks (Modal nightly runs).  
Expected yield: 8,000–15,000 new `fee_schedule_url` values.

---

## Gate: Phase 3 Complete

| Check | How to verify |
|---|---|
| ✅ Discovery queue drained | `SELECT COUNT(*) FROM jobs WHERE queue='discovery' AND status='pending'` < 500 |
| ✅ Fee URL coverage ≥ 17% | `SELECT COUNT(*) FROM crawl_targets WHERE fee_schedule_url IS NOT NULL` ≥ 12,000 |
| ✅ Platform distribution known | `SELECT cms_platform, COUNT(*) FROM crawl_targets WHERE cms_platform IS NOT NULL GROUP BY 1 ORDER BY 2 DESC` shows meaningful distribution |
| ✅ Extraction queue seeded | `SELECT COUNT(*) FROM jobs WHERE queue='extract' AND status='pending'` > 0 |
