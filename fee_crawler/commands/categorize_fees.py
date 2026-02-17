"""Batch-categorize extracted fees using the fee name alias table."""

from __future__ import annotations

from fee_crawler.db import Database
from fee_crawler.fee_analysis import normalize_fee_name, get_fee_family, FEE_FAMILIES


def _all_canonical() -> set[str]:
    """Return the set of all valid canonical fee category keys."""
    cats: set[str] = set()
    for members in FEE_FAMILIES.values():
        cats.update(members)
    return cats


def run(
    db: Database,
    *,
    dry_run: bool = False,
    force: bool = False,
    limit: int | None = None,
) -> None:
    canonical_set = _all_canonical()

    # Fetch rows to categorize
    if force:
        sql = """SELECT id, fee_name, fee_category FROM extracted_fees
                 WHERE fee_name IS NOT NULL"""
    else:
        sql = """SELECT id, fee_name, fee_category FROM extracted_fees
                 WHERE fee_name IS NOT NULL AND fee_category IS NULL"""

    if limit:
        sql += f" LIMIT {limit}"

    rows = db.fetchall(sql)
    total = len(rows)
    print(f"Processing {total:,} fees ({'dry run' if dry_run else 'live'})...")

    updates: list[tuple[str, str, int]] = []
    clears: list[tuple[int,]] = []  # rows to un-categorize (were wrong)
    unmatched_counts: dict[str, int] = {}

    for row in rows:
        canonical = normalize_fee_name(row["fee_name"])
        if canonical in canonical_set:
            family = get_fee_family(canonical) or "Other"
            updates.append((canonical, family, row["id"]))
        else:
            unmatched_counts[canonical] = unmatched_counts.get(canonical, 0) + 1
            # If --force and row had a category, it needs to be cleared
            if force and row["fee_category"]:
                clears.append((row["id"],))

    matched = len(updates)
    unmatched = total - matched
    print(f"  Matched: {matched:,} ({matched / total * 100:.1f}%)" if total > 0 else "  No rows")
    print(f"  Unmatched: {unmatched:,}")
    if clears:
        print(f"  Stale categories to clear: {len(clears):,}")

    if not dry_run and updates:
        batch_size = 1000
        for i in range(0, len(updates), batch_size):
            batch = updates[i : i + batch_size]
            db.executemany(
                "UPDATE extracted_fees SET fee_category = ?, fee_family = ? WHERE id = ?",
                [tuple(u) for u in batch],
            )
        db.commit()
        print(f"  Updated {matched:,} rows.")

    if not dry_run and clears:
        batch_size = 1000
        for i in range(0, len(clears), batch_size):
            batch = clears[i : i + batch_size]
            db.executemany(
                "UPDATE extracted_fees SET fee_category = NULL, fee_family = NULL WHERE id = ?",
                [tuple(c) for c in batch],
            )
        db.commit()
        print(f"  Cleared {len(clears):,} stale categories.")

    # Show top unmatched
    if unmatched_counts:
        top = sorted(unmatched_counts.items(), key=lambda x: -x[1])[:20]
        print(f"\nTop {len(top)} unmatched fee names:")
        for name, cnt in top:
            print(f"  {cnt:5d}x  {name}")

    # Category summary
    if updates:
        cat_counts: dict[str, int] = {}
        for canonical, _family, _id in updates:
            cat_counts[canonical] = cat_counts.get(canonical, 0) + 1
        top_cats = sorted(cat_counts.items(), key=lambda x: -x[1])[:15]
        print(f"\nTop {len(top_cats)} categories assigned:")
        for cat, cnt in top_cats:
            family = get_fee_family(cat) or "Other"
            print(f"  {cnt:5d}  {cat} ({family})")
