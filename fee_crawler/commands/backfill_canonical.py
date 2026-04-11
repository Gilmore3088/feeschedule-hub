"""Backfill canonical_fee_key and variant_type on all extracted_fees rows.

Strategy (from ARCHITECTURE.md):
  - Option A (SQL-only, fast): UPDATE extracted_fees SET canonical_fee_key = CASE fee_category WHEN ... END
  - Option B (Python, for variant_type): SELECT id, fee_name WHERE variant_type IS NULL, loop with detect_variant_type()

Run Option A first, then Option B.

Usage:
    python -m fee_crawler backfill-canonical --dry-run    # report only
    python -m fee_crawler backfill-canonical               # apply
"""

from __future__ import annotations

import os
import logging
from typing import Any

import psycopg2
import psycopg2.extras

from fee_crawler.fee_analysis import CANONICAL_KEY_MAP, detect_variant_type

log = logging.getLogger(__name__)

BATCH_SIZE = 1000


def build_case_when_sql() -> str:
    """Build the SQL UPDATE statement with a CASE WHEN block from CANONICAL_KEY_MAP.

    Returns a complete UPDATE statement that sets canonical_fee_key for all rows
    with a non-null fee_category. Uses Postgres syntax (no %s params needed for
    the CASE values since they are constants from the code, not user input).
    """
    when_clauses = "\n    ".join(
        f"WHEN '{fee_category}' THEN '{canonical_key}'"
        for fee_category, canonical_key in sorted(CANONICAL_KEY_MAP.items())
    )
    sql = f"""UPDATE extracted_fees
SET canonical_fee_key = CASE fee_category
    {when_clauses}
    ELSE NULL
END
WHERE fee_category IS NOT NULL AND canonical_fee_key IS NULL"""
    return sql


def snapshot_index_counts(conn: Any) -> dict[str, int]:
    """Query the institution_count per fee_category, mirroring getNationalIndex() logic.

    Excludes rejected fees and rows with NULL fee_category or NULL amount.

    Returns:
        dict[str, int]: mapping fee_category -> institution_count
    """
    query = """
        SELECT fee_category,
               COUNT(DISTINCT crawl_target_id) AS institution_count
        FROM extracted_fees
        WHERE review_status != 'rejected'
          AND fee_category IS NOT NULL
          AND amount IS NOT NULL
        GROUP BY fee_category
        ORDER BY fee_category
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query)
        rows = cur.fetchall()
    return {row["fee_category"]: int(row["institution_count"]) for row in rows}


def compare_snapshots(
    before: dict[str, int],
    after: dict[str, int],
) -> dict[str, dict[str, int]]:
    """Compare two institution_count snapshots.

    Returns a dict of categories where the count changed:
        {category: {"before": N, "after": M}}

    An empty dict means zero regressions (the backfill was safe).

    Args:
        before: snapshot taken before the backfill
        after:  snapshot taken after the backfill
    """
    diffs: dict[str, dict[str, int]] = {}
    all_categories = set(before) | set(after)
    for cat in all_categories:
        b = before.get(cat, 0)
        a = after.get(cat, 0)
        if b != a:
            diffs[cat] = {"before": b, "after": a}
    return diffs


def backfill_canonical_keys(conn: Any, dry_run: bool = True) -> dict[str, Any]:
    """Set canonical_fee_key for all rows that have a non-null fee_category.

    Runs a single SQL UPDATE with a CASE WHEN block derived from CANONICAL_KEY_MAP.
    Before and after snapshots are compared to verify zero index count regressions.

    Args:
        conn: psycopg2 connection
        dry_run: if True, print the SQL but do not execute; do not commit

    Returns:
        dict with keys: sql, rows_affected, before_snapshot, after_snapshot, diffs
    """
    sql = build_case_when_sql()

    print(f"\nCanonical key backfill ({'DRY RUN' if dry_run else 'LIVE'})")
    print("-" * 60)
    print("Taking before snapshot...")
    before = snapshot_index_counts(conn)
    print(f"  {len(before)} categories in index")

    if dry_run:
        print("\nSQL that would be executed:")
        print(sql)
        print("\nDry run: no changes made.")
        return {
            "sql": sql,
            "rows_affected": 0,
            "before_snapshot": before,
            "after_snapshot": before,
            "diffs": {},
        }

    print("\nExecuting UPDATE...")
    with conn.cursor() as cur:
        cur.execute(sql)
        rows_affected = cur.rowcount
    conn.commit()
    print(f"  {rows_affected:,} rows updated")

    print("Taking after snapshot...")
    after = snapshot_index_counts(conn)
    diffs = compare_snapshots(before, after)

    if diffs:
        print(f"\nWARNING: {len(diffs)} categories changed institution_count:")
        for cat, counts in sorted(diffs.items()):
            print(f"  {cat}: {counts['before']} -> {counts['after']}")
    else:
        print(f"  Snapshot check PASSED: all {len(after)} categories unchanged")

    return {
        "sql": sql,
        "rows_affected": rows_affected,
        "before_snapshot": before,
        "after_snapshot": after,
        "diffs": diffs,
    }


def backfill_variant_types(conn: Any, dry_run: bool = True) -> dict[str, Any]:
    """Set variant_type for rows where variant_type IS NULL and fee_category IS NOT NULL.

    Calls detect_variant_type() from fee_analysis for each row. Commits in batches
    of BATCH_SIZE to avoid long transactions.

    Args:
        conn: psycopg2 connection
        dry_run: if True, detect variants but do not write to DB

    Returns:
        dict with keys: total_processed, variants_detected, variant_counts
    """
    query = """
        SELECT id, fee_name, fee_category
        FROM extracted_fees
        WHERE variant_type IS NULL
          AND fee_category IS NOT NULL
    """
    print(f"\nVariant type backfill ({'DRY RUN' if dry_run else 'LIVE'})")
    print("-" * 60)

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query)
        rows = cur.fetchall()

    total = len(rows)
    print(f"  {total:,} rows to process")

    updates: list[tuple[str, int]] = []
    variant_counts: dict[str, int] = {}

    for row in rows:
        variant = detect_variant_type(row["fee_name"] or "", row["fee_category"])
        if variant is not None:
            updates.append((variant, int(row["id"])))
            variant_counts[variant] = variant_counts.get(variant, 0) + 1

    print(f"  {len(updates):,} variants detected")
    for vtype, count in sorted(variant_counts.items()):
        print(f"    {vtype}: {count:,}")

    if dry_run:
        print("  Dry run: no changes made.")
        return {
            "total_processed": total,
            "variants_detected": len(updates),
            "variant_counts": variant_counts,
        }

    # Apply in batches
    updated = 0
    with conn.cursor() as cur:
        for i in range(0, len(updates), BATCH_SIZE):
            batch = updates[i : i + BATCH_SIZE]
            for variant, row_id in batch:
                cur.execute(
                    "UPDATE extracted_fees SET variant_type = %s WHERE id = %s",
                    (variant, row_id),
                )
            conn.commit()
            updated += len(batch)

    print(f"  {updated:,} rows updated with variant_type")

    return {
        "total_processed": total,
        "variants_detected": len(updates),
        "variant_counts": variant_counts,
    }


def run(dry_run: bool = True) -> None:
    """Main entry point for the backfill-canonical command.

    Args:
        dry_run: if True, report only; do not modify any data
    """
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is required")

    conn = psycopg2.connect(database_url)
    try:
        canonical_result = backfill_canonical_keys(conn, dry_run=dry_run)
        variant_result = backfill_variant_types(conn, dry_run=dry_run)

        print("\n=== Backfill Summary ===")
        print(f"  canonical_fee_key rows updated: {canonical_result['rows_affected']:,}")
        print(f"  variant_type rows updated: {variant_result['variants_detected']:,}")
        if canonical_result["diffs"]:
            print(f"  WARNING: {len(canonical_result['diffs'])} index count regressions detected")
        else:
            print("  Index count check: PASSED (zero regressions)")
    finally:
        conn.close()
