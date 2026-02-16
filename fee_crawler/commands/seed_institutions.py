"""Seed crawl_targets from FDIC BankFind API and NCUA bulk data files."""

import csv
import io
import time
import zipfile
from pathlib import Path

import requests

from fee_crawler.config import Config
from fee_crawler.db import Database
from fee_crawler.peer import get_fed_district

FDIC_FIELDS = "CERT,NAME,WEBADDR,ASSET,STNAME,STALP,CITY,ACTIVE,OFFICES,FED"


def _normalize_url(url: str | None) -> str | None:
    """Ensure URL has scheme prefix."""
    if not url or not url.strip():
        return None
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def seed_fdic(db: Database, config: Config, *, limit: int | None = None) -> int:
    """Pull active banks from FDIC API and insert into crawl_targets.

    Returns number of new records inserted.
    """
    base = f"{config.fdic_api.base_url}/institutions"
    page_size = config.fdic_api.page_size
    offset = 0
    total_inserted = 0
    total_skipped = 0
    total_api = 0

    print(f"Seeding from FDIC API ({base})...")

    while True:
        params = {
            "filters": "ACTIVE:1",
            "fields": FDIC_FIELDS,
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

        rows = []
        for rec in records:
            d = rec.get("data", {})
            name = d.get("NAME")
            if not name:
                continue

            fed = d.get("FED")
            fed_district = int(fed) if fed else None

            rows.append((
                name,
                _normalize_url(d.get("WEBADDR")),
                "bank",
                d.get("STNAME"),
                d.get("STALP"),
                d.get("CITY"),
                d.get("ASSET"),
                str(d.get("CERT", "")),
                "fdic",
                fed_district,
            ))

        for row in rows:
            try:
                db.execute(
                    """INSERT INTO crawl_targets
                       (institution_name, website_url, charter_type,
                        state, state_code, city, asset_size, cert_number, source,
                        fed_district)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    row,
                )
                total_inserted += 1
            except Exception:
                total_skipped += 1

        db.commit()
        offset += page_size

        fetched = offset if offset < total_api else total_api
        print(f"  Fetched {fetched}/{total_api} | Inserted: {total_inserted} | Skipped: {total_skipped}")

        if limit and total_inserted >= limit:
            break

        if offset >= total_api:
            break

        time.sleep(0.5)

    print(f"FDIC seed complete: {total_inserted} inserted, {total_skipped} skipped (dupes)")
    return total_inserted


NCUA_ZIP_URL = "https://ncua.gov/files/publications/analysis/call-report-data-2025-09.zip"


def seed_ncua(db: Database, config: Config, *, limit: int | None = None) -> int:
    """Pull credit unions from NCUA quarterly bulk data (ZIP of CSVs).

    Downloads the NCUA Call Report ZIP, extracts FOICU.txt (institution info)
    and FS220.txt (financials, for total assets via ACCT_010), joins on
    CU_NUMBER, and inserts into crawl_targets.

    Returns number of new records inserted.
    """
    total_inserted = 0
    total_skipped = 0

    print(f"Downloading NCUA bulk data ({NCUA_ZIP_URL})...")
    resp = requests.get(NCUA_ZIP_URL, timeout=120)
    resp.raise_for_status()

    zf = zipfile.ZipFile(io.BytesIO(resp.content))

    # Parse FOICU.txt: institution name, city, state, charter number
    print("  Parsing FOICU.txt (institution directory)...")
    foicu_raw = zf.read("FOICU.txt").decode("utf-8", errors="replace")
    foicu_reader = csv.DictReader(io.StringIO(foicu_raw))
    institutions: dict[str, dict] = {}
    for row in foicu_reader:
        cu_num = row.get("CU_NUMBER", "").strip()
        if not cu_num:
            continue
        institutions[cu_num] = {
            "name": row.get("CU_NAME", "").strip(),
            "city": row.get("CITY", "").strip(),
            "state": row.get("STATE", "").strip(),
        }

    print(f"  Found {len(institutions):,} credit unions in FOICU")

    # Parse FS220.txt: total assets (ACCT_010) per CU_NUMBER
    print("  Parsing FS220.txt (total assets)...")
    fs220_raw = zf.read("FS220.txt").decode("utf-8", errors="replace")
    fs220_reader = csv.DictReader(io.StringIO(fs220_raw))
    for row in fs220_reader:
        cu_num = row.get("CU_NUMBER", "").strip()
        if cu_num in institutions:
            try:
                # ACCT_010 is in whole dollars; convert to thousands to match FDIC
                raw = float(row.get("ACCT_010", "0").strip() or "0")
                institutions[cu_num]["assets"] = int(raw / 1000)
            except (ValueError, TypeError):
                institutions[cu_num]["assets"] = None

    # Insert into database
    print("  Inserting into crawl_targets...")
    for cu_num, inst in institutions.items():
        if limit and total_inserted >= limit:
            break

        name = inst.get("name")
        if not name:
            continue

        state_code = inst.get("state")
        fed_district = get_fed_district(state_code)

        try:
            db.execute(
                """INSERT INTO crawl_targets
                   (institution_name, website_url, charter_type,
                    state, state_code, city, asset_size, cert_number, source,
                    fed_district)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    name,
                    None,  # NCUA bulk data doesn't include websites
                    "credit_union",
                    state_code,
                    state_code,
                    inst.get("city"),
                    inst.get("assets"),
                    cu_num,
                    "ncua",
                    fed_district,
                ),
            )
            total_inserted += 1
        except Exception:
            total_skipped += 1

    db.commit()
    print(f"NCUA seed complete: {total_inserted} inserted, {total_skipped} skipped (dupes)")
    return total_inserted


def run(db: Database, config: Config, source: str = "all", limit: int | None = None) -> None:
    """Run the seed command."""
    if source in ("all", "fdic"):
        seed_fdic(db, config, limit=limit)

    if source in ("all", "ncua"):
        seed_ncua(db, config, limit=limit)

    total = db.count("crawl_targets")
    with_url = db.fetchone(
        "SELECT COUNT(*) as cnt FROM crawl_targets WHERE website_url IS NOT NULL"
    )
    url_count = with_url["cnt"] if with_url else 0

    print(f"\nTotal institutions in database: {total}")
    print(f"With website URL: {url_count} ({url_count * 100 // max(total, 1)}%)")
