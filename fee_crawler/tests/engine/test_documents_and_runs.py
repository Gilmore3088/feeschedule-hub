"""Phase 0 — change-gate documents + pipeline_runs try/finally."""

from __future__ import annotations

import pytest

from fee_crawler.engine import documents as d
from fee_crawler.engine import runs

pytestmark = pytest.mark.asyncio


# ---- change-gate (pure) ----------------------------------------------------

def test_normalize_drops_volatile_lines():
    a = "Fee Schedule\nGenerated: 01/15/2026\nMonthly Fee $5.00\nPage 1 of 3"
    b = "Fee Schedule\nGenerated: 02/20/2026\nMonthly Fee $5.00\nPage 1 of 4"
    assert d.content_hash(a) == d.content_hash(b)  # timestamps/page nums ignored


def test_normalize_detects_real_change():
    a = "Monthly Fee $5.00"
    b = "Monthly Fee $7.00"
    assert d.content_hash(a) != d.content_hash(b)


def test_raw_hash_and_key_are_content_addressed():
    data = b"hello"
    key = d.r2_key_for(d.raw_hash(data))
    assert key.startswith("documents/")
    assert d.raw_hash(b"hello") == d.raw_hash(b"hello")
    assert d.raw_hash(b"hello") != d.raw_hash(b"world")


# ---- document recording (change-gate at the DB) ----------------------------

async def _mk_target(pool, state="IA"):
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "INSERT INTO crawl_targets (institution_name, state_code) "
            "VALUES ('Test Bank', $1) RETURNING id",
            state,
        )


async def test_first_capture_is_changed(pool):
    tid = await _mk_target(pool)
    async with pool.acquire() as conn:
        cap = await d.record_document(
            conn, crawl_target_id=tid, state_code="IA",
            source_url="http://x/fees.pdf", text="Monthly Fee $5.00",
            raw_bytes=b"pdfbytes", http_status=200, render_mode="http", doc_type="pdf",
        )
    assert cap.changed is True
    assert cap.document_id is not None


async def test_unchanged_recapture_is_gated(pool):
    tid = await _mk_target(pool)
    async with pool.acquire() as conn:
        first = await d.record_document(
            conn, crawl_target_id=tid, state_code="IA",
            source_url="http://x/fees.pdf", text="Monthly Fee $5.00\nGenerated 01/01/2026",
            raw_bytes=b"v1", http_status=200, render_mode="http", doc_type="pdf",
        )
        # same content, different volatile timestamp + different raw bytes
        second = await d.record_document(
            conn, crawl_target_id=tid, state_code="IA",
            source_url="http://x/fees.pdf", text="Monthly Fee $5.00\nGenerated 09/09/2026",
            raw_bytes=b"v2-different-bytes", http_status=200, render_mode="http", doc_type="pdf",
        )
    assert first.changed is True
    assert second.changed is False           # change-gate hit -> no downstream work
    assert second.document_id == first.document_id
    async with pool.acquire() as conn:
        count = await conn.fetchval("SELECT count(*) FROM documents WHERE crawl_target_id=$1", tid)
    assert count == 1                         # only one row stored


async def test_real_change_records_new_row(pool):
    tid = await _mk_target(pool)
    async with pool.acquire() as conn:
        await d.record_document(
            conn, crawl_target_id=tid, state_code="IA", source_url="u",
            text="Monthly Fee $5.00", raw_bytes=b"a", http_status=200,
            render_mode="http", doc_type="pdf",
        )
        changed = await d.record_document(
            conn, crawl_target_id=tid, state_code="IA", source_url="u",
            text="Monthly Fee $9.00", raw_bytes=b"b", http_status=200,
            render_mode="http", doc_type="pdf",
        )
    assert changed.changed is True
    async with pool.acquire() as conn:
        count = await conn.fetchval("SELECT count(*) FROM documents WHERE crawl_target_id=$1", tid)
    assert count == 2


# ---- pipeline_runs try/finally --------------------------------------------

async def test_run_scope_completes_on_success(pool):
    async with runs.run_scope(pool, "state", state_code="IA", cycle=1) as run:
        run.add_stats(extracted=10, failed=2)
        run.add_stats(extracted=5)  # accumulates
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status, stats FROM pipeline_runs WHERE id=$1", run.run_id
        )
    assert row["status"] == "completed"
    import json
    assert json.loads(row["stats"])["extracted"] == 15


async def test_run_scope_fails_and_reraises_on_exception(pool):
    run_id_holder = {}
    with pytest.raises(RuntimeError, match="kaboom"):
        async with runs.run_scope(pool, "state", state_code="IA") as run:
            run_id_holder["id"] = run.run_id
            raise RuntimeError("kaboom")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status, error FROM pipeline_runs WHERE id=$1", run_id_holder["id"]
        )
    assert row["status"] == "failed"          # ALWAYS terminal, never stuck running
    assert "kaboom" in row["error"]


async def test_reap_stale_run(pool):
    run = await runs.start_run(pool, "state", state_code="IA")
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE pipeline_runs SET heartbeat_at = NOW() - INTERVAL '3 hours' WHERE id=$1",
            run.run_id,
        )
    reaped = await runs.reap_stale_runs(pool, timeout_seconds=7200)
    assert reaped == 1
    async with pool.acquire() as conn:
        status = await conn.fetchval("SELECT status FROM pipeline_runs WHERE id=$1", run.run_id)
    assert status == "failed"
