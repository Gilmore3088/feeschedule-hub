"""Ingest financial data from FDIC BankFind API into institution_financials."""

import json
import time

import requests

from fee_crawler.config import Config
from fee_crawler.db import Database

# FDIC API fields mapping to our schema.
# NONII = total non-interest income (closest proxy for service charge income;
# the API does not expose RIAD4080 "service charges on deposit accounts" separately).
FDIC_FINANCIAL_FIELDS = ",".join([
    "CERT",
    "REPDTE",
    "NAMEFULL",
    "ASSET",       # total assets (in thousands)
    "DEP",         # total deposits
    "LNLSNET",    # net loans and leases
    "NONII",      # non-interest income (proxy for service charge income)
    "NIMY",        # net interest margin yield
    "EEFFR",       # efficiency ratio
    "ROA",         # return on assets
    "ROE",         # return on equity
    "RBC1AAJ",     # tier 1 capital ratio
    "NUMEMP",      # number of employees
    "OFFDOM",      # domestic offices (branches)
])

# Quarterly report dates to fetch (most recent 4 quarters).
REPORT_DATES = ["20240930", "20240630", "20240331", "20231231"]


def _safe_int(val: object) -> int | None:
    if val is None:
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def _safe_float(val: object) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def ingest_fdic_financials(
    db: Database,
    config: Config,
    *,
    report_date: str | None = None,
    limit: int | None = None,
) -> int:
    """Pull financial data from FDIC API for all FDIC-sourced institutions.

    Matches crawl_targets by cert_number. Uses INSERT OR REPLACE (UPSERT)
    on the UNIQUE(crawl_target_id, report_date, source) constraint.

    Returns total rows upserted.
    """
    dates = [report_date] if report_date else REPORT_DATES
    base = f"{config.fdic_api.base_url}/financials"
    page_size = config.fdic_api.page_size
    total_upserted = 0
    total_skipped = 0

    # Build cert -> crawl_target_id lookup
    rows = db.fetchall(
        "SELECT id, cert_number FROM crawl_targets WHERE source = 'fdic'"
    )
    cert_map: dict[str, int] = {}
    for row in rows:
        cert = row["cert_number"]
        if cert:
            cert_map[cert] = row["id"]

    print(f"Found {len(cert_map):,} FDIC institutions in database")

    for date in dates:
        print(f"\nFetching financials for report date {date}...")
        offset = 0
        date_upserted = 0

        while True:
            params = {
                "filters": f"REPDTE:{date}",
                "fields": FDIC_FINANCIAL_FIELDS,
                "limit": page_size,
                "offset": offset,
                "sort_by": "ASSET",
                "sort_order": "DESC",
            }

            resp = requests.get(base, params=params, timeout=30)
            resp.raise_for_status()
            payload = resp.json()

            records = payload.get("data", [])
            total_api = payload.get("meta", {}).get("total", 0)

            if not records:
                break

            for rec in records:
                if limit and date_upserted >= limit:
                    break

                d = rec.get("data", {})
                cert = str(d.get("CERT", ""))
                target_id = cert_map.get(cert)

                if not target_id:
                    total_skipped += 1
                    continue

                report_date_val = str(d.get("REPDTE", date))
                # Format as YYYY-MM-DD
                if len(report_date_val) == 8:
                    report_date_fmt = (
                        f"{report_date_val[:4]}-{report_date_val[4:6]}-{report_date_val[6:]}"
                    )
                else:
                    report_date_fmt = report_date_val

                try:
                    db.execute(
                        """INSERT OR REPLACE INTO institution_financials
                           (crawl_target_id, report_date, source,
                            total_assets, total_deposits, total_loans,
                            service_charge_income, other_noninterest_income,
                            net_interest_margin, efficiency_ratio,
                            roa, roe, tier1_capital_ratio,
                            branch_count, employee_count,
                            raw_json)
                           VALUES (?, ?, 'fdic',
                                   ?, ?, ?,
                                   ?, ?,
                                   ?, ?,
                                   ?, ?, ?,
                                   ?, ?,
                                   ?)""",
                        (
                            target_id,
                            report_date_fmt,
                            _safe_int(d.get("ASSET")),
                            _safe_int(d.get("DEP")),
                            _safe_int(d.get("LNLSNET")),
                            None,  # service_charge_income not available via API
                            _safe_int(d.get("NONII")),
                            _safe_float(d.get("NIMY")),
                            _safe_float(d.get("EEFFR")),
                            _safe_float(d.get("ROA")),
                            _safe_float(d.get("ROE")),
                            _safe_float(d.get("RBC1AAJ")),
                            _safe_int(d.get("OFFDOM")),
                            _safe_int(d.get("NUMEMP")),
                            json.dumps(d),
                        ),
                    )
                    date_upserted += 1
                except Exception as e:
                    print(f"  Error for CERT {cert}: {e}")
                    total_skipped += 1

            db.commit()
            offset += page_size

            fetched = min(offset, total_api)
            print(
                f"  {date}: {fetched:,}/{total_api:,} fetched | "
                f"{date_upserted:,} matched"
            )

            if limit and date_upserted >= limit:
                break

            if offset >= total_api:
                break

            time.sleep(0.3)

        total_upserted += date_upserted

    print(f"\nFDIC financials complete: {total_upserted:,} upserted, {total_skipped:,} skipped")
    return total_upserted


def run(
    db: Database,
    config: Config,
    report_date: str | None = None,
    limit: int | None = None,
) -> None:
    """Entry point for the CLI command."""
    ingest_fdic_financials(db, config, report_date=report_date, limit=limit)

    # Show summary
    count = db.fetchone("SELECT COUNT(*) as cnt FROM institution_financials WHERE source = 'fdic'")
    cnt = count["cnt"] if count else 0
    dates = db.fetchall(
        "SELECT report_date, COUNT(*) as cnt FROM institution_financials "
        "WHERE source = 'fdic' GROUP BY report_date ORDER BY report_date DESC"
    )
    print(f"\nTotal FDIC financial records: {cnt:,}")
    for d in dates:
        print(f"  {d['report_date']}: {d['cnt']:,} institutions")
