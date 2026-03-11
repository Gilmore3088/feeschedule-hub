"""Search API fallback for fee schedule URL discovery.

When sitemap, common paths, and link scanning all fail, use a search
engine API to find fee schedule pages. Currently supports SerpAPI.

Gated behind SERPAPI_API_KEY environment variable.
"""

import logging
import os
import time
from dataclasses import dataclass
from urllib.parse import urlparse

import requests

from fee_crawler.db import Database

logger = logging.getLogger(__name__)

# Search query templates (tried in order until a result is found)
_SEARCH_QUERIES = [
    'site:{domain} "fee schedule" filetype:pdf',
    'site:{domain} "schedule of fees" filetype:pdf',
    'site:{domain} "fee schedule"',
    'site:{domain} "truth in savings" OR "schedule of fees" OR "fee disclosure"',
]

# Cost per SerpAPI search (approximate)
_COST_PER_SEARCH = 0.01

# Cache TTL in days
_CACHE_TTL_DAYS = 30

_SERPAPI_URL = "https://serpapi.com/search"


@dataclass
class SearchResult:
    """Result of a search-based discovery attempt."""

    found: bool = False
    url: str | None = None
    query_used: str | None = None
    cost_incurred: float = 0.0
    error: str | None = None


class SearchDiscoverer:
    """Discover fee schedule URLs using search engine API.

    Requires SERPAPI_API_KEY environment variable.
    Results are cached in the discovery_cache table with a 30-day TTL.
    """

    def __init__(self, db: Database) -> None:
        self.api_key = os.environ.get("SERPAPI_API_KEY", "")
        self.db = db
        self._session = requests.Session()

    @property
    def available(self) -> bool:
        """Check if the search API is configured."""
        return bool(self.api_key)

    def _check_cache(self, target_id: int) -> SearchResult | None:
        """Check if we have a recent cached result for this institution."""
        row = self.db.fetchone(
            """SELECT result, found_url, error_message
               FROM discovery_cache
               WHERE crawl_target_id = ? AND discovery_method = 'search_api'
                 AND attempted_at > datetime('now', ?)""",
            (target_id, f"-{_CACHE_TTL_DAYS} days"),
        )
        if row is None:
            return None

        if row["result"] == "found" and row["found_url"]:
            return SearchResult(found=True, url=row["found_url"])
        return SearchResult(found=False, error=row["error_message"])

    def _save_cache(
        self,
        target_id: int,
        result: str,
        found_url: str | None = None,
        error: str | None = None,
    ) -> None:
        """Save a discovery result to the cache (upsert)."""
        self.db.execute(
            """INSERT INTO discovery_cache
               (crawl_target_id, discovery_method, result, found_url, error_message)
               VALUES (?, 'search_api', ?, ?, ?)
               ON CONFLICT(crawl_target_id, discovery_method) DO UPDATE SET
                 attempted_at = datetime('now'),
                 result = excluded.result,
                 found_url = excluded.found_url,
                 error_message = excluded.error_message""",
            (target_id, result, found_url, error),
        )
        self.db.commit()

    def _search(self, query: str) -> list[dict]:
        """Execute a single search via SerpAPI.

        Returns list of organic results with 'link' and 'title' keys.
        Never logs the full API URL (contains the API key).
        """
        try:
            resp = self._session.get(
                _SERPAPI_URL,
                params={
                    "q": query,
                    "api_key": self.api_key,
                    "engine": "google",
                    "num": 5,
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("organic_results", [])
        except requests.RequestException as e:
            # Strip query params from error to avoid logging API key
            safe_error = str(e).split("?")[0]
            logger.warning("Search API request failed: %s", safe_error)
            return []
        except (ValueError, KeyError):
            return []

    def _validate_url(self, url: str, expected_domain: str) -> bool:
        """Validate that a search result URL belongs to the expected domain."""
        result_domain = urlparse(url).netloc.lower()
        expected = expected_domain.lower()
        return result_domain == expected or result_domain.endswith("." + expected)

    def discover(
        self,
        target_id: int,
        domain: str,
        *,
        max_cost: float = 25.0,
        cost_so_far: float = 0.0,
    ) -> SearchResult:
        """Search for fee schedule URL for a given domain.

        Args:
            target_id: Institution's crawl_target_id.
            domain: Domain to search (e.g., "firstbank.com").
            max_cost: Maximum cost budget for this run.
            cost_so_far: Cost already incurred in this run.

        Returns:
            SearchResult with the best URL found (or error info).
        """
        if not self.available:
            return SearchResult(error="SERPAPI_API_KEY not set")

        # Check cache first
        cached = self._check_cache(target_id)
        if cached is not None:
            return cached

        # Check budget
        if cost_so_far >= max_cost:
            return SearchResult(error="search cost budget exhausted")

        total_cost = 0.0

        for template in _SEARCH_QUERIES:
            # Budget check per query
            if cost_so_far + total_cost + _COST_PER_SEARCH > max_cost:
                break

            query = template.format(domain=domain)
            results = self._search(query)
            total_cost += _COST_PER_SEARCH

            # Brief delay between queries to same API
            time.sleep(0.5)

            for result in results:
                link = result.get("link", "")
                if not link:
                    continue

                # Validate domain matches
                if not self._validate_url(link, domain):
                    continue

                # Found a matching result
                self._save_cache(target_id, "found", found_url=link)
                return SearchResult(
                    found=True,
                    url=link,
                    query_used=query,
                    cost_incurred=total_cost,
                )

        # No results found across all queries
        self._save_cache(target_id, "not_found")
        return SearchResult(
            found=False,
            cost_incurred=total_cost,
            error="no fee schedule found via search",
        )

    def close(self) -> None:
        """Close the HTTP session."""
        self._session.close()
