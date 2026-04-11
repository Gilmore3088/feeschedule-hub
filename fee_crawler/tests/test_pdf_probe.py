"""Tests for PDF URL probe via pattern probing + Google search fallback.

Verifies PDF_DIRECT_PROBE_PATHS, _is_blacklisted, probe_pdf_urls,
and _google_search_pdf_fallback functionality.
"""

from unittest.mock import MagicMock, patch, PropertyMock

import pytest


def test_pdf_probe_paths_has_minimum_entries():
    """PDF_DIRECT_PROBE_PATHS must contain at least 14 PDF-specific paths."""
    from fee_crawler.pipeline.url_discoverer import PDF_DIRECT_PROBE_PATHS

    assert len(PDF_DIRECT_PROBE_PATHS) >= 14
    for path in PDF_DIRECT_PROBE_PATHS:
        assert path.endswith(".pdf"), f"Path does not end with .pdf: {path}"


def test_blacklisted_accessibe_com():
    """accessibe.com should be blacklisted."""
    from fee_crawler.pipeline.url_discoverer import _is_blacklisted

    assert _is_blacklisted("https://accessibe.com/ada-widget") is True


def test_blacklisted_www_accessibe_com():
    """www.accessibe.com (subdomain) should also be blacklisted."""
    from fee_crawler.pipeline.url_discoverer import _is_blacklisted

    assert _is_blacklisted("https://www.accessibe.com/something") is True


def test_blacklisted_ada_com():
    """ada.com should be blacklisted."""
    from fee_crawler.pipeline.url_discoverer import _is_blacklisted

    assert _is_blacklisted("https://ada.com/widget") is True


def test_not_blacklisted_normal_bank():
    """Normal bank domains should NOT be blacklisted."""
    from fee_crawler.pipeline.url_discoverer import _is_blacklisted

    assert _is_blacklisted("https://somebank.com/fees") is False


def test_probe_pdf_urls_returns_pdf_on_200():
    """probe_pdf_urls returns URLs that respond with 200 + application/pdf."""
    from fee_crawler.pipeline.url_discoverer import UrlDiscoverer

    mock_config = MagicMock()
    mock_config.crawl.user_agent = "TestBot"
    mock_config.crawl.delay_seconds = 0
    mock_config.crawl.respect_robots_txt = False

    discoverer = UrlDiscoverer(mock_config)

    # Mock the session.head to return 200 + application/pdf for /fees.pdf
    def mock_head(url, timeout=10, allow_redirects=True):
        resp = MagicMock()
        if url.endswith("/fees.pdf"):
            resp.status_code = 200
            resp.headers = {"Content-Type": "application/pdf"}
        else:
            resp.status_code = 404
            resp.headers = {"Content-Type": "text/html"}
        return resp

    discoverer.session.head = mock_head

    results = discoverer.probe_pdf_urls("https://example.com", institution_name="Example Bank")
    assert len(results) >= 1
    assert any("/fees.pdf" in u for u in results)


def test_probe_pdf_urls_skips_non_pdf_content_type():
    """probe_pdf_urls skips paths that return non-PDF content types."""
    from fee_crawler.pipeline.url_discoverer import UrlDiscoverer

    mock_config = MagicMock()
    mock_config.crawl.user_agent = "TestBot"
    mock_config.crawl.delay_seconds = 0
    mock_config.crawl.respect_robots_txt = False

    discoverer = UrlDiscoverer(mock_config)

    # All paths return 200 but text/html
    def mock_head(url, timeout=10, allow_redirects=True):
        resp = MagicMock()
        resp.status_code = 200
        resp.headers = {"Content-Type": "text/html"}
        return resp

    discoverer.session.head = mock_head

    # Mock Google search to return nothing (so we test pattern probing isolation)
    with patch.object(discoverer, "_google_search_pdf_fallback", return_value=[]):
        results = discoverer.probe_pdf_urls("https://example.com", institution_name="Example Bank")

    assert len(results) == 0


def test_probe_pdf_urls_skips_404():
    """probe_pdf_urls skips paths that return 404."""
    from fee_crawler.pipeline.url_discoverer import UrlDiscoverer

    mock_config = MagicMock()
    mock_config.crawl.user_agent = "TestBot"
    mock_config.crawl.delay_seconds = 0
    mock_config.crawl.respect_robots_txt = False

    discoverer = UrlDiscoverer(mock_config)

    def mock_head(url, timeout=10, allow_redirects=True):
        resp = MagicMock()
        resp.status_code = 404
        resp.headers = {"Content-Type": "text/html"}
        return resp

    discoverer.session.head = mock_head

    with patch.object(discoverer, "_google_search_pdf_fallback", return_value=[]):
        results = discoverer.probe_pdf_urls("https://example.com", institution_name="Example Bank")

    assert len(results) == 0


def test_probe_pdf_urls_calls_google_fallback_when_probing_finds_nothing():
    """When pattern probing finds nothing, Google search fallback is called."""
    from fee_crawler.pipeline.url_discoverer import UrlDiscoverer

    mock_config = MagicMock()
    mock_config.crawl.user_agent = "TestBot"
    mock_config.crawl.delay_seconds = 0
    mock_config.crawl.respect_robots_txt = False

    discoverer = UrlDiscoverer(mock_config)

    # All probes return 404
    def mock_head(url, timeout=10, allow_redirects=True):
        resp = MagicMock()
        resp.status_code = 404
        resp.headers = {"Content-Type": "text/html"}
        return resp

    discoverer.session.head = mock_head

    google_pdf_url = "https://example.com/documents/fee-schedule-2024.pdf"
    with patch.object(
        discoverer, "_google_search_pdf_fallback",
        return_value=[google_pdf_url],
    ) as mock_google:
        results = discoverer.probe_pdf_urls(
            "https://example.com",
            institution_name="Example Bank",
        )

    mock_google.assert_called_once_with("Example Bank", "https://example.com")
    assert google_pdf_url in results


def test_google_search_fallback_returns_pdf_urls():
    """_google_search_pdf_fallback returns PDF URLs from Google results."""
    from fee_crawler.pipeline.url_discoverer import UrlDiscoverer

    mock_config = MagicMock()
    mock_config.crawl.user_agent = "TestBot"
    mock_config.crawl.delay_seconds = 0
    mock_config.crawl.respect_robots_txt = False

    discoverer = UrlDiscoverer(mock_config)

    google_results = [
        {"url": "https://example.com/docs/fee-schedule.pdf"},
        {"url": "https://example.com/about"},
    ]

    with patch("fee_crawler.commands.google_discover._search_google", return_value=google_results):
        results = discoverer._google_search_pdf_fallback("Example Bank", "https://example.com")

    assert len(results) == 1
    assert results[0] == "https://example.com/docs/fee-schedule.pdf"


def test_google_search_fallback_filters_blacklisted():
    """_google_search_pdf_fallback filters out blacklisted domains."""
    from fee_crawler.pipeline.url_discoverer import UrlDiscoverer

    mock_config = MagicMock()
    mock_config.crawl.user_agent = "TestBot"
    mock_config.crawl.delay_seconds = 0
    mock_config.crawl.respect_robots_txt = False

    discoverer = UrlDiscoverer(mock_config)

    google_results = [
        {"url": "https://accessibe.com/fee-schedule.pdf"},
        {"url": "https://example.com/docs/fees.pdf"},
    ]

    with patch("fee_crawler.commands.google_discover._search_google", return_value=google_results):
        results = discoverer._google_search_pdf_fallback("Example Bank", "https://example.com")

    assert len(results) == 1
    assert results[0] == "https://example.com/docs/fees.pdf"
