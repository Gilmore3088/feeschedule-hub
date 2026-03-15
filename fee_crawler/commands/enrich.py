"""Backfill enrichment data: fix NCUA asset units, compute tiers + districts."""

from fee_crawler.db import Database
from fee_crawler.peer import (
    TIER_DISPLAY,
    FED_DISTRICT_NAMES,
    classify_asset_tier,
    get_fed_district,
)


def run(db: Database) -> None:
    """Enrich all crawl_targets with asset_size_tier and fed_district."""

    # Step 1: Sync CU asset_size from institution_financials (authoritative source)
    # The seed command may store assets in wrong units; financials has the correct values
    cu_fix = db.execute(
        """UPDATE crawl_targets
           SET asset_size = (
             SELECT ifin.total_assets
             FROM institution_financials ifin
             WHERE ifin.crawl_target_id = crawl_targets.id
             ORDER BY ifin.report_date DESC
             LIMIT 1
           )
           WHERE charter_type = 'credit_union'
             AND id IN (SELECT DISTINCT crawl_target_id FROM institution_financials)"""
    )
    db.commit()
    print(f"Synced CU asset_size from institution_financials")

    # Step 2: Compute fed_district for rows missing it
    missing_district = db.fetchall(
        """SELECT id, state_code FROM crawl_targets
           WHERE fed_district IS NULL AND state_code IS NOT NULL"""
    )
    district_count = 0
    for row in missing_district:
        district = get_fed_district(row["state_code"])
        if district:
            db.execute(
                "UPDATE crawl_targets SET fed_district = ? WHERE id = ?",
                (district, row["id"]),
            )
            district_count += 1
    db.commit()
    print(f"Set fed_district for {district_count} institutions")

    # Step 3: Compute asset_size_tier for all rows
    all_targets = db.fetchall(
        "SELECT id, asset_size FROM crawl_targets WHERE asset_size IS NOT NULL"
    )
    tier_count = 0
    for row in all_targets:
        tier = classify_asset_tier(row["asset_size"])
        db.execute(
            "UPDATE crawl_targets SET asset_size_tier = ? WHERE id = ?",
            (tier, row["id"]),
        )
        tier_count += 1
    db.commit()
    print(f"Set asset_size_tier for {tier_count} institutions")

    # Summary
    print("\n--- Enrichment Summary ---")

    # Tier distribution
    print("\nAsset Size Tiers:")
    for tier_key, display in TIER_DISPLAY.items():
        count = db.fetchone(
            "SELECT COUNT(*) as cnt FROM crawl_targets WHERE asset_size_tier = ?",
            (tier_key,),
        )
        cnt = count["cnt"] if count else 0
        print(f"  {display:35s} {cnt:>6,}")

    no_tier = db.fetchone(
        "SELECT COUNT(*) as cnt FROM crawl_targets WHERE asset_size_tier IS NULL"
    )
    print(f"  {'(no asset data)':35s} {no_tier['cnt'] if no_tier else 0:>6,}")

    # District distribution
    print("\nFed Districts:")
    for num, name in sorted(FED_DISTRICT_NAMES.items()):
        count = db.fetchone(
            "SELECT COUNT(*) as cnt FROM crawl_targets WHERE fed_district = ?",
            (num,),
        )
        cnt = count["cnt"] if count else 0
        print(f"  {num:2d} - {name:15s} {cnt:>6,}")

    no_dist = db.fetchone(
        "SELECT COUNT(*) as cnt FROM crawl_targets WHERE fed_district IS NULL"
    )
    print(f"  {'(no district)':20s} {no_dist['cnt'] if no_dist else 0:>6,}")

    # Charter type split
    print("\nCharter Types:")
    for ctype in ("bank", "credit_union"):
        count = db.fetchone(
            "SELECT COUNT(*) as cnt FROM crawl_targets WHERE charter_type = ?",
            (ctype,),
        )
        cnt = count["cnt"] if count else 0
        label = "Banks" if ctype == "bank" else "Credit Unions"
        print(f"  {label:20s} {cnt:>6,}")
