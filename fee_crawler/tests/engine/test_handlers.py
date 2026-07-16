"""Phase 1 — capability-handler logic with fake adapters.

Verifies the properties that matter for correctness: the change-gate
short-circuits fetch, dead URLs escalate then give up, read escalates to OCR and
records the hint, extract writes provenance-linked fees_raw idempotently, and
verify promotes clean fees / flags dirty ones.
"""

from __future__ import annotations

import uuid

import pytest

from fee_crawler.engine import queue as q
from fee_crawler.engine.adapters import FeeCandidate, FetchOutcome, ReadOutcome
from fee_crawler.engine.handlers.extract import ExtractHandler
from fee_crawler.engine.handlers.fetch import FetchHandler
from fee_crawler.engine.handlers.read import ReadHandler
from fee_crawler.engine.handlers.verify import VerifyHandler, rule_flags
from fee_crawler.engine.worker import run_once

pytestmark = pytest.mark.asyncio


# --- fakes -----------------------------------------------------------------

class FakeStore:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    async def put(self, key, data):
        self.objects[key] = data

    async def get(self, key):
        return self.objects[key]


class FakeFetcher:
    def __init__(self, outcome):
        self.outcome = outcome
        self.calls = []

    async def fetch(self, url, *, prefer_render=None):
        self.calls.append((url, prefer_render))
        return self.outcome


class FakeReader:
    def __init__(self, outcome):
        self.outcome = outcome

    async def read(self, raw_bytes, doc_type, *, allow_ocr=True):
        return self.outcome


class FakeExtractor:
    model_version = "haiku-test-v1"

    def __init__(self, fees):
        self.fees = fees

    async def extract(self, text, *, aliases=None):
        return self.fees


class FakeClassifier:
    def __init__(self, key):
        self.key = key

    async def classify(self, fee):
        return self.key


class FakePromoter:
    def __init__(self):
        self.promoted = []
        self.flagged = []

    async def promote(self, conn, raw_fee, canonical_key):
        self.promoted.append((raw_fee["fee_name"], canonical_key))

    async def flag(self, conn, raw_fee, flags):
        self.flagged.append((raw_fee["fee_name"], flags))


# --- helpers ----------------------------------------------------------------

async def _mk_target(pool, state="IA"):
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "INSERT INTO crawl_targets (institution_name, state_code) "
            "VALUES ('Bank', $1) RETURNING id",
            state,
        )


# --- fetch ------------------------------------------------------------------

async def test_fetch_changed_enqueues_read(pool):
    tid = await _mk_target(pool)
    store = FakeStore()
    fetcher = FakeFetcher(FetchOutcome(ok=True, raw_bytes=b"pdf", text="Monthly Fee $5",
                                       http_status=200, render_mode="http", doc_type="pdf"))
    async with pool.acquire() as conn:
        await q.enqueue(conn, "fetch", f"target:{tid}", payload={"url": "http://x/f.pdf"}, state_code="IA")
    handler = FetchHandler(fetcher, store)
    assert await run_once(pool, handler, "w") is True

    # a read job now exists; document + r2 object stored; failure streak reset
    assert await q.queue_depth(pool, "read") == 1
    assert len(store.objects) == 1
    async with pool.acquire() as conn:
        cf = await conn.fetchval("SELECT consecutive_failures FROM crawl_targets WHERE id=$1", tid)
        docs = await conn.fetchval("SELECT count(*) FROM documents WHERE crawl_target_id=$1", tid)
    assert cf == 0
    assert docs == 1


async def test_fetch_unchanged_gates_no_read(pool):
    tid = await _mk_target(pool)
    store = FakeStore()
    fetcher = FakeFetcher(FetchOutcome(ok=True, raw_bytes=b"pdf", text="Monthly Fee $5",
                                       http_status=200, render_mode="http", doc_type="pdf"))
    handler = FetchHandler(fetcher, store)
    # first fetch -> changed -> read job
    async with pool.acquire() as conn:
        await q.enqueue(conn, "fetch", f"target:{tid}", payload={"url": "u"}, state_code="IA")
    await run_once(pool, handler, "w")
    assert await q.queue_depth(pool, "read") == 1

    # second fetch, same content -> change-gate hit -> NO new read job
    async with pool.acquire() as conn:
        await q.enqueue(conn, "fetch", f"target:{tid}", payload={"url": "u"}, state_code="IA")
    await run_once(pool, handler, "w")
    assert await q.queue_depth(pool, "read") == 1  # still just the one


async def test_fetch_dead_url_escalates_then_gives_up(pool):
    tid = await _mk_target(pool)
    store = FakeStore()
    fetcher = FakeFetcher(FetchOutcome(ok=False, dead=True, error="404"))
    handler = FetchHandler(fetcher, store)
    async with pool.acquire() as conn:
        await q.enqueue(conn, "fetch", f"target:{tid}", payload={"url": "u"}, state_code="IA")
    await run_once(pool, handler, "w")
    # one rescue fetch enqueued, failure streak bumped
    assert await q.queue_depth(pool, "fetch") == 1
    async with pool.acquire() as conn:
        cf = await conn.fetchval("SELECT consecutive_failures FROM crawl_targets WHERE id=$1", tid)
        rescue = await conn.fetchval("SELECT (payload->>'rescue')::bool FROM jobs WHERE queue='fetch' AND status='pending'")
    assert cf == 1
    assert rescue is True
    # process the rescue attempt (still dead) -> gives up, no further job
    await run_once(pool, handler, "w")
    assert await q.queue_depth(pool, "fetch") == 0


# --- read -------------------------------------------------------------------

async def _mk_doc(pool, tid):
    from fee_crawler.engine.documents import record_document
    async with pool.acquire() as conn:
        cap = await record_document(
            conn, crawl_target_id=tid, state_code="IA", source_url="u",
            text="Monthly Fee $5", raw_bytes=b"raw", http_status=200,
            render_mode="http", doc_type="pdf",
        )
    return cap


async def test_read_enqueues_extract(pool):
    tid = await _mk_target(pool)
    cap = await _mk_doc(pool, tid)
    store = FakeStore(); store.objects[cap.r2_key] = b"raw"
    reader = FakeReader(ReadOutcome(text="   Monthly Fee $5   ", region_start=0, region_end=20))
    async with pool.acquire() as conn:
        await q.enqueue(conn, "read", f"doc:{cap.document_id}",
                        payload={"r2_key": cap.r2_key, "doc_type": "pdf"}, state_code="IA")
    await run_once(pool, ReadHandler(store, reader), "w")
    assert await q.queue_depth(pool, "extract") == 1


async def test_read_ocr_marks_hint(pool):
    tid = await _mk_target(pool)
    cap = await _mk_doc(pool, tid)
    store = FakeStore(); store.objects[cap.r2_key] = b"raw"
    reader = FakeReader(ReadOutcome(text="Fee $5", region_end=6, ocr_used=True))
    async with pool.acquire() as conn:
        await q.enqueue(conn, "read", f"doc:{cap.document_id}",
                        payload={"r2_key": cap.r2_key, "doc_type": "pdf"}, state_code="IA")
    await run_once(pool, ReadHandler(store, reader), "w")
    async with pool.acquire() as conn:
        needs_ocr = await conn.fetchval(
            "SELECT needs_ocr FROM institution_hints WHERE crawl_target_id=$1", tid
        )
    assert needs_ocr is True  # next cycle routes straight to OCR


async def test_read_empty_region_is_terminal(pool):
    tid = await _mk_target(pool)
    cap = await _mk_doc(pool, tid)
    store = FakeStore(); store.objects[cap.r2_key] = b"raw"
    reader = FakeReader(ReadOutcome(text="   ", region_end=0))
    async with pool.acquire() as conn:
        await q.enqueue(conn, "read", f"doc:{cap.document_id}",
                        payload={"r2_key": cap.r2_key, "doc_type": "pdf"}, state_code="IA")
    await run_once(pool, ReadHandler(store, reader), "w")
    assert await q.queue_depth(pool, "extract") == 0


# --- extract ----------------------------------------------------------------

async def test_extract_writes_provenance_and_chains_verify(pool):
    tid = await _mk_target(pool)
    cap = await _mk_doc(pool, tid)
    fees = [
        FeeCandidate("Monthly Fee", 5.0, "monthly", None, 0.95, char_start=0, char_end=11),
        FeeCandidate("Wire Fee", 25.0, "per-item", None, 0.9, char_start=12, char_end=20),
    ]
    async with pool.acquire() as conn:
        await q.enqueue(conn, "extract", f"doc:{cap.document_id}",
                        payload={"region": "Monthly Fee Wire Fee", "region_start": 100}, state_code="IA")
    await run_once(pool, ExtractHandler(FakeExtractor(fees)), "w")

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT fee_name, document_id, char_start, extractor_version FROM fees_raw "
            "WHERE institution_id=$1 ORDER BY fee_name", tid
        )
    assert len(rows) == 2
    assert rows[0]["document_id"] == cap.document_id          # provenance link
    assert rows[0]["char_start"] == 100                        # absolute offset (base+span)
    assert rows[0]["extractor_version"] == "haiku-test-v1"
    assert await q.queue_depth(pool, "verify") == 1            # chained


async def test_extract_is_idempotent(pool):
    tid = await _mk_target(pool)
    cap = await _mk_doc(pool, tid)
    fees = [FeeCandidate("Monthly Fee", 5.0, "monthly", None, 0.95)]
    handler = ExtractHandler(FakeExtractor(fees))
    for _ in range(2):
        async with pool.acquire() as conn:
            await q.enqueue(conn, "extract", f"doc:{cap.document_id}",
                            payload={"region": "Monthly Fee"}, state_code="IA")
        await run_once(pool, handler, "w")
    async with pool.acquire() as conn:
        n = await conn.fetchval("SELECT count(*) FROM fees_raw WHERE institution_id=$1", tid)
    assert n == 1  # re-run replaced, did not duplicate


# --- verify -----------------------------------------------------------------

def test_rule_flags_catches_bad_fees():
    assert "negative_amount" in rule_flags({"fee_name": "x", "amount": -1, "extraction_confidence": 0.99})
    assert "amount_out_of_range" in rule_flags({"fee_name": "x", "amount": 1e9, "extraction_confidence": 0.99})
    assert "bad_frequency" in rule_flags({"fee_name": "x", "amount": 5, "frequency": "per-lunar-cycle", "extraction_confidence": 0.99})
    assert "low_confidence" in rule_flags({"fee_name": "x", "amount": 5, "extraction_confidence": 0.1})
    assert rule_flags({"fee_name": "Monthly Fee", "amount": 5.0, "frequency": "monthly", "extraction_confidence": 0.95}) == []


async def _seed_raw(pool, tid, name, amount, conf):
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO fees_raw (institution_id, agent_event_id, fee_name, amount, "
            "frequency, extraction_confidence, source) VALUES ($1,$2,$3,$4,'monthly',$5,'knox')",
            tid, uuid.UUID("11111111-1111-4111-8111-111111111111"), name, amount, conf,
        )


async def test_verify_promotes_clean_flags_dirty(pool):
    tid = await _mk_target(pool)
    ev = "11111111-1111-4111-8111-111111111111"
    await _seed_raw(pool, tid, "Monthly Fee", 5.0, 0.95)     # clean
    await _seed_raw(pool, tid, "Weird Fee", -3.0, 0.95)      # negative -> flag
    await _seed_raw(pool, tid, "Fuzzy Fee", 5.0, 0.20)       # low conf -> flag

    promoter = FakePromoter()
    handler = VerifyHandler(FakeClassifier("monthly_maintenance"), promoter)
    async with pool.acquire() as conn:
        await q.enqueue(conn, "verify", f"doc:1", payload={"event_id": ev}, state_code="IA")
    await run_once(pool, handler, "w")

    assert len(promoter.promoted) == 1
    assert promoter.promoted[0] == ("Monthly Fee", "monthly_maintenance")
    assert len(promoter.flagged) == 2


async def test_verify_flags_unclassified(pool):
    tid = await _mk_target(pool)
    ev = "11111111-1111-4111-8111-111111111111"
    await _seed_raw(pool, tid, "Monthly Fee", 5.0, 0.95)
    promoter = FakePromoter()
    handler = VerifyHandler(FakeClassifier(None), promoter)  # classifier can't map it
    async with pool.acquire() as conn:
        await q.enqueue(conn, "verify", "doc:1", payload={"event_id": ev}, state_code="IA")
    await run_once(pool, handler, "w")
    assert len(promoter.promoted) == 0
    assert promoter.flagged[0][1] == ["unclassified"]
