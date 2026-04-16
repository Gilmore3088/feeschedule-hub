"""Ingest fee-related revenue data from FFIEC Call Reports via FDIC BankFind API.

Fetches service charge income and financial data for ALL FDIC-insured banks.
Matched institutions get linked via crawl_target_id; unmatched institutions
are stored with crawl_target_id=NULL and source_cert_number for later matching.

Data source: FDIC BankFind Suite API (banks.data.fdic.gov)
  - Provides Call Report equivalent fields (SC=RIAD4080, NONII, INTINC, etc.)
  - REST API with pagination, no authentication required

Historical backfill: --backfill --from-year 2010 downloads quarterly data
from 2010 to present (~60 quarters x ~5K institutions = ~300K rows).
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime

import psycopg2
import psycopg2.extras
import requests

from fee_crawler.db import require_postgres

# FDIC BankFind API fields (same as ingest_fdic.py)
FDIC_FINANCIAL_FIELDS = ",".join([
    "CERT",
    "REPDTE",
    "NAMEFULL",
    "STNAME",
    "ASSET",
    "DEP",
    "LNLSNET",
    "SC",
    "NONII",
    "INTINC",
    "EINTEXP",
    "NETINC",
    "NIMY",
    "EEFFR",
    "ROA",
    "ROE",
    "RBC1AAJ",
    "NUMEMP",
    "OFFDOM",
])

FDIC_API_BASE = "https://banks.data.fdic.gov/api/financials"
PAGE_SIZE = 10000
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2


def _scale_thousands(value: int | None) -> int | None:
    """Multiply a thousands-denominated FDIC field up to whole dollars."""
    return value * 1000 if value is not None else None


def _apply_ffiec_scaling(
    source: str,
    sc: int | None,
    oni: int | None,
) -> tuple[int | None, int | None]:
    """Scale FDIC BankFind income fields from thousands to whole dollars.

    FDIC BankFind and FFIEC Call Report endpoints return income values in
    thousands (migration 023). NCUA 5300 and other sources already report
    whole dollars. Only source == 'ffiec' is multiplied.
    """
    if source != "ffiec":
        return sc, oni
    return (
        sc * 1000 if sc is not None else None,
        oni * 1000 if oni is not None else None,
    )


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


def _format_report_date(raw: str) -> str:
    """Convert YYYYMMDD to YYYY-MM-DD."""
    if len(raw) == 8:
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:]}"
    return raw


def _retry_get(url: str, params: dict, timeout: int = 60) -> requests.Response:
    """GET with retry logic: 3 attempts, exponential backoff (2s, 4s, 8s)."""
    session = requests.Session()
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = session.get(url, params=params, timeout=timeout)
            resp.raise_for_status()
            return resp
        except (requests.RequestException, OSError) as e:
            last_err = e
            if attempt < MAX_RETRIES - 1:
                wait = RETRY_BACKOFF_BASE ** (attempt + 1)
                print(f"  Retry {attempt + 1}/{MAX_RETRIES} after {wait}s: {e}")
                time.sleep(wait)
    raise last_err  # type: ignore[misc]


def _build_cert_map(cur) -> dict[str, int]:
    """Build cert_number -> crawl_target_id lookup for FDIC banks."""
    cur.execute(
        "SELECT id, cert_number FROM crawl_targets WHERE source = 'fdic'"
    )
    cert_map: dict[str, int] = {}
    for row in cur:
        cert = row["cert_number"]
        if cert:
            cert_map[str(cert)] = row["id"]
    return cert_map


def _build_name_map(cur) -> dict[tuple[str, str], int]:
    """Build (lower_name, state) -> crawl_target_id for fuzzy matching."""
    cur.execute(
        "SELECT id, institution_name, state_code FROM crawl_targets "
        "WHERE source = 'fdic' AND institution_name IS NOT NULL AND state_code IS NOT NULL"
    )
    name_map: dict[tuple[str, str], int] = {}
    for row in cur:
        key = (row["institution_name"].lower(), row["state_code"].upper())
        name_map[key] = row["id"]
    return name_map


def _iter_quarters(from_year: int) -> list[str]:
    """Generate YYYYMMDD report dates for each quarter from from_year to now."""
    now = datetime.now()
    dates = []
    for year in range(from_year, now.year + 1):
        for month_end, day in [(3, 31), (6, 30), (9, 30), (12, 31)]:
            if year == now.year and month_end > now.month:
                break
            dates.append(f"{year}{month_end:02d}{day:02d}")
    return dates


def _upsert_matched(cur, target_id: int, cert: str, report_date: str,
                    data: dict, sc: int | None, nonii: int | None,
                    total_revenue: int | None, fee_income_ratio: float | None) -> None:
    """Upsert a row with a known crawl_target_id."""
    cur.execute(
        """INSERT INTO institution_financials
           (crawl_target_id, source_cert_number, report_date, source,
            total_assets, total_deposits, total_loans,
            service_charge_income, other_noninterest_income,
            net_interest_margin, efficiency_ratio,
            roa, roe, tier1_capital_ratio,
            branch_count, employee_count,
            total_revenue, fee_income_ratio,
            raw_json)
           VALUES (%s, %s, %s, 'ffiec',
                   %s, %s, %s,
                   %s, %s,
                   %s, %s,
                   %s, %s, %s,
                   %s, %s,
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
             total_revenue = EXCLUDED.total_revenue,
             fee_income_ratio = EXCLUDED.fee_income_ratio,
             raw_json = EXCLUDED.raw_json,
             fetched_at = NOW()""",
        (
            target_id, cert, report_date,
            # ASSET/DEP/LNLSNET arrive in thousands; store as whole dollars
            # so all balance-sheet and income fields share the same unit.
            _scale_thousands(_safe_int(data.get("ASSET"))),
            _scale_thousands(_safe_int(data.get("DEP"))),
            _scale_thousands(_safe_int(data.get("LNLSNET"))),
            sc, nonii,
            _safe_float(data.get("NIMY")),
            _safe_float(data.get("EEFFR")),
            _safe_float(data.get("ROA")),
            _safe_float(data.get("ROE")),
            _safe_float(data.get("RBC1AAJ")),
            _safe_int(data.get("OFFDOM")),
            _safe_int(data.get("NUMEMP")),
            total_revenue, fee_income_ratio,
            json.dumps(data),
        ),
    )


def _upsert_unmatched(cur, cert: str, report_date: str,
                      data: dict, sc: int | None, nonii: int | None,
                      total_revenue: int | None, fee_income_ratio: float | None) -> None:
    """Upsert a row with crawl_target_id IS NULL using source_cert_number for dedup."""
    cur.execute(
        """INSERT INTO institution_financials
           (crawl_target_id, source_cert_number, report_date, source,
            total_assets, total_deposits, total_loans,
            service_charge_income, other_noninterest_income,
            net_interest_margin, efficiency_ratio,
            roa, roe, tier1_capital_ratio,
            branch_count, employee_count,
            total_revenue, fee_income_ratio,
            raw_json)
           VALUES (NULL, %s, %s, 'ffiec',
                   %s, %s, %s,
                   %s, %s,
                   %s, %s,
                   %s, %s, %s,
                   %s, %s,
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
             total_revenue = EXCLUDED.total_revenue,
             fee_income_ratio = EXCLUDED.fee_income_ratio,
             raw_json = EXCLUDED.raw_json,
             fetched_at = NOW()""",
        (
            cert, report_date,
            # ASSET/DEP/LNLSNET arrive in thousands; store as whole dollars.
            _scale_thousands(_safe_int(data.get("ASSET"))),
            _scale_thousands(_safe_int(data.get("DEP"))),
            _scale_thousands(_safe_int(data.get("LNLSNET"))),
            sc, nonii,
            _safe_float(data.get("NIMY")),
            _safe_float(data.get("EEFFR")),
            _safe_float(data.get("ROA")),
            _safe_float(data.get("ROE")),
            _safe_float(data.get("RBC1AAJ")),
            _safe_int(data.get("OFFDOM")),
            _safe_int(data.get("NUMEMP")),
            total_revenue, fee_income_ratio,
            json.dumps(data),
        ),
    )


def _ingest_quarter(cur, report_date_yyyymmdd: str,
                    cert_map: dict[str, int],
                    name_map: dict[tuple[str, str], int]) -> dict:
    """Fetch and upsert one quarter of FDIC financial data.

    Returns stats dict with matched, unmatched, errors counts.
    """
    stats = {"matched": 0, "unmatched": 0, "errors": 0, "total_api": 0}
    report_date = _format_report_date(report_date_yyyymmdd)
    offset = 0

    while True:
        params = {
            "filters": f"REPDTE:{report_date_yyyymmdd}",
            "fields": FDIC_FINANCIAL_FIELDS,
            "limit": PAGE_SIZE,
            "offset": offset,
            "sort_by": "ASSET",
            "sort_order": "DESC",
        }

        try:
            resp = _retry_get(FDIC_API_BASE, params)
        except Exception as e:
            print(f"  Failed to fetch page at offset {offset}: {e}")
            stats["errors"] += 1
            break

        payload = resp.json()
        records = payload.get("data", [])
        stats["total_api"] = payload.get("meta", {}).get("total", 0)

        if not records:
            break

        for rec in records:
            d = rec.get("data", {})
            cert = str(d.get("CERT", "")).strip()
            if not cert:
                continue

            # FDIC BankFind returns income fields in thousands. Multiply up to
            # whole dollars via _apply_ffiec_scaling so storage is consistent
            # with migration 023 and test_call_report_scaling.
            sc_raw = _safe_int(d.get("SC"))
            nonii_raw = _safe_int(d.get("NONII"))
            sc, nonii = _apply_ffiec_scaling("ffiec", sc_raw, nonii_raw)
            intinc_raw = _safe_int(d.get("INTINC"))
            eintexp_raw = _safe_int(d.get("EINTEXP"))
            intinc = intinc_raw * 1000 if intinc_raw is not None else None
            eintexp = eintexp_raw * 1000 if eintexp_raw is not None else None

            # Derived: total_revenue = net interest income + noninterest income
            total_revenue = None
            if intinc is not None and eintexp is not None and nonii is not None:
                total_revenue = intinc - eintexp + nonii

            # Derived: fee_income_ratio = service charges / total revenue
            fee_income_ratio = None
            if sc is not None and total_revenue and total_revenue > 0:
                fee_income_ratio = round(sc / total_revenue, 4)

            # Match by cert_number first (D-09)
            target_id = cert_map.get(cert)

            # Fuzzy fallback: name + state (D-09)
            if target_id is None:
                name = (d.get("NAMEFULL") or "").strip().lower()
                state = (d.get("STNAME") or "").strip().upper()
                if name and state:
                    target_id = name_map.get((name, state))

            try:
                if target_id is not None:
                    _upsert_matched(cur, target_id, cert, report_date,
                                    d, sc, nonii, total_revenue, fee_income_ratio)
                    stats["matched"] += 1
                else:
                    _upsert_unmatched(cur, cert, report_date,
                                      d, sc, nonii, total_revenue, fee_income_ratio)
                    stats["unmatched"] += 1
            except Exception as e:
                stats["errors"] += 1
                if stats["errors"] <= 5:
                    print(f"  Error for CERT {cert}: {e}")

        offset += PAGE_SIZE
        fetched = min(offset, stats["total_api"])
        print(
            f"  {report_date_yyyymmdd}: {fetched:,}/{stats['total_api']:,} fetched | "
            f"{stats['matched']:,} matched, {stats['unmatched']:,} unmatched"
        )

        if offset >= stats["total_api"]:
            break

        time.sleep(0.3)

    return stats


def run(
    *,
    backfill: bool = False,
    from_year: int = 2010,
) -> None:
    """Ingest FFIEC Call Report data from FDIC BankFind API into Postgres.

    Args:
        backfill: If True, download all quarters from from_year to present.
        from_year: Starting year for backfill (default 2010).
    """
    require_postgres("ingest_call_reports writes to institution_financials")
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        cert_map = _build_cert_map(cur)
        name_map = _build_name_map(cur)
        print(f"Found {len(cert_map):,} FDIC banks in crawl_targets")

        if backfill:
            dates = _iter_quarters(from_year)
            print(f"Backfill mode: {len(dates)} quarters from {from_year} to present")
        else:
            # Default: latest 4 quarters
            now = datetime.now()
            dates = _iter_quarters(now.year - 1)[-4:]
            print(f"Standard mode: {len(dates)} recent quarters")

        total_matched = 0
        total_unmatched = 0
        total_errors = 0
        quarters_processed = 0

        for report_date in dates:
            print(f"\nFetching quarter {report_date}...")
            try:
                stats = _ingest_quarter(cur, report_date, cert_map, name_map)
                conn.commit()
                total_matched += stats["matched"]
                total_unmatched += stats["unmatched"]
                total_errors += stats["errors"]
                quarters_processed += 1
            except Exception as e:
                print(f"  Quarter {report_date} failed: {e}")
                conn.rollback()
                total_errors += 1

        print(f"\n{'='*60}")
        print(f"FFIEC Call Report Ingestion Summary")
        print(f"{'='*60}")
        print(f"  Quarters processed:  {quarters_processed}")
        print(f"  Rows matched:        {total_matched:,}")
        print(f"  Rows unmatched:      {total_unmatched:,}")
        print(f"  Total upserted:      {total_matched + total_unmatched:,}")
        print(f"  Errors:              {total_errors:,}")

    finally:
        cur.close()
        conn.close()
