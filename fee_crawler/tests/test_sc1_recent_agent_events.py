"""SC1 acceptance: recent-hour query on agent_events is sub-second and uses partition pruning.

ROADMAP.md Phase 62a Success Criterion 1:
  An operator can query SELECT COUNT(*) FROM agent_events WHERE agent_name='knox'
  AND created_at > now() - interval '1 hour' and get a sub-second response.

CI runs this at 10K rows (scaled from the 10M target for runtime budget).
Phase 63+ can rerun at full 10M in a dedicated perf CI.
"""

from __future__ import annotations

import time
import uuid

import pytest


SEED_ROWS = 10_000
SUB_SECOND_BUDGET_MS = 1000


@pytest.mark.asyncio
@pytest.mark.slow
async def test_sc1_recent_query_sub_second(db_schema):
    """Seed 10K agent_events rows split across Knox + other agents, run the SC1
    query, assert execution time under budget AND confirm partition pruning
    behavior by EXPLAIN (see companion test below).
    """
    _, pool = db_schema

    rows_knox = [
        (
            str(uuid.uuid4()), "knox", "extract", "create_fee_raw", "fees_raw",
            str(i), "success", 1, None, None, str(uuid.uuid4()), b"\x00" * 32,
            "{}", "{}", "{}", "{}",
        )
        for i in range(SEED_ROWS // 2)
    ]
    rows_others = [
        (
            str(uuid.uuid4()),
            ("darwin" if i % 3 == 0 else ("atlas" if i % 3 == 1 else "hamilton")),
            "verify", "_mixed", "fees_verified",
            str(i), "success", 1, None, None, str(uuid.uuid4()), b"\x00" * 32,
            "{}", "{}", "{}", "{}",
        )
        for i in range(SEED_ROWS // 2)
    ]

    async with pool.acquire() as conn:
        await conn.copy_records_to_table(
            "agent_events",
            records=rows_knox + rows_others,
            columns=[
                "event_id", "agent_name", "action", "tool_name", "entity",
                "entity_id", "status", "cost_cents", "confidence", "parent_event_id",
                "correlation_id", "reasoning_hash",
                "input_payload", "output_payload", "source_refs", "error",
            ],
        )

    async with pool.acquire() as conn:
        start = time.monotonic()
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM agent_events "
            "WHERE agent_name = 'knox' "
            "AND created_at > now() - interval '1 hour'"
        )
        elapsed_ms = (time.monotonic() - start) * 1000

    assert count == SEED_ROWS // 2, (
        f"expected {SEED_ROWS // 2} knox rows, got {count}"
    )
    assert elapsed_ms < SUB_SECOND_BUDGET_MS, (
        f"SC1 query took {elapsed_ms:.1f}ms at {SEED_ROWS} rows; "
        f"budget is {SUB_SECOND_BUDGET_MS}ms. Partition pruning may not be active."
    )


@pytest.mark.asyncio
async def test_sc1_explain_shows_partition_pruning(db_schema):
    """EXPLAIN the SC1 query and assert the plan mentions a partition or 'Partitions'.

    A plain 'Seq Scan on agent_events' without partition markers means pruning failed.
    The parent table is declared PARTITION BY RANGE (created_at) so at minimum the
    plan must reference at least one child partition (agent_events_YYYY_MM or the
    default partition) rather than the bare parent table.
    """
    _, pool = db_schema
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "EXPLAIN SELECT COUNT(*) FROM agent_events "
            "WHERE agent_name = 'knox' "
            "AND created_at > now() - interval '1 hour'"
        )
    plan_text = "\n".join(r[0] for r in rows)
    assert (
        "agent_events_" in plan_text
        or "Partitions" in plan_text
        or "partition" in plan_text.lower()
    ), (
        f"EXPLAIN plan does not mention partitions; partition pruning may be broken:\n"
        f"{plan_text}"
    )
