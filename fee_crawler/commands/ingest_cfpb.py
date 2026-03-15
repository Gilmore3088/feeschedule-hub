"""Ingest consumer complaint data from CFPB API into institution_complaints."""

import time

import requests

MAX_RETRIES = 3

from fee_crawler.config import Config
from fee_crawler.db import Database

CFPB_BASE = "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/"

# Products relevant to fee benchmarking.
RELEVANT_PRODUCTS = [
    "Checking or savings account",
    "Credit card",
    "Money transfer, virtual currency, or money service",
]

# Default report years for ingestion (2020-present for trend analysis).
DEFAULT_YEARS = ["2020", "2021", "2022", "2023", "2024", "2025"]

# Fee-relevant issue categories for filtering.
FEE_ISSUES = [
    "Problem with a purchase or transfer",
    "Problem caused by your funds being low",
    "Managing an account",
    "Fees or interest",
    "Problem with a lender or other company charging your account",
    "Opening an account",
    "Closing an account",
]


def _normalize_name(name: str) -> str:
    """Normalize institution name for fuzzy matching."""
    name = name.upper().strip()
    # Remove common suffixes
    for suffix in [
        ", NATIONAL ASSOCIATION",
        ", N.A.",
        " N.A.",
        ", INC.",
        " INC.",
        ", INC",
        " INC",
        " CORPORATION",
        " CORP.",
        " CORP",
        ", LLC",
        " LLC",
        " CO.",
        " CO",
        " & COMPANY",
        " & CO.",
        " GROUP",
        " FINANCIAL",
        " BANCORP",
        " BANCSHARES",
        " NATIONAL BANK",
        ", THE",
        " THE",
        " HOLDING COMPANY",
        " HOLDINGS",
        " US HOLDING",
        " BANK",
    ]:
        if name.endswith(suffix):
            name = name[: -len(suffix)].strip()
    # Remove punctuation
    name = name.replace(",", "").replace(".", "").replace("'", "")
    return name.strip()


def _build_name_index(db: Database) -> dict[str, int]:
    """Build a mapping from normalized names to crawl_target_id.

    Uses institution_name from crawl_targets. For common holding companies
    vs bank entities, maps both forms.
    """
    rows = db.fetchall("SELECT id, institution_name FROM crawl_targets")
    index: dict[str, int] = {}
    for row in rows:
        name = row["institution_name"]
        if not name:
            continue
        norm = _normalize_name(name)
        # Keep the largest institution (highest ID likely = most assets)
        if norm not in index:
            index[norm] = row["id"]
    return index


def _match_company(cfpb_name: str, name_index: dict[str, int]) -> int | None:
    """Try to match a CFPB company name to a crawl_target_id."""
    norm = _normalize_name(cfpb_name)

    # Exact match
    if norm in name_index:
        return name_index[norm]

    # Try prefix matching (CFPB uses holding co names, we have bank names)
    for db_norm, target_id in name_index.items():
        if norm.startswith(db_norm) or db_norm.startswith(norm):
            return target_id

    return None


def _fetch_with_retry(url: str, params: dict) -> dict | None:
    """Fetch from CFPB API with retry logic."""
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, params=params, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.RequestException as e:
            if attempt < MAX_RETRIES - 1:
                print(f"  Retry {attempt + 1}/{MAX_RETRIES}: {e}")
                time.sleep(2 ** attempt)
            else:
                print(f"  Failed after {MAX_RETRIES} attempts: {e}")
                return None
    return None


def ingest_cfpb_complaints(
    db: Database,
    config: Config,
    *,
    years: list[str] | None = None,
    limit: int | None = None,
) -> int:
    """Query CFPB API for complaint aggregations by company and product.

    For each relevant product and year, gets the top companies by complaint
    count, matches them to our institutions, and upserts into
    institution_complaints. Also fetches issue-level breakdowns for matched
    institutions.

    Returns total rows upserted.
    """
    report_years = years or DEFAULT_YEARS
    name_index = _build_name_index(db)
    print(f"Built name index with {len(name_index):,} normalized names")

    total_upserted = 0
    total_unmatched = 0
    matched_companies: set[str] = set()
    unmatched_companies: list[tuple[str, int]] = []

    for year in report_years:
        date_min = f"{year}-01-01"
        date_max = f"{year}-12-31"

        for product in RELEVANT_PRODUCTS:
            print(f"\nFetching complaints: {product} ({year})...")

            data = _fetch_with_retry(
                CFPB_BASE,
                {
                    "product": product,
                    "date_received_min": date_min,
                    "date_received_max": date_max,
                    "size": 0,
                },
            )
            if data is None:
                continue

            # Get company aggregation
            company_agg = data.get("aggregations", {}).get("company", {})
            buckets = company_agg.get("company", {}).get("buckets", [])

            print(f"  {len(buckets)} companies with complaints")

            for bucket in buckets:
                if limit and total_upserted >= limit:
                    break

                company_name = bucket["key"]
                total_count = bucket["doc_count"]

                target_id = _match_company(company_name, name_index)
                if not target_id:
                    if company_name not in [u[0] for u in unmatched_companies]:
                        unmatched_companies.append((company_name, total_count))
                    total_unmatched += 1
                    continue

                matched_companies.add(company_name)

                # Store total complaint count per product
                try:
                    db.execute(
                        """INSERT OR REPLACE INTO institution_complaints
                           (crawl_target_id, report_period, product, issue, complaint_count)
                           VALUES (?, ?, ?, '_total', ?)""",
                        (target_id, year, product, total_count),
                    )
                    total_upserted += 1
                except Exception as e:
                    print(f"  Error inserting total for {company_name}: {e}")

            # Fetch issue-level breakdown for "Checking or savings account"
            # (most fee-relevant product) -- uses a single aggregation query
            if product == "Checking or savings account":
                issue_data = _fetch_with_retry(
                    CFPB_BASE,
                    {
                        "product": product,
                        "date_received_min": date_min,
                        "date_received_max": date_max,
                        "size": 0,
                    },
                )
                if issue_data:
                    issue_agg = issue_data.get("aggregations", {}).get("issue", {})
                    issue_buckets = issue_agg.get("issue", {}).get("buckets", [])
                    fee_issue_count = sum(
                        b["doc_count"]
                        for b in issue_buckets
                        if b["key"] in FEE_ISSUES
                    )
                    all_count = sum(b["doc_count"] for b in issue_buckets)
                    if all_count > 0:
                        pct = fee_issue_count / all_count * 100
                        print(f"  Fee-related issues: {fee_issue_count:,}/{all_count:,} ({pct:.0f}%)")

            print(f"  Matched: {len(matched_companies)} | Unmatched: {total_unmatched}")
            time.sleep(0.5)

    db.commit()

    if unmatched_companies:
        unmatched_companies.sort(key=lambda x: -x[1])
        print(f"\nTop unmatched companies (by complaint count):")
        for name, count in unmatched_companies[:15]:
            print(f"  {name}: {count:,}")

    print(f"\nCFPB ingestion complete: {total_upserted:,} rows upserted")
    print(f"  Companies matched: {len(matched_companies)}")
    return total_upserted


def run(
    db: Database,
    config: Config,
    *,
    years: list[str] | None = None,
    limit: int | None = None,
) -> None:
    """Entry point for the CLI command."""
    ingest_cfpb_complaints(db, config, years=years, limit=limit)

    count = db.fetchone("SELECT COUNT(*) as cnt FROM institution_complaints")
    cnt = count["cnt"] if count else 0
    institutions = db.fetchone(
        "SELECT COUNT(DISTINCT crawl_target_id) as cnt FROM institution_complaints"
    )
    inst_cnt = institutions["cnt"] if institutions else 0
    periods = db.fetchone(
        "SELECT COUNT(DISTINCT report_period) as cnt FROM institution_complaints"
    )
    p_cnt = periods["cnt"] if periods else 0
    print(f"\nTotal complaint records: {cnt:,}")
    print(f"Institutions with complaints: {inst_cnt:,}")
    print(f"Report periods: {p_cnt}")
