"""Ingest OFR Financial Stress Index into fed_economic_indicators."""

from __future__ import annotations

from datetime import datetime, timezone

import requests

from fee_crawler.config import Config
from fee_crawler.db import Database

OFR_FSI_URL = "https://www.financialresearch.gov/financial-stress-index/data/fsi.json"
MAX_RETRIES = 3

# Series to ingest from the FSI JSON.
# Keys map to JSON top-level keys; values are (series_id, title) tuples.
FSI_SERIES: dict[str, tuple[str, str]] = {
    "OFRFSI": ("OFR_FSI", "OFR Financial Stress Index (composite)"),
    "Credit": ("OFR_FSI_CREDIT", "OFR FSI: Credit"),
    "Equity_Valuation": ("OFR_FSI_EQUITY", "OFR FSI: Equity Valuation"),
    "Funding": ("OFR_FSI_FUNDING", "OFR FSI: Funding"),
    "Volatility": ("OFR_FSI_VOLATILITY", "OFR FSI: Volatility"),
}


def _epoch_to_date(epoch_ms: int) -> str:
    """Convert Highcharts epoch milliseconds to YYYY-MM-DD."""
    dt = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d")


def run(
    db: Database,
    config: Config,
    *,
    start_date: str | None = None,
) -> None:
    """Entry point for the CLI command."""
    print("Fetching OFR Financial Stress Index...")

    import time
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(OFR_FSI_URL, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            break
        except requests.exceptions.RequestException as e:
            if attempt < MAX_RETRIES - 1:
                print(f"  Retry {attempt + 1}/{MAX_RETRIES}: {e}")
                time.sleep(2 ** attempt)
            else:
                print(f"  Failed after {MAX_RETRIES} attempts: {e}")
                return

    total = 0
    for json_key, (series_id, title) in FSI_SERIES.items():
        series_data = data.get(json_key, {})
        observations = series_data.get("data", [])

        upserted = 0
        for obs in observations:
            if not isinstance(obs, list) or len(obs) < 2:
                continue

            epoch_ms, value = obs[0], obs[1]
            if value is None:
                continue

            date = _epoch_to_date(epoch_ms)

            # Filter by start date if provided
            if start_date and date < start_date:
                continue

            db.execute(
                """INSERT OR REPLACE INTO fed_economic_indicators
                   (series_id, series_title, fed_district, observation_date,
                    value, units, frequency)
                   VALUES (?, ?, NULL, ?, ?, ?, ?)""",
                (series_id, title, date, float(value), "Index", "Daily"),
            )
            upserted += 1

        print(f"  {series_id}: {title} -- {upserted} observations")
        total += upserted

    db.commit()

    # Summary
    row = db.fetchone(
        "SELECT COUNT(*) as cnt FROM fed_economic_indicators WHERE series_id LIKE 'OFR_%'"
    )
    cnt = row["cnt"] if row else 0
    print(f"\nOFR ingestion complete: {total} rows upserted")
    print(f"Total OFR records: {cnt:,}")

    # Show latest value
    latest = db.fetchone(
        """SELECT observation_date, value FROM fed_economic_indicators
           WHERE series_id = 'OFR_FSI' ORDER BY observation_date DESC LIMIT 1"""
    )
    if latest:
        val = latest["value"]
        label = "elevated stress" if val > 0 else "below-average stress"
        print(f"Latest FSI: {val:.3f} on {latest['observation_date']} ({label})")
