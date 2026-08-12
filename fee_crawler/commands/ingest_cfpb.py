"""Ingest consumer complaint data from CFPB API into institution_complaints."""

import os
import time

import psycopg2
import psycopg2.extras
import requests

from fee_crawler.config import Config

MAX_RETRIES = 3

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


def _connect():
    """Open a psycopg2 connection using DATABASE_URL from environment."""
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


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


def _build_name_index(conn) -> dict[str, int]:
    """Build a mapping from normalized names to crawl_target_id.

    Uses institution_name from crawl_targets. For common holding companies
    vs bank entities, maps both forms.
    """
    cursor = conn.cursor()
    cursor.execute("SELECT id, institution_name FROM crawl_targets")
    rows = cursor.fetchall()
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
    conn,
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
    name_index = _build_name_index(conn)
    print(f"Built name index with {len(name_index):,} normalized names")

    total_upserted = 0
    total_unmatched = 0
    matched_companies: set[str] = set()
    unmatched_companies: list[tuple[str, int]] = []
    unmatched_names: set[str] = set()

    cursor = conn.cursor()

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

            upsert_counts: dict[int, int] = {}
            for bucket in buckets:
                if limit and total_upserted + len(upsert_counts) >= limit:
                    break

                company_name = bucket["key"]
                total_count = bucket["doc_count"]

                target_id = _match_company(company_name, name_index)
                if not target_id:
                    if company_name not in unmatched_names:
                        unmatched_companies.append((company_name, total_count))
                        unmatched_names.add(company_name)
                    total_unmatched += 1
                    continue

                matched_companies.add(company_name)
                upsert_counts[target_id] = upsert_counts.get(target_id, 0) + total_count

            if upsert_counts:
                upsert_rows = [
                    (target_id, year, product, "_total", total_count)
                    for target_id, total_count in upsert_counts.items()
                ]
                psycopg2.extras.execute_values(
                    cursor,
                    """INSERT INTO institution_complaints
                         (crawl_target_id, report_period, product, issue, complaint_count)
                       VALUES %s
                       ON CONFLICT (crawl_target_id, report_period, product, issue)
                       DO UPDATE SET complaint_count = EXCLUDED.complaint_count""",
                    upsert_rows,
                    page_size=1000,
                )
                total_upserted += len(upsert_rows)

            # Fetch issue-level breakdown for "Checking or savings account"
            # from the response already fetched for the company aggregation.
            if product == "Checking or savings account":
                issue_agg = data.get("aggregations", {}).get("issue", {})
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

    conn.commit()

    if unmatched_companies:
        unmatched_companies.sort(key=lambda x: -x[1])
        print("\nTop unmatched companies (by complaint count):")
        for name, count in unmatched_companies[:15]:
            print(f"  {name}: {count:,}")

    print(f"\nCFPB ingestion complete: {total_upserted:,} rows upserted")
    print(f"  Companies matched: {len(matched_companies)}")
    return total_upserted


def run(
    conn,
    config: Config,
    *,
    years: list[str] | None = None,
    limit: int | None = None,
) -> None:
    """Entry point for the CLI command."""
    ingest_cfpb_complaints(conn, config, years=years, limit=limit)

    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as cnt FROM institution_complaints")
    count_row = cursor.fetchone()
    cnt = count_row["cnt"] if count_row else 0

    cursor.execute("SELECT COUNT(DISTINCT crawl_target_id) as cnt FROM institution_complaints")
    inst_row = cursor.fetchone()
    inst_cnt = inst_row["cnt"] if inst_row else 0

    cursor.execute("SELECT COUNT(DISTINCT report_period) as cnt FROM institution_complaints")
    period_row = cursor.fetchone()
    p_cnt = period_row["cnt"] if period_row else 0

    print(f"\nTotal complaint records: {cnt:,}")
    print(f"Institutions with complaints: {inst_cnt:,}")
    print(f"Report periods: {p_cnt}")
