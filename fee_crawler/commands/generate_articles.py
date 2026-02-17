"""Generate research articles from fee data using LLM.

Usage:
    python -m fee_crawler generate-articles --type national-benchmark --category overdraft
    python -m fee_crawler generate-articles --type national-benchmark --all-spotlight
    python -m fee_crawler generate-articles --type district-comparison --category monthly_maintenance --district 10
    python -m fee_crawler generate-articles --type charter-comparison
    python -m fee_crawler generate-articles --type top-10 --category wire_domestic_outgoing
    python -m fee_crawler generate-articles --type national-benchmark --category nsf --dry-run
"""

from __future__ import annotations

import logging

from fee_crawler.db import Database
from fee_crawler.fee_analysis import FEE_FAMILIES
from fee_crawler.generation.generator import generate_article

logger = logging.getLogger(__name__)

# Spotlight categories for --all-spotlight
SPOTLIGHT_CATEGORIES = [
    "monthly_maintenance",
    "overdraft",
    "nsf",
    "atm_non_network",
    "card_foreign_txn",
    "wire_domestic_outgoing",
]


def run(
    db: Database,
    article_type: str,
    category: str | None = None,
    district: int | None = None,
    all_spotlight: bool = False,
    dry_run: bool = False,
    limit: int | None = None,
) -> None:
    """Generate articles based on the specified type and options."""
    # Normalize type key (CLI uses hyphens, internal uses underscores)
    type_key = article_type.replace("-", "_")

    categories: list[str | None] = []

    if all_spotlight:
        categories = list(SPOTLIGHT_CATEGORIES)
        if limit:
            categories = categories[:limit]
        logger.info("Generating %d spotlight %s articles", len(categories), type_key)
    elif category:
        categories = [category]
    else:
        categories = [None]  # For types that don't need a category (charter_comparison)

    generated = 0
    errors = 0

    for cat in categories:
        try:
            result = generate_article(
                db=db,
                article_type=type_key,
                category=cat,
                district=district,
                dry_run=dry_run,
            )
            if result:
                generated += 1
                print(f"  [{result['status']}] {result['title']}")
                if not result["fact_check_passed"]:
                    print(f"    WARNING: Fact-check flagged issues — saved as 'draft'")
            elif dry_run:
                print(f"  (dry run — no LLM calls)")
        except Exception as e:
            errors += 1
            cat_label = cat or "(cross-category)"
            logger.error("Error generating %s for %s: %s", type_key, cat_label, e)
            print(f"  ERROR: {e}")

    if not dry_run:
        print(f"\nDone: {generated} generated, {errors} errors")
