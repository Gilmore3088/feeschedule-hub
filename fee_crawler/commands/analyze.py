"""Compute peer comparisons and store results for the admin UI."""

import json

from fee_crawler.db import Database
from fee_crawler.fee_analysis import generate_peer_summary
from fee_crawler.peer import find_peers


def _analyze_institution(db: Database, target_id: int) -> dict | None:
    """Run peer analysis for a single institution and store the result."""
    target = db.fetchone(
        "SELECT id, institution_name FROM crawl_targets WHERE id = ?",
        (target_id,),
    )
    if not target:
        print(f"  Institution {target_id} not found, skipping")
        return None

    # Find peers (don't require fees for peer group - use all matching institutions)
    peers = find_peers(db, target_id, max_results=20)
    if not peers:
        print(f"  {target['institution_name']}: no peers found")
        return None

    peer_ids = [p["id"] for p in peers]
    summary = generate_peer_summary(db, target_id, peer_ids)

    # Add peer list to summary
    summary["peers"] = [
        {
            "id": p["id"],
            "name": p["institution_name"],
            "asset_size": p["asset_size"],
            "tier": p["asset_size_tier"],
            "district": p["fed_district"],
            "state": p["state_code"],
            "score": p["peer_score"],
        }
        for p in peers[:10]  # Store top 10 peers in the summary
    ]

    # Upsert into analysis_results
    result_json = json.dumps(summary)
    db.execute(
        """INSERT INTO analysis_results (crawl_target_id, analysis_type, result_json, computed_at)
           VALUES (?, 'peer_comparison', ?, datetime('now'))
           ON CONFLICT(crawl_target_id, analysis_type)
           DO UPDATE SET result_json = excluded.result_json,
                         computed_at = excluded.computed_at""",
        (target_id, result_json),
    )
    db.commit()

    fee_count = len(summary.get("fee_comparisons", []))
    highlight_count = len(summary.get("highlights", []))
    print(
        f"  {target['institution_name']}: "
        f"{len(peers)} peers, {fee_count} fees compared, "
        f"{highlight_count} highlights"
    )
    return summary


def run(
    db: Database,
    *,
    target_id: int | None = None,
    analyze_all: bool = False,
) -> None:
    """Run fee analysis and store results."""
    if target_id:
        print(f"Analyzing institution {target_id}...")
        _analyze_institution(db, target_id)
        return

    if analyze_all:
        # Find all institutions with extracted fees
        targets = db.fetchall(
            """SELECT DISTINCT ct.id, ct.institution_name
               FROM crawl_targets ct
               JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
               ORDER BY ct.institution_name"""
        )
        print(f"Analyzing {len(targets)} institutions with extracted fees...\n")
        for t in targets:
            _analyze_institution(db, t["id"])
        print(f"\nDone. Results stored in analysis_results table.")
        return

    print("Usage: python -m fee_crawler analyze --target-id ID")
    print("       python -m fee_crawler analyze --all")
