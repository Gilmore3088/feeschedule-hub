"""Phase 62b — structural probes for migrations 20260501..20260505.

These tests apply the full migration stack via the db_schema fixture in
conftest.py and assert that Phase 62b schema objects (widened CHECK, new
columns, new tables, partial unique index) are present.

Run with docker compose up -d postgres +
DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5433/bfi_test.
"""

from __future__ import annotations

import pytest


# ---------------------------------------------------------------------------
# 20260501 — agent_events.status widen + is_shadow column
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_events_status_widened(db_schema):
    """CHECK constraint accepts improve_rejected AND shadow_diff."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT check_clause
              FROM information_schema.check_constraints
             WHERE constraint_name = 'agent_events_status_check'
            """
        )
    assert row is not None, "agent_events_status_check constraint missing"
    clause = row["check_clause"]
    assert "improve_rejected" in clause, (
        f"status CHECK must include 'improve_rejected'; clause: {clause}"
    )
    assert "shadow_diff" in clause, (
        f"status CHECK must include 'shadow_diff'; clause: {clause}"
    )
    # Original values still present.
    for v in ("pending", "success", "error", "budget_halt"):
        assert v in clause, f"status CHECK regressed — missing {v!r}; clause: {clause}"


@pytest.mark.asyncio
async def test_agent_events_is_shadow_column(db_schema):
    """agent_events.is_shadow exists, BOOLEAN NOT NULL DEFAULT FALSE, partial index present."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        col = await conn.fetchrow(
            """
            SELECT data_type, is_nullable, column_default
              FROM information_schema.columns
             WHERE table_name = 'agent_events' AND column_name = 'is_shadow'
            """
        )
        idx = await conn.fetchval(
            """
            SELECT indexdef FROM pg_indexes
             WHERE tablename = 'agent_events' AND indexname = 'agent_events_shadow_idx'
            """
        )
    assert col is not None, "agent_events.is_shadow column missing"
    assert col["data_type"] == "boolean"
    assert col["is_nullable"] == "NO"
    assert col["column_default"] is not None and "false" in col["column_default"].lower()
    assert idx is not None, "agent_events_shadow_idx missing"
    assert "WHERE is_shadow" in idx or "WHERE (is_shadow)" in idx


# ---------------------------------------------------------------------------
# 20260502 — agent_registry.lifecycle_state + review_schedule
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_registry_lifecycle_state_column(db_schema):
    """lifecycle_state column exists; CHECK includes all 4 values; rows default q1_validation."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        col = await conn.fetchrow(
            """
            SELECT data_type, is_nullable, column_default
              FROM information_schema.columns
             WHERE table_name = 'agent_registry' AND column_name = 'lifecycle_state'
            """
        )
        check_row = await conn.fetchrow(
            """
            SELECT cc.check_clause
              FROM information_schema.check_constraints cc
              JOIN information_schema.constraint_column_usage ccu
                ON cc.constraint_name = ccu.constraint_name
             WHERE ccu.table_name = 'agent_registry'
               AND ccu.column_name = 'lifecycle_state'
             LIMIT 1
            """
        )
        registry_rows = await conn.fetchval("SELECT COUNT(*) FROM agent_registry")
        default_rows = await conn.fetchval(
            "SELECT COUNT(*) FROM agent_registry WHERE lifecycle_state = 'q1_validation'"
        )
    assert col is not None, "agent_registry.lifecycle_state column missing"
    assert col["data_type"] == "text"
    assert col["is_nullable"] == "NO"
    assert col["column_default"] is not None
    assert "q1_validation" in col["column_default"]
    assert check_row is not None, "lifecycle_state CHECK constraint missing"
    clause = check_row["check_clause"]
    for v in ("q1_validation", "q2_high_confidence", "q3_autonomy", "paused"):
        assert v in clause, f"lifecycle_state CHECK missing {v!r}; clause: {clause}"
    # 4 top-level + 51 state agents = 55 expected in standard seed.
    assert registry_rows >= 55, (
        f"expected >=55 agent_registry rows (55 seeded in 62a), got {registry_rows}"
    )
    assert default_rows == registry_rows, (
        "every seeded agent should default to q1_validation "
        f"(got {default_rows}/{registry_rows})"
    )


@pytest.mark.asyncio
async def test_agent_registry_review_schedule_seeded(db_schema):
    """knox every 15 min; darwin hourly; state_agents every 4h."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        col = await conn.fetchrow(
            """
            SELECT data_type
              FROM information_schema.columns
             WHERE table_name = 'agent_registry' AND column_name = 'review_schedule'
            """
        )
        knox = await conn.fetchval(
            "SELECT review_schedule FROM agent_registry WHERE agent_name = 'knox'"
        )
        darwin = await conn.fetchval(
            "SELECT review_schedule FROM agent_registry WHERE agent_name = 'darwin'"
        )
        state_count = await conn.fetchval(
            "SELECT COUNT(*) FROM agent_registry "
            "WHERE role = 'state_agent' AND review_schedule = '0 */4 * * *'"
        )
    assert col is not None, "agent_registry.review_schedule column missing"
    assert col["data_type"] == "text"
    assert knox == "*/15 * * * *"
    assert darwin == "0 * * * *"
    # 50 states + DC = 51 state_agents; allow >=51 in case future rows land.
    assert state_count >= 51, (
        f"expected >=51 state_agent rows with '0 */4 * * *' schedule; got {state_count}"
    )


# ---------------------------------------------------------------------------
# 20260503 — agent_lessons
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_lessons_table(db_schema):
    """Table + FK to agent_registry + UNIQUE (agent_name, lesson_name)."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        cols = await conn.fetch(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_name = 'agent_lessons'"
        )
        uniq = await conn.fetchval(
            """
            SELECT indexdef FROM pg_indexes
             WHERE tablename = 'agent_lessons'
               AND indexdef ILIKE '%UNIQUE%'
               AND indexdef ILIKE '%agent_name%'
               AND indexdef ILIKE '%lesson_name%'
             LIMIT 1
            """
        )
        fk_count = await conn.fetchval(
            """
            SELECT COUNT(*)
              FROM information_schema.table_constraints tc
              JOIN information_schema.constraint_column_usage ccu
                ON tc.constraint_name = ccu.constraint_name
             WHERE tc.table_name = 'agent_lessons'
               AND tc.constraint_type = 'FOREIGN KEY'
               AND ccu.table_name = 'agent_registry'
               AND ccu.column_name = 'agent_name'
            """
        )
    present = {r["column_name"] for r in cols}
    required = {
        "lesson_id", "created_at", "agent_name", "lesson_name",
        "description", "evidence_refs", "confidence",
        "superseded_by", "source_event_id",
    }
    missing = required - present
    assert not missing, f"agent_lessons missing columns: {missing}"
    assert uniq is not None, "UNIQUE (agent_name, lesson_name) index missing on agent_lessons"
    assert fk_count >= 1, "agent_lessons FK to agent_registry(agent_name) missing"


# ---------------------------------------------------------------------------
# 20260504 — shadow_outputs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_shadow_outputs_table(db_schema):
    """shadow_outputs exists with expected columns + FK + run_idx."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        cols = await conn.fetch(
            "SELECT column_name, data_type, is_nullable FROM information_schema.columns "
            "WHERE table_name = 'shadow_outputs'"
        )
        fk_count = await conn.fetchval(
            """
            SELECT COUNT(*)
              FROM information_schema.table_constraints tc
              JOIN information_schema.constraint_column_usage ccu
                ON tc.constraint_name = ccu.constraint_name
             WHERE tc.table_name = 'shadow_outputs'
               AND tc.constraint_type = 'FOREIGN KEY'
               AND ccu.table_name = 'agent_registry'
            """
        )
        run_idx = await conn.fetchval(
            "SELECT indexdef FROM pg_indexes "
            "WHERE tablename = 'shadow_outputs' AND indexname = 'shadow_outputs_run_idx'"
        )
    col_map = {r["column_name"]: r for r in cols}
    required = {
        "shadow_output_id", "created_at", "shadow_run_id", "agent_name",
        "entity", "payload_diff", "agent_event_id",
    }
    missing = required - set(col_map)
    assert not missing, f"shadow_outputs missing columns: {missing}"
    # payload_diff must be jsonb NOT NULL.
    assert col_map["payload_diff"]["data_type"] == "jsonb"
    assert col_map["payload_diff"]["is_nullable"] == "NO"
    assert fk_count >= 1, "shadow_outputs FK to agent_registry missing"
    assert run_idx is not None, "shadow_outputs_run_idx missing"


# ---------------------------------------------------------------------------
# 20260505 — canary_runs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_canary_runs_table(db_schema):
    """canary_runs exists with expected columns + UNIQUE partial index on (agent_name, corpus_version) WHERE is_baseline."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        cols = await conn.fetch(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'canary_runs'"
        )
        baseline_idx = await conn.fetchval(
            "SELECT indexdef FROM pg_indexes "
            "WHERE tablename = 'canary_runs' AND indexname = 'canary_runs_baseline_idx'"
        )
        fk_count = await conn.fetchval(
            """
            SELECT COUNT(*)
              FROM information_schema.table_constraints tc
              JOIN information_schema.constraint_column_usage ccu
                ON tc.constraint_name = ccu.constraint_name
             WHERE tc.table_name = 'canary_runs'
               AND tc.constraint_type = 'FOREIGN KEY'
               AND ccu.table_name = 'agent_registry'
            """
        )
    present = {r["column_name"] for r in cols}
    required = {
        "run_id", "agent_name", "corpus_version", "started_at", "finished_at",
        "status", "is_baseline", "coverage", "confidence_mean", "extraction_count",
        "coverage_delta", "confidence_delta", "extraction_count_delta",
        "verdict", "report_payload", "baseline_run_id",
    }
    missing = required - present
    assert not missing, f"canary_runs missing columns: {missing}"
    assert baseline_idx is not None, "canary_runs_baseline_idx missing"
    assert "UNIQUE" in baseline_idx.upper()
    assert "is_baseline" in baseline_idx
    assert fk_count >= 1, "canary_runs FK to agent_registry(agent_name) missing"


# ---------------------------------------------------------------------------
# 20260417 — darwin lifecycle state q2
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_darwin_lifecycle_state_is_q2_high_confidence(db_schema):
    """Darwin v1 auto-promote at confidence >= 0.90 requires q2_high_confidence lifecycle."""
    _, pool = db_schema
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT lifecycle_state FROM agent_registry WHERE agent_name = 'darwin'"
        )
    assert row is not None, "darwin agent not found in agent_registry"
    assert row["lifecycle_state"] == "q2_high_confidence", (
        "Darwin v1 spec requires q2_high_confidence lifecycle to permit auto-promote >= 0.90"
    )
