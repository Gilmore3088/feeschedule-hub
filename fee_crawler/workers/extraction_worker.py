"""Async extraction worker.

Downloads documents from fee_schedule_url, classifies them,
extracts text, and queues for LLM batch processing.
Stores documents in R2 using content-addressed keys.
"""

import asyncio
import os
import logging

logger = logging.getLogger(__name__)


async def run(concurrency: int = 8, limit: int = 2000):
    """Main extraction worker loop.

    TODO: Implement in Phase 4
    - Pull extraction jobs from jobs table
    - Download documents via httpx
    - Store in R2 (content-addressed by SHA-256)
    - Classify with classify_document()
    - Extract text (PDF or HTML)
    - Queue for LLM batch if classification passes
    """
    import psycopg2
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM jobs WHERE queue = 'extract' AND status = 'pending'")
    pending = cur.fetchone()[0]
    conn.close()
    return f"{pending} extraction jobs pending. Full implementation in Phase 4."
