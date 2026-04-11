"""Tests for stealth Playwright fetcher integration.

Verifies that fetch_with_browser(stealth=True) applies playwright-stealth
to the browser context and rotates user agents.
"""

from unittest.mock import MagicMock, patch

import pytest


def _make_mock_browser():
    """Create a mock browser with page/context hierarchy."""
    mock_page = MagicMock()
    mock_page.content.return_value = "<html><body>Fee Schedule</body></html>" * 20
    mock_page.goto = MagicMock()
    mock_page.wait_for_load_state = MagicMock()
    mock_page.wait_for_timeout = MagicMock()
    mock_page.close = MagicMock()
    mock_page.route = MagicMock()
    mock_page.query_selector = MagicMock(return_value=None)

    mock_context = MagicMock()
    mock_context.new_page.return_value = mock_page
    mock_context.close = MagicMock()

    mock_browser = MagicMock()
    mock_browser.new_context.return_value = mock_context
    mock_browser.is_connected.return_value = True

    return mock_browser, mock_context, mock_page


def test_user_agent_list_has_minimum_entries():
    """USER_AGENT_LIST must contain at least 5 realistic browser UA strings."""
    from fee_crawler.pipeline.playwright_fetcher import USER_AGENT_LIST

    assert len(USER_AGENT_LIST) >= 5
    for ua in USER_AGENT_LIST:
        assert "Mozilla" in ua, f"UA does not look realistic: {ua}"


def test_stealth_true_calls_apply_stealth_sync():
    """When stealth=True, Stealth().apply_stealth_sync(context) must be called."""
    mock_browser, mock_context, _ = _make_mock_browser()
    mock_stealth_instance = MagicMock()

    with patch("fee_crawler.pipeline.playwright_fetcher._get_browser", return_value=mock_browser), \
         patch("playwright_stealth.Stealth", return_value=mock_stealth_instance) as mock_stealth_cls, \
         patch("fee_crawler.pipeline.playwright_fetcher._is_safe_url", return_value=True), \
         patch("fee_crawler.pipeline.playwright_fetcher.is_playwright_available", return_value=True), \
         patch("time.sleep"):

        from fee_crawler.pipeline.playwright_fetcher import fetch_with_browser
        result = fetch_with_browser("https://example.com/fees", stealth=True)

    mock_stealth_cls.assert_called_once()
    mock_stealth_instance.apply_stealth_sync.assert_called_once_with(mock_context)


def test_stealth_false_does_not_call_apply_stealth():
    """When stealth=False (default), Stealth should NOT be called."""
    mock_browser, mock_context, _ = _make_mock_browser()
    mock_stealth_instance = MagicMock()

    with patch("fee_crawler.pipeline.playwright_fetcher._get_browser", return_value=mock_browser), \
         patch("playwright_stealth.Stealth", return_value=mock_stealth_instance) as mock_stealth_cls, \
         patch("fee_crawler.pipeline.playwright_fetcher._is_safe_url", return_value=True), \
         patch("fee_crawler.pipeline.playwright_fetcher.is_playwright_available", return_value=True):

        from fee_crawler.pipeline.playwright_fetcher import fetch_with_browser
        result = fetch_with_browser("https://example.com/fees", stealth=False)

    # Stealth should NOT have been called when stealth=False
    mock_stealth_cls.assert_not_called()
    mock_stealth_instance.apply_stealth_sync.assert_not_called()


def test_stealth_true_passes_random_user_agent():
    """When stealth=True, a UA from USER_AGENT_LIST must be passed to new_context()."""
    from fee_crawler.pipeline.playwright_fetcher import USER_AGENT_LIST

    mock_browser, _, _ = _make_mock_browser()

    with patch("fee_crawler.pipeline.playwright_fetcher._get_browser", return_value=mock_browser), \
         patch("playwright_stealth.Stealth", return_value=MagicMock()), \
         patch("fee_crawler.pipeline.playwright_fetcher._is_safe_url", return_value=True), \
         patch("fee_crawler.pipeline.playwright_fetcher.is_playwright_available", return_value=True), \
         patch("time.sleep"):

        from fee_crawler.pipeline.playwright_fetcher import fetch_with_browser
        result = fetch_with_browser("https://example.com/fees", stealth=True)

    call_kwargs = mock_browser.new_context.call_args
    ua_passed = call_kwargs.kwargs.get("user_agent")
    assert ua_passed in USER_AGENT_LIST, f"User agent '{ua_passed}' not in USER_AGENT_LIST"
