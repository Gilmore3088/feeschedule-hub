"""Ingest economic indicators from BLS Public Data API v2 into fed_economic_indicators."""

from __future__ import annotations

import os
import time
from datetime import datetime

import requests

from fee_crawler.config import Config
from fee_crawler.db import Database

BLS_API_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
MAX_RETRIES = 3
# BLS v2 limits: 500 queries/day, 50 series per query, 20 years per query
MAX_SERIES_PER_REQUEST = 50

# Key BLS series for the Bank Fee Index.
# CPI series format: CU{seasonal}{area}{item}
#   seasonal: U=unadjusted, S=seasonally adjusted, R=revised
#   area: 0000=US average, 0100=Northeast, 0200=Midwest, 0300=South, 0400=West
#   item: SEMC01=checking/bank services, SEMC02=other bank services, SEMC=professional svcs
NATIONAL_SERIES: dict[str, str] = {
    "CUUR0000SEMC01": "CPI: Checking Account and Other Bank Services",
    "CUUR0000SEMC02": "CPI: Other Financial Services",
    "CUUR0000SA0": "CPI: All Items (not seasonally adjusted)",
}

# Regional CPI -- SEMC01 (checking/bank services) not published regionally,
# so we use SEMC (professional services incl. financial) as the closest proxy.
REGIONAL_SERIES: dict[str, str] = {
    "CUUR0100SEMC": "CPI: Professional Services, Northeast",
    "CUUR0200SEMC": "CPI: Professional Services, Midwest",
    "CUUR0300SEMC": "CPI: Professional Services, South",
    "CUUR0400SEMC": "CPI: Professional Services, West",
}


def _get_api_key(config: Config) -> str | None:
    """Get BLS API key from env var or config."""
    key = os.environ.get("BLS_API_KEY", "").strip()
    if key:
        return key
    key = getattr(config, "bls", None)
    if key and hasattr(key, "api_key"):
        return key.api_key.strip() or None
    return None


def _period_to_date(year: str, period: str) -> str | None:
    """Convert BLS year+period to YYYY-MM-DD date string.

    BLS periods: M01-M12 for monthly, A01 for annual, S01-S02 for semi-annual,
    Q01-Q05 for quarterly.
    """
    if period.startswith("M"):
        month = int(period[1:])
        return f"{year}-{month:02d}-01"
    if period == "A01":
        return f"{year}-01-01"
    if period.startswith("Q"):
        quarter = int(period[1:])
        month = (quarter - 1) * 3 + 1
        return f"{year}-{month:02d}-01"
    if period.startswith("S"):
        half = int(period[1:])
        month = 1 if half == 1 else 7
        return f"{year}-{month:02d}-01"
    return None


def _fetch_series_batch(
    api_key: str | None,
    series_ids: list[str],
    start_year: int,
    end_year: int,
) -> dict[str, list[dict]] | None:
    """Fetch observations for a batch of BLS series (up to 50).

    Returns dict mapping series_id -> list of observation dicts,
    or None on failure.
    """
    payload: dict = {
        "seriesid": series_ids,
        "startyear": str(start_year),
        "endyear": str(end_year),
        "catalog": True,
        "calculations": True,
        "annualaverage": True,
    }
    if api_key:
        payload["registrationkey"] = api_key

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.post(
                BLS_API_URL,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=60,
            )
            resp.raise_for_status()
            data = resp.json()

            if data.get("status") != "REQUEST_SUCCEEDED":
                msgs = data.get("message", [])
                print(f"  BLS API error: {msgs}")
                return None

            results: dict[str, list[dict]] = {}
            for series_block in data.get("Results", {}).get("series", []):
                sid = series_block.get("seriesID", "")
                observations = series_block.get("data", [])
                results[sid] = observations
            return results

        except requests.exceptions.RequestException as e:
            if attempt < MAX_RETRIES - 1:
                print(f"  Retry {attempt + 1}/{MAX_RETRIES}: {e}")
                time.sleep(2 ** attempt)
            else:
                print(f"  Failed after {MAX_RETRIES} attempts: {e}")
                return None
    return None


def ingest_bls_series(
    db: Database,
    api_key: str | None,
    series_map: dict[str, str],
    *,
    start_year: int,
    end_year: int,
) -> int:
    """Ingest a batch of BLS series into fed_economic_indicators.

    series_map: {series_id: human_title}
    Returns total rows upserted.
    """
    series_ids = list(series_map.keys())

    # BLS allows 50 series per request
    total_upserted = 0
    for i in range(0, len(series_ids), MAX_SERIES_PER_REQUEST):
        batch = series_ids[i : i + MAX_SERIES_PER_REQUEST]
        print(f"  Fetching {len(batch)} series ({start_year}-{end_year})...")

        results = _fetch_series_batch(api_key, batch, start_year, end_year)
        if results is None:
            continue

        for sid, observations in results.items():
            title = series_map.get(sid, sid)
            upserted = 0

            for obs in observations:
                year = obs.get("year", "")
                period = obs.get("period", "")
                value_str = obs.get("value", "")

                # Skip annual averages (M13) and missing values
                if period == "M13":
                    continue
                if not value_str or value_str == "-":
                    continue

                date = _period_to_date(year, period)
                if not date:
                    continue

                try:
                    value = float(value_str.replace(",", ""))
                except (ValueError, TypeError):
                    continue

                # Determine units from series type
                units = "Index" if sid.startswith("CU") else ""
                frequency = "Monthly" if period.startswith("M") else "Annual"

                db.execute(
                    """INSERT OR REPLACE INTO fed_economic_indicators
                       (series_id, series_title, fed_district, observation_date,
                        value, units, frequency)
                       VALUES (?, ?, NULL, ?, ?, ?, ?)""",
                    (sid, title, date, value, units, frequency),
                )
                upserted += 1

            print(f"    {sid}: {title} -- {upserted} observations")
            total_upserted += upserted

    return total_upserted


def run(
    db: Database,
    config: Config,
    *,
    series: str | None = None,
    start_year: int | None = None,
    end_year: int | None = None,
    skip_regional: bool = False,
) -> None:
    """Entry point for the CLI command."""
    api_key = _get_api_key(config)
    if not api_key:
        print("BLS API key not configured (will use v1 limits: 25 queries/day, 3 years).")
        print("For better limits, set BLS_API_KEY env var.")
        print("Register free at: https://data.bls.gov/registrationEngine/")

    now = datetime.now()
    sy = start_year or now.year - 10
    ey = end_year or now.year

    total = 0

    if series:
        # Single series
        series_map = {series: series}
        print(f"Ingesting 1 BLS series...")
        count = ingest_bls_series(db, api_key, series_map, start_year=sy, end_year=ey)
        total += count
    else:
        # National series
        print(f"Ingesting {len(NATIONAL_SERIES)} national BLS series...")
        count = ingest_bls_series(
            db, api_key, NATIONAL_SERIES, start_year=sy, end_year=ey
        )
        total += count

        # Regional series
        if not skip_regional:
            print(f"\nIngesting {len(REGIONAL_SERIES)} regional BLS series...")
            count = ingest_bls_series(
                db, api_key, REGIONAL_SERIES, start_year=sy, end_year=ey
            )
            total += count

    db.commit()

    # Summary
    row = db.fetchone(
        "SELECT COUNT(*) as cnt FROM fed_economic_indicators WHERE series_id LIKE 'CU%'"
    )
    cnt = row["cnt"] if row else 0
    series_row = db.fetchone(
        "SELECT COUNT(DISTINCT series_id) as cnt FROM fed_economic_indicators WHERE series_id LIKE 'CU%'"
    )
    sr_cnt = series_row["cnt"] if series_row else 0
    print(f"\nBLS ingestion complete: {total} rows upserted")
    print(f"Total BLS records: {cnt:,} across {sr_cnt} series")
