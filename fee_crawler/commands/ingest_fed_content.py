"""Ingest Fed speeches and research papers from RSS feeds into fed_content."""

from __future__ import annotations

import re
import time
from time import strftime

import feedparser

from fee_crawler.config import Config
from fee_crawler.db import Database


def _extract_date(entry: dict) -> str:
    """Extract the best available date from a feedparser entry."""
    # Try published first, then updated, then dc:date
    for field in ("published", "updated"):
        val = entry.get(field, "")
        if val:
            return val

    # Try parsed time structs
    for field in ("published_parsed", "updated_parsed"):
        parsed = entry.get(field)
        if parsed:
            return strftime("%Y-%m-%d", parsed)

    return ""

# Board of Governors speeches RSS feed
SPEECHES_FEED = "https://www.federalreserve.gov/feeds/speeches.xml"

# Fed in Print RSS feeds (per-district research papers)
FED_IN_PRINT_FEEDS: dict[int, str] = {
    1: "https://fedinprint.org/rss/boston.rss",
    2: "https://fedinprint.org/rss/newyork.rss",
    3: "https://fedinprint.org/rss/philadelphia.rss",
    4: "https://fedinprint.org/rss/cleveland.rss",
    5: "https://fedinprint.org/rss/richmond.rss",
    6: "https://fedinprint.org/rss/atlanta.rss",
    7: "https://fedinprint.org/rss/chicago.rss",
    8: "https://fedinprint.org/rss/stlouis.rss",
    9: "https://fedinprint.org/rss/minneapolis.rss",
    10: "https://fedinprint.org/rss/kansascity.rss",
    11: "https://fedinprint.org/rss/dallas.rss",
    12: "https://fedinprint.org/rss/sanfrancisco.rss",
}

# Federal Reserve Bank presidents -> district mapping (2024-2026)
FED_PRESIDENT_DISTRICT: dict[str, int] = {
    "Collins": 1,
    "Williams": 2,
    "Harker": 3,
    "Hammack": 4,
    "Barkin": 5,
    "Bostic": 6,
    "Goolsbee": 7,
    "Musalem": 8,
    "Kashkari": 9,
    "Schmid": 10,
    "Logan": 11,
    "Daly": 12,
}

# Board of Governors members (no specific district)
BOARD_GOVERNORS = {
    "Powell", "Jefferson", "Barr", "Bowman", "Cook", "Kugler", "Waller",
}


def _classify_content_type(title: str) -> str:
    """Classify a speech/content item by its title."""
    title_lower = title.lower()
    if "testimony" in title_lower:
        return "testimony"
    if "press conference" in title_lower:
        return "press_release"
    return "speech"


def _extract_speaker_district(title: str) -> tuple[str | None, int | None]:
    """Extract speaker name and district from an RSS title.

    Speeches RSS titles typically start with the speaker's last name,
    e.g. "Powell, Monetary Policy and the Economy" or
    "Goolsbee, Economic Outlook for the Seventh District".
    """
    # Try to extract speaker last name before the first comma
    match = re.match(r"^(\w+),", title)
    if not match:
        return None, None

    last_name = match.group(1)

    # Check if this is a known Fed president
    district = FED_PRESIDENT_DISTRICT.get(last_name)
    if district:
        return last_name, district

    # Board governors get NULL district
    if last_name in BOARD_GOVERNORS:
        return last_name, None

    # Unknown speaker -- still store but no district tag
    return last_name, None


def _ingest_speeches(
    db: Database,
    config: Config,
    *,
    limit: int | None = None,
) -> int:
    """Parse the Board of Governors speeches RSS feed."""
    feed_url = config.fed_content.speeches_feed
    print(f"Fetching speeches feed: {feed_url}")

    feed = feedparser.parse(feed_url)
    if feed.bozo and not feed.entries:
        print(f"  Feed error: {feed.bozo_exception}")
        return 0

    print(f"  {len(feed.entries)} entries")
    upserted = 0

    entries = feed.entries[:limit] if limit else feed.entries
    for entry in entries:
        title = entry.get("title", "").strip()
        link = entry.get("link", "").strip()
        if not title or not link:
            continue

        published = _extract_date(entry)
        description = entry.get("summary", "").strip() or None
        content_type = _classify_content_type(title)
        speaker, district = _extract_speaker_district(title)

        try:
            db.execute(
                """INSERT OR REPLACE INTO fed_content
                   (content_type, title, speaker, fed_district, source_url,
                    published_at, description, source_feed)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (content_type, title, speaker, district, link,
                 published, description, "speeches"),
            )
            upserted += 1
        except Exception as e:
            print(f"  Error inserting speech: {e}")

    db.commit()
    print(f"  Speeches upserted: {upserted}")
    return upserted


def _ingest_fed_in_print(
    db: Database,
    config: Config,
    *,
    limit: int | None = None,
) -> int:
    """Parse Fed in Print RSS feeds (one per district)."""
    delay = config.fed_content.crawl_delay
    total_upserted = 0

    for district, feed_url in FED_IN_PRINT_FEEDS.items():
        print(f"  District {district}: {feed_url}")
        time.sleep(delay)

        feed = feedparser.parse(feed_url)
        if feed.bozo and not feed.entries:
            print(f"    Feed error: {feed.bozo_exception}")
            continue

        entries = feed.entries[:limit] if limit else feed.entries
        upserted = 0
        for entry in entries:
            title = entry.get("title", "").strip()
            link = entry.get("link", "").strip()
            if not title or not link:
                continue

            published = _extract_date(entry)

            description = entry.get("summary", "").strip() or None
            # Extract author if available
            author = entry.get("author", "").strip() or None

            try:
                db.execute(
                    """INSERT OR REPLACE INTO fed_content
                       (content_type, title, speaker, fed_district, source_url,
                        published_at, description, source_feed)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    ("research", title, author, district, link,
                     published, description, "fed_in_print"),
                )
                upserted += 1
            except Exception as e:
                print(f"    Error inserting research: {e}")

        total_upserted += upserted
        print(f"    {upserted} items")

    db.commit()
    print(f"  Research total upserted: {total_upserted}")
    return total_upserted


def run(
    db: Database,
    config: Config,
    *,
    content_type: str | None = None,
    limit: int | None = None,
) -> None:
    """Entry point for the CLI command."""
    total = 0

    if content_type in (None, "speeches"):
        print("\n--- Fed Speeches ---")
        total += _ingest_speeches(db, config, limit=limit)

    if content_type in (None, "research"):
        print("\n--- Fed in Print (Research) ---")
        total += _ingest_fed_in_print(db, config, limit=limit)

    # Print summary
    row = db.fetchone("SELECT COUNT(*) as cnt FROM fed_content")
    cnt = row["cnt"] if row else 0
    speeches = db.fetchone(
        "SELECT COUNT(*) as cnt FROM fed_content WHERE content_type IN ('speech', 'testimony')"
    )
    sp_cnt = speeches["cnt"] if speeches else 0
    research = db.fetchone(
        "SELECT COUNT(*) as cnt FROM fed_content WHERE content_type = 'research'"
    )
    rs_cnt = research["cnt"] if research else 0
    print(f"\nFed content ingestion complete: {total} rows upserted")
    print(f"Total records: {cnt:,} (speeches: {sp_cnt:,}, research: {rs_cnt:,})")
