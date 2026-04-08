"""CLI entry point: python -m fee_crawler <command>."""

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

from fee_crawler.config import load_config
from fee_crawler.db import get_db

# Load .env.local (then .env) so API keys are available to all commands
load_dotenv(Path(".env.local"))
load_dotenv()  # fallback to .env if present


def cmd_seed(args: argparse.Namespace) -> None:
    """Seed institution directory from FDIC/NCUA APIs."""
    from fee_crawler.commands.seed_institutions import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, source=args.source, limit=args.limit)
    finally:
        db.close()


def cmd_discover(args: argparse.Namespace) -> None:
    """Discover fee schedule URLs on institution websites."""
    from fee_crawler.commands.discover_urls import run

    config = load_config()
    db = get_db(config)
    try:
        run(
            db,
            config,
            limit=args.limit,
            state=args.state,
            source=args.source,
            force=args.force,
            workers=args.workers,
            max_search_cost=args.max_search_cost,
        )
    finally:
        db.close()


def cmd_crawl(args: argparse.Namespace) -> None:
    """Run the full crawl pipeline: download, extract, store."""
    from fee_crawler.commands.crawl import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, target_id=getattr(args, 'target_id', None),
            limit=args.limit, state=args.state, tier=getattr(args, 'tier', None),
            doc_type=getattr(args, 'doc_type', None),
            dry_run=args.dry_run, workers=args.workers, include_failing=args.include_failing,
            skip_with_fees=getattr(args, 'skip_with_fees', False),
            new_only=getattr(args, 'new_only', False))
    finally:
        db.close()


def cmd_enrich(args: argparse.Namespace) -> None:
    """Backfill enrichment data: tiers, districts, fix NCUA asset units."""
    from fee_crawler.commands.enrich import run

    config = load_config()
    db = get_db(config)
    try:
        run(db)
    finally:
        db.close()


def cmd_auto_review(args: argparse.Namespace) -> None:
    """Intelligent auto-review of staged and flagged fees."""
    from fee_crawler.commands.auto_review import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, dry_run=args.dry_run)
    finally:
        db.close()


def cmd_seed_users(args: argparse.Namespace) -> None:
    """Seed users from config."""
    from fee_crawler.commands.seed_users import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config)
    finally:
        db.close()


def cmd_analyze(args: argparse.Namespace) -> None:
    """Compute peer comparisons and fee analysis."""
    from fee_crawler.commands.analyze import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, target_id=args.target_id, analyze_all=args.analyze_all)
    finally:
        db.close()


def cmd_validate(args: argparse.Namespace) -> None:
    """Retroactively validate existing extracted fees."""
    from fee_crawler.commands.backfill_validation import run

    config = load_config()
    db = get_db(config)
    try:
        run(db)
    finally:
        db.close()


def cmd_outlier_detect(args: argparse.Namespace) -> None:
    """Detect statistical outliers in extracted fee amounts."""
    from fee_crawler.pipeline.outlier_detection import run_outlier_detection

    config = load_config()
    db = get_db(config)
    try:
        run_outlier_detection(db, auto_flag=args.auto_flag)
    finally:
        db.close()


def cmd_categorize(args: argparse.Namespace) -> None:
    """Batch-categorize extracted fees using fee name aliases."""
    from fee_crawler.commands.categorize_fees import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, dry_run=args.dry_run, force=args.force, limit=args.limit)
    finally:
        db.close()


def cmd_backfill_ncua_urls(args: argparse.Namespace) -> None:
    """Backfill website URLs for NCUA credit unions from mapping API."""
    from fee_crawler.commands.backfill_ncua_urls import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, workers=args.workers, limit=args.limit)
    finally:
        db.close()


def cmd_ingest_call_reports(args: argparse.Namespace) -> None:
    """Ingest Call Report service charge revenue data."""
    from fee_crawler.commands.ingest_call_reports import run

    config = load_config()
    db = get_db(config)
    try:
        run(
            db, config,
            csv_path=args.csv,
            report_date=args.report_date,
            source=args.source,
            show_gaps=args.gaps,
        )
    finally:
        db.close()


def cmd_ingest_fdic(args: argparse.Namespace) -> None:
    """Ingest financial data from FDIC BankFind API."""
    from fee_crawler.commands.ingest_fdic import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, report_date=args.report_date, limit=args.limit)
    finally:
        db.close()


def cmd_ingest_ncua(args: argparse.Namespace) -> None:
    """Ingest financial data from NCUA 5300 Call Reports."""
    from fee_crawler.commands.ingest_ncua import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, quarter=args.quarter, limit=args.limit)
    finally:
        db.close()


def cmd_ingest_cfpb(args: argparse.Namespace) -> None:
    """Ingest consumer complaint data from CFPB API."""
    from fee_crawler.commands.ingest_cfpb import run, _connect

    years = args.years.split(",") if args.years else None
    config = load_config()
    conn = _connect()
    try:
        run(conn, config, years=years, limit=args.limit)
    finally:
        conn.close()


def cmd_ingest_beige_book(args: argparse.Namespace) -> None:
    """Ingest Federal Reserve Beige Book reports."""
    from fee_crawler.commands.ingest_beige_book import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, edition=args.edition, all_editions=args.all)
    finally:
        db.close()


def cmd_ingest_fed_content(args: argparse.Namespace) -> None:
    """Ingest Fed speeches and research papers from RSS feeds."""
    from fee_crawler.commands.ingest_fed_content import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, content_type=args.type, limit=args.limit)
    finally:
        db.close()


def cmd_ingest_ffiec_cdr(args: argparse.Namespace) -> None:
    """Ingest overdraft revenue from FFIEC CDR bulk Call Report data."""
    from fee_crawler.commands.ingest_ffiec_cdr import run
    config = load_config()
    db = get_db(config)
    run(db, args)


def cmd_ingest_fred(args: argparse.Namespace) -> None:
    """Ingest economic indicators from FRED API."""
    from fee_crawler.commands.ingest_fred import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, series=args.series, from_date=args.from_date)
    finally:
        db.close()


def cmd_ingest_bls(args: argparse.Namespace) -> None:
    """Ingest CPI and economic data from BLS API."""
    from fee_crawler.commands.ingest_bls import run

    config = load_config()
    db = get_db(config)
    try:
        run(
            db,
            config,
            series=args.series,
            start_year=args.start_year,
            end_year=args.end_year,
            skip_regional=args.skip_regional,
        )
    finally:
        db.close()


def cmd_ingest_nyfed(args: argparse.Namespace) -> None:
    """Ingest reference rates from NY Fed Markets Data API."""
    from fee_crawler.commands.ingest_nyfed import run

    config = load_config()
    db = get_db(config)
    try:
        run(
            db,
            config,
            rate_type=args.rate_type,
            start_date=args.start_date,
            end_date=args.end_date,
        )
    finally:
        db.close()


def cmd_refresh_data(args: argparse.Namespace) -> None:
    """Refresh all research data sources."""
    from fee_crawler.commands.refresh_data import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, cadence=args.cadence, only=args.only)
    finally:
        db.close()


def cmd_snapshot(args: argparse.Namespace) -> None:
    """Take a snapshot of current fees and detect changes."""
    from fee_crawler.commands.snapshot_fees import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, date=args.date)
    finally:
        db.close()


def cmd_ingest_ofr(args: argparse.Namespace) -> None:
    """Ingest OFR Financial Stress Index."""
    from fee_crawler.commands.ingest_ofr import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, start_date=args.start_date)
    finally:
        db.close()


def cmd_ingest_sod(args: argparse.Namespace) -> None:
    """Ingest FDIC Summary of Deposits data."""
    from fee_crawler.commands.ingest_sod import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, year=args.year, limit=args.limit)
    finally:
        db.close()


def cmd_ingest_census_acs(args: argparse.Namespace) -> None:
    """Ingest Census ACS demographic data."""
    from fee_crawler.commands.ingest_census_acs import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, year=args.year, level=args.level)
    finally:
        db.close()


def cmd_ingest_census_tracts(args: argparse.Namespace) -> None:
    """Ingest FFIEC census tract income classifications."""
    from fee_crawler.commands.ingest_census_tracts import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, year=args.year)
    finally:
        db.close()


def cmd_run_pipeline(args: argparse.Namespace) -> None:
    """Run full pipeline: discover → crawl → categorize."""
    import logging

    from fee_crawler.commands.run_pipeline import run

    if args.verbose:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    config = load_config()
    db = get_db(config)
    try:
        run(
            db, config,
            limit=args.limit,
            workers=args.workers,
            max_llm_calls=args.max_llm_calls,
            max_search_cost=args.max_search_cost,
            skip_discover=args.skip_discover,
            skip_crawl=args.skip_crawl,
            skip_categorize=args.skip_categorize,
            state=args.state,
        )
    finally:
        db.close()


def cmd_merge_fees(args: argparse.Namespace) -> None:
    """Re-merge extracted fees with existing data."""
    from fee_crawler.commands.merge_fees import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, dry_run=args.dry_run)
    finally:
        db.close()


def cmd_rediscover_failed(args: argparse.Namespace) -> None:
    """Clear bad URLs and prepare for rediscovery."""
    from fee_crawler.commands.rediscover_failed import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, state=args.state, limit=args.limit, dry_run=args.dry_run)
    finally:
        db.close()


def cmd_recrawl(args: argparse.Namespace) -> None:
    """Reset content hashes to force re-download and R2 storage."""
    from fee_crawler.commands.recrawl import run

    config = load_config()
    db = get_db(config)
    try:
        run(
            db, config,
            state=args.state,
            doc_type=args.type,
            limit=args.limit,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
            all_targets=args.all,
        )
    finally:
        db.close()


def cmd_publish_index(args: argparse.Namespace) -> None:
    """Publish fee index: coverage snapshot, cache, DB maintenance."""
    from fee_crawler.commands.publish_index import run

    config = load_config()
    db = get_db(config)
    try:
        run(db, config, dry_run=args.dry_run)
    finally:
        db.close()


def cmd_pipeline_v2(args: argparse.Namespace) -> None:
    """Run atomic pipeline with resume support."""
    from fee_crawler.pipeline.executor import run_pipeline

    config = load_config()
    db = get_db(config)
    skip = frozenset(args.skip.split(",")) if args.skip else frozenset()
    try:
        run_id = run_pipeline(
            db, config,
            from_phase=args.from_phase,
            resume_run_id=args.resume,
            skip=skip,
            dry_run=args.dry_run,
            limit=args.limit,
            workers=args.workers,
            state=args.state,
        )
        print(f"\nPipeline run ID: {run_id}")
    finally:
        db.close()


def cmd_stats(args: argparse.Namespace) -> None:
    """Show database statistics."""
    config = load_config()
    db = get_db(config)
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


def cmd_knowledge_prune(args: argparse.Namespace) -> None:
    """Prune knowledge files to stay within token budget."""
    from fee_crawler.knowledge.pruner import prune_state, prune_national
    from fee_crawler.knowledge import loader as knowledge_loader
    from pathlib import Path

    config = load_config()
    budget = config.knowledge.token_budget_chars

    if args.state:
        state = args.state.upper()
        print(f"Pruning {state} knowledge file (budget: {budget} chars)...")
        prune_state(state, token_budget_chars=budget)
        print("Done.")
    elif args.all:
        states_dir = Path(knowledge_loader.KNOWLEDGE_DIR) / "states"
        state_files = sorted(states_dir.glob("*.md")) if states_dir.exists() else []
        print(f"Pruning {len(state_files)} state files and national.md (budget: {budget} chars)...")
        for f in state_files:
            prune_state(f.stem, token_budget_chars=budget)
        prune_national(token_budget_chars=budget)
        print(f"Done. Pruned {len(state_files)} states + national.")
    else:
        print("Specify --state XX or --all", file=sys.stderr)
        sys.exit(1)


def cmd_knowledge_status(args: argparse.Namespace) -> None:
    """Show knowledge base file sizes and token budget status."""
    from fee_crawler.knowledge import loader as knowledge_loader
    from pathlib import Path

    config = load_config()
    budget = config.knowledge.token_budget_chars

    knowledge_dir = Path(knowledge_loader.KNOWLEDGE_DIR)
    states_dir = knowledge_dir / "states"
    national_path = knowledge_dir / "national.md"

    print(f"Knowledge base: {knowledge_dir}")
    print(f"Token budget: {budget} chars (~{budget // 4} tokens)")
    print()

    state_files = sorted(states_dir.glob("*.md")) if states_dir.exists() else []
    over_budget = []
    total_chars = 0

    for f in state_files:
        size = len(f.read_text())
        total_chars += size
        if size > budget:
            over_budget.append((f.stem, size))

    print(f"States: {len(state_files)} files, {total_chars:,} total chars")
    if over_budget:
        print(f"Over budget ({budget} chars): {len(over_budget)} states")
        for code, size in over_budget[:10]:
            print(f"  {code}: {size:,} chars")
        if len(over_budget) > 10:
            print(f"  ... and {len(over_budget) - 10} more")
    else:
        print("All state files within budget.")

    if national_path.exists():
        nat_size = len(national_path.read_text())
        status = "OVER BUDGET" if nat_size > budget else "OK"
        print(f"national.md: {nat_size:,} chars [{status}]")
    else:
        print("national.md: not yet created")


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
    disc_parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Number of concurrent worker threads (default: 1)",
    )
    disc_parser.add_argument(
        "--max-search-cost",
        type=float,
        default=25.0,
        help="Maximum budget for search API queries in dollars (default: $25)",
    )
    disc_parser.set_defaults(func=cmd_discover)

    # crawl command
    crawl_parser = subparsers.add_parser("crawl", help="Download and extract fees from discovered URLs")
    crawl_parser.add_argument(
        "--target-id",
        type=int,
        default=None,
        help="Crawl a specific institution by ID",
    )
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
    crawl_parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Number of concurrent worker threads (default: 1)",
    )
    crawl_parser.add_argument(
        "--include-failing",
        action="store_true",
        help="Include institutions with 5+ consecutive failures (skipped by default)",
    )
    crawl_parser.add_argument(
        "--tier",
        type=str,
        default=None,
        help="Filter by asset tier (comma-separated: community_small,community_mid,community_large,regional,large_regional,super_regional)",
    )
    crawl_parser.add_argument(
        "--skip-with-fees",
        action="store_true",
        help="Skip institutions that already have extracted fees",
    )
    crawl_parser.add_argument(
        "--new-only",
        action="store_true",
        help="Only crawl institutions with recently discovered URLs (never crawled before)",
    )
    crawl_parser.add_argument(
        "--doc-type",
        type=str,
        default=None,
        choices=["pdf", "html"],
        dest="doc_type",
        help="Filter by document type (pdf or html)",
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

    # outlier-detect command
    outlier_parser = subparsers.add_parser("outlier-detect", help="Detect statistical outliers in fee amounts")
    outlier_parser.add_argument(
        "--auto-flag",
        action="store_true",
        help="Automatically flag detected outliers for review",
    )
    outlier_parser.set_defaults(func=cmd_outlier_detect)

    # categorize command
    cat_parser = subparsers.add_parser("categorize", help="Batch-categorize fees using name aliases")
    cat_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be categorized without writing",
    )
    cat_parser.add_argument(
        "--force",
        action="store_true",
        help="Re-categorize even if fee_category is already set",
    )
    cat_parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max rows to process (for testing)",
    )
    cat_parser.set_defaults(func=cmd_categorize)

    # auto-review command
    review_parser = subparsers.add_parser(
        "auto-review", help="Intelligent auto-review of staged and flagged fees"
    )
    review_parser.add_argument(
        "--dry-run", action="store_true",
        help="Show what would be approved/rejected without making changes",
    )
    review_parser.set_defaults(func=cmd_auto_review)

    # backfill-ncua-urls command
    ncua_url_parser = subparsers.add_parser(
        "backfill-ncua-urls", help="Backfill website URLs for NCUA credit unions"
    )
    ncua_url_parser.add_argument(
        "--workers",
        type=int,
        default=8,
        help="Number of concurrent worker threads (default: 8)",
    )
    ncua_url_parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max institutions to process (for testing)",
    )
    ncua_url_parser.set_defaults(func=cmd_backfill_ncua_urls)

    # ingest-call-reports command
    call_report_parser = subparsers.add_parser(
        "ingest-call-reports",
        help="Ingest Call Report service charge revenue data for coverage gap analysis",
    )
    call_report_parser.add_argument(
        "--csv",
        type=str,
        default=None,
        help="Path to bulk Call Report CSV file",
    )
    call_report_parser.add_argument(
        "--report-date",
        type=str,
        default=None,
        help="Reporting period (e.g., 2024-12-31). Required with --csv",
    )
    call_report_parser.add_argument(
        "--source",
        type=str,
        default="ffiec",
        help="Data source identifier: ffiec or ncua_5300 (default: ffiec)",
    )
    call_report_parser.add_argument(
        "--gaps",
        action="store_true",
        help="Show high-revenue institutions missing fee data",
    )
    call_report_parser.set_defaults(func=cmd_ingest_call_reports)

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
        "--quarter",
        type=str,
        default=None,
        help="Quarter end date YYYY-MM (e.g. 2025-09). Default: latest available",
    )
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
        "--years",
        type=str,
        default=None,
        help="Comma-separated years (e.g. 2023,2024). Default: 2020-2025",
    )
    cfpb_parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max institutions to process (for testing)",
    )
    cfpb_parser.set_defaults(func=cmd_ingest_cfpb)

    # ingest-beige-book command
    beige_parser = subparsers.add_parser(
        "ingest-beige-book", help="Ingest Federal Reserve Beige Book reports"
    )
    beige_parser.add_argument(
        "--edition",
        type=str,
        default=None,
        help="Specific edition code (YYYYMM), e.g. 202601. Default: latest",
    )
    beige_parser.add_argument(
        "--all",
        action="store_true",
        help="Ingest all known editions (2024-2026)",
    )
    beige_parser.set_defaults(func=cmd_ingest_beige_book)

    # ingest-fed-content command
    fed_content_parser = subparsers.add_parser(
        "ingest-fed-content", help="Ingest Fed speeches and research from RSS"
    )
    fed_content_parser.add_argument(
        "--type",
        choices=["speeches", "research"],
        default=None,
        help="Content type to ingest (default: all)",
    )
    fed_content_parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max items per feed (for testing)",
    )
    fed_content_parser.set_defaults(func=cmd_ingest_fed_content)

    # ingest-fred command
    fred_parser = subparsers.add_parser(
        "ingest-fred", help="Ingest economic indicators from FRED API"
    )
    fred_parser.add_argument(
        "--series",
        type=str,
        default=None,
        help="Specific FRED series ID (e.g. UNRATE). Default: all configured",
    )
    fred_parser.add_argument(
        "--from-date",
        type=str,
        default=None,
        help="Start date for observations (YYYY-MM-DD). Default: last 10 years",
    )
    fred_parser.set_defaults(func=cmd_ingest_fred)

    # ingest-ffiec-cdr command
    cdr_parser = subparsers.add_parser(
        "ingest-ffiec-cdr", help="Ingest overdraft revenue (RIADH032) from FFIEC CDR bulk data"
    )
    cdr_parser.add_argument(
        "--quarter",
        type=str,
        default=None,
        help="Specific quarter (YYYYMMDD, e.g. 20251231). Default: latest",
    )
    cdr_parser.add_argument(
        "--backfill",
        action="store_true",
        help="Backfill all 8 quarters (2-year history)",
    )
    cdr_parser.set_defaults(func=cmd_ingest_ffiec_cdr)

    # ingest-bls command
    bls_parser = subparsers.add_parser(
        "ingest-bls", help="Ingest CPI and economic data from BLS API"
    )
    bls_parser.add_argument(
        "--series",
        type=str,
        default=None,
        help="Specific BLS series ID (e.g. CUUR0000SEMC01). Default: all configured",
    )
    bls_parser.add_argument(
        "--start-year",
        type=int,
        default=None,
        help="Start year (YYYY). Default: 10 years ago",
    )
    bls_parser.add_argument(
        "--end-year",
        type=int,
        default=None,
        help="End year (YYYY). Default: current year",
    )
    bls_parser.add_argument(
        "--skip-regional",
        action="store_true",
        help="Skip regional CPI series (national only)",
    )
    bls_parser.set_defaults(func=cmd_ingest_bls)

    # ingest-nyfed command
    nyfed_parser = subparsers.add_parser(
        "ingest-nyfed", help="Ingest reference rates (SOFR, EFFR, OBFR) from NY Fed"
    )
    nyfed_parser.add_argument(
        "--rate-type",
        type=str,
        default=None,
        help="Specific rate type (SOFR, EFFR, OBFR). Default: all",
    )
    nyfed_parser.add_argument(
        "--start-date",
        type=str,
        default=None,
        help="Start date (YYYY-MM-DD). Default: 5 years ago",
    )
    nyfed_parser.add_argument(
        "--end-date",
        type=str,
        default=None,
        help="End date (YYYY-MM-DD). Default: today",
    )
    nyfed_parser.set_defaults(func=cmd_ingest_nyfed)

    # ingest-ofr command
    ofr_parser = subparsers.add_parser(
        "ingest-ofr", help="Ingest OFR Financial Stress Index"
    )
    ofr_parser.add_argument(
        "--start-date", type=str, default=None,
        help="Start date (YYYY-MM-DD). Default: all available (~2000-present)",
    )
    ofr_parser.set_defaults(func=cmd_ingest_ofr)

    # ingest-sod command
    sod_parser = subparsers.add_parser(
        "ingest-sod", help="Ingest FDIC Summary of Deposits (branch-level)"
    )
    sod_parser.add_argument(
        "--year", type=int, default=2024,
        help="SOD year (default: 2024)",
    )
    sod_parser.add_argument(
        "--limit", type=int, default=None,
        help="Max branches to process (for testing)",
    )
    sod_parser.set_defaults(func=cmd_ingest_sod)

    # ingest-census-acs command
    census_acs_parser = subparsers.add_parser(
        "ingest-census-acs", help="Ingest Census ACS demographics (income, poverty, population)"
    )
    census_acs_parser.add_argument(
        "--year", type=int, default=2022,
        help="ACS 5-year estimate year (default: 2022, latest available)",
    )
    census_acs_parser.add_argument(
        "--level", type=str, default="county", choices=["state", "county"],
        help="Geographic level (default: county)",
    )
    census_acs_parser.set_defaults(func=cmd_ingest_census_acs)

    # ingest-census-tracts command
    census_tracts_parser = subparsers.add_parser(
        "ingest-census-tracts", help="Ingest FFIEC census tract income classifications"
    )
    census_tracts_parser.add_argument(
        "--year", type=int, default=2022,
        help="Census year (default: 2022)",
    )
    census_tracts_parser.set_defaults(func=cmd_ingest_census_tracts)

    # refresh-data command
    refresh_parser = subparsers.add_parser(
        "refresh-data",
        help="Refresh all research data sources (orchestrates all ingest commands)",
    )
    refresh_parser.add_argument(
        "--cadence",
        type=str,
        default=None,
        choices=["daily", "weekly", "quarterly", "annual"],
        help="Only run sources at this cadence tier",
    )
    refresh_parser.add_argument(
        "--only",
        type=str,
        default=None,
        help="Run a single source (e.g. fred, bls, ofr, sod)",
    )
    refresh_parser.set_defaults(func=cmd_refresh_data)

    # snapshot command
    snapshot_parser = subparsers.add_parser(
        "snapshot",
        help="Snapshot current fees and detect changes since last snapshot",
    )
    snapshot_parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Snapshot date (YYYY-MM-DD). Default: today",
    )
    snapshot_parser.set_defaults(func=cmd_snapshot)

    # run-pipeline command
    pipeline_parser = subparsers.add_parser(
        "run-pipeline",
        help="Run full pipeline: discover → crawl → categorize (cron-ready)",
    )
    pipeline_parser.add_argument("--limit", type=int, default=None, help="Max institutions per stage")
    pipeline_parser.add_argument("--workers", type=int, default=4, help="Concurrent workers (default: 4)")
    pipeline_parser.add_argument("--max-llm-calls", type=int, default=500, help="Max LLM API calls (default: 500)")
    pipeline_parser.add_argument("--max-search-cost", type=float, default=10.0, help="Max search API budget in $ (default: 10)")
    pipeline_parser.add_argument("--state", type=str, default=None, help="Filter by state code")
    pipeline_parser.add_argument("--skip-discover", action="store_true", help="Skip URL discovery stage")
    pipeline_parser.add_argument("--skip-crawl", action="store_true", help="Skip crawl/extraction stage")
    pipeline_parser.add_argument("--skip-categorize", action="store_true", help="Skip categorization stage")
    pipeline_parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")
    pipeline_parser.set_defaults(func=cmd_run_pipeline)

    # merge-fees command
    merge_parser = subparsers.add_parser(
        "merge-fees",
        help="Re-merge extracted fees with existing data",
    )
    merge_parser.add_argument("--dry-run", action="store_true", help="Show what would be merged")
    merge_parser.set_defaults(func=cmd_merge_fees)

    # rediscover-failed command
    rediscover_parser = subparsers.add_parser(
        "rediscover-failed",
        help="Clear bad URLs (pre-screen fails, 404s) and prepare for rediscovery",
    )
    rediscover_parser.add_argument("--state", type=str, default=None, help="Filter by state code")
    rediscover_parser.add_argument("--limit", type=int, default=None, help="Max institutions to process")
    rediscover_parser.add_argument("--dry-run", action="store_true", help="Show what would be cleared")
    rediscover_parser.set_defaults(func=cmd_rediscover_failed)

    # recrawl command
    recrawl_parser = subparsers.add_parser(
        "recrawl",
        help="Reset content hashes to force re-download and R2 storage",
    )
    recrawl_parser.add_argument("--state", type=str, default=None, help="Filter by state code")
    recrawl_parser.add_argument("--type", type=str, default=None, choices=["pdf", "html"], help="Filter by document type")
    recrawl_parser.add_argument("--limit", type=int, default=None, help="Max institutions to reset")
    recrawl_parser.add_argument("--batch-size", type=int, default=100, help="Commit every N updates")
    recrawl_parser.add_argument("--dry-run", action="store_true", help="Show what would be reset")
    recrawl_parser.add_argument("--all", action="store_true", help="Reset all institutions, not just those missing R2 keys")
    recrawl_parser.set_defaults(func=cmd_recrawl)

    # publish-index command
    publish_parser = subparsers.add_parser(
        "publish-index",
        help="Publish fee index: coverage snapshot, cache revalidation, DB maintenance",
    )
    publish_parser.add_argument("--dry-run", action="store_true", help="Show what would be published")
    publish_parser.set_defaults(func=cmd_publish_index)

    # pipeline-v2 command (new orchestrator with resume)
    v2_parser = subparsers.add_parser(
        "pipeline",
        help="Run atomic pipeline with resume support (replaces run-pipeline)",
    )
    v2_parser.add_argument("--from-phase", type=int, default=1, help="Start from phase N (1-4)")
    v2_parser.add_argument("--resume", type=int, default=None, help="Resume a previous run by ID")
    v2_parser.add_argument("--skip", type=str, default=None, help="Comma-separated stage names to skip")
    v2_parser.add_argument("--dry-run", action="store_true", help="Show what would run")
    v2_parser.add_argument("--limit", type=int, default=None, help="Max institutions per stage")
    v2_parser.add_argument("--workers", type=int, default=1, help="Concurrent workers")
    v2_parser.add_argument("--state", type=str, default=None, help="Filter by state code (e.g., CA, TX, NY)")
    v2_parser.set_defaults(func=cmd_pipeline_v2)

    # stats command
    stats_parser = subparsers.add_parser("stats", help="Show database statistics")
    stats_parser.set_defaults(func=cmd_stats)

    # ── Wave orchestrator ──────────────────────────────────────────────
    wave_parser = subparsers.add_parser(
        "wave",
        help="Wave orchestrator: batch state agent runs across all states",
    )
    wave_sub = wave_parser.add_subparsers(dest="wave_command", required=True)

    wave_run_parser = wave_sub.add_parser(
        "run",
        help="Launch wave campaign (all states by coverage gap, or --states override)",
    )
    wave_run_parser.add_argument(
        "--states",
        default=None,
        help="Comma-separated state codes to run (e.g., WY,MT,TX). Omit for auto-selection by coverage gap.",
    )
    wave_run_parser.add_argument(
        "--wave-size",
        type=int,
        default=8,
        help="States per wave chunk (default: 8)",
    )
    wave_run_parser.add_argument(
        "--max-passes",
        type=int,
        default=3,
        dest="max_passes",
        help="Number of discovery passes per state (default: 3). Each pass escalates strategy: tier1 -> tier2 -> tier3.",
    )
    wave_run_parser.set_defaults(
        func=lambda args: __import__(
            "fee_crawler.wave.cli", fromlist=["cmd_wave_run"]
        ).cmd_wave_run(args)
    )

    wave_rec_parser = wave_sub.add_parser(
        "recommend",
        help="Show ranked state list by coverage gap (for operator review before running)",
    )
    wave_rec_parser.add_argument(
        "--wave-size",
        type=int,
        default=8,
        help="How many states to display per wave grouping (default: 8)",
    )
    wave_rec_parser.set_defaults(
        func=lambda args: __import__(
            "fee_crawler.wave.cli", fromlist=["cmd_wave_recommend"]
        ).cmd_wave_recommend(args)
    )

    wave_resume_parser = wave_sub.add_parser(
        "resume",
        help="Resume an interrupted wave — skips already-complete states",
    )
    wave_resume_parser.add_argument(
        "wave_id",
        type=int,
        help="Wave run ID to resume (from wave_runs.id)",
    )
    wave_resume_parser.add_argument(
        "--max-passes",
        type=int,
        default=3,
        dest="max_passes",
        help="Number of discovery passes per state (default: 3). Each pass escalates strategy: tier1 -> tier2 -> tier3.",
    )
    wave_resume_parser.set_defaults(
        func=lambda args: __import__(
            "fee_crawler.wave.cli", fromlist=["cmd_wave_resume"]
        ).cmd_wave_resume(args)
    )

    wave_report_parser = wave_sub.add_parser(
        "report",
        help="Print a Markdown summary report for a completed wave",
    )
    wave_report_parser.add_argument(
        "wave_id",
        type=int,
        help="Wave run ID to report on (from wave_runs.id)",
    )
    wave_report_parser.add_argument(
        "--output",
        default=None,
        metavar="PATH",
        help="Optional file path to write the report (default: stdout only)",
    )
    wave_report_parser.set_defaults(
        func=lambda args: __import__(
            "fee_crawler.wave.cli", fromlist=["cmd_wave_report"]
        ).cmd_wave_report(args)
    )

    # ── Knowledge management ───────────────────────────────────────────
    knowledge_parser = subparsers.add_parser(
        "knowledge",
        help="Knowledge base management: prune, status",
    )
    knowledge_sub = knowledge_parser.add_subparsers(
        dest="knowledge_command", required=True
    )

    # knowledge prune
    k_prune_parser = knowledge_sub.add_parser(
        "prune",
        help="Prune knowledge files to stay within token budget",
    )
    k_prune_parser.add_argument(
        "--state",
        type=str,
        default=None,
        metavar="XX",
        help="Two-letter state code to prune (e.g. WY)",
    )
    k_prune_parser.add_argument(
        "--all",
        action="store_true",
        help="Prune all state files and national.md",
    )
    k_prune_parser.set_defaults(func=cmd_knowledge_prune)

    # knowledge status
    k_status_parser = knowledge_sub.add_parser(
        "status",
        help="Show knowledge base file sizes and budget status",
    )
    k_status_parser.set_defaults(func=cmd_knowledge_status)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
