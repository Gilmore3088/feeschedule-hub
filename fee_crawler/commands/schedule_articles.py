"""Scheduled article generation with data change detection.

Runs on a cron schedule to generate articles only when fee data has
changed significantly since the last article was generated.

Usage:
    python -m fee_crawler schedule-articles --frequency weekly
    python -m fee_crawler schedule-articles --frequency monthly
    python -m fee_crawler schedule-articles --frequency weekly --dry-run
"""

from __future__ import annotations

import logging

from fee_crawler.db import Database
from fee_crawler.generation.change_detection import has_data_changed
from fee_crawler.generation.generator import generate_article

logger = logging.getLogger(__name__)

SPOTLIGHT_CATEGORIES = [
    "monthly_maintenance",
    "overdraft",
    "nsf",
    "atm_non_network",
    "card_foreign_txn",
    "wire_domestic_outgoing",
]

GENERATION_SCHEDULE: dict[str, list[dict]] = {
    "weekly": [
        {"type": "national_benchmark", "scope": "spotlight"},
    ],
    "monthly": [
        {"type": "district_comparison", "scope": "spotlight", "districts": list(range(1, 13))},
        {"type": "charter_comparison", "scope": "single"},
    ],
}


def run(db: Database, frequency: str, dry_run: bool = False) -> None:
    """Check data changes and generate articles where needed."""
    schedule = GENERATION_SCHEDULE.get(frequency)
    if not schedule:
        valid = ", ".join(GENERATION_SCHEDULE.keys())
        print(f"Unknown frequency '{frequency}'. Valid: {valid}")
        return

    generated = 0
    skipped = 0
    errors = 0

    for job in schedule:
        article_type = job["type"]
        districts = job.get("districts", [None])

        if job["scope"] == "spotlight":
            categories = SPOTLIGHT_CATEGORIES
        elif job["scope"] == "single":
            categories = [None]
        else:
            categories = [job.get("category")]

        for category in categories:
            for district in districts:
                label = f"{article_type}/{category or 'cross'}"
                if district:
                    label += f"/d{district}"

                if not has_data_changed(article_type, category, district, db):
                    logger.info("Skipping %s: no significant data change", label)
                    skipped += 1
                    continue

                if dry_run:
                    print(f"  [DRY RUN] Would generate {label}")
                    continue

                try:
                    result = generate_article(
                        db=db,
                        article_type=article_type,
                        category=category,
                        district=district,
                    )
                    if result:
                        if result.get("skipped"):
                            skipped += 1
                            print(f"  [skipped] {result['slug']}: already in '{result['status']}'")
                        else:
                            generated += 1
                            print(f"  [{result['status']}] {result['title']}")
                except Exception as e:
                    errors += 1
                    logger.error("Error generating %s: %s", label, e)
                    print(f"  ERROR ({label}): {e}")

    if not dry_run:
        print(f"\nDone: {generated} generated, {skipped} skipped, {errors} errors")
