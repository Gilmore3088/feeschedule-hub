"""Ingest financial data from NCUA 5300 Call Reports into institution_financials.

Downloads quarterly ZIP files from NCUA containing FS220.txt (balance sheet)
and FS220A.txt (income statement), joins on CU_NUMBER, and upserts into Postgres.

Matched credit unions get linked via crawl_target_id; unmatched credit unions
are stored with crawl_target_id=NULL and source_cert_number for later matching.

Historical backfill: --backfill --from-year 2010 downloads all quarterly ZIPs.
"""

from __future__ import annotations

import csv
import io
import json
import os
import time
import zipfile
from datetime import datetime

import psycopg2
import psycopg2.extras
import requests

# NCUA bulk data URL -- quarterly ZIP of CSV files.
NCUA_ZIP_BASE = "https://ncua.gov/files/publications/analysis/call-report-data-{year}-{month:02d}.zip"

# Default to most recent available quarter.
NCUA_DEFAULT_YEAR = 2025
NCUA_DEFAULT_MONTH = 12

MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2

# FS220.txt field mapping (balance sheet + summary)
FS220_FIELDS = {
    "ACCT_010": "total_assets",
    "ACCT_018": "total_deposits",
    "ACCT_025B": "total_loans",
    "ACCT_083": "member_count",
    "ACCT_602": "net_income",
    "ACCT_671": "noninterest_expense",
}

# FS220A.txt field mapping (income statement + ratios)
FS220A_FIELDS = {
    "ACCT_115": "interest_income",
    "ACCT_117": "noninterest_income",
    "ACCT_131": "fee_income",
    "Acct_997": "net_worth",
    "Acct_998": "net_worth_ratio",
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


def _retry_download(url: str, timeout: int = 120) -> bytes:
    """Download with retry logic: 3 attempts, exponential backoff (2s, 4s, 8s)."""
    session = requests.Session()
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = session.get(url, timeout=timeout, stream=True)
            resp.raise_for_status()
            content_length = int(resp.headers.get("content-length", 0))
            max_size = 500 * 1024 * 1024  # 500MB guard
            if content_length > max_size:
                raise ValueError(f"NCUA ZIP too large: {content_length:,} bytes")
            data = resp.content
            if len(data) > max_size:
                raise ValueError(f"NCUA ZIP too large: {len(data):,} bytes")
            return data
        except (requests.RequestException, OSError, ValueError) as e:
            last_err = e
            if attempt < MAX_RETRIES - 1:
                wait = RETRY_BACKOFF_BASE ** (attempt + 1)
                print(f"  Retry {attempt + 1}/{MAX_RETRIES} after {wait}s: {e}")
                time.sleep(wait)
    raise last_err  # type: ignore[misc]


def _build_cu_map(cur) -> dict[str, int]:
    """Build charter_number -> crawl_target_id lookup for credit unions.

    Matches by charter_type = 'credit_union' rather than source = 'ncua' so that
    CU rows seeded from any source (NCUA bulk, manual imports, etc.) are joined
    to NCUA 5300 financial data by cert_number. The cert_number namespace for
    credit unions is distinct from FDIC CERT, so no cross-charter collisions.
    """
    cur.execute(
        "SELECT id, cert_number FROM crawl_targets "
        "WHERE charter_type = 'credit_union' AND cert_number IS NOT NULL"
    )
    cu_map: dict[str, int] = {}
    for row in cur:
        cert = row["cert_number"]
        if cert:
            cu_map[str(cert)] = row["id"]
    return cu_map


def _parse_zip(zf: zipfile.ZipFile, cu_map: dict[str, int]) -> tuple[dict, dict]:
    """Parse FS220 + FS220A + branch data from the ZIP.

    Returns (financials dict keyed by cu_num, branch_counts dict).
    financials values include all parsed fields plus 'matched_target_id' if matched.
    """
    # Phase 1: Parse FS220.txt (balance sheet data)
    print("  Parsing FS220.txt (balance sheet)...")
    fs220_raw = zf.read("FS220.txt").decode("utf-8", errors="replace")
    fs220_reader = csv.DictReader(io.StringIO(fs220_raw))

    financials: dict[str, dict] = {}
    for row in fs220_reader:
        cu_num = row.get("CU_NUMBER", "").strip()
        if not cu_num:
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
    branch_counts: dict[str, int] = {}
    try:
        branch_raw = zf.read("Credit Union Branch Information.txt").decode("utf-8", errors="replace")
        branch_reader = csv.DictReader(io.StringIO(branch_raw))
        for row in branch_reader:
            cu_num = row.get("CU_NUMBER", "").strip()
            if cu_num in financials:
                branch_counts[cu_num] = branch_counts.get(cu_num, 0) + 1
    except KeyError:
        print("  Branch file not found in ZIP, skipping branch counts")

    return financials, branch_counts


def _upsert_financials(cur, financials: dict, branch_counts: dict,
                       cu_map: dict[str, int], limit: int | None = None) -> dict:
    """Upsert parsed financial data into institution_financials.

    Returns stats dict with matched, unmatched, errors counts.
    """
    stats = {"matched": 0, "unmatched": 0, "errors": 0}

    for cu_num, rec in financials.items():
        if limit and (stats["matched"] + stats["unmatched"]) >= limit:
            break

        target_id = cu_map.get(cu_num)
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

        # Derived: total_revenue = interest income + noninterest income
        total_revenue = None
        if interest_income is not None and noninterest_income is not None:
            total_revenue = interest_income + noninterest_income

        # Derived: fee_income_ratio = fee_income / total_revenue
        fee_income_ratio = None
        if fee_income is not None and total_revenue and total_revenue > 0:
            fee_income_ratio = round(fee_income / total_revenue, 4)

        values = (
            total_assets, total_deposits, total_loans,
            fee_income, noninterest_income,
            None, None,  # net_interest_margin, efficiency_ratio
            roa, None, net_worth_pct,  # roa, roe, tier1_capital_ratio
            branch_count, None, member_count,  # branch, employee, member
            total_revenue, fee_income_ratio,
            json.dumps(rec.get("raw", {})),
        )

        try:
            if target_id is not None:
                cur.execute(
                    """INSERT INTO institution_financials
                       (crawl_target_id, source_cert_number, report_date, source,
                        total_assets, total_deposits, total_loans,
                        service_charge_income, other_noninterest_income,
                        net_interest_margin, efficiency_ratio,
                        roa, roe, tier1_capital_ratio,
                        branch_count, employee_count, member_count,
                        total_revenue, fee_income_ratio,
                        raw_json)
                       VALUES (%s, %s, %s, 'ncua',
                               %s, %s, %s,
                               %s, %s,
                               %s, %s,
                               %s, %s, %s,
                               %s, %s, %s,
                               %s, %s,
                               %s)
                       ON CONFLICT (crawl_target_id, report_date, source)
                         DO UPDATE SET
                         total_assets = EXCLUDED.total_assets,
                         total_deposits = EXCLUDED.total_deposits,
                         total_loans = EXCLUDED.total_loans,
                         service_charge_income = EXCLUDED.service_charge_income,
                         other_noninterest_income = EXCLUDED.other_noninterest_income,
                         net_interest_margin = EXCLUDED.net_interest_margin,
                         efficiency_ratio = EXCLUDED.efficiency_ratio,
                         roa = EXCLUDED.roa,
                         roe = EXCLUDED.roe,
                         tier1_capital_ratio = EXCLUDED.tier1_capital_ratio,
                         branch_count = EXCLUDED.branch_count,
                         employee_count = EXCLUDED.employee_count,
                         member_count = EXCLUDED.member_count,
                         total_revenue = EXCLUDED.total_revenue,
                         fee_income_ratio = EXCLUDED.fee_income_ratio,
                         raw_json = EXCLUDED.raw_json,
                         fetched_at = NOW()""",
                    (target_id, cu_num, rec["report_date"], *values),
                )
                stats["matched"] += 1
            else:
                cur.execute(
                    """INSERT INTO institution_financials
                       (crawl_target_id, source_cert_number, report_date, source,
                        total_assets, total_deposits, total_loans,
                        service_charge_income, other_noninterest_income,
                        net_interest_margin, efficiency_ratio,
                        roa, roe, tier1_capital_ratio,
                        branch_count, employee_count, member_count,
                        total_revenue, fee_income_ratio,
                        raw_json)
                       VALUES (NULL, %s, %s, 'ncua',
                               %s, %s, %s,
                               %s, %s,
                               %s, %s,
                               %s, %s, %s,
                               %s, %s, %s,
                               %s, %s,
                               %s)
                       ON CONFLICT (source_cert_number, report_date, source)
                         WHERE crawl_target_id IS NULL
                         DO UPDATE SET
                         total_assets = EXCLUDED.total_assets,
                         total_deposits = EXCLUDED.total_deposits,
                         total_loans = EXCLUDED.total_loans,
                         service_charge_income = EXCLUDED.service_charge_income,
                         other_noninterest_income = EXCLUDED.other_noninterest_income,
                         net_interest_margin = EXCLUDED.net_interest_margin,
                         efficiency_ratio = EXCLUDED.efficiency_ratio,
                         roa = EXCLUDED.roa,
                         roe = EXCLUDED.roe,
                         tier1_capital_ratio = EXCLUDED.tier1_capital_ratio,
                         branch_count = EXCLUDED.branch_count,
                         employee_count = EXCLUDED.employee_count,
                         member_count = EXCLUDED.member_count,
                         total_revenue = EXCLUDED.total_revenue,
                         fee_income_ratio = EXCLUDED.fee_income_ratio,
                         raw_json = EXCLUDED.raw_json,
                         fetched_at = NOW()""",
                    (cu_num, rec["report_date"], *values),
                )
                stats["unmatched"] += 1
        except Exception as e:
            stats["errors"] += 1
            if stats["errors"] <= 5:
                print(f"  Error for CU {cu_num}: {e}")

    return stats


def _iter_ncua_quarters(from_year: int) -> list[tuple[int, int]]:
    """Generate (year, month) tuples for NCUA quarterly data."""
    now = datetime.now()
    quarters = []
    for year in range(from_year, now.year + 1):
        for month in (3, 6, 9, 12):
            if year == now.year and month > now.month:
                break
            quarters.append((year, month))
    return quarters


def ingest_ncua_financials(
    *,
    quarter: str | None = None,
    limit: int | None = None,
    backfill: bool = False,
    from_year: int = 2010,
) -> int:
    """Download NCUA 5300 Call Report ZIP(s) and ingest financial data.

    Returns total rows upserted.
    """
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        cu_map = _build_cu_map(cur)
        print(f"Found {len(cu_map):,} NCUA credit unions in crawl_targets")

        if backfill:
            quarters_list = _iter_ncua_quarters(from_year)
            print(f"Backfill mode: {len(quarters_list)} quarters from {from_year} to present")
        elif quarter:
            parts = quarter.split("-")
            quarters_list = [(int(parts[0]), int(parts[1]))]
        else:
            quarters_list = [(NCUA_DEFAULT_YEAR, NCUA_DEFAULT_MONTH)]

        total_matched = 0
        total_unmatched = 0
        total_errors = 0
        quarters_processed = 0

        for q_year, q_month in quarters_list:
            zip_url = NCUA_ZIP_BASE.format(year=q_year, month=q_month)
            print(f"\nDownloading NCUA {q_year}-{q_month:02d} ({zip_url})...")

            try:
                data = _retry_download(zip_url)
            except Exception as e:
                print(f"  Failed to download {q_year}-{q_month:02d}: {e}")
                total_errors += 1
                continue

            try:
                zf = zipfile.ZipFile(io.BytesIO(data))
                financials, branch_counts = _parse_zip(zf, cu_map)

                print("  Upserting into institution_financials...")
                stats = _upsert_financials(cur, financials, branch_counts, cu_map, limit)
                conn.commit()

                total_matched += stats["matched"]
                total_unmatched += stats["unmatched"]
                total_errors += stats["errors"]
                quarters_processed += 1

                print(
                    f"  {q_year}-{q_month:02d}: {stats['matched']:,} matched, "
                    f"{stats['unmatched']:,} unmatched, {stats['errors']:,} errors"
                )
            except Exception as e:
                print(f"  Quarter {q_year}-{q_month:02d} failed: {e}")
                conn.rollback()
                total_errors += 1

        print(f"\n{'='*60}")
        print(f"NCUA 5300 Ingestion Summary")
        print(f"{'='*60}")
        print(f"  Quarters processed:  {quarters_processed}")
        print(f"  Rows matched:        {total_matched:,}")
        print(f"  Rows unmatched:      {total_unmatched:,}")
        print(f"  Total upserted:      {total_matched + total_unmatched:,}")
        print(f"  Errors:              {total_errors:,}")

        return total_matched + total_unmatched

    finally:
        cur.close()
        conn.close()


def run(
    *,
    quarter: str | None = None,
    limit: int | None = None,
    backfill: bool = False,
    from_year: int = 2010,
) -> None:
    """Entry point for the CLI command."""
    ingest_ncua_financials(
        quarter=quarter, limit=limit,
        backfill=backfill, from_year=from_year,
    )
