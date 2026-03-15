"""Ingest FFIEC census tract income data into census_tracts table.

FFIEC publishes annual flat files with tract-level income classifications
used for CRA analysis. This command downloads and parses that data.

Source: https://www.ffiec.gov/census/report.aspx?year=2024&county=&tract=&state=&report=demographic
"""

from __future__ import annotations

import csv
import io
import time
import zipfile

import requests

from fee_crawler.config import Config
from fee_crawler.db import Database

FFIEC_BASE = "https://www.ffiec.gov/census"
MAX_RETRIES = 3

# Income level classification thresholds (tract median / MSA median).
# FFIEC classifies tracts as: Low (<50%), Moderate (50-79%), Middle (80-119%), Upper (>=120%)
INCOME_LEVELS = {
    (0, 50): "low",
    (50, 80): "moderate",
    (80, 120): "middle",
    (120, 999): "upper",
}


def _classify_income(ratio_pct: float | None) -> str | None:
    """Classify tract income level from income ratio percentage."""
    if ratio_pct is None:
        return None
    for (low, high), level in INCOME_LEVELS.items():
        if low <= ratio_pct < high:
            return level
    return "upper" if ratio_pct >= 120 else None


def _safe_int(val: str | None) -> int | None:
    if val is None or val.strip() == "" or val.strip() == "NA":
        return None
    try:
        return int(val.strip().replace(",", ""))
    except (ValueError, TypeError):
        return None


def _safe_float(val: str | None) -> float | None:
    if val is None or val.strip() == "" or val.strip() == "NA":
        return None
    try:
        return float(val.strip().replace(",", "").replace("%", ""))
    except (ValueError, TypeError):
        return None


def _fetch_ffiec_demographic(year: int) -> list[dict] | None:
    """Fetch FFIEC demographic data for all tracts.

    Uses the FFIEC Census flat file download. Falls back to API if available.
    """
    # Try the flat file download first
    url = f"{FFIEC_BASE}/report.aspx?year={year}&county=&tract=&state=&report=demographic&format=csv"

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, timeout=120, allow_redirects=True)
            resp.raise_for_status()

            # Check if we got CSV content
            content_type = resp.headers.get("content-type", "")
            if "text/csv" in content_type or "application/csv" in content_type:
                reader = csv.DictReader(io.StringIO(resp.text))
                return list(reader)

            # If ZIP, extract CSV from it
            if "zip" in content_type or resp.content[:4] == b"PK\x03\x04":
                with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
                    for name in zf.namelist():
                        if name.endswith(".csv"):
                            with zf.open(name) as f:
                                text = f.read().decode("utf-8", errors="replace")
                                reader = csv.DictReader(io.StringIO(text))
                                return list(reader)

            # If HTML (not the file), the download format may have changed
            if "text/html" in content_type:
                print(f"  FFIEC returned HTML -- CSV download format may have changed for {year}")
                return None

            return None

        except requests.exceptions.RequestException as e:
            if attempt < MAX_RETRIES - 1:
                print(f"  Retry {attempt + 1}/{MAX_RETRIES}: {e}")
                time.sleep(2 ** attempt)
            else:
                print(f"  Failed: {e}")
                return None
    return None


def _ingest_from_census_api(
    db: Database,
    year: int,
) -> int:
    """Fallback: use Census ACS tract-level income data.

    Fetches median household income at tract level and computes income
    ratios against county medians stored in the demographics table.
    """
    import os

    api_key = os.environ.get("CENSUS_API_KEY", "").strip() or None

    # Get county medians from demographics table as baseline
    county_medians: dict[str, int] = {}
    rows = db.fetchall(
        "SELECT county_fips, state_fips, median_household_income FROM demographics "
        "WHERE geo_type = 'county' AND median_household_income IS NOT NULL"
    )
    for row in rows:
        key = f"{row['state_fips']}{row['county_fips']}"
        county_medians[key] = row["median_household_income"]

    if not county_medians:
        print("  No county demographics found. Run ingest-census-acs first.")
        return 0

    print(f"  Using {len(county_medians)} county medians as baseline")
    print(f"  Fetching tract-level income from Census ACS ({year})...")

    # Import STATE_FIPS from census_acs module
    from fee_crawler.commands.ingest_census_acs import STATE_FIPS

    total_upserted = 0
    for state_fips in STATE_FIPS:
        url = f"https://api.census.gov/data/{year}/acs/acs5"
        params: dict = {
            "get": "NAME,B19013_001E,B01003_001E",
            "for": "tract:*",
            "in": f"state:{state_fips}",
        }
        if api_key:
            params["key"] = api_key

        try:
            resp = requests.get(url, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except requests.exceptions.RequestException:
            continue

        for row in data[1:]:
            name, income_str, pop_str, state, county, tract = row
            tract_id = f"{state}{county}{tract}"
            tract_income = _safe_int(income_str)
            population = _safe_int(pop_str)

            county_key = f"{state}{county}"
            county_median = county_medians.get(county_key)

            income_ratio = None
            income_level = None
            if tract_income and county_median and county_median > 0:
                income_ratio = round(tract_income / county_median * 100, 1)
                income_level = _classify_income(income_ratio)

            db.execute(
                """INSERT OR REPLACE INTO census_tracts
                   (tract_id, state_fips, county_fips, msa_code,
                    income_level, median_family_income, tract_median_income,
                    income_ratio, population, minority_pct, year)
                   VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?)""",
                (tract_id, state, county, income_level, county_median,
                 tract_income, income_ratio, population, year),
            )
            total_upserted += 1

        db.commit()
        time.sleep(0.3)

    return total_upserted


def run(
    db: Database,
    config: Config,
    *,
    year: int = 2022,
) -> None:
    """Entry point for the CLI command."""
    print(f"Ingesting FFIEC census tract data for {year}...")

    # Try FFIEC flat file first
    ffiec_data = _fetch_ffiec_demographic(year)

    total = 0
    if ffiec_data:
        print(f"  Processing {len(ffiec_data):,} FFIEC tract records...")
        for row in ffiec_data:
            # FFIEC CSV field names vary by year -- try common patterns
            state = row.get("State Code", row.get("MSA/MD State Code", "")).strip()
            county = row.get("County Code", row.get("County", "")).strip()
            tract = row.get("Tract", row.get("Census Tract", "")).strip()

            if not (state and county and tract):
                continue

            tract_id = f"{state}{county}{tract}"
            msa = row.get("MSA/MD", row.get("MSA Code", "")).strip() or None
            median_family = _safe_int(row.get("Tract Median Family Income", row.get("FFI Median Family Income")))
            msa_median = _safe_int(row.get("MSA/MD Median Family Income", row.get("FFI Est. MSA/MD Median Family Income")))
            ratio = _safe_float(row.get("Tract Median Family Income %", row.get("% of MSA/MD Median Family Income")))
            population = _safe_int(row.get("Tract Population", row.get("Population")))
            minority = _safe_float(row.get("Tract Minority %", row.get("Minority Population %")))

            income_level = row.get("Income Level", "").strip().lower() or _classify_income(ratio)

            db.execute(
                """INSERT OR REPLACE INTO census_tracts
                   (tract_id, state_fips, county_fips, msa_code,
                    income_level, median_family_income, tract_median_income,
                    income_ratio, population, minority_pct, year)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (tract_id, state, county, msa, income_level, msa_median,
                 median_family, ratio, population, minority, year),
            )
            total += 1

        db.commit()
        print(f"  {total:,} tracts from FFIEC flat file")
    else:
        # Fallback to Census ACS tract-level data
        print("  FFIEC flat file not available, falling back to Census ACS...")
        total = _ingest_from_census_api(db, year)
        print(f"  {total:,} tracts from Census ACS")

    # Summary
    cnt = db.fetchone("SELECT COUNT(*) as cnt FROM census_tracts")
    levels = db.fetchall(
        "SELECT income_level, COUNT(*) as cnt FROM census_tracts "
        "WHERE year = ? AND income_level IS NOT NULL GROUP BY income_level "
        "ORDER BY cnt DESC",
        (year,),
    )
    print(f"\nTotal census tract records: {cnt['cnt']:,}")
    if levels:
        print(f"Income distribution ({year}):")
        for row in levels:
            print(f"  {row['income_level']:12s}: {row['cnt']:,} tracts")
