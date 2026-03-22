"""LLM batch extraction worker using Anthropic Batch API.

Collects pending llm_batch jobs, groups by state for locality-aware
batching, submits to Anthropic Batch API with Haiku model.
Polls for completion and writes results to extracted_fees.

Daily budget cap prevents runaway costs.
"""

import os
import logging

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-haiku-4-5-20251001"
DEFAULT_MAX_TOKENS = 2048
COST_PER_INSTITUTION_USD = 0.002  # Haiku + 50% batch discount


async def run(daily_budget_usd: float = 20.0, limit: int | None = None):
    """Main LLM batch worker loop.

    TODO: Implement in Phase 4
    - Pull llm_batch jobs from jobs table
    - Check daily spend against budget cap
    - Group by state for locality-aware batching
    - Submit to Anthropic Batch API
    - Poll for completion
    - Parse results and write to extracted_fees
    - Run validation and categorization
    """
    import psycopg2
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM jobs WHERE queue = 'llm_batch' AND status = 'pending'")
    pending = cur.fetchone()[0]

    max_institutions = int(daily_budget_usd / COST_PER_INSTITUTION_USD)
    actual_limit = min(pending, limit or max_institutions, max_institutions)

    conn.close()
    return (
        f"{pending} LLM batch jobs pending. "
        f"Budget: ${daily_budget_usd}/day = {max_institutions:,} institutions. "
        f"Would process: {actual_limit:,}. "
        f"Full implementation in Phase 4."
    )
