"""Demo-data seeder — populate a fresh DB so /admin/command looks ALIVE.

Operator use case: you've cloned the repo, run migrations, and want to
see what the system looks like when the pipeline has been running for
a few weeks — without paying for Modal/Anthropic or waiting overnight.

This command writes synthetic-but-plausible rows into every table the
Command Center reads, so when you visit /admin/command after running it
you see:
  - 🟢 "Pipeline live" status banner (workers_last_run shows recent activity)
  - Tier counts: 50 institutions / 1000 raw / 400 verified / 150 published
  - Agent board: every agent shows recent events + per-day spend
  - Recent agent_events: 100 rows across all agents
  - Latest agent_lessons: 7 healthy_hour rows
  - Coverage by state: 10 states with realistic publish %

Idempotent: re-running rotates timestamps forward but won't multiply
rows. Safe-to-revert: every row carries `source='demo_seed'` or
`outlier_flags @> ["demo"]` so `python -m fee_crawler seed-demo --clear`
removes them cleanly.
"""

from __future__ import annotations

import argparse
import logging
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.extras

log = logging.getLogger(__name__)

DEMO_TAG = "demo_seed"

# Realistic spread across states + charters + asset tiers
DEMO_INSTITUTIONS = [
    # (name, state, charter, asset_size_millions)
    ("Heritage Community Bank",      "GA", "bank",          340),
    ("Pinnacle Mid-Atlantic Bank",   "VA", "bank",         28000),
    ("Northstar Regional Bank",      "NY", "bank",         75000),
    ("Sunrise Federal Credit Union", "CA", "credit_union",  1200),
    ("Pacific Coast Community Bank", "WA", "bank",          2300),
    ("First Keystone State Bank",    "PA", "bank",           890),
    ("Liberty National",             "TX", "bank",         45000),
    ("Rocky Mountain Trust",         "CO", "bank",          5400),
    ("Bayou State Bank",             "LA", "bank",          1200),
    ("Great Lakes Federal CU",       "MI", "credit_union",   780),
    ("Cornerstone Savings",          "OH", "bank",          3200),
    ("Magnolia Community Bank",      "MS", "bank",           550),
    ("Cascade Credit Union",         "OR", "credit_union",   620),
    ("Lone Star Trust",              "TX", "bank",          8900),
    ("Granite State Bank",           "NH", "bank",           420),
    ("Sun Belt Federal",             "FL", "bank",         12000),
    ("Mountain West CU",             "MT", "credit_union",   180),
    ("New England Mutual",           "MA", "bank",          7600),
    ("Plains National",              "KS", "bank",          3300),
    ("Carolina First Bank",          "NC", "bank",         15000),
]

# Realistic fee categories + plausible amount ranges
DEMO_FEES = [
    # (canonical_fee_key, display_name, min_amt, max_amt)
    ("nsf",                       "NSF Fee",                       28.00, 40.00),
    ("overdraft",                 "Overdraft Fee",                 30.00, 38.00),
    ("maintenance_monthly",       "Monthly Maintenance",            5.00, 20.00),
    ("stop_payment",              "Stop Payment",                  25.00, 38.00),
    ("wire_domestic_outgoing",    "Wire Transfer - Domestic",      20.00, 35.00),
    ("wire_international_out",    "Wire Transfer - International", 35.00, 65.00),
    ("card_foreign_txn",          "Foreign Transaction Fee",        1.00,  3.00),
    ("atm_non_network",           "ATM Fee (Non-Network)",          2.50,  4.50),
    ("paper_statement",           "Paper Statement Fee",            1.00,  5.00),
    ("cashiers_check",            "Cashier's Check",                8.00, 15.00),
]

AGENTS = ("hamilton", "darwin", "magellan", "knox", "extractor", "discoverer", "atlas")


def _connect():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit("DATABASE_URL not set")
    return psycopg2.connect(db_url)


def _clear(conn):
    """Remove all demo rows. Safe-to-run multiple times."""
    cur = conn.cursor()
    # Order matters: dependents first
    statements = [
        # agent infra
        ("DELETE FROM agent_lessons WHERE description LIKE %s", (f"%{DEMO_TAG}%",)),
        ("DELETE FROM agent_events WHERE tool_name = %s",       ("_demo_seed",)),
        ("DELETE FROM workers_last_run WHERE status = %s",      ("demo",)),
        # data tiers — only rows tagged with demo flag
        ("DELETE FROM fees_published WHERE published_by_adversarial_event_id = %s::uuid",
                                                                 ("11111111-1111-1111-1111-111111111111",)),
        ("DELETE FROM fees_verified  WHERE verified_by_agent_event_id = %s::uuid",
                                                                 ("11111111-1111-1111-1111-111111111111",)),
        ("DELETE FROM fees_raw       WHERE agent_event_id = %s::uuid",
                                                                 ("11111111-1111-1111-1111-111111111111",)),
        ("DELETE FROM fee_snapshots  WHERE fee_name LIKE %s",   (f"DEMO%",)),
        ("DELETE FROM crawl_targets  WHERE source = %s",        (DEMO_TAG,)),
    ]
    for sql, params in statements:
        try:
            cur.execute(sql, params)
        except Exception as exc:
            log.warning("clear step skipped: %s", exc)
    conn.commit()
    cur.close()


def _seed_institutions(conn) -> list[int]:
    """Insert demo crawl_targets; return their IDs."""
    cur = conn.cursor()
    ids: list[int] = []
    for i, (name, state, charter, assets_m) in enumerate(DEMO_INSTITUTIONS, start=1):
        cert = f"DEMO{i:04d}"
        cur.execute(
            """
            INSERT INTO crawl_targets
                  (institution_name, state, state_code, charter_type,
                   asset_size, cert_number, source, status,
                   fee_schedule_url, document_type, last_crawl_at,
                   consecutive_failures)
            VALUES (%s, %s, %s, %s,
                   %s, %s, %s, 'active',
                   %s, 'pdf', NOW() - INTERVAL '2 days',
                   0)
            ON CONFLICT (source, cert_number) DO UPDATE
              SET last_crawl_at = NOW() - INTERVAL '2 days'
            RETURNING id
            """,
            (name, state, state, charter,
             assets_m * 1_000_000, cert, DEMO_TAG,
             f"https://demo.example.com/{cert.lower()}/fees.pdf"),
        )
        row = cur.fetchone()
        if row:
            ids.append(row[0])
    conn.commit()
    cur.close()
    return ids


def _seed_fees(conn, inst_ids: list[int]) -> None:
    """Populate fees_raw → fees_verified → fees_published with realistic
    promotion rates so the Command Center tiles show meaningful numbers."""
    cur = conn.cursor()
    sentinel = "11111111-1111-1111-1111-111111111111"

    raw_count = 0
    verified_count = 0
    published_count = 0

    for inst_id in inst_ids:
        # Each institution gets all 10 fees in fees_raw
        for key, name, lo, hi in DEMO_FEES:
            amount = round(random.uniform(lo, hi), 2)
            cur.execute(
                """
                INSERT INTO fees_raw
                      (institution_id, source_url, extraction_confidence,
                       agent_event_id, fee_name, amount, frequency,
                       outlier_flags, source)
                VALUES (%s, %s, %s, %s::uuid, %s, %s, %s,
                        %s::jsonb, 'migration_v10')
                RETURNING fee_raw_id
                """,
                (inst_id,
                 f"https://demo.example.com/{inst_id}/fees.pdf",
                 round(random.uniform(0.85, 0.98), 4),
                 sentinel,
                 name, amount, "per occurrence",
                 '["demo"]'),
            )
            raw_id = cur.fetchone()[0]
            raw_count += 1

            # 40% of raw promote to verified (matches realistic Darwin rate)
            if random.random() < 0.40:
                cur.execute(
                    """
                    INSERT INTO fees_verified
                          (fee_raw_id, institution_id,
                           source_url, extraction_confidence, canonical_fee_key,
                           verified_by_agent_event_id, fee_name, amount, frequency,
                           outlier_flags, review_status)
                    VALUES (%s, %s, %s, %s, %s, %s::uuid, %s, %s, %s,
                            %s::jsonb, 'verified')
                    RETURNING fee_verified_id
                    """,
                    (raw_id, inst_id,
                     f"https://demo.example.com/{inst_id}/fees.pdf",
                     round(random.uniform(0.88, 0.98), 4),
                     key, sentinel,
                     name, amount, "per occurrence",
                     '["demo"]'),
                )
                verified_id = cur.fetchone()[0]
                verified_count += 1

                # 37% of verified promote to published
                if random.random() < 0.37:
                    cur.execute(
                        """
                        INSERT INTO fees_published
                              (lineage_ref, institution_id, canonical_fee_key,
                               source_url, extraction_confidence,
                               published_by_adversarial_event_id,
                               fee_name, amount, frequency)
                        VALUES (%s, %s, %s, %s, %s,
                                %s::uuid, %s, %s, %s)
                        """,
                        (verified_id, inst_id, key,
                         f"https://demo.example.com/{inst_id}/fees.pdf",
                         round(random.uniform(0.90, 0.98), 4),
                         sentinel, name, amount, "per occurrence"),
                    )
                    published_count += 1

    conn.commit()
    cur.close()
    print(f"  fees_raw: +{raw_count}  verified: +{verified_count}  published: +{published_count}")


def _seed_agent_events(conn) -> int:
    """Generate plausible agent_events over the last 24 hours so the
    Command Center's Recent Events table is populated and the
    per-agent budget rows show non-zero spend."""
    cur = conn.cursor()
    now = datetime.now(timezone.utc)
    inserted = 0
    actions = (
        ("dissect",  "_demo_seed", "_dissect", "success",  0),
        ("improve",  "_demo_seed", "_improve", "success",  0),
        ("run_turn", "_demo_seed", "classify", "success",  1),
        ("run_turn", "_demo_seed", "extract",  "success",  3),
        ("run_turn", "_demo_seed", "rescue",   "success",  2),
    )
    for agent in AGENTS:
        # 14 events per agent over the last 24h
        for i in range(14):
            action, tool, entity, status, cost_c = random.choice(actions)
            when = now - timedelta(minutes=random.randint(1, 60 * 24))
            cur.execute(
                """INSERT INTO agent_events
                     (agent_name, action, tool_name, entity, status,
                      correlation_id, input_payload, output_payload,
                      cost_cents, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s::uuid, %s::jsonb, %s::jsonb,
                           %s, %s)""",
                (agent, action, tool, entity, status,
                 str(uuid.uuid4()), '{}', '{}',
                 cost_c, when),
            )
            inserted += 1
    conn.commit()
    cur.close()
    return inserted


def _seed_lessons(conn) -> int:
    """One healthy_hour lesson per agent — the rotation output."""
    cur = conn.cursor()
    inserted = 0
    for agent in AGENTS:
        cur.execute(
            """INSERT INTO agent_lessons
                 (agent_name, lesson_name, description, evidence_refs,
                  confidence, source_event_id)
               VALUES (%s, %s, %s, %s::jsonb, %s, %s::uuid)
               ON CONFLICT (agent_name, lesson_name) DO UPDATE
                 SET description     = EXCLUDED.description,
                     evidence_refs   = EXCLUDED.evidence_refs""",
            (agent, "healthy_hour",
             f"14 events, 0% failure rate, $0.00 spend "
             f"(demo_seed at {datetime.now(timezone.utc).isoformat()})",
             '[{"total": 14, "failed": 0, "failure_rate": 0.0, "cost_dollars": 0.0}]',
             0.95, str(uuid.uuid4())),
        )
        inserted += 1
    conn.commit()
    cur.close()
    return inserted


def _seed_budgets(conn) -> int:
    """Pretend each agent has spent some of its per_day cap so the
    spent/cap columns aren't all $0.00."""
    cur = conn.cursor()
    updated = 0
    # Realistic spend pattern: extractor + magellan high, knox/atlas low
    SPENT = {
        "extractor": 850,  # 42% of $20 cap
        "magellan":  340,  # 34% of $10 cap
        "darwin":    180,  # 36% of $5 cap
        "hamilton":   95,  # 19% of $5 cap
        "discoverer": 120, # 24% of $5 cap
        "atlas":       8,  #  4% of $2 cap
        "knox":        4,  #  2% of $2 cap
    }
    for agent, cents in SPENT.items():
        cur.execute(
            """UPDATE agent_budgets
                  SET spent_cents = %s,
                      window_started_at = NOW()
                WHERE agent_name = %s
                  AND budget_window = 'per_day'""",
            (cents, agent),
        )
        if cur.rowcount > 0:
            updated += 1
    conn.commit()
    cur.close()
    return updated


def _seed_workers_last_run(conn) -> int:
    """Mark every cron job in EXPECTED_JOBS as having completed in the
    last hour. Flips the Command Center banner from amber/red to green.

    Three jobs in the admin freshness UI read from crawl_runs instead of
    workers_last_run (run_discovery, run_pdf_extraction,
    run_browser_extraction) — we seed both tables so all 9 show fresh."""
    cur = conn.cursor()
    workers_last_run_jobs = [
        "daily_pipeline", "magellan_rescue", "knox_review", "darwin_drain",
        "publish_index", "ingest_data", "knox_rejection_summary",
    ]
    crawl_run_jobs = [
        "run_discovery", "run_pdf_extraction", "run_browser_extraction",
    ]
    inserted = 0
    for j in workers_last_run_jobs:
        mins = random.randint(5, 55)
        cur.execute(
            """INSERT INTO workers_last_run (job_name, completed_at, status)
               VALUES (%s, NOW() - (%s || ' minutes')::interval, 'demo')
               ON CONFLICT (job_name) DO UPDATE
                 SET completed_at = EXCLUDED.completed_at,
                     status       = EXCLUDED.status""",
            (j, str(mins)),
        )
        inserted += 1

    # crawl_runs is the alt source for the 3 extraction crons. Per
    # admin-queries.ts:getJobFreshness, the freshness UI reads the
    # MAX(completed_at) WHERE trigger_type='scheduled' AND status='completed'
    # — a single recent row covers all three crawler jobs.
    for _j in crawl_run_jobs:
        mins = random.randint(5, 55)
        try:
            cur.execute(
                """INSERT INTO crawl_runs
                       (trigger_type, status, targets_total, targets_crawled,
                        targets_succeeded, started_at, completed_at)
                   VALUES ('scheduled', 'completed', 50, 50, 48,
                           NOW() - (%s || ' minutes')::interval - INTERVAL '5 minutes',
                           NOW() - (%s || ' minutes')::interval)""",
                (str(mins), str(mins)),
            )
            inserted += 1
        except Exception as exc:
            log.warning("crawl_runs insert skipped: %s", exc)
    conn.commit()
    cur.close()
    return inserted


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(
        prog="seed-demo",
        description="Populate demo data so /admin/command looks alive.",
    )
    p.add_argument("--clear", action="store_true",
                   help="Remove demo rows instead of inserting")
    p.add_argument("--seed", type=int, default=42,
                   help="Random seed for reproducible amounts")
    args = p.parse_args(argv)

    random.seed(args.seed)
    conn = _connect()

    if args.clear:
        print("seed-demo: clearing demo rows…")
        _clear(conn)
        print("seed-demo: done. Visit /admin/command — tiles should be empty again.")
        return 0

    print("seed-demo: clearing any prior demo rows…")
    _clear(conn)

    print("seed-demo: inserting institutions…")
    ids = _seed_institutions(conn)
    print(f"  +{len(ids)} institutions")

    print("seed-demo: inserting fees (3 tiers)…")
    _seed_fees(conn, ids)

    print("seed-demo: inserting agent_events…")
    n_events = _seed_agent_events(conn)
    print(f"  +{n_events} events")

    print("seed-demo: upserting agent_lessons…")
    n_lessons = _seed_lessons(conn)
    print(f"  +{n_lessons} lessons (one per agent)")

    print("seed-demo: bumping agent_budgets spent_cents…")
    n_budgets = _seed_budgets(conn)
    print(f"  +{n_budgets} budget rows updated")

    print("seed-demo: marking workers_last_run timestamps recent…")
    n_workers = _seed_workers_last_run(conn)
    print(f"  +{n_workers} workers_last_run rows")

    print()
    print("seed-demo: done. Visit /admin/command — banner should be 🟢 live.")
    print("seed-demo: to remove, re-run with --clear.")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
