"""Ingest Federal Reserve Beige Book reports into fed_beige_book."""

from __future__ import annotations

import json as json_module
import os
import re
import time

import anthropic
import requests
from bs4 import BeautifulSoup

from fee_crawler.config import Config
from fee_crawler.db import Database

BASE_URL_DEFAULT = "https://www.federalreserve.gov/monetarypolicy"

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


def _summarize_district(content_text: str, district_num: int) -> str:
    """Generate 2-3 sentence economic narrative for one Fed district."""
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    if district_num == 0:
        prompt = (
            "Summarize the overall national economic conditions across all Federal Reserve "
            "districts in exactly 2-3 sentences. Focus on the dominant national trends in "
            "economic activity, employment, and prices. Be specific about direction "
            "(growing, slowing, mixed).\n\n"
            f"District summaries:\n{content_text[:8000]}"
        )
    else:
        prompt = (
            f"Summarize the economic conditions in Federal Reserve District {district_num} "
            f"in exactly 2-3 sentences. Focus on overall economic activity, key sectors, "
            f"and notable trends. Be specific about direction (growing, slowing, steady).\n\n"
            f"Beige Book text:\n{content_text[:4000]}"
        )
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text.strip()


def _extract_national_themes(district_summaries: list[str]) -> dict:
    """Extract structured national themes from all district summaries."""
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    combined = "\n\n".join(
        f"District {i + 1}: {s}" for i, s in enumerate(district_summaries)
    )
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system="Respond with only valid JSON. No markdown, no explanation.",
        messages=[{
            "role": "user",
            "content": (
                "Extract 4 key national economic themes from these Federal Reserve "
                "district reports. Respond with JSON: "
                '{"growth": "...", "employment": "...", "prices": "...", "lending": "..."}. '
                "Each value is 1-2 sentences summarizing the national picture.\n\n"
                + combined[:8000]
            ),
        }],
    )
    try:
        raw = json_module.loads(response.content[0].text)
        return {
            "growth": raw.get("growth") or None,
            "employment": raw.get("employment") or None,
            "prices": raw.get("prices") or None,
            "lending": raw.get("lending") or None,
        }
    except Exception:
        return {"growth": None, "employment": None, "prices": None, "lending": None}


def ingest_edition(
    db: Database,
    edition: str,
    *,
    delay: float = 2.0,
    base_url: str = BASE_URL_DEFAULT,
    skip_llm: bool = False,
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
    summary_url = f"{base_url}/beigebook{edition}-summary.htm"
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
            """INSERT INTO fed_beige_book
               (release_date, release_code, fed_district, section_name,
                content_text, source_url)
               VALUES (?, ?, NULL, ?, ?, ?)
               ON CONFLICT (release_code, fed_district, section_name)
               DO UPDATE SET
                 release_date = EXCLUDED.release_date,
                 content_text = EXCLUDED.content_text,
                 source_url = EXCLUDED.source_url""",
            (release_date, edition, section_name, content_text, summary_url),
        )
        total_upserted += 1

    print(f"  Summary: {len(sections)} sections")

    # Fetch each district page
    for district, slug in DISTRICT_SLUGS.items():
        district_url = f"{base_url}/beigebook{edition}-{slug}.htm"
        print(f"  District {district} ({slug})...")
        html = _fetch_page(district_url, delay)
        if not html:
            print(f"    Skipped (not available)")
            continue

        sections = _parse_sections(html)
        for section_name, content_text in sections:
            db.execute(
                """INSERT INTO fed_beige_book
                   (release_date, release_code, fed_district, section_name,
                    content_text, source_url)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT (release_code, fed_district, section_name)
                   DO UPDATE SET
                     release_date = EXCLUDED.release_date,
                     content_text = EXCLUDED.content_text,
                     source_url = EXCLUDED.source_url""",
                (release_date, edition, district, section_name,
                 content_text, district_url),
            )
            total_upserted += 1

        print(f"    {len(sections)} sections")

    db.commit()

    # LLM summarization step — skippable via skip_llm=True or missing API key
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if skip_llm or not api_key:
        if not api_key and not skip_llm:
            print("  Warning: ANTHROPIC_API_KEY not set — skipping LLM summarization")
        return total_upserted

    print("  Running LLM summarization for all 12 districts...")
    district_summaries: list[str] = []
    for district in DISTRICT_SLUGS:
        row = db.fetchone(
            "SELECT content_text FROM fed_beige_book "
            "WHERE release_code = ? AND fed_district = ? "
            "AND section_name = 'Summary of Economic Activity'",
            (edition, district),
        )
        if not row:
            district_summaries.append("")
            continue
        content = row["content_text"] if hasattr(row, "__getitem__") else row[0]
        try:
            summary = _summarize_district(content, district)
        except Exception as e:
            print(f"    District {district} summarization failed: {e}")
            summary = ""
        district_summaries.append(summary)
        if summary:
            db.execute(
                """INSERT INTO beige_book_summaries (release_code, fed_district, district_summary)
                   VALUES (?, ?, ?)
                   ON CONFLICT (release_code, fed_district) WHERE fed_district IS NOT NULL
                   DO UPDATE SET district_summary = EXCLUDED.district_summary,
                                 generated_at = NOW()""",
                (edition, district, summary),
            )

    # Extract national themes from district summaries
    non_empty = [s for s in district_summaries if s]
    themes: dict = {}
    if non_empty:
        try:
            themes = _extract_national_themes(non_empty)
        except Exception as e:
            print(f"  National themes extraction failed: {e}")
            themes = {"growth": None, "employment": None, "prices": None, "lending": None}
    else:
        themes = {"growth": None, "employment": None, "prices": None, "lending": None}

    # Generate national prose summary
    national_summary = ""
    if non_empty:
        try:
            combined = "\n\n".join(
                f"District {i + 1}: {s}" for i, s in enumerate(district_summaries) if s
            )
            national_summary = _summarize_district(combined, 0)
        except Exception as e:
            print(f"  National summary generation failed: {e}")

    db.execute(
        """INSERT INTO beige_book_summaries (release_code, fed_district, national_summary, themes)
           VALUES (?, NULL, ?, ?)
           ON CONFLICT (release_code) WHERE fed_district IS NULL
           DO UPDATE SET national_summary = EXCLUDED.national_summary,
                         themes = EXCLUDED.themes,
                         generated_at = NOW()""",
        (edition, national_summary, json_module.dumps(themes)),
    )
    db.commit()
    print(f"  LLM summarization complete for edition {edition}")

    return total_upserted


def run(
    db: Database,
    config: Config,
    *,
    edition: str | None = None,
    all_editions: bool = False,
    skip_llm: bool = False,
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

    # Auto-disable LLM if API key is missing
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Warning: ANTHROPIC_API_KEY not set — LLM summarization disabled")
        skip_llm = True

    total = 0
    for ed in editions:
        print(f"\n--- Beige Book {ed} ---")
        count = ingest_edition(
            db, ed, delay=delay,
            base_url=config.fed_content.beige_book_base_url,
            skip_llm=skip_llm,
        )
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
