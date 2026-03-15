"""Ingest economic indicators from FRED API into fed_economic_indicators."""

from __future__ import annotations

import os
import time

import requests

from fee_crawler.config import Config
from fee_crawler.db import Database

FRED_BASE_DEFAULT = "https://api.stlouisfed.org/fred"
MAX_RETRIES = 3
# FRED rate limit: 120 requests/minute
REQUEST_DELAY = 0.5

# National-level series (fed_district = NULL)
NATIONAL_SERIES: list[str] = [
    "UNRATE",           # Unemployment Rate (monthly)
    "FEDFUNDS",         # Effective Federal Funds Rate (monthly)
    "CPIAUCSL",         # Consumer Price Index, Urban All Items (monthly)
    "DPSACBM027NBOG",   # Deposits, All Commercial Banks (monthly)
    "QBPQYNTIY",        # Net Interest Income, all banks (quarterly, QBP)
    "QBPQYTNIY",        # Total Noninterest Income (quarterly, QBP)
    "QBPQYTNIYSRVDP",   # Service Charges on Deposit Accounts (quarterly, QBP)
    "QBPQYNTYBKNI",     # Net Income, all banks (quarterly, QBP)
]

# NOTE: BLS series CUUR0000SEMC01 (CPI: Checking Account & Other Bank Services)
# is NOT available via FRED. Requires direct BLS API (ingest-bls command).

# District-level series: maps FRED series_id -> fed_district number.
# Uses the primary/largest state in each Fed district as the proxy.
DISTRICT_SERIES: dict[str, int] = {
    # Unemployment rate by state (one per district)
    "MAUR": 1,    # Massachusetts (Boston)
    "NYUR": 2,    # New York (New York)
    "PAUR": 3,    # Pennsylvania (Philadelphia)
    "OHUR": 4,    # Ohio (Cleveland)
    "VAUR": 5,    # Virginia (Richmond)
    "GAUR": 6,    # Georgia (Atlanta)
    "ILUR": 7,    # Illinois (Chicago)
    "MOUR": 8,    # Missouri (St. Louis)
    "MNUR": 9,    # Minnesota (Minneapolis)
    "COUR": 10,   # Colorado (Kansas City)
    "TXUR": 11,   # Texas (Dallas)
    "CAUR": 12,   # California (San Francisco)
}


def _get_api_key(config: Config) -> str | None:
    """Get FRED API key from env var or config."""
    key = os.environ.get("FRED_API_KEY", "").strip()
    if key:
        return key
    key = config.fred.api_key.strip()
    return key if key else None


def _fetch_series(
    api_key: str,
    series_id: str,
    *,
    from_date: str | None = None,
    base_url: str = FRED_BASE_DEFAULT,
) -> list[dict] | None:
    """Fetch observations for a FRED series."""
    params: dict = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "sort_order": "desc",
        "limit": 10000,  # FRED default is 100k; 10k covers decades of monthly data
    }
    if from_date:
        params["observation_start"] = from_date

    time.sleep(REQUEST_DELAY)
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(
                f"{base_url}/series/observations",
                params=params,
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("observations", [])
        except requests.exceptions.RequestException as e:
            if attempt < MAX_RETRIES - 1:
                print(f"  Retry {attempt + 1}/{MAX_RETRIES}: {e}")
                time.sleep(2 ** attempt)
            else:
                print(f"  Failed after {MAX_RETRIES} attempts: {e}")
                return None
    return None


def _fetch_series_info(api_key: str, series_id: str, base_url: str = FRED_BASE_DEFAULT) -> dict | None:
    """Fetch metadata for a FRED series (title, units, frequency)."""
    time.sleep(REQUEST_DELAY)
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(
                f"{base_url}/series",
                params={
                    "series_id": series_id,
                    "api_key": api_key,
                    "file_type": "json",
                },
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            serieses = data.get("seriess", [])
            return serieses[0] if serieses else None
        except requests.exceptions.RequestException as e:
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)
            else:
                print(f"  Failed fetching series info: {e}")
                return None
    return None


def ingest_series(
    db: Database,
    api_key: str,
    series_id: str,
    *,
    fed_district: int | None = None,
    from_date: str | None = None,
    base_url: str = FRED_BASE_DEFAULT,
) -> int:
    """Ingest a single FRED series into fed_economic_indicators."""
    info = _fetch_series_info(api_key, series_id, base_url=base_url)
    title = info.get("title", "") if info else ""
    units = info.get("units", "") if info else ""
    frequency = info.get("frequency", "") if info else ""

    district_label = f" [district {fed_district}]" if fed_district else ""
    print(f"  {series_id}: {title}{district_label}")

    observations = _fetch_series(api_key, series_id, from_date=from_date, base_url=base_url)
    if observations is None:
        return 0

    upserted = 0
    for obs in observations:
        date = obs.get("date", "")
        value_str = obs.get("value", "")

        # FRED uses "." for missing values
        if not date or value_str == ".":
            continue

        try:
            value = float(value_str)
        except (ValueError, TypeError):
            continue

        db.execute(
            """INSERT OR REPLACE INTO fed_economic_indicators
               (series_id, series_title, fed_district, observation_date,
                value, units, frequency)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (series_id, title, fed_district, date, value, units, frequency),
        )
        upserted += 1

    print(f"    {upserted} observations")
    return upserted


def run(
    db: Database,
    config: Config,
    *,
    series: str | None = None,
    from_date: str | None = None,
) -> None:
    """Entry point for the CLI command."""
    api_key = _get_api_key(config)
    if not api_key:
        print("FRED API key not configured.")
        print("Set FRED_API_KEY env var or add fred.api_key to config.yaml")
        print("Get a free key at: https://fred.stlouisfed.org/docs/api/api_key.html")
        return

    base_url = config.fred.base_url
    total = 0

    if series:
        # Single series: check if it's a district series
        district = DISTRICT_SERIES.get(series)
        count = ingest_series(
            db, api_key, series,
            fed_district=district, from_date=from_date, base_url=base_url,
        )
        total += count
    else:
        # Ingest national series from config
        national = config.fred.series or list(NATIONAL_SERIES)
        print(f"Ingesting {len(national)} national series...")
        for s in national:
            count = ingest_series(
                db, api_key, s,
                from_date=from_date, base_url=base_url,
            )
            total += count

        # Ingest district-level series
        print(f"\nIngesting {len(DISTRICT_SERIES)} district series...")
        for s, district in DISTRICT_SERIES.items():
            count = ingest_series(
                db, api_key, s,
                fed_district=district, from_date=from_date, base_url=base_url,
            )
            total += count

    db.commit()

    # Print summary
    row = db.fetchone("SELECT COUNT(*) as cnt FROM fed_economic_indicators")
    cnt = row["cnt"] if row else 0
    series_row = db.fetchone(
        "SELECT COUNT(DISTINCT series_id) as cnt FROM fed_economic_indicators"
    )
    sr_cnt = series_row["cnt"] if series_row else 0
    district_row = db.fetchone(
        "SELECT COUNT(DISTINCT fed_district) as cnt FROM fed_economic_indicators WHERE fed_district IS NOT NULL"
    )
    d_cnt = district_row["cnt"] if district_row else 0
    print(f"\nFRED ingestion complete: {total} rows upserted")
    print(f"Total records: {cnt:,} across {sr_cnt} series ({d_cnt} districts)")
