"""Tests for URL discoverer helper methods."""

import pytest

from fee_crawler.pipeline.url_discoverer import (
    NON_FEE_PDF_KEYWORDS,
    UrlDiscoverer,
)


class FakeConfig:
    class crawl:
        user_agent = "test-bot"
        delay_seconds = 0
        respect_robots_txt = False


@pytest.fixture
def discoverer():
    return UrlDiscoverer(FakeConfig())


class TestNormalizeDomain:
    def test_strips_www(self):
        assert UrlDiscoverer._normalize_domain("www.example.com") == "example.com"

    def test_no_www(self):
        assert UrlDiscoverer._normalize_domain("example.com") == "example.com"

    def test_lowercases(self):
        assert UrlDiscoverer._normalize_domain("WWW.Example.COM") == "example.com"


class TestIsSameDomain:
    def test_exact_match(self, discoverer):
        assert discoverer._is_same_domain(
            "https://example.com/fees", "https://example.com"
        )

    def test_www_vs_bare(self, discoverer):
        assert discoverer._is_same_domain(
            "https://www.example.com/fees", "https://example.com"
        )

    def test_subdomain_allowed(self, discoverer):
        assert discoverer._is_same_domain(
            "https://pages.example.com/doc.pdf", "https://example.com"
        )

    def test_different_domain_rejected(self, discoverer):
        assert not discoverer._is_same_domain(
            "https://other.com/fees", "https://example.com"
        )


class TestIsHomepageRedirect:
    def test_root_path(self, discoverer):
        assert discoverer._is_homepage_redirect(
            "https://example.com/", "https://example.com"
        )

    def test_empty_path(self, discoverer):
        assert discoverer._is_homepage_redirect(
            "https://example.com", "https://example.com"
        )

    def test_www_redirect(self, discoverer):
        assert discoverer._is_homepage_redirect(
            "https://www.example.com/", "https://example.com"
        )

    def test_subpage_not_homepage(self, discoverer):
        assert not discoverer._is_homepage_redirect(
            "https://example.com/fees", "https://example.com"
        )

    def test_subdomain_homepage_not_flagged(self, discoverer):
        """Subdomain homepage is NOT the base homepage."""
        assert not discoverer._is_homepage_redirect(
            "https://pages.example.com/", "https://example.com"
        )


class TestIsFeePdfUrl:
    def test_fee_schedule_accepted(self, discoverer):
        assert discoverer._is_fee_pdf_url(
            "https://example.com/docs/fee-schedule.pdf"
        )

    def test_generic_pdf_rejected(self, discoverer):
        assert not discoverer._is_fee_pdf_url(
            "https://example.com/docs/brochure.pdf"
        )

    def test_skip_a_pay_rejected(self, discoverer):
        assert not discoverer._is_fee_pdf_url(
            "https://example.com/docs/skip-a-pay-form.pdf"
        )

    def test_switch_kit_rejected(self, discoverer):
        assert not discoverer._is_fee_pdf_url(
            "https://example.com/docs/switch-kit.pdf"
        )


class TestNonFeePdfKeywords:
    def test_skip_a_pay_in_list(self):
        assert "skip-a-pay" in NON_FEE_PDF_KEYWORDS

    def test_switch_kit_in_list(self):
        assert "switch-kit" in NON_FEE_PDF_KEYWORDS

    def test_membership_application_in_list(self):
        assert "membership-application" in NON_FEE_PDF_KEYWORDS


class TestIsFeeContent:
    def test_strict_needs_five(self, discoverer):
        text = "monthly maintenance fee, overdraft fee, nsf fee, atm fee"
        assert discoverer._is_fee_content(text, strict=False)
        assert not discoverer._is_fee_content(text, strict=True)

    def test_strict_passes_with_five(self, discoverer):
        text = (
            "monthly maintenance fee, overdraft fee, nsf fee, "
            "atm fee, wire transfer fee"
        )
        assert discoverer._is_fee_content(text, strict=True)

    def test_empty_text(self, discoverer):
        assert not discoverer._is_fee_content("", strict=False)


class TestScoreLink:
    def test_fee_schedule_pdf_scores_high(self, discoverer):
        score = discoverer._score_link(
            "https://example.com/fee-schedule.pdf", "Fee Schedule"
        )
        assert score >= 20

    def test_login_penalized(self, discoverer):
        score = discoverer._score_link(
            "https://example.com/login", "Online Banking Login"
        )
        assert score == 0
