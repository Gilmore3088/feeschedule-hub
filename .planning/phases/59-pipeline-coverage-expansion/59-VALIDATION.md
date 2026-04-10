# Phase 59: Pipeline Coverage Expansion - Validation

**Created:** 2026-04-10
**Phase:** 59-pipeline-coverage-expansion

---

## Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest |
| Config file | `fee_crawler/tests/conftest.py` |
| Quick run command | `python -m pytest fee_crawler/tests/ -x -q` |
| Full suite command | `python -m pytest fee_crawler/tests/ -v` |

---

## Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Test File | Automated Command | Exists? |
|--------|----------|-----------|-----------|-------------------|---------|
| COV-01 | PDF URL probe discovers direct PDF URLs via pattern probing | unit | `fee_crawler/tests/test_pdf_probe.py` | `pytest fee_crawler/tests/test_pdf_probe.py -x` | Wave 0 |
| COV-01 | Google search fallback finds PDF URLs when probing fails | unit | `fee_crawler/tests/test_pdf_probe.py` | `pytest fee_crawler/tests/test_pdf_probe.py -x` | Wave 0 |
| COV-01 | accessibe.com blacklist filters false positive URLs | unit | `fee_crawler/tests/test_pdf_probe.py` | `pytest fee_crawler/tests/test_pdf_probe.py -x` | Wave 0 |
| COV-02 | Stealth Playwright fetch applies stealth plugin to browser context | unit | `fee_crawler/tests/test_stealth_fetcher.py` | `pytest fee_crawler/tests/test_stealth_fetcher.py -x` | Wave 0 |
| COV-02 | Rotating user agents selected from USER_AGENT_LIST when stealth=True | unit | `fee_crawler/tests/test_stealth_fetcher.py` | `pytest fee_crawler/tests/test_stealth_fetcher.py -x` | Wave 0 |
| COV-02 | Cloudflare challenge page detected and recorded as cloudflare_blocked | unit | `fee_crawler/tests/test_cloudflare_detection.py` | `pytest fee_crawler/tests/test_cloudflare_detection.py -x` | Wave 0 |

---

## Wave 0 Test Stubs

All test files are created as part of Plan 01 tasks (TDD: tests written before implementation).

### test_stealth_fetcher.py

```python
"""Tests for Playwright stealth integration in fetch_with_browser().

Wave 0 stub -- created during Plan 01 Task 1 execution.
"""
import pytest
from unittest.mock import patch, MagicMock


class TestStealthIntegration:
    """Verify stealth plugin is applied correctly to browser context."""

    def test_stealth_true_calls_apply_stealth_sync(self):
        """fetch_with_browser(stealth=True) calls apply_stealth_sync on context."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 1")

    def test_stealth_false_does_not_call_apply_stealth_sync(self):
        """fetch_with_browser(stealth=False) does NOT call apply_stealth_sync."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 1")

    def test_stealth_passes_user_agent_from_list(self):
        """fetch_with_browser(stealth=True) passes UA from USER_AGENT_LIST to new_context."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 1")

    def test_user_agent_list_has_minimum_entries(self):
        """USER_AGENT_LIST contains at least 5 realistic browser user agent strings."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 1")

    def test_stealth_adds_random_delay(self):
        """fetch_with_browser(stealth=True) sleeps 2-5s before page.goto()."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 1")
```

### test_cloudflare_detection.py

```python
"""Tests for Cloudflare challenge page detection.

Wave 0 stub -- created during Plan 01 Task 1 execution.
"""
import pytest


class TestCloudflareDetection:
    """Verify _is_cloudflare_blocked identifies challenge pages."""

    def test_cf_browser_verification_detected(self):
        """Content with 'cf-browser-verification' returns True."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 1")

    def test_checking_your_browser_detected(self):
        """Content with 'checking your browser' returns True."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 1")

    def test_normal_html_not_blocked(self):
        """Normal HTML without challenge markers returns False."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 1")

    def test_empty_content_not_blocked(self):
        """Empty bytes returns False."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 1")

    def test_markers_beyond_4096_not_detected(self):
        """Markers beyond first 4096 bytes are not detected."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 1")
```

### test_pdf_probe.py

```python
"""Tests for PDF URL probing and Google search fallback.

Wave 0 stub -- created during Plan 01 Task 2 execution.
"""
import pytest


class TestBlacklist:
    """Verify domain blacklist for false positive filtering."""

    def test_accessibe_blocked(self):
        """accessibe.com URLs are blacklisted."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 2")

    def test_subdomain_accessibe_blocked(self):
        """www.accessibe.com URLs are blacklisted."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 2")

    def test_normal_bank_not_blocked(self):
        """Normal bank URLs are not blacklisted."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 2")

    def test_ada_blocked(self):
        """ada.com URLs are blacklisted."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 2")


class TestPdfProbe:
    """Verify PDF URL pattern probing."""

    def test_pdf_probe_paths_count(self):
        """PDF_DIRECT_PROBE_PATHS has at least 14 entries ending in .pdf."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 2")

    def test_probe_returns_pdf_url(self):
        """probe_pdf_urls returns URL when HEAD returns 200 + application/pdf."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 2")

    def test_probe_skips_non_pdf(self):
        """probe_pdf_urls skips URLs returning text/html content type."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 2")

    def test_probe_skips_404(self):
        """probe_pdf_urls skips URLs returning 404."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 2")


class TestGoogleSearchFallback:
    """Verify Google search fallback when pattern probing finds nothing."""

    def test_google_fallback_called_when_probing_empty(self):
        """probe_pdf_urls calls _google_search_pdf_fallback when no PDFs found by probing."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 2")

    def test_google_fallback_not_called_when_probing_succeeds(self):
        """probe_pdf_urls does NOT call Google search when pattern probing finds a PDF."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 2")

    def test_google_fallback_filters_blacklisted(self):
        """_google_search_pdf_fallback filters out blacklisted domains from results."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 2")

    def test_google_fallback_returns_pdf_urls(self):
        """_google_search_pdf_fallback returns PDF URLs from Google search results."""
        pytest.skip("Wave 0 stub -- implement in Plan 01 Task 2")
```

---

## Sampling Rate

- **Per task commit:** `python -m pytest fee_crawler/tests/ -x -q`
- **Per wave merge:** `python -m pytest fee_crawler/tests/ -v`
- **Phase gate:** Full suite green before `/gsd-verify-work`

---

## Regression Guard

Existing test suite must remain green throughout phase execution:
```bash
python -m pytest fee_crawler/tests/ -x -q
```

Expected baseline: 60 tests passing (from prior phases).
