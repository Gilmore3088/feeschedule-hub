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

# Default series descriptions for display
SERIES_TITLES: dict[str, str] = {
    "UNRATE": "Unemployment Rate",
    "USNIM": "Net Interest Margin, All US Banks",
    "EQTA": "Equity Capital to Assets, All US Banks",
    "DPSACBM027NBOG": "Deposits, All Commercial Banks",
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
        "limit": 120,  # ~10 years of monthly data
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
    from_date: str | None = None,
    base_url: str = FRED_BASE_DEFAULT,
) -> int:
    """Ingest a single FRED series into fed_economic_indicators."""
    # Get series metadata
    info = _fetch_series_info(api_key, series_id, base_url=base_url)
    title = info.get("title", SERIES_TITLES.get(series_id)) if info else SERIES_TITLES.get(series_id)
    units = info.get("units", "") if info else ""
    frequency = info.get("frequency", "") if info else ""

    print(f"  {series_id}: {title}")

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

        # National-level series: fed_district = NULL
        db.execute(
            """INSERT OR REPLACE INTO fed_economic_indicators
               (series_id, series_title, fed_district, observation_date,
                value, units, frequency)
               VALUES (?, ?, NULL, ?, ?, ?, ?)""",
            (series_id, title, date, value, units, frequency),
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

    if series:
        series_list = [series]
    else:
        series_list = config.fred.series

    print(f"Ingesting {len(series_list)} FRED series...")
    total = 0
    for s in series_list:
        count = ingest_series(db, api_key, s, from_date=from_date, base_url=config.fred.base_url)
        total += count

    db.commit()

    # Print summary
    row = db.fetchone("SELECT COUNT(*) as cnt FROM fed_economic_indicators")
    cnt = row["cnt"] if row else 0
    series_row = db.fetchone(
        "SELECT COUNT(DISTINCT series_id) as cnt FROM fed_economic_indicators"
    )
    sr_cnt = series_row["cnt"] if series_row else 0
    print(f"\nFRED ingestion complete: {total} rows upserted")
    print(f"Total records: {cnt:,} across {sr_cnt} series")
