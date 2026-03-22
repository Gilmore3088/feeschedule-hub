"""LLM batch extraction worker using Anthropic Batch API.

Collects pending llm_batch jobs from the jobs table, submits them as a
single batch to the Anthropic Batch API (Haiku model), polls for
completion, parses tool_use responses, validates and categorizes fees,
then writes results to extracted_fees.

Uses psycopg2 (sync) since the Anthropic Batch API is synchronous.

Cost model: ~$0.002 per institution (Haiku + 50% batch discount).
Daily budget cap prevents runaway costs.
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

import anthropic
import psycopg2
import psycopg2.extras

from fee_crawler.config import Config, load_config
from fee_crawler.fee_analysis import get_fee_family, normalize_fee_name
from fee_crawler.pipeline.extract_llm import (
    ExtractedFee,
    _EXTRACT_FEES_TOOL,
    _SYSTEM_PROMPT,
    _USER_PROMPT,
    _raw_to_fees,
)
from fee_crawler.validation import (
    determine_review_status,
    flags_to_json,
    validate_and_classify_fees,
    validate_fee,
)

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-haiku-4-5-20251001"
DEFAULT_MAX_TOKENS = 2048
COST_PER_INSTITUTION_USD = 0.002  # Haiku + 50% batch discount
MAX_BATCH_SIZE = 10_000  # Anthropic Batch API limit per request
POLL_INTERVAL_SECONDS = 300  # 5 minutes between status checks
MAX_POLL_DURATION_SECONDS = 93_600  # 26 hours
MAX_TEXT_LENGTH = 40_000  # Truncate documents beyond this
MAX_FEES_PER_INSTITUTION = 100  # Anomaly threshold

WORKER_ID = f"llm-batch-{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# Database helpers (psycopg2 sync)
# ---------------------------------------------------------------------------

def _get_connection() -> psycopg2.extensions.connection:
    """Create a new psycopg2 connection from DATABASE_URL."""
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def _get_daily_spend(conn: psycopg2.extensions.connection) -> float:
    """Sum estimated cost of jobs completed today (UTC)."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) AS n
            FROM jobs
            WHERE queue = 'llm_batch'
              AND status = 'completed'
              AND completed_at >= CURRENT_DATE
        """)
        row = cur.fetchone()
        return (row["n"] if row else 0) * COST_PER_INSTITUTION_USD


def _collect_pending_jobs(
    conn: psycopg2.extensions.connection,
    limit: int,
) -> list[dict]:
    """Pull pending llm_batch jobs ordered by priority (asset size desc)."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT j.id, j.entity_id, j.payload, j.attempts,
                   ct.institution_name, ct.charter_type, ct.state_code,
                   ct.asset_size
            FROM jobs j
            JOIN crawl_targets ct ON ct.id = j.entity_id::INT
            WHERE j.queue = 'llm_batch'
              AND j.status = 'pending'
              AND j.attempts < j.max_attempts
              AND j.run_at <= NOW()
            ORDER BY j.priority DESC, j.id ASC
            LIMIT %s
        """, (limit,))
        return [dict(row) for row in cur.fetchall()]


def _claim_jobs(
    conn: psycopg2.extensions.connection,
    job_ids: list[int],
) -> None:
    """Mark jobs as running and lock them to this worker."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE jobs
            SET status = 'running',
                locked_by = %s,
                locked_at = NOW(),
                attempts = attempts + 1
            WHERE id = ANY(%s)
        """, (WORKER_ID, job_ids))
    conn.commit()


def _store_batch_id(
    conn: psycopg2.extensions.connection,
    job_ids: list[int],
    batch_id: str,
) -> None:
    """Store the Anthropic batch_id on each job's payload for traceability."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE jobs
            SET payload = COALESCE(payload, '{}'::jsonb)
                          || jsonb_build_object('batch_id', %s::text)
            WHERE id = ANY(%s)
        """, (batch_id, job_ids))
    conn.commit()


def _mark_job_completed(
    conn: psycopg2.extensions.connection,
    job_id: int,
    fees_count: int,
) -> None:
    """Mark a single job as completed."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE jobs
            SET status = 'completed',
                completed_at = NOW(),
                error = NULL,
                payload = COALESCE(payload, '{}'::jsonb)
                          || jsonb_build_object('fees_extracted', %s::int)
            WHERE id = %s
        """, (fees_count, job_id))
    conn.commit()


def _mark_job_failed(
    conn: psycopg2.extensions.connection,
    job_id: int,
    error_msg: str,
) -> None:
    """Mark a single job as failed with an error message."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE jobs
            SET status = 'failed',
                error = %s,
                completed_at = NOW()
            WHERE id = %s
        """, (error_msg[:2000], job_id))
    conn.commit()


def _release_jobs(
    conn: psycopg2.extensions.connection,
    job_ids: list[int],
    error_msg: str,
) -> None:
    """Release claimed jobs back to pending on batch-level failure."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE jobs
            SET status = 'pending',
                locked_by = NULL,
                locked_at = NULL,
                error = %s
            WHERE id = ANY(%s) AND status = 'running'
        """, (error_msg[:2000], job_ids))
    conn.commit()


def _update_crawl_target_success(
    conn: psycopg2.extensions.connection,
    crawl_target_id: int,
) -> None:
    """Mark crawl_target as successfully extracted."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE crawl_targets
            SET last_success_at = NOW(),
                consecutive_failures = 0
            WHERE id = %s
        """, (crawl_target_id,))
    conn.commit()


# ---------------------------------------------------------------------------
# Fee writing
# ---------------------------------------------------------------------------

def _get_document_text(job: dict) -> str:
    """Extract document text from job payload.

    Text can be inline in the payload or referenced by an R2 key.
    Falls back to empty string if neither is available.
    """
    payload = job.get("payload") or {}
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except (json.JSONDecodeError, TypeError):
            return ""

    # Inline text is the primary source
    text = payload.get("text", "")
    if text:
        return text[:MAX_TEXT_LENGTH]

    # If an R2 key is present, fetch from R2
    r2_key = payload.get("document_r2_key") or payload.get("r2_key")
    if r2_key:
        try:
            from fee_crawler.storage import DocumentStore
            store = DocumentStore()
            content = store.get(r2_key)
            return content.decode("utf-8", errors="replace")[:MAX_TEXT_LENGTH]
        except Exception:
            logger.warning(
                "Failed to fetch R2 document %s for job %s",
                r2_key, job["id"], exc_info=True,
            )

    return ""


def _write_extracted_fees(
    conn: psycopg2.extensions.connection,
    crawl_target_id: int,
    fees: list[ExtractedFee],
    config: Config,
) -> int:
    """Validate, categorize, and write extracted fees to the database.

    Returns the number of fees written.
    """
    if not fees:
        return 0

    # Anomaly detection: truncate if too many fees
    if len(fees) > MAX_FEES_PER_INSTITUTION:
        logger.warning(
            "Institution %d: %d fees exceed threshold %d, keeping top by confidence",
            crawl_target_id, len(fees), MAX_FEES_PER_INSTITUTION,
        )
        fees.sort(key=lambda f: f.confidence, reverse=True)
        fees = fees[:MAX_FEES_PER_INSTITUTION]

    # Categorize each fee
    categories = [normalize_fee_name(f.fee_name) for f in fees]
    families = [get_fee_family(cat) for cat in categories]

    # Validate and determine review status
    validated = validate_and_classify_fees(fees, config, fee_categories=categories)

    written = 0
    with conn.cursor() as cur:
        # Remove existing non-approved fees for this institution
        cur.execute("""
            DELETE FROM extracted_fees
            WHERE crawl_target_id = %s
              AND review_status NOT IN ('approved')
        """, (crawl_target_id,))

        for i, (fee, flags, review_status) in enumerate(validated):
            category = categories[i] if i < len(categories) else None
            family = families[i] if i < len(families) else None
            validation_json = flags_to_json(flags)

            cur.execute("""
                INSERT INTO extracted_fees
                (crawl_target_id, fee_name, amount, frequency, conditions,
                 extraction_confidence, review_status, validation_flags,
                 fee_category, fee_family, extracted_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'llm')
            """, (
                crawl_target_id,
                fee.fee_name,
                fee.amount,
                fee.frequency,
                fee.conditions,
                fee.confidence,
                review_status,
                validation_json,
                category,
                family,
            ))
            written += 1

    conn.commit()
    return written


# ---------------------------------------------------------------------------
# Batch API interaction
# ---------------------------------------------------------------------------

def _build_batch_request(job: dict, model: str, max_tokens: int) -> dict:
    """Build one Anthropic Batch API request from a job."""
    text = _get_document_text(job)
    if not text.strip():
        return None

    payload = job.get("payload") or {}
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except (json.JSONDecodeError, TypeError):
            payload = {}

    user_content = _USER_PROMPT.format(
        text=text,
        institution_name=job.get("institution_name", "Unknown"),
        charter_type=job.get("charter_type") or "bank",
        document_type=payload.get("document_type", "unknown"),
    )

    return {
        "custom_id": str(job["id"]),
        "params": {
            "model": model,
            "max_tokens": max_tokens,
            "system": _SYSTEM_PROMPT,
            "tools": [_EXTRACT_FEES_TOOL],
            "tool_choice": {"type": "tool", "name": "extract_fees"},
            "messages": [{"role": "user", "content": user_content}],
        },
    }


def _parse_batch_result_fees(result) -> list[dict]:
    """Extract raw fee dicts from a batch result's tool_use response."""
    if result.result.type != "succeeded":
        return []

    message = result.result.message
    for block in message.content:
        if (
            hasattr(block, "type")
            and block.type == "tool_use"
            and block.name == "extract_fees"
        ):
            fees = block.input.get("fees", [])
            if isinstance(fees, list):
                return fees
    return []


def _poll_batch(
    client: anthropic.Anthropic,
    batch_id: str,
) -> bool:
    """Poll until batch completes or times out.

    Returns True if batch ended normally, False on timeout.
    """
    start = time.time()
    while True:
        batch_status = client.messages.batches.retrieve(batch_id)
        processing = batch_status.processing_status

        if processing == "ended":
            counts = batch_status.request_counts
            logger.info(
                "Batch %s ended: succeeded=%d, errored=%d, expired=%d, canceled=%d",
                batch_id,
                counts.succeeded,
                counts.errored,
                counts.expired,
                counts.canceled,
            )
            return True

        elapsed = int(time.time() - start)
        logger.info(
            "Batch %s status=%s, elapsed=%ds, next check in %ds",
            batch_id, processing, elapsed, POLL_INTERVAL_SECONDS,
        )

        if elapsed > MAX_POLL_DURATION_SECONDS:
            logger.error("Batch %s timed out after %ds", batch_id, elapsed)
            return False

        time.sleep(POLL_INTERVAL_SECONDS)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run(
    daily_budget_usd: float | None = None,
    limit: int | None = None,
    dry_run: bool = False,
) -> str:
    """Main LLM batch worker.

    Collects pending jobs, enforces daily budget, submits to Anthropic
    Batch API, polls for completion, writes results.

    Args:
        daily_budget_usd: Max spend per day. Defaults to config value or $20.
        limit: Override max institutions (capped by budget).
        dry_run: If True, collect and report but do not submit.

    Returns:
        Summary string describing what happened.
    """
    config = load_config()
    ext_config = config.extraction
    model_name = ext_config.model or DEFAULT_MODEL
    max_tokens = ext_config.max_tokens or DEFAULT_MAX_TOKENS

    if daily_budget_usd is None:
        daily_budget_usd = ext_config.daily_budget_usd

    conn = _get_connection()

    try:
        # Check daily spend against budget
        spent_today = _get_daily_spend(conn)
        remaining_budget = max(0.0, daily_budget_usd - spent_today)

        if remaining_budget <= COST_PER_INSTITUTION_USD:
            msg = (
                f"Daily budget exhausted. Spent ${spent_today:.2f} "
                f"of ${daily_budget_usd:.2f} today."
            )
            logger.info(msg)
            return msg

        # Calculate how many institutions we can afford
        budget_limit = int(remaining_budget / COST_PER_INSTITUTION_USD)
        effective_limit = min(budget_limit, MAX_BATCH_SIZE)
        if limit is not None:
            effective_limit = min(effective_limit, limit)

        logger.info(
            "Budget: $%.2f spent today, $%.2f remaining, max %d institutions",
            spent_today, remaining_budget, effective_limit,
        )

        # Collect pending jobs
        jobs = _collect_pending_jobs(conn, effective_limit)
        if not jobs:
            msg = "No pending llm_batch jobs found."
            logger.info(msg)
            return msg

        estimated_cost = len(jobs) * COST_PER_INSTITUTION_USD
        logger.info(
            "Collected %d jobs, estimated cost $%.2f", len(jobs), estimated_cost,
        )

        if dry_run:
            states = {}
            for j in jobs:
                st = j.get("state_code", "??")
                states[st] = states.get(st, 0) + 1
            state_summary = ", ".join(
                f"{s}: {c}" for s, c in sorted(states.items(), key=lambda x: -x[1])[:10]
            )
            return (
                f"DRY RUN: Would submit {len(jobs)} jobs. "
                f"Estimated cost: ${estimated_cost:.2f}. "
                f"Top states: {state_summary}"
            )

        # Build batch requests, filtering out jobs with no text
        job_ids = [j["id"] for j in jobs]
        requests = []
        skipped_jobs = []
        job_map = {}

        for job in jobs:
            req = _build_batch_request(job, model_name, max_tokens)
            if req is None:
                skipped_jobs.append(job["id"])
                logger.warning(
                    "Job %d (institution %s): no document text, skipping",
                    job["id"], job.get("institution_name", "?"),
                )
                continue
            requests.append(req)
            job_map[str(job["id"])] = job

        # Mark skipped jobs as failed
        for jid in skipped_jobs:
            _mark_job_failed(conn, jid, "no_document_text")

        if not requests:
            msg = f"All {len(jobs)} jobs had no document text."
            logger.warning(msg)
            return msg

        # Claim the jobs we are submitting
        valid_job_ids = [int(cid) for cid in job_map.keys()]
        _claim_jobs(conn, valid_job_ids)

        # Submit batch to Anthropic
        client = anthropic.Anthropic()
        try:
            batch = client.messages.batches.create(requests=requests)
        except Exception as e:
            error_msg = f"Batch submission failed: {e}"
            logger.error(error_msg, exc_info=True)
            _release_jobs(conn, valid_job_ids, error_msg)
            return error_msg

        batch_id = batch.id
        logger.info("Batch submitted: %s (%d requests)", batch_id, len(requests))

        # Store batch_id on jobs for traceability
        _store_batch_id(conn, valid_job_ids, batch_id)

        # Poll for completion
        completed = _poll_batch(client, batch_id)
        if not completed:
            error_msg = f"Batch {batch_id} timed out after {MAX_POLL_DURATION_SECONDS}s"
            _release_jobs(conn, valid_job_ids, error_msg)
            return error_msg

        # Process results
        succeeded = 0
        failed = 0
        total_fees = 0

        for result in client.messages.batches.results(batch_id):
            job = job_map.get(result.custom_id)
            if not job:
                logger.warning("Unknown custom_id in results: %s", result.custom_id)
                continue

            job_id = job["id"]
            crawl_target_id = int(job["entity_id"])

            if result.result.type != "succeeded":
                error_type = result.result.type
                error_detail = ""
                if hasattr(result.result, "error") and result.result.error:
                    error_detail = str(result.result.error)
                _mark_job_failed(
                    conn, job_id, f"batch_result_{error_type}: {error_detail}",
                )
                failed += 1
                logger.debug(
                    "Job %d failed: %s %s", job_id, error_type, error_detail,
                )
                continue

            # Parse fees from tool_use response
            try:
                fees_raw = _parse_batch_result_fees(result)
                fees = _raw_to_fees(fees_raw)
                n_written = _write_extracted_fees(
                    conn, crawl_target_id, fees, config,
                )
                _mark_job_completed(conn, job_id, n_written)
                _update_crawl_target_success(conn, crawl_target_id)
                succeeded += 1
                total_fees += n_written

                if succeeded % 100 == 0:
                    logger.info(
                        "Progress: %d succeeded, %d failed, %d fees",
                        succeeded, failed, total_fees,
                    )

            except Exception as e:
                _mark_job_failed(conn, job_id, f"parse_error: {e}")
                failed += 1
                logger.error(
                    "Job %d parse/write error: %s", job_id, e, exc_info=True,
                )

        actual_cost = succeeded * COST_PER_INSTITUTION_USD
        summary = (
            f"Batch {batch_id} complete. "
            f"Succeeded: {succeeded}, Failed: {failed}, "
            f"Skipped (no text): {len(skipped_jobs)}, "
            f"Fees extracted: {total_fees}, "
            f"Estimated cost: ${actual_cost:.2f}"
        )
        logger.info(summary)
        return summary

    finally:
        conn.close()
