"""End-to-end demonstration of the ingestion engine.

Drives the whole chain against a disposable Postgres schema using fake
network/LLM adapters (so it needs no bank sites or API key), and narrates what
each persona does:

    Steward dispatches -> Magellan fetches -> Rosetta reads -> Knox extracts ->
    Darwin verifies -> Atlas publishes.

Then re-runs the cycle to show the change-gate skip. Run:

    DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5432/bfi_test \
        python scripts/engine_e2e_demo.py
"""

from __future__ import annotations

import asyncio
import json
import os
import secrets as _secrets
from pathlib import Path

import asyncpg

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"

PREREQ = """
CREATE TABLE jobs (
    id BIGSERIAL PRIMARY KEY, queue TEXT NOT NULL, entity_id TEXT NOT NULL,
    payload JSONB, status TEXT NOT NULL DEFAULT 'pending', priority INT NOT NULL DEFAULT 0,
    attempts INT NOT NULL DEFAULT 0, max_attempts INT NOT NULL DEFAULT 3,
    run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), locked_by TEXT, locked_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE crawl_targets (
    id BIGSERIAL PRIMARY KEY, institution_name TEXT NOT NULL, charter_type TEXT DEFAULT 'bank',
    source TEXT DEFAULT 'demo', state_code CHAR(2), fee_schedule_url TEXT, website_url TEXT,
    status TEXT DEFAULT 'active', last_content_hash TEXT, last_crawl_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ, consecutive_failures INT NOT NULL DEFAULT 0);
CREATE TABLE fees_raw (
    fee_raw_id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    institution_id INTEGER NOT NULL, source_url TEXT, document_r2_key TEXT,
    extraction_confidence NUMERIC(5,4), agent_event_id UUID NOT NULL, fee_name TEXT NOT NULL,
    amount NUMERIC(12,2), frequency TEXT, conditions TEXT,
    outlier_flags JSONB NOT NULL DEFAULT '[]'::jsonb, source TEXT NOT NULL DEFAULT 'knox');
CREATE TABLE fees_verified (
    fee_verified_id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fee_raw_id BIGINT NOT NULL REFERENCES fees_raw(fee_raw_id), institution_id INTEGER NOT NULL,
    source_url TEXT, document_r2_key TEXT, extraction_confidence NUMERIC(5,4),
    canonical_fee_key TEXT NOT NULL, variant_type TEXT,
    outlier_flags JSONB NOT NULL DEFAULT '[]'::jsonb, verified_by_agent_event_id UUID NOT NULL,
    fee_name TEXT NOT NULL, amount NUMERIC(12,2), frequency TEXT,
    review_status TEXT NOT NULL DEFAULT 'verified');
"""

MIGS = [
    "20260716000001_engine_phase0.sql",
    "20260716000003_engine_fees_provenance.sql",
    "20260716000002_engine_state_knowledge.sql",
    "20260716000004_engine_publish.sql",
    "20260716000005_engine_golden.sql",
]


async def _init_codec(conn):
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    await conn.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


def log(persona, msg):
    print(f"  {persona:<9} │ {msg}")


async def _fake_fleet():
    """Build the four personas with fake adapters (no network/LLM/R2)."""
    from fee_crawler.engine.adapters import FeeCandidate, FetchOutcome, ReadOutcome
    from fee_crawler.engine.handlers.extract import Knox
    from fee_crawler.engine.handlers.fetch import Magellan
    from fee_crawler.engine.handlers.read import Rosetta
    from fee_crawler.engine.handlers.verify import Darwin
    from fee_crawler.engine.promoter import FeesVerifiedPromoter

    store = {}

    class Store:
        async def put(self, k, d): store[k] = d
        async def get(self, k): return store[k]

    class Fetcher:
        async def fetch(self, url, *, prefer_render=None):
            if "dead" in url:
                return FetchOutcome(ok=False, dead=True, error="404")
            body = f"Fee Schedule\nMonthly Fee $5.00\nWire Fee $25.00\nsource:{url}"
            return FetchOutcome(ok=True, raw_bytes=body.encode(), text=body,
                                http_status=200, render_mode="http", doc_type="html")

    class Reader:
        async def read(self, raw, doc_type, *, allow_ocr=True):
            t = raw.decode()
            return ReadOutcome(text=t, region_start=0, region_end=len(t))

    class Extractor:
        model_version = "haiku-demo-v1"
        async def extract(self, text, *, aliases=None):
            return [
                FeeCandidate("Monthly Fee", 5.0, "monthly", None, 0.96, 0, 11),
                FeeCandidate("Wire Fee", 25.0, "per-item", None, 0.93, 12, 20),
            ]

    class Classifier:
        _map = {"Monthly Fee": "monthly_maintenance", "Wire Fee": "wire_transfer"}
        async def classify(self, fee):
            return self._map.get(fee["fee_name"])

    return {
        "fetch": Magellan(Fetcher(), Store()),
        "read": Rosetta(Store() if False else _shared_store(store), Reader()),
        "extract": Knox(Extractor()),
        "verify": Darwin(Classifier(), FeesVerifiedPromoter()),
    }


def _shared_store(store):
    class Store:
        async def put(self, k, d): store[k] = d
        async def get(self, k): return store[k]
    return Store()


async def _drain(pool, fleet):
    from fee_crawler.engine.worker import run_once
    counts = {q: 0 for q in fleet}
    progressed = True
    while progressed:
        progressed = False
        for q, handler in fleet.items():
            if await run_once(pool, handler, f"{q}-w"):
                counts[q] += 1
                progressed = True
    return counts


async def main():
    dsn = os.environ.get("DATABASE_URL_TEST")
    if not dsn:
        raise SystemExit("set DATABASE_URL_TEST")
    schema = f"engine_demo_{_secrets.token_hex(4)}"
    admin = await asyncpg.connect(dsn=dsn)
    await admin.execute(f'CREATE SCHEMA "{schema}"')
    await admin.close()
    pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=8,
                                     server_settings={"search_path": schema}, init=_init_codec)
    try:
        async with pool.acquire() as c:
            await c.execute(PREREQ)
            for m in MIGS:
                await c.execute((MIGRATIONS / m).read_text())
            # Seed 3 Iowa institutions: 2 healthy, 1 with a dead URL.
            for name, url in [("Hawkeye Bank", "http://hawkeye/fees"),
                              ("Prairie CU", "http://prairie/fees"),
                              ("Ghost Bank", "http://ghost/dead")]:
                await c.execute(
                    "INSERT INTO crawl_targets (institution_name, state_code, fee_schedule_url) "
                    "VALUES ($1,'IA',$2)", name, url)

        from fee_crawler.engine import knowledge as kn
        from fee_crawler.engine import rollup, supervisor as sup

        fleet = await _fake_fleet()

        print("\n═══ CYCLE 1 — first run (nothing learned yet) ═══")
        c1 = await sup.run_cycle(pool, "IA", cycle=1)
        log("Steward", f"dispatched {c1['dispatched']} targets for IA (run {c1['run_id']})")
        counts = await _drain(pool, fleet)
        log("Magellan", f"fetch jobs processed: {counts['fetch']} (1 dead URL rescued then parked)")
        log("Rosetta", f"read jobs processed: {counts['read']}")
        log("Knox", f"extract jobs processed: {counts['extract']}")
        log("Darwin", f"verify jobs processed: {counts['verify']}")
        stats = await sup.finalize_cycle(pool, "IA", c1["run_id"])
        log("Steward", f"learned + logged: {stats}")

        async with pool.acquire() as c:
            docs = await c.fetchval("SELECT count(*) FROM documents")
            raw = await c.fetchval("SELECT count(*) FROM fees_raw")
            ver = await c.fetchval("SELECT count(*) FROM fees_verified")
            dead = await c.fetchval("SELECT count(*) FROM jobs WHERE status='dead'")
            hints = await c.fetch("SELECT known_fee_url, render_mode FROM institution_hints ORDER BY crawl_target_id")
        print(f"\n  DB state → documents={docs}  fees_raw={raw}  fees_verified={ver}  dead_jobs={dead}")
        print(f"  Steward's hints learned: {[(h['known_fee_url'], h['render_mode']) for h in hints]}")

        print("\n═══ ATLAS — national roll-up + atomic publish ═══")
        out = await rollup.run_national_rollup(pool, enforce_golden=True)
        log("Atlas", f"published={out['published']} rows={out.get('rows')}")
        async with pool.acquire() as c:
            pub = await c.fetch("SELECT institution_id, canonical_fee_key, amount FROM fees_published_current ORDER BY institution_id, canonical_fee_key")
        print("  Live published index (fees_published_current):")
        for r in pub:
            print(f"    inst {r['institution_id']}  {r['canonical_fee_key']:<20} ${r['amount']}")

        print("\n═══ CYCLE 2 — re-run (change-gate should skip unchanged docs) ═══")
        c2 = await sup.run_cycle(pool, "IA", cycle=2)
        log("Steward", f"re-dispatched {c2['dispatched']} targets (uses learned URLs)")
        counts2 = await _drain(pool, fleet)
        log("Magellan", f"fetched again: {counts2['fetch']}")
        log("Rosetta", f"read jobs this cycle: {counts2['read']}  ← 0 = change-gate held")
        log("Knox", f"extract jobs this cycle: {counts2['extract']}  ← 0 = no wasted LLM calls")
        async with pool.acquire() as c:
            docs2 = await c.fetchval("SELECT count(*) FROM documents")
        print(f"\n  DB state → documents={docs2} (unchanged; no duplicate rows)")
        assert counts2["read"] == 0 and counts2["extract"] == 0, "change-gate failed"
        assert docs2 == docs, "documents duplicated"

        print("\n✅ End-to-end run complete: full chain worked, change-gate held on re-run.\n")
        md = await kn.export_state_md(pool, "IA")
        print("─── Steward's generated knowledge (knowledge/states/IA.md) ───")
        print(md)
    finally:
        await pool.close()
        admin = await asyncpg.connect(dsn=dsn)
        await admin.execute(f'DROP SCHEMA "{schema}" CASCADE')
        await admin.close()


if __name__ == "__main__":
    asyncio.run(main())
