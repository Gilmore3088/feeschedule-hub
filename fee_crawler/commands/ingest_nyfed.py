"""Ingest reference rates from NY Fed Markets Data API into fed_economic_indicators."""

from __future__ import annotations

import time
from datetime import date, timedelta

import requests

from fee_crawler.config import Config
from fee_crawler.db import Database

NYFED_BASE = "https://markets.newyorkfed.org/api/rates"
MAX_RETRIES = 3
REVISION_OVERLAP_DAYS = 14

# Rate types to ingest. Each maps to a path segment and human title.
# The API returns daily observations with percentRate, volume, and percentiles.
RATE_TYPES: dict[str, dict] = {
    "SOFR": {
        "path": "secured/sofr/search.json",
        "title": "Secured Overnight Financing Rate (SOFR)",
        "units": "Percent",
    },
    "EFFR": {
        "path": "unsecured/effr/search.json",
        "title": "Effective Federal Funds Rate (EFFR)",
        "units": "Percent",
    },
    "OBFR": {
        "path": "unsecured/obfr/search.json",
        "title": "Overnight Bank Funding Rate (OBFR)",
        "units": "Percent",
    },
}


def _fetch_rates(
    rate_type: str,
    path: str,
    *,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict] | None:
    """Fetch rate observations from NY Fed API."""
    params: dict = {}
    if start_date:
        params["startDate"] = start_date
    if end_date:
        params["endDate"] = end_date

    url = f"{NYFED_BASE}/{path}"
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            return data.get("refRates", [])
        except requests.exceptions.RequestException as e:
            if attempt < MAX_RETRIES - 1:
                print(f"  Retry {attempt + 1}/{MAX_RETRIES}: {e}")
                time.sleep(2 ** attempt)
            else:
                print(f"  Failed after {MAX_RETRIES} attempts: {e}")
                return None
    return None


def ingest_rate_type(
    db: Database,
    rate_type: str,
    rate_info: dict,
    *,
    start_date: str | None = None,
    end_date: str | None = None,
) -> int:
    """Ingest a single rate type into fed_economic_indicators."""
    title = rate_info["title"]
    units = rate_info["units"]
    series_id = f"NYFED_{rate_type}"

    print(f"  {series_id}: {title}")

    effective_start_date = start_date
    if effective_start_date is None:
        latest = db.fetchone(
            """SELECT MAX(observation_date) AS latest
                 FROM fed_economic_indicators
                WHERE series_id = ?""",
            (series_id,),
        )
        latest_value = latest.get("latest") if latest else None
        if latest_value:
            try:
                latest_date = date.fromisoformat(str(latest_value)[:10])
                effective_start_date = (
                    latest_date - timedelta(days=REVISION_OVERLAP_DAYS)
                ).isoformat()
            except ValueError:
                effective_start_date = None

    observations = _fetch_rates(
        rate_type, rate_info["path"],
        start_date=effective_start_date, end_date=end_date,
    )
    if observations is None:
        return 0

    rows: list[tuple] = []
    for obs in observations:
        observation_date = obs.get("effectiveDate", "")
        rate = obs.get("percentRate")

        if not observation_date or rate is None:
            continue

        try:
            value = float(rate)
        except (ValueError, TypeError):
            continue

        rows.append(
            (series_id, title, None, observation_date, value, units, "Daily")
        )

    if rows:
        db.execute_values(
            """INSERT INTO fed_economic_indicators
                 (series_id, series_title, fed_district, observation_date,
                  value, units, frequency)
               VALUES %s
               ON CONFLICT (series_id, observation_date)
               DO UPDATE SET
                 series_title = EXCLUDED.series_title,
                 value = EXCLUDED.value,
                 units = EXCLUDED.units,
                 frequency = EXCLUDED.frequency,
                 fetched_at = NOW()""",
            rows,
        )

    print(f"    {len(rows)} observations")
    return len(rows)


def run(
    db: Database,
    config: Config,
    *,
    rate_type: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> None:
    """Entry point for the CLI command."""
    if rate_type:
        rate_type_upper = rate_type.upper()
        if rate_type_upper not in RATE_TYPES:
            print(f"Unknown rate type: {rate_type}. Available: {', '.join(RATE_TYPES)}")
            return
        types_to_fetch = {rate_type_upper: RATE_TYPES[rate_type_upper]}
    else:
        types_to_fetch = RATE_TYPES

    print(f"Ingesting {len(types_to_fetch)} NY Fed rate types...")
    total = 0
    for rt, info in types_to_fetch.items():
        count = ingest_rate_type(
            db, rt, info, start_date=start_date, end_date=end_date,
        )
        total += count
        time.sleep(0.3)

    db.commit()

    # Summary
    row = db.fetchone(
        "SELECT COUNT(*) as cnt FROM fed_economic_indicators WHERE series_id LIKE 'NYFED_%'"
    )
    cnt = row["cnt"] if row else 0
    series_row = db.fetchone(
        "SELECT COUNT(DISTINCT series_id) as cnt FROM fed_economic_indicators WHERE series_id LIKE 'NYFED_%'"
    )
    sr_cnt = series_row["cnt"] if series_row else 0
    print(f"\nNY Fed ingestion complete: {total} rows upserted")
    print(f"Total NY Fed records: {cnt:,} across {sr_cnt} rate types")
