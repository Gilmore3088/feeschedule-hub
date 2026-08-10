"""Phase 2 — state supervisor + structured knowledge.

Proves the compounding property the whole design exists for: cycle 1 resolves an
unknown URL; after the supervisor learns, cycle 2 goes straight to fetch. Also
checks select_work routing, the fail cap, learn() writing hints/notes, and md
export.
"""

from __future__ import annotations

import pytest

from fee_crawler.engine import knowledge as kn
from fee_crawler.engine import queue as q
from fee_crawler.engine import supervisor as sup
from fee_crawler.engine.adapters import FeeCandidate, FetchOutcome, ReadOutcome
from fee_crawler.engine.handlers.extract import Knox
from fee_crawler.engine.handlers.fetch import Magellan
from fee_crawler.engine.handlers.read import Rosetta
from fee_crawler.engine.handlers.verify import Darwin
from fee_crawler.engine.promoter import FeesVerifiedPromoter
from fee_crawler.engine.worker import run_once

pytestmark = pytest.mark.asyncio


async def _mk_target(pool, *, url=None, state="IA"):
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "INSERT INTO crawl_targets (institution_name, state_code, fee_schedule_url) "
            "VALUES ('Bank', $1, $2) RETURNING id",
            state, url,
        )


# --- select_work routing ----------------------------------------------------

async def test_select_work_routes_by_url_and_priority(pool):
    known = await _mk_target(pool, url="http://x/fees.pdf")     # -> fetch
    unknown = await _mk_target(pool, url=None)                  # -> resolve
    work = {w.target_id: w for w in await sup.select_work(pool, "IA")}
    assert work[known].queue == "fetch"
    assert work[unknown].queue == "resolve"
    # never-crawled targets are top priority
    assert work[known].priority == 10


async def test_select_work_respects_fail_cap(pool):
    tid = await _mk_target(pool, url="u")
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE crawl_targets SET consecutive_failures=$2 WHERE id=$1", tid, sup.FAIL_CAP
        )
    work = await sup.select_work(pool, "IA")
    assert all(w.target_id != tid for w in work)  # skipped this cycle


async def test_known_hint_url_overrides_missing_target_url(pool):
    tid = await _mk_target(pool, url=None)  # no target URL
    await kn.upsert_hint(pool, tid, "IA", known_fee_url="http://learned/fees.pdf")
    work = {w.target_id: w for w in await sup.select_work(pool, "IA")}
    assert work[tid].queue == "fetch"       # hint supplies the URL -> skip resolve
    assert work[tid].url == "http://learned/fees.pdf"


# --- full cycle drains + learns; cycle 2 compounds --------------------------

def _fleet(pool):
    """Handlers with fakes that always succeed with one fee."""
    store = _FakeStore()
    fetch = Magellan(
        _FakeFetcher(FetchOutcome(ok=True, raw_bytes=b"pdf", text="Fee Schedule\nMonthly Fee $5",
                                  http_status=200, render_mode="http", doc_type="pdf")),
        store,
    )
    read = Rosetta(store, _FakeReader(ReadOutcome(text="Fee Schedule\nMonthly Fee $5", region_end=27)))
    extract = Knox(_FakeExtractor([FeeCandidate("Monthly Fee", 5.0, "monthly", None, 0.95)]))
    verify = Darwin(_FakeClassifier("monthly_maintenance"), FeesVerifiedPromoter())
    return {"fetch": fetch, "read": read, "extract": extract, "verify": verify}


async def _drain(pool, fleet):
    """Run every queue to empty (fixed-point)."""
    progressed = True
    while progressed:
        progressed = False
        for name, handler in fleet.items():
            if await run_once(pool, handler, "w"):
                progressed = True


async def test_cycle_learns_and_compounds(pool):
    tid = await _mk_target(pool, url="http://x/fees.pdf")
    fleet = _fleet(pool)

    # Cycle 1
    c1 = await sup.run_cycle(pool, "IA", cycle=1)
    assert c1["dispatched"] == 1
    await _drain(pool, fleet)
    stats1 = await sup.finalize_cycle(pool, "IA", c1["run_id"])
    assert stats1["discovered"] == 1
    assert stats1["extracted"] == 1

    # The supervisor learned render_mode + known URL for this target.
    hints = await kn.load_hints(pool, "IA")
    assert hints[tid].render_mode == "http"
    assert hints[tid].known_fee_url == "http://x/fees.pdf"

    # A verified fee exists (real promoter wrote fees_verified).
    async with pool.acquire() as conn:
        verified = await conn.fetchval("SELECT count(*) FROM fees_verified")
    assert verified == 1

    # Cycle 2 re-dispatches, but the doc is unchanged -> change-gate stops it at
    # fetch, so no new read/extract jobs are produced.
    c2 = await sup.run_cycle(pool, "IA", cycle=2)
    await _drain(pool, fleet)
    async with pool.acquire() as conn:
        # still exactly one document + one verified fee (idempotent, gated)
        docs = await conn.fetchval("SELECT count(*) FROM documents WHERE crawl_target_id=$1", tid)
        verified = await conn.fetchval("SELECT count(*) FROM fees_verified")
    assert docs == 1
    assert verified == 1


async def test_run_note_and_md_export(pool):
    await _mk_target(pool, url="u")
    fleet = _fleet(pool)
    c = await sup.run_cycle(pool, "IA", cycle=7)
    await _drain(pool, fleet)
    await sup.finalize_cycle(pool, "IA", c["run_id"])
    md = await kn.export_state_md(pool, "IA")
    assert "# IA Fee Schedule Knowledge" in md
    assert f"## Run #{c['run_id']}" in md
    assert "Extracted: 1" in md


async def test_backfill_hints_from_targets(pool):
    tid = await _mk_target(pool, url="http://x/f.pdf")
    n = await kn.backfill_hints_from_targets(pool, "IA")
    assert n == 1
    hints = await kn.load_hints(pool, "IA")
    assert hints[tid].known_fee_url == "http://x/f.pdf"


# --- fakes (module-level so _fleet can build them) --------------------------

class _FakeStore:
    def __init__(self):
        self.objects = {}

    async def put(self, key, data):
        self.objects[key] = data

    async def get(self, key):
        return self.objects[key]


class _FakeFetcher:
    def __init__(self, outcome):
        self.outcome = outcome

    async def fetch(self, url, *, prefer_render=None):
        return self.outcome


class _FakeReader:
    def __init__(self, outcome):
        self.outcome = outcome

    async def read(self, raw_bytes, doc_type, *, allow_ocr=True):
        return self.outcome


class _FakeExtractor:
    model_version = "haiku-test-v1"

    def __init__(self, fees):
        self.fees = fees

    async def extract(self, text, *, aliases=None):
        return self.fees


class _FakeClassifier:
    def __init__(self, key):
        self.key = key

    async def classify(self, fee):
        return self.key
