"""CLI entry point: python -m fee_crawler <command>."""

import argparse
import sys

from fee_crawler.config import load_config
from fee_crawler.db import Database


def cmd_seed(args: argparse.Namespace) -> None:
    """Seed institution directory from FDIC/NCUA APIs."""
    from fee_crawler.commands.seed_institutions import run

    config = load_config()
    db = Database(config)
    try:
        run(db, config, source=args.source, limit=args.limit)
    finally:
        db.close()


def cmd_discover(args: argparse.Namespace) -> None:
    """Discover fee schedule URLs on institution websites."""
    from fee_crawler.commands.discover_urls import run

    config = load_config()
    db = Database(config)
    try:
        run(
            db,
            config,
            limit=args.limit,
            state=args.state,
            source=args.source,
            force=args.force,
        )
    finally:
        db.close()


def cmd_crawl(args: argparse.Namespace) -> None:
    """Run the full crawl pipeline: download, extract, store."""
    from fee_crawler.commands.crawl import run

    config = load_config()
    db = Database(config)
    try:
        run(db, config, limit=args.limit, state=args.state, dry_run=args.dry_run)
    finally:
        db.close()


def cmd_enrich(args: argparse.Namespace) -> None:
    """Backfill enrichment data: tiers, districts, fix NCUA asset units."""
    from fee_crawler.commands.enrich import run

    config = load_config()
    db = Database(config)
    try:
        run(db)
    finally:
        db.close()


def cmd_seed_users(args: argparse.Namespace) -> None:
    """Seed users from config."""
    from fee_crawler.commands.seed_users import run

    config = load_config()
    db = Database(config)
    try:
        run(db, config)
    finally:
        db.close()


def cmd_analyze(args: argparse.Namespace) -> None:
    """Compute peer comparisons and fee analysis."""
    from fee_crawler.commands.analyze import run

    config = load_config()
    db = Database(config)
    try:
        run(db, target_id=args.target_id, analyze_all=args.analyze_all)
    finally:
        db.close()


def cmd_validate(args: argparse.Namespace) -> None:
    """Retroactively validate existing extracted fees."""
    from fee_crawler.commands.backfill_validation import run

    config = load_config()
    db = Database(config)
    try:
        run(db)
    finally:
        db.close()


def cmd_ingest_fdic(args: argparse.Namespace) -> None:
    """Ingest financial data from FDIC BankFind API."""
    from fee_crawler.commands.ingest_fdic import run

    config = load_config()
    db = Database(config)
    try:
        run(db, config, report_date=args.report_date, limit=args.limit)
    finally:
        db.close()


def cmd_ingest_ncua(args: argparse.Namespace) -> None:
    """Ingest financial data from NCUA 5300 Call Reports."""
    from fee_crawler.commands.ingest_ncua import run

    config = load_config()
    db = Database(config)
    try:
        run(db, config, limit=args.limit)
    finally:
        db.close()


def cmd_ingest_cfpb(args: argparse.Namespace) -> None:
    """Ingest consumer complaint data from CFPB API."""
    from fee_crawler.commands.ingest_cfpb import run

    config = load_config()
    db = Database(config)
    try:
        run(db, config, limit=args.limit)
    finally:
        db.close()


def cmd_stats(args: argparse.Namespace) -> None:
    """Show database statistics."""
    config = load_config()
    db = Database(config)
    try:
        total = db.count("crawl_targets")
        banks = db.fetchone(
            "SELECT COUNT(*) as cnt FROM crawl_targets WHERE charter_type='bank'"
        )
        cus = db.fetchone(
            "SELECT COUNT(*) as cnt FROM crawl_targets WHERE charter_type='credit_union'"
        )
        with_url = db.fetchone(
            "SELECT COUNT(*) as cnt FROM crawl_targets WHERE website_url IS NOT NULL"
        )
        with_fee_url = db.fetchone(
            "SELECT COUNT(*) as cnt FROM crawl_targets WHERE fee_schedule_url IS NOT NULL"
        )

        print(f"Total institutions:     {total:,}")
        print(f"  Banks (FDIC):         {banks['cnt']:,}" if banks else "  Banks: 0")
        print(f"  Credit Unions (NCUA): {cus['cnt']:,}" if cus else "  CUs: 0")
        print(f"  With website URL:     {with_url['cnt']:,}" if with_url else "  URLs: 0")
        print(f"  With fee schedule URL: {with_fee_url['cnt']:,}" if with_fee_url else "  Fee URLs: 0")

        # Discovery stats
        crawled = db.fetchone(
            "SELECT COUNT(*) as cnt FROM crawl_targets WHERE last_crawl_at IS NOT NULL"
        )
        fee_pdf = db.fetchone(
            "SELECT COUNT(*) as cnt FROM crawl_targets WHERE document_type='pdf'"
        )
        fee_html = db.fetchone(
            "SELECT COUNT(*) as cnt FROM crawl_targets WHERE document_type='html'"
        )
        failed = db.fetchone(
            "SELECT COUNT(*) as cnt FROM crawl_targets WHERE consecutive_failures > 0"
        )
        if crawled and crawled["cnt"] > 0:
            print(f"\nDiscovery progress:")
            print(f"  Crawled:      {crawled['cnt']:,}")
            print(f"  Fee PDFs:     {fee_pdf['cnt']:,}" if fee_pdf else "  Fee PDFs: 0")
            print(f"  Fee HTML:     {fee_html['cnt']:,}" if fee_html else "  Fee HTML: 0")
            print(f"  With errors:  {failed['cnt']:,}" if failed else "  Errors: 0")

        # Extraction stats
        total_fees = db.count("extracted_fees")
        if total_fees > 0:
            runs = db.fetchone("SELECT COUNT(*) as cnt FROM crawl_runs")
            avg_fees = db.fetchone(
                """SELECT AVG(fees_extracted) as avg FROM crawl_results
                   WHERE status = 'success' AND fees_extracted > 0"""
            )
            print(f"\nExtraction results:")
            print(f"  Crawl runs:       {runs['cnt']:,}" if runs else "  Runs: 0")
            print(f"  Total fees found: {total_fees:,}")
            avg = avg_fees["avg"] if avg_fees and avg_fees["avg"] else 0
            print(f"  Avg fees/doc:     {avg:.0f}")

        # Financial data stats
        fin_total = db.count("institution_financials")
        if fin_total > 0:
            fin_fdic = db.fetchone(
                "SELECT COUNT(*) as cnt FROM institution_financials WHERE source='fdic'"
            )
            fin_ncua = db.fetchone(
                "SELECT COUNT(*) as cnt FROM institution_financials WHERE source='ncua'"
            )
            fin_inst = db.fetchone(
                "SELECT COUNT(DISTINCT crawl_target_id) as cnt FROM institution_financials"
            )
            comp_total = db.count("institution_complaints")
            comp_inst = db.fetchone(
                "SELECT COUNT(DISTINCT crawl_target_id) as cnt FROM institution_complaints"
            )
            print(f"\nFinancial data:")
            print(f"  Total records:  {fin_total:,}")
            print(f"  FDIC (banks):   {fin_fdic['cnt']:,}" if fin_fdic else "  FDIC: 0")
            print(f"  NCUA (CUs):     {fin_ncua['cnt']:,}" if fin_ncua else "  NCUA: 0")
            print(f"  Institutions:   {fin_inst['cnt']:,}" if fin_inst else "  Institutions: 0")
            if comp_total > 0:
                print(f"  CFPB complaints: {comp_total:,} ({comp_inst['cnt']:,} institutions)" if comp_inst else "")

        if total > 0:
            top = db.fetchall(
                """SELECT institution_name, state_code, asset_size, website_url, fee_schedule_url
                   FROM crawl_targets
                   ORDER BY asset_size DESC NULLS LAST
                   LIMIT 5"""
            )
            print("\nTop 5 by asset size:")
            for row in top:
                assets = row["asset_size"]
                asset_str = f"${assets / 1_000_000:,.0f}B" if assets and assets > 1_000_000 else (
                    f"${assets / 1_000:,.0f}M" if assets else "N/A"
                )
                fee_url = row["fee_schedule_url"]
                url_str = f"FEE: {fee_url[:50]}" if fee_url else (row["website_url"] or "no URL")
                print(f"  {row['institution_name'][:50]:50s} {row['state_code'] or '':>2s}  {asset_str:>10s}  {url_str}")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="fee_crawler",
        description="Fee schedule crawler for banks and credit unions",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # seed command
    seed_parser = subparsers.add_parser("seed", help="Seed institution directory from FDIC/NCUA")
    seed_parser.add_argument(
        "--source",
        choices=["all", "fdic", "ncua"],
        default="all",
        help="Data source to seed from (default: all)",
    )
    seed_parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max records to insert (for testing)",
    )
    seed_parser.set_defaults(func=cmd_seed)

    # discover command
    disc_parser = subparsers.add_parser("discover", help="Discover fee schedule URLs on institution websites")
    disc_parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max institutions to process (for testing)",
    )
    disc_parser.add_argument(
        "--state",
        type=str,
        default=None,
        help="Filter by state code (e.g., TX, CA)",
    )
    disc_parser.add_argument(
        "--source",
        choices=["fdic", "ncua"],
        default=None,
        help="Filter by data source",
    )
    disc_parser.add_argument(
        "--force",
        action="store_true",
        help="Re-discover even if fee_schedule_url already set",
    )
    disc_parser.set_defaults(func=cmd_discover)

    # crawl command
    crawl_parser = subparsers.add_parser("crawl", help="Download and extract fees from discovered URLs")
    crawl_parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max institutions to process",
    )
    crawl_parser.add_argument(
        "--state",
        type=str,
        default=None,
        help="Filter by state code (e.g., TX, CA)",
    )
    crawl_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Download and extract text but skip LLM extraction (no API cost)",
    )
    crawl_parser.set_defaults(func=cmd_crawl)

    # seed-users command
    seed_users_parser = subparsers.add_parser("seed-users", help="Seed users from config")
    seed_users_parser.set_defaults(func=cmd_seed_users)

    # enrich command
    enrich_parser = subparsers.add_parser("enrich", help="Backfill tiers, districts, fix NCUA units")
    enrich_parser.set_defaults(func=cmd_enrich)

    # analyze command
    analyze_parser = subparsers.add_parser("analyze", help="Compute peer comparisons and fee analysis")
    analyze_parser.add_argument(
        "--target-id",
        type=int,
        default=None,
        help="Analyze a specific institution by ID",
    )
    analyze_parser.add_argument(
        "--all",
        action="store_true",
        dest="analyze_all",
        help="Analyze all institutions with extracted fees",
    )
    analyze_parser.set_defaults(func=cmd_analyze)

    # validate command
    validate_parser = subparsers.add_parser("validate", help="Retroactively validate existing fees")
    validate_parser.set_defaults(func=cmd_validate)

    # ingest-fdic command
    fdic_parser = subparsers.add_parser("ingest-fdic", help="Ingest FDIC financial data")
    fdic_parser.add_argument(
        "--report-date",
        type=str,
        default=None,
        help="Specific report date (YYYYMMDD), e.g. 20240930. Default: last 4 quarters",
    )
    fdic_parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max records per report date (for testing)",
    )
    fdic_parser.set_defaults(func=cmd_ingest_fdic)

    # ingest-ncua command
    ncua_fin_parser = subparsers.add_parser("ingest-ncua", help="Ingest NCUA 5300 financial data")
    ncua_fin_parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max records to process (for testing)",
    )
    ncua_fin_parser.set_defaults(func=cmd_ingest_ncua)

    # ingest-cfpb command
    cfpb_parser = subparsers.add_parser("ingest-cfpb", help="Ingest CFPB complaint data")
    cfpb_parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max institutions to process (for testing)",
    )
    cfpb_parser.set_defaults(func=cmd_ingest_cfpb)

    # stats command
    stats_parser = subparsers.add_parser("stats", help="Show database statistics")
    stats_parser.set_defaults(func=cmd_stats)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
