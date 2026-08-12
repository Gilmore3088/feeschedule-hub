"""Ingest demographic data from Census ACS API into demographics table."""

from __future__ import annotations

import os
import time

import requests

from fee_crawler.config import Config
from fee_crawler.db import Database

CENSUS_BASE = "https://api.census.gov/data"
MAX_RETRIES = 3

# ACS 5-year variables for demographics.
# B19013_001E = Median household income
# B17001_002E = Population below poverty level
# B01003_001E = Total population
ACS_VARIABLES = "NAME,B19013_001E,B17001_002E,B01003_001E"

# All US state FIPS codes (50 states + DC + PR)
STATE_FIPS = [
    "01", "02", "04", "05", "06", "08", "09", "10", "11", "12",
    "13", "15", "16", "17", "18", "19", "20", "21", "22", "23",
    "24", "25", "26", "27", "28", "29", "30", "31", "32", "33",
    "34", "35", "36", "37", "38", "39", "40", "41", "42", "44",
    "45", "46", "47", "48", "49", "50", "51", "53", "54", "55",
    "56", "72",
]


def _get_api_key() -> str | None:
    """Get Census API key from env var."""
    key = os.environ.get("CENSUS_API_KEY", "").strip()
    return key if key else None


def _fetch_acs(
    api_key: str | None,
    year: int,
    geo_for: str,
    geo_in: str | None = None,
) -> list[list[str]] | None:
    """Fetch ACS 5-year data for a geographic level."""
    url = f"{CENSUS_BASE}/{year}/acs/acs5"
    params: dict = {
        "get": ACS_VARIABLES,
        "for": geo_for,
    }
    if geo_in:
        params["in"] = geo_in
    if api_key:
        params["key"] = api_key

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, params=params, timeout=30)
            resp.raise_for_status()
            payload = resp.json()
            if not isinstance(payload, list):
                raise ValueError("Census API returned a non-tabular response")
            return payload
        except (requests.exceptions.RequestException, ValueError) as e:
            if attempt < MAX_RETRIES - 1:
                print(f"  Retry {attempt + 1}/{MAX_RETRIES}: {e}")
                time.sleep(2 ** attempt)
            else:
                print(f"  Failed: {e}")
                return None
    return None


def _safe_int(val: str | None) -> int | None:
    if val is None or val == "" or val == "-":
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _upsert_demographics(db: Database, rows: list[tuple]) -> None:
    """Persist one API response without a database round trip per geography."""
    if not rows:
        return
    db.execute_values(
        """INSERT INTO demographics
             (geo_id, geo_type, geo_name, state_fips, county_fips,
              median_household_income, poverty_count, total_population, year)
           VALUES %s
           ON CONFLICT (geo_id, geo_type, year) DO UPDATE SET
             geo_name = EXCLUDED.geo_name,
             state_fips = EXCLUDED.state_fips,
             county_fips = EXCLUDED.county_fips,
             median_household_income = EXCLUDED.median_household_income,
             poverty_count = EXCLUDED.poverty_count,
             total_population = EXCLUDED.total_population,
             fetched_at = NOW()""",
        rows,
        page_size=1000,
    )


def ingest_demographics(
    db: Database,
    api_key: str | None,
    *,
    year: int = 2022,
    level: str = "county",
) -> int:
    """Ingest ACS demographics at county or state level."""
    total_upserted = 0

    if level == "state":
        print(f"  Fetching state-level demographics ({year})...")
        data = _fetch_acs(api_key, year, "state:*")
        if data is None:
            return 0

        rows = []
        for row in data[1:]:
            name, income, poverty, pop, state_fips = row
            geo_id = f"state:{state_fips}"
            rows.append(
                (
                    geo_id,
                    "state",
                    name,
                    state_fips,
                    None,
                    _safe_int(income),
                    _safe_int(poverty),
                    _safe_int(pop),
                    year,
                )
            )
            total_upserted += 1
        _upsert_demographics(db, rows)

        print(f"    {total_upserted} states")

    elif level == "county":
        print(f"  Fetching county-level demographics ({year})...")

        for state_fips in STATE_FIPS:
            data = _fetch_acs(api_key, year, "county:*", f"state:{state_fips}")
            if data is None:
                continue

            rows = []
            for row in data[1:]:
                name, income, poverty, pop, st, county = row
                geo_id = f"county:{st}{county}"
                rows.append(
                    (
                        geo_id,
                        "county",
                        name,
                        st,
                        county,
                        _safe_int(income),
                        _safe_int(poverty),
                        _safe_int(pop),
                        year,
                    )
                )
                total_upserted += 1

            _upsert_demographics(db, rows)
            db.commit()
            time.sleep(0.2)  # rate limit courtesy

        print(f"    {total_upserted} counties")

    db.commit()
    return total_upserted


def run(
    db: Database,
    config: Config,
    *,
    year: int = 2022,
    level: str = "county",
) -> None:
    """Entry point for the CLI command."""
    api_key = _get_api_key()
    if not api_key:
        raise RuntimeError(
            "CENSUS_API_KEY is required; configure the Modal secret before "
            "running Census ingestion"
        )

    print(f"Ingesting Census ACS {level}-level demographics...")

    # Always do state level first
    state_count = ingest_demographics(db, api_key, year=year, level="state")

    county_count = 0
    if level == "county":
        county_count = ingest_demographics(db, api_key, year=year, level="county")

    total = state_count + county_count
    if total == 0:
        raise RuntimeError("Census API returned no demographic rows")
    print(f"\nCensus ACS ingestion complete: {total:,} rows upserted")

    # Summary
    cnt = db.fetchone("SELECT COUNT(*) as cnt FROM demographics")
    print(f"Total demographic records: {cnt['cnt']:,}")
