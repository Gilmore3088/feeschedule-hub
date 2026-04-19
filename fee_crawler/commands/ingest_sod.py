"""Ingest Summary of Deposits data from FDIC SOD API into branch_deposits."""

from __future__ import annotations

import time
from collections import defaultdict

import requests

from fee_crawler.config import Config
from fee_crawler.db import Database

SOD_FIELDS = ",".join([
    "CERT",
    "YEAR",
    "BRNUM",
    "BKMO",         # main office flag (1=main)
    "DEPSUMBR",     # branch deposits (thousands)
    "STALPBR",      # state (branch)
    "CITYBR",       # city (branch)
    "CNTYNUMB",     # FIPS county code (branch)
    "MSABR",        # MSA code (branch)
    "MSANAMB",      # MSA name (branch)
    "FED",          # Fed district number
    "SIMS_LATITUDE",
    "SIMS_LONGITUDE",
])


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


def ingest_sod(
    db: Database,
    config: Config,
    *,
    year: int = 2024,
    limit: int | None = None,
) -> int:
    """Pull SOD branch-level deposit data from FDIC API.

    Also computes market concentration (HHI) per MSA and stores in
    market_concentration table.
    """
    base = f"{config.fdic_api.base_url}/sod"
    page_size = config.fdic_api.page_size

    # Build cert -> crawl_target_id lookup for banks.
    #
    # Matches by charter_type = 'bank' rather than source = 'fdic' so that
    # FDIC Summary of Deposits (SOD) rows are joined to any bank-chartered
    # target by cert_number, regardless of how the row was seeded. FDIC CERT
    # is the bank-only namespace (disjoint from NCUA charter_number), so no
    # cross-charter collisions are possible.
    rows = db.fetchall(
        "SELECT id, cert_number FROM crawl_targets "
        "WHERE charter_type = 'bank' AND cert_number IS NOT NULL"
    )
    cert_map: dict[str, int] = {}
    for row in rows:
        cert = row["cert_number"]
        if cert:
            cert_map[cert] = row["id"]

    print(f"Found {len(cert_map):,} bank institutions")
    print(f"Fetching SOD data for {year}...")

    offset = 0
    total_upserted = 0
    # Track MSA deposits for HHI computation
    msa_deposits: dict[int, dict] = defaultdict(lambda: {"name": "", "institutions": defaultdict(int)})

    while True:
        params = {
            "filters": f"YEAR:{year}",
            "fields": SOD_FIELDS,
            "limit": page_size,
            "offset": offset,
            "sort_by": "DEPSUMBR",
            "sort_order": "DESC",
        }

        resp = requests.get(base, params=params, timeout=60)
        resp.raise_for_status()
        payload = resp.json()

        records = payload.get("data", [])
        total_api = payload.get("meta", {}).get("total", 0)

        if not records:
            break

        for rec in records:
            d = rec.get("data", {})
            cert = str(d.get("CERT", ""))
            target_id = cert_map.get(cert)
            deposits = _safe_int(d.get("DEPSUMBR"))
            msa_code = _safe_int(d.get("MSABR"))

            # Track MSA-level deposits for HHI regardless of target match
            if msa_code and deposits and cert:
                msa_info = msa_deposits[msa_code]
                msa_info["name"] = d.get("MSANAMB", "") or ""
                msa_info["institutions"][cert] += deposits

            try:
                # Commit every 500 rows to prevent connection exhaustion
                if total_upserted > 0 and total_upserted % 500 == 0:
                    db.commit()
                db.execute(
                    """INSERT INTO branch_deposits
                       (cert, crawl_target_id, year, branch_number, is_main_office,
                        deposits, state, city, county_fips, msa_code, msa_name,
                        fed_district, latitude, longitude)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT (cert, year, branch_number) DO UPDATE SET
                        crawl_target_id = EXCLUDED.crawl_target_id,
                        is_main_office = EXCLUDED.is_main_office,
                        deposits = EXCLUDED.deposits,
                        state = EXCLUDED.state,
                        city = EXCLUDED.city,
                        county_fips = EXCLUDED.county_fips,
                        msa_code = EXCLUDED.msa_code,
                        msa_name = EXCLUDED.msa_name,
                        fed_district = EXCLUDED.fed_district,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude""",
                    (
                        int(cert) if cert else None,
                        target_id,
                        year,
                        _safe_int(d.get("BRNUM")) or 0,
                        True if d.get("BKMO") == 1 else False,
                        deposits,
                        d.get("STALPBR"),
                        d.get("CITYBR"),
                        _safe_int(d.get("CNTYNUMB")),
                        msa_code,
                        d.get("MSANAMB"),
                        _safe_int(d.get("FED")),
                        _safe_float(d.get("SIMS_LATITUDE")),
                        _safe_float(d.get("SIMS_LONGITUDE")),
                    ),
                )
                total_upserted += 1
            except Exception as e:
                print(f"  Error for CERT {cert} branch {d.get('BRNUM')}: {e}")

        db.commit()
        offset += page_size

        fetched = min(offset, total_api)
        print(f"  {fetched:,}/{total_api:,} branches fetched | {total_upserted:,} stored")

        if limit and total_upserted >= limit:
            break
        if offset >= total_api:
            break

        time.sleep(0.3)

    # Compute HHI per MSA
    print(f"\nComputing market concentration for {len(msa_deposits):,} MSAs...")
    hhi_count = 0
    for msa_code, info in msa_deposits.items():
        inst_deposits = info["institutions"]
        total_dep = sum(inst_deposits.values())
        if total_dep == 0:
            continue

        # HHI = sum of (market share %)^2 for each institution
        shares = [(dep / total_dep) * 100 for dep in inst_deposits.values()]
        hhi = int(sum(s * s for s in shares))

        # Top 3 share
        sorted_shares = sorted(shares, reverse=True)
        top3 = sum(sorted_shares[:3])

        db.execute(
            """INSERT INTO market_concentration
               (year, msa_code, msa_name, total_deposits, institution_count, hhi, top3_share)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (year, msa_code) DO UPDATE SET
                msa_name = EXCLUDED.msa_name,
                total_deposits = EXCLUDED.total_deposits,
                institution_count = EXCLUDED.institution_count,
                hhi = EXCLUDED.hhi,
                top3_share = EXCLUDED.top3_share""",
            (year, msa_code, info["name"], total_dep, len(inst_deposits), hhi, round(top3, 2)),
        )
        hhi_count += 1

    db.commit()

    print(f"\nSOD ingestion complete: {total_upserted:,} branches, {hhi_count:,} MSA concentrations")
    return total_upserted


def run(
    db: Database,
    config: Config,
    *,
    year: int = 2024,
    limit: int | None = None,
) -> None:
    """Entry point for the CLI command."""
    ingest_sod(db, config, year=year, limit=limit)

    branch_cnt = db.fetchone("SELECT COUNT(*) as cnt FROM branch_deposits")
    msa_cnt = db.fetchone("SELECT COUNT(*) as cnt FROM market_concentration")
    print(f"\nTotal branches: {branch_cnt['cnt']:,}")
    print(f"Total MSA concentrations: {msa_cnt['cnt']:,}")

    # Show most/least concentrated MSAs
    top = db.fetchall(
        """SELECT msa_name, hhi, institution_count, top3_share
           FROM market_concentration WHERE year = ? AND institution_count >= 3
           ORDER BY hhi DESC LIMIT 5""",
        (year,),
    )
    if top:
        print(f"\nMost concentrated MSAs ({year}):")
        for r in top:
            print(f"  {r['msa_name']}: HHI={r['hhi']:,} ({r['institution_count']} banks, top3={r['top3_share']:.0f}%)")
