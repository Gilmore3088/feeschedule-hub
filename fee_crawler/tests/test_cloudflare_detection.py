"""Tests for Cloudflare challenge detection in stealth fetcher.

Verifies that _is_cloudflare_blocked correctly identifies Cloudflare
challenge pages from content bytes.
"""

import pytest


def test_cloudflare_detected_cf_browser_verification():
    """Content with 'cf-browser-verification' in first 4096 bytes returns True."""
    from fee_crawler.pipeline.playwright_fetcher import _is_cloudflare_blocked

    html = b'<html><head></head><body><div id="cf-browser-verification">Checking your browser</div></body></html>'
    assert _is_cloudflare_blocked(html) is True


def test_cloudflare_detected_checking_your_browser():
    """Content with 'checking your browser' in first 4096 bytes returns True."""
    from fee_crawler.pipeline.playwright_fetcher import _is_cloudflare_blocked

    html = b'<html><body>Please wait while we are checking your browser...</body></html>'
    assert _is_cloudflare_blocked(html) is True


def test_cloudflare_not_detected_normal_html():
    """Normal HTML without challenge markers returns False."""
    from fee_crawler.pipeline.playwright_fetcher import _is_cloudflare_blocked

    html = b'<html><body><h1>Fee Schedule</h1><p>Monthly maintenance fee: $12.00</p></body></html>'
    assert _is_cloudflare_blocked(html) is False


def test_cloudflare_not_detected_empty_content():
    """Empty content returns False."""
    from fee_crawler.pipeline.playwright_fetcher import _is_cloudflare_blocked

    assert _is_cloudflare_blocked(b"") is False


def test_cloudflare_markers_beyond_4096_not_detected():
    """Markers beyond the first 4096 bytes should NOT be detected."""
    from fee_crawler.pipeline.playwright_fetcher import _is_cloudflare_blocked

    # Create content where markers appear only after 4096 bytes
    padding = b"x" * 5000
    html = padding + b"cf-browser-verification checking your browser cloudflare"
    assert _is_cloudflare_blocked(html) is False


def test_cloudflare_detected_challenge_platform():
    """Content with 'challenge-platform' marker returns True."""
    from fee_crawler.pipeline.playwright_fetcher import _is_cloudflare_blocked

    html = b'<html><body><div class="challenge-platform">Verifying...</div></body></html>'
    assert _is_cloudflare_blocked(html) is True


def test_cloudflare_detected_cloudflare_word():
    """Content with 'cloudflare' marker returns True."""
    from fee_crawler.pipeline.playwright_fetcher import _is_cloudflare_blocked

    html = b'<html><body>Performance & security by Cloudflare</body></html>'
    assert _is_cloudflare_blocked(html) is True
