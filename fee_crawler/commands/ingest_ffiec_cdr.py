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

from fee_crawler.config import Config
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
    Download Schedule RI-E (service charge detail) from FFIEC CDR for a quarter.

    Returns list of dicts with keys: IDRSSD, CERT, RIADH032, REPDTE.
    """
    cdr_date = _quarter_to_cdr_date(quarter)

    # The CDR bulk download uses a POST form submission.
    # We request Schedule RI-E data specifically.
    params = {
        "DtASOf": cdr_date,
        "DtRptPrd": cdr_date,
        "RptType": "Call",
        "DtRptSbType": "RI-E",
        "RunRpt": "Download",
        "TabDelimited": "Y",
    }

    print(f"  Downloading FFIEC CDR RI-E for {quarter}...")

    try:
        resp = requests.post(CDR_BULK_URL, data=params, timeout=timeout)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  Warning: CDR download failed for {quarter}: {e}")
        return []

    content = resp.content

    # Response may be a ZIP file or raw TSV
    if content[:2] == b"PK":  # ZIP magic bytes
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                # Find the TSV/CSV file inside
                names = zf.namelist()
                data_file = next((n for n in names if n.endswith((".txt", ".csv", ".tsv"))), names[0])
                raw = zf.read(data_file).decode("utf-8", errors="replace")
        except Exception as e:
            print(f"  Warning: Failed to extract ZIP for {quarter}: {e}")
            return []
    else:
        raw = content.decode("utf-8", errors="replace")

    # Parse TSV
    rows = []
    reader = csv.DictReader(io.StringIO(raw), delimiter="\t")

    for row in reader:
        # FFIEC uses IDRSSD as primary key. We need CERT for matching to our DB.
        idrssd = row.get("IDRSSD", "").strip()
        cert = row.get("CERT", row.get("FDIC Certificate Number", "")).strip()
        riadh032 = row.get("RIADH032", row.get("H032", "")).strip()

        if not idrssd and not cert:
            continue

        rows.append({
            "idrssd": idrssd,
            "cert": cert,
            "riadh032": _safe_int(riadh032),
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
            if db.is_postgres:
                result = db.execute(
                    """UPDATE institution_financials
                       SET overdraft_revenue = %s
                       WHERE crawl_target_id = (
                           SELECT id FROM crawl_targets WHERE cert_number = %s LIMIT 1
                       )
                       AND report_date::text LIKE %s""",
                    (overdraft_thousands, cert, f"{report_date}%")
                )
            else:
                result = db.execute(
                    """UPDATE institution_financials
                       SET overdraft_revenue = ?
                       WHERE crawl_target_id = (
                           SELECT id FROM crawl_targets WHERE cert_number = ? LIMIT 1
                       )
                       AND report_date LIKE ?""",
                    (overdraft_thousands, cert, f"{report_date}%")
                )

            if result and result.rowcount and result.rowcount > 0:
                updated += 1
        except Exception as e:
            # Skip individual row errors
            continue

    return updated


def run(args) -> None:
    """Main entry point for ingest-ffiec-cdr command."""
    config = Config.load()
    db = Database(config)

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
        total_updated += count
        print(f"  Updated {count} institutions for {quarter}")

        # Rate limit between quarters
        if len(quarters) > 1:
            time.sleep(1)

    print(f"\nFFIEC CDR ingestion complete: {total_updated} total rows updated with overdraft revenue (RIADH032)")

    db.close()


def _ensure_column(db: Database) -> None:
    """Add overdraft_revenue column if it doesn't exist."""
    try:
        if db.is_postgres:
            db.execute(
                "ALTER TABLE institution_financials ADD COLUMN IF NOT EXISTS overdraft_revenue BIGINT"
            )
        else:
            # SQLite: check if column exists first
            cols = db.fetchall("PRAGMA table_info(institution_financials)")
            col_names = [c["name"] for c in cols]
            if "overdraft_revenue" not in col_names:
                db.execute("ALTER TABLE institution_financials ADD COLUMN overdraft_revenue INTEGER")
    except Exception as e:
        print(f"  Warning: Could not add overdraft_revenue column: {e}")
