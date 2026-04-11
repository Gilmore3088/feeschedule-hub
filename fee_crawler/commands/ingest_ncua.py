"""Ingest financial data from NCUA 5300 Call Reports into institution_financials."""

import csv
import io
import json
import zipfile

import requests

from fee_crawler.config import Config
from fee_crawler.db import Database

# NCUA bulk data URL — quarterly ZIP of CSV files.
# Update this each quarter (format: call-report-data-YYYY-QQ.zip).
NCUA_ZIP_BASE = "https://ncua.gov/files/publications/analysis/call-report-data-{year}-{month:02d}.zip"

# Default to most recent available quarter.
NCUA_DEFAULT_YEAR = 2025
NCUA_DEFAULT_MONTH = 12

# FS220.txt field mapping (balance sheet + summary)
FS220_FIELDS = {
    "ACCT_010": "total_assets",      # Total Assets (whole dollars)
    "ACCT_018": "total_deposits",    # Total Shares and Deposits
    "ACCT_025B": "total_loans",      # Total Loans and Leases
    "ACCT_083": "member_count",      # Number of current members
    "ACCT_602": "net_income",        # Net Income
    "ACCT_671": "noninterest_expense",  # Total Non-Interest Expense
}

# FS220A.txt field mapping (income statement + ratios)
FS220A_FIELDS = {
    "ACCT_115": "interest_income",        # Total Interest Income
    "ACCT_117": "noninterest_income",     # Total Non-Interest Income
    "ACCT_131": "fee_income",             # Fee Income (service charges)
    "Acct_997": "net_worth",              # Total Net Worth
    "Acct_998": "net_worth_ratio",        # Net Worth Ratio (basis points)
}


def _safe_int(val: str | None) -> int | None:
    if not val or not val.strip():
        return None
    try:
        return int(float(val.strip()))
    except (ValueError, TypeError):
        return None


def _safe_float(val: str | None) -> float | None:
    if not val or not val.strip():
        return None
    try:
        return float(val.strip())
    except (ValueError, TypeError):
        return None


def _parse_cycle_date(raw: str) -> str | None:
    """Convert '9/30/2025 0:00:00' -> '2025-09-30'."""
    if not raw or not raw.strip():
        return None
    parts = raw.strip().split(" ")[0].split("/")
    if len(parts) != 3:
        return None
    month, day, year = parts
    return f"{year}-{int(month):02d}-{int(day):02d}"


def ingest_ncua_financials(
    db: Database,
    config: Config,
    *,
    quarter: str | None = None,
    limit: int | None = None,
) -> int:
    """Download NCUA 5300 Call Report ZIP and ingest financial data.

    Parses FS220.txt (balance sheet) and FS220A.txt (income statement),
    joins on CU_NUMBER, and upserts into institution_financials.

    Returns total rows upserted.
    """
    # Build cu_number -> crawl_target_id lookup
    rows = db.fetchall(
        "SELECT id, cert_number FROM crawl_targets WHERE source = 'ncua'"
    )
    cu_map: dict[str, int] = {}
    for row in rows:
        cert = row["cert_number"]
        if cert:
            cu_map[cert] = row["id"]

    print(f"Found {len(cu_map):,} NCUA credit unions in database")

    # Build URL from quarter param (YYYY-MM-DD) or defaults
    if quarter:
        parts = quarter.split("-")
        q_year, q_month = int(parts[0]), int(parts[1])
    else:
        q_year, q_month = NCUA_DEFAULT_YEAR, NCUA_DEFAULT_MONTH
    zip_url = NCUA_ZIP_BASE.format(year=q_year, month=q_month)

    print(f"Downloading NCUA bulk data ({zip_url})...")
    resp = requests.get(zip_url, timeout=120, stream=True)
    resp.raise_for_status()
    content_length = int(resp.headers.get("content-length", 0))
    max_size = 500 * 1024 * 1024  # 500MB guard
    if content_length > max_size:
        raise ValueError(f"NCUA ZIP too large: {content_length:,} bytes (max {max_size:,})")
    data = resp.content
    if len(data) > max_size:
        raise ValueError(f"NCUA ZIP too large: {len(data):,} bytes (max {max_size:,})")
    zf = zipfile.ZipFile(io.BytesIO(data))

    # Phase 1: Parse FS220.txt (balance sheet data)
    print("  Parsing FS220.txt (balance sheet)...")
    fs220_raw = zf.read("FS220.txt").decode("utf-8", errors="replace")
    fs220_reader = csv.DictReader(io.StringIO(fs220_raw))

    financials: dict[str, dict] = {}
    for row in fs220_reader:
        cu_num = row.get("CU_NUMBER", "").strip()
        if not cu_num or cu_num not in cu_map:
            continue

        cycle_date = _parse_cycle_date(row.get("CYCLE_DATE", ""))
        if not cycle_date:
            continue

        rec: dict = {"report_date": cycle_date, "raw": {}}
        for acct_code, field_name in FS220_FIELDS.items():
            raw_val = row.get(acct_code)
            rec[field_name] = raw_val
            if raw_val:
                rec["raw"][acct_code] = raw_val

        financials[cu_num] = rec

    print(f"  Parsed {len(financials):,} CUs from FS220")

    # Phase 2: Parse FS220A.txt (income statement + ratios)
    print("  Parsing FS220A.txt (income statement)...")
    fs220a_raw = zf.read("FS220A.txt").decode("utf-8", errors="replace")
    fs220a_reader = csv.DictReader(io.StringIO(fs220a_raw))

    matched_a = 0
    for row in fs220a_reader:
        cu_num = row.get("CU_NUMBER", "").strip()
        if cu_num not in financials:
            continue

        for acct_code, field_name in FS220A_FIELDS.items():
            raw_val = row.get(acct_code)
            financials[cu_num][field_name] = raw_val
            if raw_val:
                financials[cu_num]["raw"][acct_code] = raw_val

        matched_a += 1

    print(f"  Matched {matched_a:,} CUs from FS220A")

    # Phase 3: Count branches per CU
    print("  Parsing branch data...")
    branch_raw = zf.read("Credit Union Branch Information.txt").decode("utf-8", errors="replace")
    branch_reader = csv.DictReader(io.StringIO(branch_raw))
    branch_counts: dict[str, int] = {}
    for row in branch_reader:
        cu_num = row.get("CU_NUMBER", "").strip()
        if cu_num in financials:
            branch_counts[cu_num] = branch_counts.get(cu_num, 0) + 1

    # Phase 4: Upsert into database
    print("  Upserting into institution_financials...")
    total_upserted = 0
    total_errors = 0

    for cu_num, rec in financials.items():
        if limit and total_upserted >= limit:
            break

        target_id = cu_map[cu_num]
        total_assets = _safe_int(rec.get("total_assets"))
        total_deposits = _safe_int(rec.get("total_deposits"))
        total_loans = _safe_int(rec.get("total_loans"))
        fee_income = _safe_int(rec.get("fee_income"))
        noninterest_income = _safe_int(rec.get("noninterest_income"))
        member_count = _safe_int(rec.get("member_count"))
        net_worth_ratio_bps = _safe_float(rec.get("net_worth_ratio"))
        branch_count = branch_counts.get(cu_num)

        # Convert NCUA whole dollars to thousands (to match FDIC convention)
        if total_assets is not None:
            total_assets = total_assets // 1000
        if total_deposits is not None:
            total_deposits = total_deposits // 1000
        if total_loans is not None:
            total_loans = total_loans // 1000
        if fee_income is not None:
            fee_income = fee_income // 1000
        if noninterest_income is not None:
            noninterest_income = noninterest_income // 1000

        # Net worth ratio: NCUA reports in basis points (e.g., 1142 = 11.42%)
        net_worth_pct = net_worth_ratio_bps / 100 if net_worth_ratio_bps else None

        # ROA approximation: net_income / total_assets * 100
        net_income = _safe_int(rec.get("net_income"))
        roa = None
        if net_income is not None and total_assets and total_assets > 0:
            roa = round(net_income / 1000 / total_assets * 100, 2)

        # Interest income (ACCT_115), convert whole dollars to thousands
        interest_income = _safe_int(rec.get("interest_income"))
        if interest_income is not None:
            interest_income = interest_income // 1000

        # Derived: total_revenue = interest_income - interest_expense + noninterest_income
        # NCUA doesn't have a clean interest_expense field, approximate from raw if possible
        noninterest_exp = _safe_int(rec.get("noninterest_expense"))
        if noninterest_exp is not None:
            noninterest_exp = noninterest_exp // 1000
        total_revenue = None
        if interest_income is not None and noninterest_income is not None:
            # Approximate: total revenue = interest income + noninterest income
            # (without subtracting interest expense, which isn't cleanly available)
            total_revenue = interest_income + noninterest_income

        # Derived: fee_income_ratio = fee_income / total_revenue
        fee_income_ratio = None
        if fee_income is not None and total_revenue and total_revenue > 0:
            fee_income_ratio = round(fee_income / total_revenue, 4)

        try:
            db.execute(
                """INSERT INTO institution_financials
                   (crawl_target_id, report_date, source,
                    total_assets, total_deposits, total_loans,
                    service_charge_income, other_noninterest_income,
                    net_interest_margin, efficiency_ratio,
                    roa, roe, tier1_capital_ratio,
                    branch_count, employee_count, member_count,
                    total_revenue, fee_income_ratio,
                    raw_json)
                   VALUES (?, ?, 'ncua',
                           ?, ?, ?,
                           ?, ?,
                           ?, ?,
                           ?, ?, ?,
                           ?, ?, ?,
                           ?, ?,
                           ?)
                   ON CONFLICT(crawl_target_id, report_date, source) DO UPDATE SET
                    total_assets = excluded.total_assets,
                    total_deposits = excluded.total_deposits,
                    total_loans = excluded.total_loans,
                    service_charge_income = excluded.service_charge_income,
                    other_noninterest_income = excluded.other_noninterest_income,
                    net_interest_margin = excluded.net_interest_margin,
                    efficiency_ratio = excluded.efficiency_ratio,
                    roa = excluded.roa,
                    roe = excluded.roe,
                    tier1_capital_ratio = excluded.tier1_capital_ratio,
                    branch_count = excluded.branch_count,
                    employee_count = excluded.employee_count,
                    member_count = excluded.member_count,
                    total_revenue = excluded.total_revenue,
                    fee_income_ratio = excluded.fee_income_ratio,
                    raw_json = excluded.raw_json""",
                (
                    target_id,
                    rec["report_date"],
                    total_assets,
                    total_deposits,
                    total_loans,
                    fee_income,         # service_charge_income = ACCT_131 Fee Income
                    noninterest_income,  # other_noninterest_income = ACCT_117
                    None,               # net_interest_margin (not directly in 5300)
                    None,               # efficiency_ratio (not directly in 5300)
                    roa,
                    None,               # ROE (not directly in 5300)
                    net_worth_pct,      # tier1_capital_ratio -> net worth ratio
                    branch_count,
                    None,               # employee_count (not in 5300)
                    member_count,
                    total_revenue,
                    fee_income_ratio,
                    json.dumps(rec.get("raw", {})),
                ),
            )
            total_upserted += 1
        except Exception as e:
            total_errors += 1
            if total_errors <= 5:
                print(f"  Error for CU {cu_num}: {e}")

    db.commit()
    print(f"\nNCUA financials complete: {total_upserted:,} upserted, {total_errors:,} errors")
    return total_upserted


def run(
    db: Database,
    config: Config,
    *,
    quarter: str | None = None,
    limit: int | None = None,
) -> None:
    """Entry point for the CLI command."""
    ingest_ncua_financials(db, config, quarter=quarter, limit=limit)

    count = db.fetchone(
        "SELECT COUNT(*) as cnt FROM institution_financials WHERE source = 'ncua'"
    )
    cnt = count["cnt"] if count else 0
    print(f"\nTotal NCUA financial records: {cnt:,}")
