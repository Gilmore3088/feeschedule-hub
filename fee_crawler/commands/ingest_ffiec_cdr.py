"""
Ingest overdraft/NSF revenue from FFIEC CDR bulk Call Report data.

Downloads quarterly bulk TSV from cdr.ffiec.gov, extracts RIADH032
(consumer overdraft/NSF service charges) per CERT, and updates
institution_financials.overdraft_revenue.

RIADH032 = consumer overdraft-related service charges (Schedule RI-E).
Only reported by banks with $1B+ assets. Smaller banks will have NULL.

Usage:
    python -m fee_crawler ingest-ffiec-cdr                    # Latest quarter
    python -m fee_crawler ingest-ffiec-cdr --backfill         # All 8 quarters
    python -m fee_crawler ingest-ffiec-cdr --quarter 20251231 # Specific quarter
"""

import csv
import io
import os
import time
import zipfile
from pathlib import Path

import requests

from fee_crawler.db import Database


# FFIEC CDR bulk download URL pattern.
# The TSV download contains all Call Report schedule RI-E fields.
CDR_BULK_URL = "https://cdr.ffiec.gov/Public/PWS/DownloadBulkData.aspx"

# Quarterly report dates matching FDIC convention (YYYYMMDD).
REPORT_DATES = [
    "20251231", "20250930", "20250630", "20250331",
    "20241231", "20240930", "20240630", "20240331",
]

# Map FFIEC quarter end dates to the CDR download period format.
# CDR uses "MM/DD/YYYY" in form submissions.
def _quarter_to_cdr_date(quarter: str) -> str:
    """Convert '20251231' to '12/31/2025'."""
    return f"{quarter[4:6]}/{quarter[6:8]}/{quarter[:4]}"


def _safe_int(val: str | None) -> int | None:
    """Parse a string to int, returning None on failure."""
    if not val or val.strip() == "":
        return None
    try:
        return int(float(val.strip()))
    except (ValueError, TypeError):
        return None


def download_ri_e_data(quarter: str, timeout: int = 60) -> list[dict]:
    """
    Download Call Report data from FFIEC CDR including RIADH032 (overdraft revenue).

    Uses "Four Periods" report type which includes income statement data (RIAD fields).
    The ZIP contains two files -- file 2 has RIAD columns including H032.
    Converts the year-based download into quarter-specific rows via Reporting Period End Date.

    Returns list of dicts with keys: idrssd, cert, riadh032, report_date.
    """
    # Four Periods uses year labels, not quarter dates
    year = quarter[:4]

    print(f"  Downloading FFIEC CDR Call Reports for {year} via Playwright...")

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("  Error: Playwright not installed. Run: pip install playwright && playwright install chromium")
        return []

    download_path = Path(f"/tmp/ffiec_cdr_{year}.zip")

    # Use cached download if available (avoid re-downloading same year)
    if download_path.exists() and download_path.stat().st_size > 1000:
        print(f"  Using cached download: {download_path}")
        content = download_path.read_bytes()
    else:
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                page.goto(CDR_BULK_URL, wait_until="networkidle", timeout=30000)

                # Select "Call Reports -- Balance Sheet, Income Statement, Past Due -- Four Periods"
                report_select = "select[name='ctl00$MainContentHolder$ListBox1']"
                page.select_option(report_select, value="ReportingSeriesSubsetSchedulesFourPeriods")
                page.wait_for_timeout(3000)  # ASP.NET postback to populate dates

                # Select the year
                date_select = "select[name='ctl00$MainContentHolder$DatesDropDownList']"
                page.select_option(date_select, label=year)
                page.wait_for_timeout(1000)

                # Click Download and wait for file
                with page.expect_download(timeout=300000) as download_info:
                    page.click("#Download_0")

                download = download_info.value
                download.save_as(download_path)
                browser.close()

                content = download_path.read_bytes()

        except Exception as e:
            print(f"  Warning: CDR download failed for {year}: {e}")
            return []

    # ZIP contains 2 data files + Readme. File 2 has RIAD (income statement) columns.
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            # Find file 2 (income statement)
            names = [n for n in zf.namelist() if "Readme" not in n]
            data_file = next((n for n in names if "(2 of 2)" in n), names[-1])
            raw = zf.read(data_file).decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  Warning: Failed to extract ZIP for {year}: {e}")
        return []

    # Convert quarter YYYYMMDD to YYYY-MM-DD for matching the Reporting Period End Date column
    target_date = f"{quarter[:4]}-{quarter[4:6]}-{quarter[6:8]}"

    # Parse TSV -- filter to matching quarter only (file has 4 quarters per year)
    rows = []
    reader = csv.DictReader(io.StringIO(raw), delimiter="\t")

    for row in reader:
        # Filter to the requested quarter
        repdte = row.get("Reporting Period End Date", "").strip()
        if repdte != target_date:
            continue

        cert = row.get("FDIC Certificate Number", "").strip()
        idrssd = row.get("IDRSSD", "").strip()

        if not cert and not idrssd:
            continue

        try:
            riadh032 = _safe_int(row.get("RIADH032", ""))
        except (ValueError, TypeError):
            riadh032 = None

        rows.append({
            "idrssd": idrssd,
            "cert": cert,
            "riadh032": riadh032,
            "report_date": quarter,
        })

    print(f"  Parsed {len(rows)} institutions for {quarter}")
    return rows


def update_overdraft_revenue(db: Database, rows: list[dict]) -> int:
    """
    Update institution_financials.overdraft_revenue from FFIEC CDR data.

    Matches on cert_number + report_date via crawl_targets JOIN.
    Returns count of rows updated.
    """
    updated = 0

    for row in rows:
        if row["riadh032"] is None:
            continue

        cert = row["cert"] or row["idrssd"]
        if not cert:
            continue

        # Convert report_date from YYYYMMDD to YYYY-MM-DD for DB matching
        rd = row["report_date"]
        report_date = f"{rd[:4]}-{rd[4:6]}-{rd[6:8]}"

        # RIADH032 is reported in thousands on Call Reports
        overdraft_thousands = row["riadh032"]

        try:
            from fee_crawler.db import PostgresDatabase
            if isinstance(db, PostgresDatabase):
                cursor = db.execute(
                    """UPDATE institution_financials
                       SET overdraft_revenue = %s
                       WHERE crawl_target_id = (
                           SELECT id FROM crawl_targets WHERE cert_number = %s LIMIT 1
                       )
                       AND report_date::text LIKE %s""",
                    (overdraft_thousands, cert, f"{report_date}%")
                )
            else:
                cursor = db.execute(
                    """UPDATE institution_financials
                       SET overdraft_revenue = ?
                       WHERE crawl_target_id = (
                           SELECT id FROM crawl_targets WHERE cert_number = ? LIMIT 1
                       )
                       AND report_date LIKE ?""",
                    (overdraft_thousands, cert, f"{report_date}%")
                )

            if cursor and cursor.rowcount and cursor.rowcount > 0:
                updated += 1
        except Exception:
            continue

    return updated


def run(db: "Database", args) -> None:
    """Main entry point for ingest-ffiec-cdr command."""

    # Ensure overdraft_revenue column exists
    _ensure_column(db)

    # Determine which quarters to process
    if args.quarter:
        quarters = [args.quarter]
    elif args.backfill:
        quarters = REPORT_DATES
    else:
        quarters = [REPORT_DATES[0]]  # Latest quarter only

    total_updated = 0

    for quarter in quarters:
        rows = download_ri_e_data(quarter)

        if not rows:
            print(f"  No data for {quarter}, skipping")
            continue

        count = update_overdraft_revenue(db, rows)
        db.commit()
        total_updated += count
        print(f"  Updated {count} institutions for {quarter}")

        # Rate limit between quarters
        if len(quarters) > 1:
            time.sleep(1)

    print(f"\nFFIEC CDR ingestion complete: {total_updated} total rows updated with overdraft revenue (RIADH032)")


def _ensure_column(db) -> None:
    """Add overdraft_revenue column if it doesn't exist."""
    from fee_crawler.db import PostgresDatabase
    try:
        if isinstance(db, PostgresDatabase):
            db.execute(
                "ALTER TABLE institution_financials ADD COLUMN IF NOT EXISTS overdraft_revenue BIGINT"
            )
        else:
            cols = db.fetchall("PRAGMA table_info(institution_financials)")
            col_names = [c["name"] for c in cols]
            if "overdraft_revenue" not in col_names:
                db.execute("ALTER TABLE institution_financials ADD COLUMN overdraft_revenue INTEGER")
    except Exception as e:
        print(f"  Warning: Could not add overdraft_revenue column: {e}")
