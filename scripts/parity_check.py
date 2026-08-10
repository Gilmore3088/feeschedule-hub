"""Parity check — frozen extracted_fees vs the engine's extracted_fees_compat view.

Run this AFTER applying the engine migrations to a database that also holds the
legacy extracted_fees table and a published batch, to confirm the compat view is
a safe drop-in before repointing the product's reads. It does NOT modify data.

    DATABASE_URL=postgres://... python scripts/parity_check.py
    DATABASE_URL=postgres://... python scripts/parity_check.py --state IA --sample 50

Exit code 0 = within tolerance; 1 = deltas worth investigating. Reads only.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

import asyncpg

# How much drift is acceptable before we refuse to flip.
ROW_TOLERANCE = 0.02          # ±2% total published rows
CATEGORY_TOLERANCE = 0.05     # ±5% per fee_category count


async def _one(conn, sql, *args):
    return await conn.fetchval(sql, *args)


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", default=None, help="limit to one state_code")
    ap.add_argument("--sample", type=int, default=0, help="print N example rows from each side")
    args = ap.parse_args()

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL not set", file=sys.stderr)
        return 2

    conn = await asyncpg.connect(dsn=dsn)
    try:
        # Guard: both surfaces must exist.
        for rel in ("extracted_fees", "extracted_fees_compat"):
            ok = await _one(
                conn,
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_name=$1 UNION ALL "
                "SELECT count(*) FROM information_schema.views WHERE table_name=$1",
                rel,
            )
            if not ok:
                print(f"missing relation: {rel}", file=sys.stderr)
                return 2

        state_filter = ""
        params: list = []
        if args.state:
            # extracted_fees has no state; join crawl_targets on both sides.
            state_filter = " AND t.state_code = $1"
            params = [args.state]

        legacy_rows = int(await conn.fetchval(
            f"""SELECT count(*) FROM extracted_fees ef
                  JOIN crawl_targets t ON t.id = ef.crawl_target_id
                 WHERE ef.review_status='approved'{state_filter}""", *params))
        compat_rows = int(await conn.fetchval(
            f"""SELECT count(*) FROM extracted_fees_compat ef
                  JOIN crawl_targets t ON t.id = ef.crawl_target_id
                 WHERE TRUE{state_filter}""", *params))

        print(f"row count   legacy={legacy_rows:>8}   compat={compat_rows:>8}")
        drift = abs(compat_rows - legacy_rows) / legacy_rows if legacy_rows else 1.0
        row_ok = drift <= ROW_TOLERANCE
        print(f"row drift   {drift:.2%}   ({'OK' if row_ok else 'INVESTIGATE'}, tol {ROW_TOLERANCE:.0%})")

        # Category distribution parity.
        legacy_cat = {r["fee_category"]: int(r["n"]) for r in await conn.fetch(
            f"""SELECT ef.fee_category, count(*) n FROM extracted_fees ef
                  JOIN crawl_targets t ON t.id = ef.crawl_target_id
                 WHERE ef.review_status='approved'{state_filter}
                 GROUP BY ef.fee_category""", *params)}
        compat_cat = {r["fee_category"]: int(r["n"]) for r in await conn.fetch(
            f"""SELECT ef.fee_category, count(*) n FROM extracted_fees_compat ef
                  JOIN crawl_targets t ON t.id = ef.crawl_target_id
                 WHERE TRUE{state_filter}
                 GROUP BY ef.fee_category""", *params)}

        cats = sorted(set(legacy_cat) | set(compat_cat))
        offenders = []
        for c in cats:
            a, b = legacy_cat.get(c, 0), compat_cat.get(c, 0)
            base = max(a, 1)
            if abs(b - a) / base > CATEGORY_TOLERANCE:
                offenders.append((c, a, b))
        if offenders:
            print(f"\ncategories beyond ±{CATEGORY_TOLERANCE:.0%} ({len(offenders)}):")
            for c, a, b in offenders[:25]:
                print(f"  {c:<28} legacy={a:>6}  compat={b:>6}")
        else:
            print("category distribution within tolerance")

        if args.sample:
            print(f"\nsample compat rows:")
            for r in await conn.fetch(
                "SELECT crawl_target_id, fee_category, fee_family, amount, review_status "
                "FROM extracted_fees_compat LIMIT $1", args.sample):
                print(" ", dict(r))

        clean = row_ok and not offenders
        print(f"\nPARITY: {'CLEAN — safe to flip product reads' if clean else 'DELTAS — investigate before flipping'}")
        return 0 if clean else 1
    finally:
        await conn.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
