# Phase 4 — Extraction Pipeline Rebuild

> **Duration:** Weeks 5–8 development + 3–5 days compute  
> **Goal:** 12,000+ institutions have extracted fees. LLM costs minimized. Nightly batch pipeline running.  
> **Risk:** See [R7](./02-risk-register.md#r7) (tesseract in Modal), [R8](./02-risk-register.md#r8) (batch turnaround)

---

## 4A — Cloudflare R2 Document Store

Create `fee_crawler/storage.py`:

```python
"""Content-addressed document store using Cloudflare R2 (S3-compatible)."""

import hashlib
import os
import boto3
from botocore.exceptions import ClientError


class DocumentStore:
    def __init__(self):
        self.client = boto3.client(
            's3',
            endpoint_url=os.environ['R2_ENDPOINT'],
            aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
            aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
        )
        self.bucket = os.environ.get('R2_BUCKET', 'bank-fee-index-documents')

    @staticmethod
    def key_for(content: bytes) -> str:
        """SHA-256 content hash = R2 key. Same document = same key = never re-upload."""
        return hashlib.sha256(content).hexdigest()

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError:
            return False

    def put(self, content: bytes, content_type: str) -> str:
        """Store document. Returns key. Idempotent — safe to call multiple times."""
        key = self.key_for(content)
        if not self.exists(key):
            self.client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=content,
                ContentType=content_type,
            )
        return key

    def get(self, key: str) -> bytes:
        obj = self.client.get_object(Bucket=self.bucket, Key=key)
        return obj['Body'].read()
```

### Why R2 Matters for Extraction
Once a PDF is in R2, you can re-run extraction as many times as you want — with different prompts, different models, different validation rules — **without hitting the bank's website again**. This is critical for iterating on extraction quality.

### Tasks
- [ ] Create `fee_crawler/storage.py`
- [ ] Add `boto3>=1.34` to `requirements.txt`
- [ ] Update `download.py`: after successful download, store in R2 via `DocumentStore.put()`
- [ ] Update `crawl_targets`: `document_r2_key` column tracks stored document (already in Phase 1 schema)
- [ ] Update `crawl.py`: before downloading, check if `document_r2_key` is set and content matches ETag → skip download

---

## 4B — LLM Batch Worker

Create `fee_crawler/workers/llm_batch_worker.py`:

```python
"""
Nightly LLM batch extraction worker.

Collects all pending llm_batch jobs, groups by state (locality),
submits to Anthropic Batch API using Haiku model.
Polls for completion, writes results to extracted_fees.

Cost: ~$0.002 per institution (Haiku + 50% batch discount)
Daily budget: $20 = 10,000 institutions/day
Full 70K sweep: ~7 days
"""

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass

import anthropic
import asyncpg

from fee_crawler.pipeline.extract_llm import (
    _SYSTEM_PROMPT, _USER_PROMPT, _EXTRACT_FEES_TOOL, _raw_to_fees
)
from fee_crawler.fee_analysis import normalize_fee_name
from fee_crawler.validation import validate_and_classify_fees

logger = logging.getLogger(__name__)

HAIKU_MODEL = "claude-haiku-4-5-20251001"
COST_PER_INSTITUTION = 0.002  # Haiku + batch API discount
MAX_BATCH_SIZE = 10_000       # Anthropic Batch API limit


async def collect_pending_jobs(pool, limit: int) -> list[dict]:
    """Pull pending LLM jobs ordered by priority (asset size)."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT j.id, j.entity_id, j.payload,
                   ct.institution_name, ct.charter_type, ct.state_code,
                   ct.asset_size
            FROM jobs j
            JOIN crawl_targets ct ON ct.id = j.entity_id::INT
            WHERE j.queue = 'llm_batch'
              AND j.status = 'pending'
              AND j.attempts < j.max_attempts
            ORDER BY j.priority DESC, j.id ASC
            LIMIT $1
        """, limit)
    return [dict(r) for r in rows]


def build_batch_request(job: dict) -> dict:
    """Build one Anthropic Batch API request from a job."""
    payload = job.get('payload') or {}
    text = payload.get('text', '')[:40_000]

    user_content = _USER_PROMPT.format(
        text=text,
        institution_name=job['institution_name'],
        charter_type=job.get('charter_type') or 'bank',
        document_type=payload.get('document_type', 'unknown'),
    )

    return {
        "custom_id": str(job['id']),  # job.id, not institution id
        "params": {
            "model": HAIKU_MODEL,
            "max_tokens": 2048,
            "system": _SYSTEM_PROMPT,
            "tools": [_EXTRACT_FEES_TOOL],
            "tool_choice": {"type": "tool", "name": "extract_fees"},
            "messages": [{"role": "user", "content": user_content}],
        }
    }


async def write_fees(pool, inst_id: int, fees, crawl_result_id: int | None = None):
    """Write extracted fees to DB."""
    if not fees:
        return 0

    from fee_crawler.config import Config
    config = Config()
    categories = [normalize_fee_name(f.fee_name) for f in fees]
    validated = validate_and_classify_fees(fees, config, fee_categories=categories)

    async with pool.acquire() as conn:
        async with conn.transaction():
            # Remove existing non-approved fees for this institution
            await conn.execute("""
                DELETE FROM extracted_fees
                WHERE crawl_target_id = $1
                  AND review_status NOT IN ('approved')
            """, inst_id)

            # Insert new fees
            for fee in validated:
                await conn.execute("""
                    INSERT INTO extracted_fees
                    (crawl_target_id, fee_name, amount, frequency, conditions,
                     extraction_confidence, review_status, fee_category, fee_family)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """,
                    inst_id,
                    fee.fee_name,
                    fee.amount,
                    fee.frequency,
                    fee.conditions,
                    fee.confidence,
                    'staged' if fee.confidence >= 0.85 else 'pending',
                    getattr(fee, 'fee_category', None),
                    getattr(fee, 'fee_family', None),
                )

    return len(validated)


async def run(daily_budget_usd: float = 20.0):
    """Main LLM batch worker."""
    db_url = os.environ['DATABASE_URL']
    pool = await asyncpg.create_pool(db_url, min_size=2, max_size=5)
    client = anthropic.Anthropic()

    # How many institutions can we process today?
    max_institutions = min(int(daily_budget_usd / COST_PER_INSTITUTION), MAX_BATCH_SIZE)
    logger.info("Daily budget: $%.2f → max %d institutions", daily_budget_usd, max_institutions)

    jobs = await collect_pending_jobs(pool, max_institutions)
    if not jobs:
        logger.info("No pending LLM jobs.")
        await pool.close()
        return

    logger.info("Submitting batch of %d institutions...", len(jobs))
    estimated_cost = len(jobs) * COST_PER_INSTITUTION
    logger.info("Estimated cost: $%.2f", estimated_cost)

    # Build and submit batch
    requests = [build_batch_request(j) for j in jobs]

    # Mark jobs as running
    job_ids = [j['id'] for j in jobs]
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE jobs SET status = 'running', locked_at = NOW()
            WHERE id = ANY($1::bigint[])
        """, job_ids)

    # Submit to Anthropic
    batch = client.messages.batches.create(requests=requests)
    batch_id = batch.id
    logger.info("Batch submitted: %s", batch_id)

    # Store batch_id for tracking
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE jobs SET payload = payload || jsonb_build_object('batch_id', $1::text)
            WHERE id = ANY($2::bigint[])
        """, batch_id, job_ids)

    # Poll until complete (up to 26 hours)
    start = time.time()
    while True:
        batch_status = client.messages.batches.retrieve(batch_id)
        if batch_status.processing_status == 'ended':
            logger.info("Batch complete: %s", batch_status.request_counts)
            break
        elapsed = int(time.time() - start)
        logger.info("Batch %s still processing... elapsed %ds", batch_id, elapsed)
        if elapsed > 93_600:  # 26 hours
            logger.error("Batch timed out")
            break
        await asyncio.sleep(300)  # check every 5 minutes

    # Process results
    succeeded = 0
    failed = 0

    # Build job_id → institution mapping
    job_map = {str(j['id']): j for j in jobs}

    for result in client.messages.batches.results(batch_id):
        job = job_map.get(result.custom_id)
        if not job:
            continue

        inst_id = int(job['entity_id'])

        if result.result.type != 'succeeded':
            failed += 1
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE jobs SET status='failed', error=$1 WHERE id=$2",
                    result.result.type, job['id']
                )
            continue

        # Extract fees from tool_use response
        fees_raw = []
        for block in result.result.message.content:
            if hasattr(block, 'type') and block.type == 'tool_use' and block.name == 'extract_fees':
                fees_raw = block.input.get('fees', [])
                break

        fees = _raw_to_fees(fees_raw)
        n_written = await write_fees(pool, inst_id, fees)

        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE jobs SET status='completed', completed_at=NOW() WHERE id=$1",
                job['id']
            )
            await conn.execute(
                "UPDATE crawl_targets SET last_success_at=NOW(), consecutive_failures=0 WHERE id=$1",
                inst_id
            )

        succeeded += 1
        if succeeded % 100 == 0:
            logger.info("Progress: %d succeeded, %d failed", succeeded, failed)

    logger.info("Batch done. Succeeded: %d, Failed: %d, Actual cost: ~$%.2f",
                succeeded, failed, succeeded * COST_PER_INSTITUTION)
    await pool.close()
```

### Config Changes
In `fee_crawler/config.py`, update `ClaudeConfig`:

```python
class ClaudeConfig(BaseModel):
    model: str = "claude-haiku-4-5-20251001"  # was claude-sonnet-4-5-20250929
    model_fallback: str = "claude-sonnet-4-6"   # for complex/retry cases
    max_tokens: int = 2048                       # was 4096
    use_batch_api: bool = True                   # new
```

### Tasks
- [ ] Create `fee_crawler/workers/llm_batch_worker.py`
- [ ] Update `fee_crawler/config.py` (model → Haiku, max_tokens → 2048)
- [ ] Create `fee_crawler/storage.py` (R2 document store)
- [ ] Update `download.py` to store in R2
- [ ] Update `crawl.py` to check R2 before downloading
- [ ] Verify tesseract + poppler in Modal image definition
- [ ] Run first manual batch: `modal run fee_crawler/modal_app.py::run_llm_batch`
- [ ] Verify results in Postgres: `SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees`

---

## Gate: Phase 4 Complete

| Check | How to verify |
|---|---|
| ✅ Institutions with fees ≥ 12,000 | `SELECT COUNT(DISTINCT crawl_target_id) FROM extracted_fees` ≥ 12,000 |
| ✅ Nightly batch pipeline running | Modal logs show `run_llm_batch` completing nightly |
| ✅ R2 document store active | R2 bucket shows > 5,000 objects |
| ✅ Cost per institution ≤ $0.003 | Actual Anthropic API bill / institutions processed ≤ $0.003 |
| ✅ OCR working | Query `SELECT failure_reason, COUNT(*) FROM crawl_targets GROUP BY failure_reason` shows `scanned_pdf_no_ocr` trending down |
| ✅ Haiku model active | `SELECT DISTINCT model FROM ... ` (or check API logs) shows haiku-4-5 |
