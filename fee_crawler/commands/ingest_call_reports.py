"""Ingest fee-related revenue data from FFIEC Call Reports.

Fetches service charge income from the FFIEC CDR (Central Data Repository)
bulk download files. This data helps prioritize crawling: high-revenue
institutions with no extracted fees represent the biggest coverage gaps.

Data source: FFIEC CDR Bulk Data
  https://cdr.ffiec.gov/public/PWS/DownloadBulkData.aspx

Key Call Report fields:
  - RIAD4080: Total service charges on deposit accounts (income)
  - RIAD4079: Service charges on deposit accounts - domestic offices
  - RIAD4107: Other noninterest income

For NCUA Credit Unions, equivalent data comes from 5300 Call Reports:
  - Acct_661: Fee income
  - Acct_131: Service charges, commissions, and fees
"""

from __future__ import annotations

import csv
import io
import time
from pathlib import Path

import requests

from fee_crawler.config import Config
from fee_crawler.db import Database

# FFIEC CDR Bulk Data download URL template
# Format: Schedule RC-I (Income Statement), reporting period MMDDYYYY
_FFIEC_BULK_URL = "https://cdr.ffiec.gov/public/PWS/DownloadBulkData.aspx"

# NCUA 5300 Call Report quarterly data
_NCUA_5300_URL = "https://ncua.gov/files/publications/analysis/call-report-data-{year}-{quarter}.zip"

# Service charge MDRM codes from Call Reports
_SERVICE_CHARGE_CODES = {
    "RIAD4080",  # Total service charges on deposit accounts
    "RIAD4079",  # Service charges - domestic offices
    "RIAD4107",  # Other noninterest income
}


def _ingest_from_csv(
    db: Database,
    csv_path: str,
    report_date: str,
    source: str = "ffiec",
) -> dict:
    """Parse a Call Report CSV and store service charge income.

    Expected CSV columns: IDRSSD (or CU_NUMBER), RIAD4080, RIAD4107, etc.

    Returns stats dict.
    """
    stats = {"matched": 0, "updated": 0, "skipped": 0, "errors": 0}

    path = Path(csv_path)
    if not path.exists():
        print(f"File not found: {csv_path}")
        return stats

    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)

        # Normalize header names (FFIEC uses mixed case)
        if reader.fieldnames:
            reader.fieldnames = [h.strip().upper() for h in reader.fieldnames]

        for row in reader:
            # Identify institution by FDIC cert or NCUA charter
            cert = row.get("IDRSSD") or row.get("CERT") or row.get("CU_NUMBER")
            if not cert:
                stats["skipped"] += 1
                continue

            cert = str(cert).strip()
            if not cert:
                stats["skipped"] += 1
                continue

            # Find matching institution in our database
            target = db.fetchone(
                "SELECT id FROM crawl_targets WHERE cert_number = ?",
                (cert,),
            )
            if not target:
                stats["skipped"] += 1
                continue

            stats["matched"] += 1
            target_id = target["id"]

            # Extract service charge income (in thousands for FDIC, whole dollars for NCUA)
            service_charges = _parse_amount(row.get("RIAD4080") or row.get("ACCT_661") or row.get("ACCT_131"))
            other_noninterest = _parse_amount(row.get("RIAD4107"))

            if service_charges is None and other_noninterest is None:
                stats["skipped"] += 1
                continue

            # Upsert into institution_financials
            try:
                db.execute(
                    """INSERT INTO institution_financials
                       (crawl_target_id, report_date, source,
                        service_charge_income, other_noninterest_income)
                       VALUES (?, ?, ?, ?, ?)
                       ON CONFLICT(crawl_target_id, report_date, source) DO UPDATE SET
                         service_charge_income = excluded.service_charge_income,
                         other_noninterest_income = excluded.other_noninterest_income,
                         fetched_at = datetime('now')""",
                    (target_id, report_date, source,
                     service_charges, other_noninterest),
                )
                stats["updated"] += 1
            except Exception as e:
                stats["errors"] += 1
                if stats["errors"] <= 5:
                    print(f"  Error for cert {cert}: {e}")

    db.commit()
    return stats


def _parse_amount(value: str | None) -> int | None:
    """Parse a numeric string to integer, handling commas and empty values."""
    if not value or not value.strip():
        return None
    try:
        cleaned = value.strip().replace(",", "").replace('"', "")
        if cleaned in ("", "0", "N/A", "n/a"):
            return 0
        return int(float(cleaned))
    except (ValueError, TypeError):
        return None


def run(
    db: Database,
    config: Config,
    *,
    csv_path: str | None = None,
    report_date: str | None = None,
    source: str = "ffiec",
    show_gaps: bool = False,
) -> None:
    """Ingest Call Report service charge revenue data.

    Args:
        db: Database connection.
        config: Application config.
        csv_path: Path to bulk CSV file. If None, shows gap analysis only.
        report_date: Reporting period (e.g., "2024-12-31"). Required with csv_path.
        source: Data source identifier ("ffiec" or "ncua_5300").
        show_gaps: Show high-revenue institutions with no extracted fees.
    """
    if csv_path and report_date:
        print(f"Ingesting Call Report data from {csv_path}")
        print(f"  Report date: {report_date}")
        print(f"  Source: {source}")
        print()

        stats = _ingest_from_csv(db, csv_path, report_date, source)

        print(f"\nIngestion complete:")
        print(f"  Matched:  {stats['matched']:,}")
        print(f"  Updated:  {stats['updated']:,}")
        print(f"  Skipped:  {stats['skipped']:,}")
        print(f"  Errors:   {stats['errors']:,}")

    if show_gaps or not csv_path:
        _show_coverage_gaps(db)


def _show_coverage_gaps(db: Database) -> None:
    """Show high-revenue institutions that lack extracted fee data."""
    print("\n--- Coverage Gap Analysis (by Service Charge Revenue) ---\n")

    # Institutions with financial data but no extracted fees
    gaps = db.fetchall(
        """SELECT
            t.id, t.institution_name, t.state_code, t.charter_type,
            t.asset_size, t.fee_schedule_url,
            f.service_charge_income, f.report_date
        FROM institution_financials f
        JOIN crawl_targets t ON t.id = f.crawl_target_id
        LEFT JOIN extracted_fees e ON e.crawl_target_id = t.id
        WHERE f.service_charge_income > 0
          AND e.id IS NULL
        ORDER BY f.service_charge_income DESC
        LIMIT 50"""
    )

    if not gaps:
        # Check if we have any financial data at all
        fin_count = db.fetchone(
            "SELECT COUNT(*) as cnt FROM institution_financials WHERE service_charge_income > 0"
        )
        cnt = fin_count["cnt"] if fin_count else 0
        if cnt == 0:
            print("No service charge revenue data available.")
            print("Ingest Call Report data first:")
            print("  python -m fee_crawler ingest-call-reports --csv /path/to/data.csv --report-date 2024-12-31")
        else:
            print("All institutions with revenue data have extracted fees.")
        return

    print(f"Top {len(gaps)} high-revenue institutions WITHOUT extracted fees:\n")
    print(f"{'Rank':>4s}  {'Institution':45s}  {'St':2s}  {'Type':5s}  {'Revenue ($K)':>12s}  {'Has URL':>7s}")
    print("-" * 85)

    for i, row in enumerate(gaps, 1):
        name = row["institution_name"][:45]
        state = row["state_code"] or "??"
        charter = "CU" if row["charter_type"] == "credit_union" else "Bank"
        revenue = row["service_charge_income"]
        has_url = "Yes" if row["fee_schedule_url"] else "No"
        revenue_str = f"${revenue:,.0f}" if revenue else "N/A"
        print(f"{i:4d}  {name:45s}  {state:2s}  {charter:5s}  {revenue_str:>12s}  {has_url:>7s}")

    # Summary stats
    total_with_revenue = db.fetchone(
        "SELECT COUNT(*) as cnt FROM institution_financials WHERE service_charge_income > 0"
    )
    total_with_fees = db.fetchone(
        """SELECT COUNT(DISTINCT f.crawl_target_id) as cnt
           FROM institution_financials f
           JOIN extracted_fees e ON e.crawl_target_id = f.crawl_target_id
           WHERE f.service_charge_income > 0"""
    )
    rev_total = total_with_revenue["cnt"] if total_with_revenue else 0
    fee_total = total_with_fees["cnt"] if total_with_fees else 0
    pct = fee_total / rev_total * 100 if rev_total > 0 else 0

    print(f"\nInstitutions with revenue data: {rev_total:,}")
    print(f"  With extracted fees: {fee_total:,} ({pct:.0f}%)")
    print(f"  Missing fees:       {rev_total - fee_total:,}")
