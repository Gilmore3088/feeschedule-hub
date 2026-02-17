"""Ingest Federal Reserve Beige Book reports into fed_beige_book."""

from __future__ import annotations

import re
import time

import requests
from bs4 import BeautifulSoup

from fee_crawler.config import Config
from fee_crawler.db import Database

BASE_URL = "https://www.federalreserve.gov/monetarypolicy"

# District number -> URL slug used in Beige Book URLs
DISTRICT_SLUGS: dict[int, str] = {
    1: "boston",
    2: "new-york",
    3: "philadelphia",
    4: "cleveland",
    5: "richmond",
    6: "atlanta",
    7: "chicago",
    8: "st-louis",
    9: "minneapolis",
    10: "kansas-city",
    11: "dallas",
    12: "san-francisco",
}

# Recent edition codes (YYYYMM format). The Fed publishes ~8 per year.
# This list covers 2024-2026; the --edition flag handles specific codes.
KNOWN_EDITIONS = [
    "202401", "202403", "202404", "202406",
    "202407", "202409", "202410", "202412",
    "202501", "202503", "202504", "202506",
    "202507", "202509", "202510", "202512",
    "202601",
]

MAX_RETRIES = 3


def _fetch_page(url: str, delay: float) -> str | None:
    """Fetch a page with retries and delay."""
    time.sleep(delay)
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, timeout=30, headers={
                "User-Agent": "FeeScheduleHub/1.0 (fee-benchmarking research)"
            })
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.text
        except requests.exceptions.RequestException as e:
            if attempt < MAX_RETRIES - 1:
                print(f"  Retry {attempt + 1}/{MAX_RETRIES}: {e}")
                time.sleep(2 ** attempt)
            else:
                print(f"  Failed after {MAX_RETRIES} attempts: {e}")
                return None
    return None


def _extract_release_date(html: str) -> str | None:
    """Extract the release date from the summary page."""
    soup = BeautifulSoup(html, "html.parser")
    # Look for date in the page title or heading, e.g. "January 2026"
    title = soup.find("h2")
    if title:
        text = title.get_text()
        # Match patterns like "January 2026" or "January 15, 2026"
        match = re.search(r"(\w+ \d{1,2},? \d{4})", text)
        if match:
            return match.group(1)
        match = re.search(r"(\w+ \d{4})", text)
        if match:
            return match.group(1)
    return None


def _parse_sections(html: str) -> list[tuple[str, str]]:
    """Parse <h4> sections from a Beige Book district page.

    Returns list of (section_name, content_text) tuples.
    """
    soup = BeautifulSoup(html, "html.parser")
    sections: list[tuple[str, str]] = []

    headings = soup.find_all("h4")
    for heading in headings:
        section_name = heading.get_text(strip=True)
        if not section_name:
            continue

        # Collect all <p> siblings until the next <h4> or <h3>
        paragraphs = []
        for sibling in heading.find_next_siblings():
            if sibling.name in ("h4", "h3", "h2"):
                break
            if sibling.name == "p":
                text = sibling.get_text(strip=True)
                if text:
                    paragraphs.append(text)

        content = "\n\n".join(paragraphs)
        if content:
            sections.append((section_name, content))

    return sections


def _parse_summary_sections(html: str) -> list[tuple[str, str]]:
    """Parse the national summary page.

    The summary page has sections like "Overall Economic Activity",
    "Labor Markets", "Prices" under <h4> tags.
    """
    return _parse_sections(html)


def ingest_edition(
    db: Database,
    edition: str,
    *,
    delay: float = 2.0,
) -> int:
    """Ingest a single Beige Book edition (all districts + national summary).

    Args:
        db: Database connection.
        edition: Edition code in YYYYMM format (e.g., "202601").
        delay: Seconds to wait between HTTP requests.

    Returns:
        Number of rows upserted.
    """
    total_upserted = 0

    # Fetch national summary
    summary_url = f"{BASE_URL}/beigebook{edition}-summary.htm"
    print(f"Fetching summary: {summary_url}")
    html = _fetch_page(summary_url, delay)
    if not html:
        print(f"  Edition {edition} not available (404 or error)")
        return 0

    release_date = _extract_release_date(html) or edition

    # Parse and store national summary sections (fed_district=NULL for national)
    sections = _parse_summary_sections(html)
    for section_name, content_text in sections:
        db.execute(
            """INSERT OR REPLACE INTO fed_beige_book
               (release_date, release_code, fed_district, section_name,
                content_text, source_url)
               VALUES (?, ?, NULL, ?, ?, ?)""",
            (release_date, edition, section_name, content_text, summary_url),
        )
        total_upserted += 1

    print(f"  Summary: {len(sections)} sections")

    # Fetch each district page
    for district, slug in DISTRICT_SLUGS.items():
        district_url = f"{BASE_URL}/beigebook{edition}-{slug}.htm"
        print(f"  District {district} ({slug})...")
        html = _fetch_page(district_url, delay)
        if not html:
            print(f"    Skipped (not available)")
            continue

        sections = _parse_sections(html)
        for section_name, content_text in sections:
            db.execute(
                """INSERT OR REPLACE INTO fed_beige_book
                   (release_date, release_code, fed_district, section_name,
                    content_text, source_url)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (release_date, edition, district, section_name,
                 content_text, district_url),
            )
            total_upserted += 1

        print(f"    {len(sections)} sections")

    db.commit()
    return total_upserted


def run(
    db: Database,
    config: Config,
    *,
    edition: str | None = None,
    all_editions: bool = False,
) -> None:
    """Entry point for the CLI command."""
    delay = config.fed_content.crawl_delay

    if all_editions:
        editions = KNOWN_EDITIONS
    elif edition:
        editions = [edition]
    else:
        # Default: latest known edition
        editions = [KNOWN_EDITIONS[-1]]

    total = 0
    for ed in editions:
        print(f"\n--- Beige Book {ed} ---")
        count = ingest_edition(db, ed, delay=delay)
        total += count
        print(f"  Upserted: {count} rows")

    # Print summary
    row = db.fetchone("SELECT COUNT(*) as cnt FROM fed_beige_book")
    cnt = row["cnt"] if row else 0
    editions_row = db.fetchone(
        "SELECT COUNT(DISTINCT release_code) as cnt FROM fed_beige_book"
    )
    ed_cnt = editions_row["cnt"] if editions_row else 0
    print(f"\nBeige Book ingestion complete: {total} rows upserted")
    print(f"Total records: {cnt:,} across {ed_cnt} editions")
