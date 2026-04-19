"""Ingest financial data from FDIC BankFind API into institution_financials."""

import json
import time

import requests

from fee_crawler.config import Config
from fee_crawler.db import Database

# FDIC API fields mapping to our schema.
# SC = service charges on deposit accounts (RIAD4080).
# NONII = total non-interest income.
FDIC_FINANCIAL_FIELDS = ",".join([
    "CERT",
    "REPDTE",
    "NAMEFULL",
    "ASSET",       # total assets (in thousands)
    "DEP",         # total deposits
    "LNLSNET",    # net loans and leases
    "SC",          # service charges on deposit accounts (RIAD4080)
    "NONII",      # total non-interest income
    "INTINC",     # total interest income
    "EINTEXP",    # total interest expense
    "NETINC",     # net income
    "NIMY",        # net interest margin yield
    "EEFFR",       # efficiency ratio
    "ROA",         # return on assets
    "ROE",         # return on equity
    "RBC1AAJ",     # tier 1 capital ratio
    "NUMEMP",      # number of employees
    "OFFDOM",      # domestic offices (branches)
])

# Default quarterly report dates (most recent 8 quarters for 2-year history).
REPORT_DATES = [
    "20251231", "20250930", "20250630", "20250331",
    "20241231", "20240930", "20240630", "20240331",
]


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
    quarters: int | None = None,
    limit: int | None = None,
) -> int:
    """Pull financial data from FDIC API for all FDIC-sourced institutions.

    Matches crawl_targets by cert_number. Uses INSERT ... ON CONFLICT DO UPDATE
    to safely upsert without destroying columns not in the INSERT list.

    Returns total rows upserted.
    """
    if report_date:
        dates = [report_date]
    elif quarters:
        dates = REPORT_DATES[:quarters]
    else:
        dates = REPORT_DATES
    base = f"{config.fdic_api.base_url}/financials"
    page_size = config.fdic_api.page_size
    total_upserted = 0
    total_skipped = 0

    # Build cert -> crawl_target_id lookup for banks.
    #
    # Matches by charter_type = 'bank' rather than source = 'fdic' so that any
    # bank-chartered row (regardless of how it was seeded) can be joined to
    # FDIC BankFind financial data by cert_number. FDIC CERT is the bank-only
    # namespace, disjoint from NCUA charter_number, so there is no risk of
    # cross-charter collisions.
    rows = db.fetchall(
        "SELECT id, cert_number FROM crawl_targets "
        "WHERE charter_type = 'bank' AND cert_number IS NOT NULL"
    )
    cert_map: dict[str, int] = {}
    for row in rows:
        cert = row["cert_number"]
        if cert:
            cert_map[cert] = row["id"]

    print(f"Found {len(cert_map):,} bank institutions in database")

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

                # SC (RIAD4080) is reported in whole dollars by the FDIC API,
                # while all other fields (ASSET, INTINC, etc.) are in thousands.
                # Convert SC to thousands to match.
                sc_raw = _safe_int(d.get("SC"))
                sc = sc_raw // 1000 if sc_raw is not None else None
                nonii = _safe_int(d.get("NONII"))
                intinc = _safe_int(d.get("INTINC"))
                eintexp = _safe_int(d.get("EINTEXP"))

                # Derived: total_revenue = net interest income + noninterest income
                total_revenue = None
                if intinc is not None and eintexp is not None and nonii is not None:
                    total_revenue = intinc - eintexp + nonii

                # Derived: fee_income_ratio = service charges / total revenue
                fee_income_ratio = None
                if sc is not None and total_revenue and total_revenue > 0:
                    fee_income_ratio = round(sc / total_revenue, 4)

                try:
                    db.execute(
                        """INSERT INTO institution_financials
                           (crawl_target_id, report_date, source,
                            total_assets, total_deposits, total_loans,
                            service_charge_income, other_noninterest_income,
                            net_interest_margin, efficiency_ratio,
                            roa, roe, tier1_capital_ratio,
                            branch_count, employee_count,
                            total_revenue, fee_income_ratio,
                            raw_json)
                           VALUES (?, ?, 'fdic',
                                   ?, ?, ?,
                                   ?, ?,
                                   ?, ?,
                                   ?, ?, ?,
                                   ?, ?,
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
                            total_revenue = excluded.total_revenue,
                            fee_income_ratio = excluded.fee_income_ratio,
                            raw_json = excluded.raw_json""",
                        (
                            target_id,
                            report_date_fmt,
                            _safe_int(d.get("ASSET")),
                            _safe_int(d.get("DEP")),
                            _safe_int(d.get("LNLSNET")),
                            sc,
                            nonii,
                            _safe_float(d.get("NIMY")),
                            _safe_float(d.get("EEFFR")),
                            _safe_float(d.get("ROA")),
                            _safe_float(d.get("ROE")),
                            _safe_float(d.get("RBC1AAJ")),
                            _safe_int(d.get("OFFDOM")),
                            _safe_int(d.get("NUMEMP")),
                            total_revenue,
                            fee_income_ratio,
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
    quarters: int | None = None,
    limit: int | None = None,
) -> None:
    """Entry point for the CLI command."""
    ingest_fdic_financials(
        db, config, report_date=report_date, quarters=quarters, limit=limit
    )

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
