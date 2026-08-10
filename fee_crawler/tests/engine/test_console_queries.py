"""Validate the ops-console SQL (src/lib/engine-db/*) against the engine schema.

The console read layer is TypeScript, but its queries are the risky part — joins
across jobs / engine_runs / documents / state_run_notes / fees_* / publish_*.
These tests run the same SQL (params as $1) against a seeded engine schema so a
column typo in the console fails here, not in production.
"""

from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.asyncio
_EV = uuid.UUID("77777777-7777-4777-8777-777777777777")


async def _seed(pool):
    async with pool.acquire() as conn:
        tid = await conn.fetchval(
            "INSERT INTO crawl_targets (institution_name, state_code, charter_type) "
            "VALUES ('Hawkeye Bank','IA','bank') RETURNING id")
        await conn.execute("INSERT INTO jobs (queue,entity_id,status) VALUES ('fetch',$1,'pending')", f"target:{tid}")
        await conn.execute("INSERT INTO jobs (queue,entity_id,status,completed_at) VALUES ('extract','doc:1','dead',NOW())")
        await conn.execute("INSERT INTO institution_hints (crawl_target_id,state_code,render_mode,known_fee_url) "
                           "VALUES ($1,'IA','http','http://x/fees')", tid)
        await conn.execute("INSERT INTO state_run_notes (state_code,run_id,discovered,extracted,failed) VALUES ('IA',1,3,8,1)")
        await conn.execute("INSERT INTO engine_runs (kind,state_code,cycle,status,finished_at) VALUES ('state','IA',1,'completed',NOW())")
        doc = await conn.fetchval(
            "INSERT INTO documents (crawl_target_id,state_code,source_url,content_sha256,raw_sha256,r2_key,render_mode,doc_type) "
            "VALUES ($1,'IA','http://x/fees','c1','r1','documents/r1','http','html') RETURNING id", tid)
        raw = await conn.fetchval(
            "INSERT INTO fees_raw (institution_id,document_id,agent_event_id,fee_name,amount,conditions,"
            "extraction_confidence,char_start,char_end,extractor_version,outlier_flags,source) "
            "VALUES ($1,$2,$3,'Monthly Fee',5.0,'waived',0.60,10,21,'haiku-v7',$4,'knox') RETURNING fee_raw_id",
            tid, doc, _EV, ["low_confidence"])
        await conn.fetchval(
            "INSERT INTO fees_verified (fee_raw_id,institution_id,canonical_fee_key,verified_by_agent_event_id,"
            "fee_name,amount) VALUES ($1,$2,'monthly_maintenance',$3,'Monthly Fee',5.0) RETURNING fee_verified_id",
            raw, tid, _EV)
        batch = await conn.fetchval("INSERT INTO publish_batches (status,row_count,activated_at) VALUES ('active',1,NOW()) RETURNING batch_id")
        await conn.execute("INSERT INTO fees_published_engine (batch_id,institution_id,canonical_fee_key,fee_name,amount) "
                           "VALUES ($1,$2,'monthly_maintenance','Monthly Fee',5.0)", batch, tid)
        return tid, raw


async def test_fleet_query(pool):
    await _seed(pool)
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT queue,
                   count(*) FILTER (WHERE status='pending' AND run_at <= NOW()) AS depth,
                   count(*) FILTER (WHERE status='running')                      AS running,
                   count(*) FILTER (WHERE status='dead')                         AS dead,
                   count(*) FILTER (WHERE status='succeeded' AND completed_at > NOW() - INTERVAL '1 hour') AS done_1h,
                   EXTRACT(EPOCH FROM (NOW() - min(run_at) FILTER (WHERE status='pending' AND run_at <= NOW()))) AS oldest_secs
              FROM jobs GROUP BY queue ORDER BY queue""")
    by = {r["queue"]: r for r in rows}
    assert by["fetch"]["depth"] == 1
    assert by["extract"]["dead"] == 1


async def test_runs_query(pool):
    await _seed(pool)
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, kind, state_code, cycle, status, stats, error, started_at, finished_at,
                   EXTRACT(EPOCH FROM (COALESCE(finished_at, NOW()) - started_at)) AS dur
              FROM engine_runs ORDER BY started_at DESC LIMIT 40""")
    assert rows[0]["status"] == "completed"
    assert rows[0]["dur"] is not None


async def test_steward_grid_query(pool):
    await _seed(pool)
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            WITH cov AS (
              SELECT t.state_code, count(DISTINCT t.id) AS institutions,
                     count(DISTINCT v.institution_id) AS with_fees
                FROM crawl_targets t LEFT JOIN fees_verified v ON v.institution_id = t.id
               WHERE t.status='active' AND t.state_code IS NOT NULL GROUP BY t.state_code),
            latest AS (SELECT DISTINCT ON (state_code) state_code, run_id AS cycle, extracted, failed
                         FROM state_run_notes ORDER BY state_code, run_id DESC),
            hints AS (SELECT state_code, count(*) AS n FROM institution_hints GROUP BY state_code)
            SELECT c.state_code, c.institutions, c.with_fees, l.cycle AS last_cycle,
                   l.extracted AS last_extracted, l.failed AS last_failed, COALESCE(h.n,0) AS hints
              FROM cov c LEFT JOIN latest l ON l.state_code=c.state_code
              LEFT JOIN hints h ON h.state_code=c.state_code ORDER BY c.state_code""")
    ia = rows[0]
    assert ia["state_code"] == "IA"
    assert ia["with_fees"] == 1 and ia["last_extracted"] == 8 and ia["hints"] == 1


async def test_publish_and_live_summary(pool):
    await _seed(pool)
    async with pool.acquire() as conn:
        [row] = await conn.fetch("""
            SELECT b.batch_id, count(fp.id) AS rows, count(DISTINCT fp.institution_id) AS insts, b.activated_at
              FROM publish_batches b LEFT JOIN fees_published_engine fp ON fp.batch_id=b.batch_id
             WHERE b.status='active' GROUP BY b.batch_id, b.activated_at""")
    assert row["rows"] == 1 and row["insts"] == 1


async def test_review_queue_and_provenance(pool):
    _, raw = await _seed(pool)
    async with pool.acquire() as conn:
        q = await conn.fetch("""
            SELECT fr.fee_raw_id, fr.institution_id, t.institution_name, fr.fee_name, fr.amount,
                   fr.extraction_confidence, fr.outlier_flags, fr.document_id
              FROM fees_raw fr LEFT JOIN crawl_targets t ON t.id = fr.institution_id
             WHERE jsonb_array_length(fr.outlier_flags) > 0 ORDER BY fr.created_at DESC LIMIT 100""")
        assert q[0]["fee_name"] == "Monthly Fee"
        assert "low_confidence" in q[0]["outlier_flags"]
        [p] = await conn.fetch("""
            SELECT fr.fee_name, fr.amount, v.canonical_fee_key, fr.extraction_confidence,
                   fr.char_start, fr.char_end, fr.extractor_version,
                   fr.document_id, d.source_url, d.r2_key, d.content_sha256, d.fetched_at, d.render_mode
              FROM fees_raw fr
              LEFT JOIN fees_verified v ON v.fee_raw_id = fr.fee_raw_id
              LEFT JOIN documents d ON d.id = fr.document_id
             WHERE fr.fee_raw_id = $1""", raw)
    assert p["canonical_fee_key"] == "monthly_maintenance"
    assert p["char_start"] == 10 and p["r2_key"] == "documents/r1"


async def test_golden_status_query(pool):
    tid, _ = await _seed(pool)
    async with pool.acquire() as conn:
        await conn.execute("INSERT INTO golden_institutions (crawl_target_id,label) VALUES ($1,'g')", tid)
        await conn.execute("INSERT INTO golden_fees (crawl_target_id,canonical_fee_key,expected_amount,tolerance) "
                           "VALUES ($1,'monthly_maintenance',5.0,0.5)", tid)
        rows = await conn.fetch("""
            WITH latest AS (SELECT DISTINCT ON (institution_id, canonical_fee_key)
                              institution_id, canonical_fee_key, amount
                              FROM fees_verified ORDER BY institution_id, canonical_fee_key, created_at DESC)
            SELECT g.crawl_target_id, count(*) AS expected,
                   count(*) FILTER (WHERE l.canonical_fee_key IS NOT NULL
                     AND (g.expected_amount IS NULL OR l.amount IS NULL
                          OR abs(l.amount - g.expected_amount) <= g.tolerance)) AS matched
              FROM golden_fees g
              LEFT JOIN latest l ON l.institution_id=g.crawl_target_id AND l.canonical_fee_key=g.canonical_fee_key
             GROUP BY g.crawl_target_id""")
    assert int(rows[0]["matched"]) == int(rows[0]["expected"])  # clean
