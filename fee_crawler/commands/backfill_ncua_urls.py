"""Backfill website URLs for NCUA credit unions from the NCUA mapping API.

The NCUA bulk data (FOICU.txt) doesn't include website URLs. This command
calls the per-institution NCUA mapping API to fetch and store them:

    GET https://mapping.ncua.gov/api/CreditUnionDetails/GetCreditUnionDetails/{charterNumber}
    → { "creditUnionWebsite": "http://www.navyfcu.org", ... }
"""

import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

from fee_crawler.db import Database
from fee_crawler.config import Config

NCUA_API_BASE_DEFAULT = "https://mapping.ncua.gov/api/CreditUnionDetails/GetCreditUnionDetails"
REQUEST_DELAY = 0.1  # seconds between requests per worker (politeness)


def _make_session() -> requests.Session:
    """Create a requests.Session with appropriate headers."""
    session = requests.Session()
    session.headers.update({
        "User-Agent": "FeeScheduleHub/1.0 (research)",
        "Accept": "application/json",
    })
    return session


# Thread-local storage for sessions
_thread_local = threading.local()


def _get_session() -> requests.Session:
    """Get or create a thread-local requests.Session."""
    if not hasattr(_thread_local, "session"):
        _thread_local.session = _make_session()
    return _thread_local.session


def _fetch_one(target: dict) -> dict:
    """Fetch website URL for a single credit union from NCUA API.

    Args:
        target: Dict with 'id' and 'cert_number' from crawl_targets.

    Returns:
        Dict with target_id, cert_number, website_url (or None), error (or None).
    """
    target_id = target["id"]
    cert_number = target["cert_number"]

    result = {
        "target_id": target_id,
        "cert_number": cert_number,
        "website_url": None,
        "error": None,
    }

    try:
        session = _get_session()
        api_base = target.get("api_base", NCUA_API_BASE_DEFAULT)
        resp = session.get(f"{api_base}/{cert_number}", timeout=15)

        if resp.status_code == 404:
            result["error"] = "not_found"
            return result

        resp.raise_for_status()
        data = resp.json()

        url = data.get("creditUnionWebsite") or data.get("CreditUnionWebsite")
        if url and url.strip() and url.strip().lower() not in ("n/a", "none", ""):
            url = url.strip()
            if not url.startswith(("http://", "https://")):
                url = "https://" + url
            result["website_url"] = url

        time.sleep(REQUEST_DELAY)

    except requests.exceptions.Timeout:
        result["error"] = "timeout"
    except requests.exceptions.RequestException as e:
        result["error"] = str(e)[:100]
    except Exception as e:
        result["error"] = str(e)[:100]

    return result


def run(
    db: Database,
    config: Config,
    *,
    workers: int = 8,
    limit: int | None = None,
) -> None:
    """Backfill website URLs for NCUA credit unions.

    Args:
        db: Database connection (used for queries and updates from main thread).
        config: Application config.
        workers: Number of concurrent HTTP worker threads.
        limit: Max institutions to process (for testing).
    """
    # Get all NCUA CUs without website URLs
    query = """SELECT id, cert_number
            FROM crawl_targets
            WHERE source = 'ncua' AND website_url IS NULL
            ORDER BY asset_size DESC NULLS LAST"""
    query_params: list = []
    if limit and limit > 0:
        query += " LIMIT ?"
        query_params.append(limit)
    targets = db.fetchall(query, tuple(query_params))

    total = len(targets)
    if total == 0:
        print("No NCUA credit unions need URL backfill.")
        return

    # Convert to plain dicts for thread safety, inject API base URL from config
    api_base = config.ncua_api.mapping_api_url
    targets = [{**dict(t), "api_base": api_base} for t in targets]

    print(f"Backfilling website URLs for {total:,} NCUA credit unions")
    print(f"  Workers: {workers}")
    print(f"  API: {api_base}/{{charter}}")
    print()

    completed = 0
    found = 0
    not_found = 0
    errors = 0
    start_time = time.time()
    pending_updates: list[tuple] = []

    try:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(_fetch_one, target): target
                for target in targets
            }

            for future in as_completed(futures):
                completed += 1
                result = future.result()

                if result["website_url"]:
                    found += 1
                    pending_updates.append((result["website_url"], result["target_id"]))
                elif result["error"]:
                    errors += 1
                else:
                    not_found += 1

                # Batch commit every 100 results
                if len(pending_updates) >= 100:
                    _flush_updates(db, pending_updates)
                    pending_updates.clear()

                # Progress every 200 institutions
                if completed % 200 == 0:
                    elapsed = time.time() - start_time
                    rate = completed / elapsed * 3600 if elapsed > 0 else 0
                    pct = found / completed * 100 if completed > 0 else 0
                    print(
                        f"  Progress: {completed:,}/{total:,} | "
                        f"URLs found: {found:,} ({pct:.0f}%) | "
                        f"Errors: {errors:,} | "
                        f"Rate: {rate:,.0f}/hr"
                    )

    except KeyboardInterrupt:
        print(f"\n\nInterrupted after {completed:,} institutions.")

    # Flush remaining updates
    if pending_updates:
        _flush_updates(db, pending_updates)

    elapsed = time.time() - start_time
    rate = completed / elapsed * 3600 if elapsed > 0 else 0
    pct = found / completed * 100 if completed > 0 else 0

    print(f"\nBackfill complete:")
    print(f"  Processed:  {completed:,}/{total:,}")
    print(f"  URLs found: {found:,} ({pct:.0f}%)")
    print(f"  No website: {not_found:,}")
    print(f"  Errors:     {errors:,}")
    if elapsed > 0:
        print(f"  Elapsed:    {elapsed / 60:.1f} min | Rate: {rate:,.0f}/hr")


def _flush_updates(db: Database, updates: list[tuple]) -> None:
    """Batch-update website_url for a list of (url, target_id) tuples."""
    db.executemany(
        "UPDATE crawl_targets SET website_url = ? WHERE id = ?",
        updates,
    )
    db.commit()
