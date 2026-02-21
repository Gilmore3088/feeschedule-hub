"""Discover fee schedule URLs on institution websites.

Strategy (in order):
1. Check robots.txt compliance
2. Probe common fee schedule URL paths
3. Scan homepage links for fee-related keywords
4. Follow promising internal links one level deep for PDF discovery
"""

import re
import time
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

from fee_crawler.config import Config

# Common paths where banks publish fee schedules (ordered by likelihood)
COMMON_PATHS = [
    "/fees",
    "/fee-schedule",
    "/disclosures",
    "/fee-schedules",
    "/feeschedule",
    "/rates-and-fees",
    "/account-fees",
    "/schedule-of-fees",
    "/pricing",
    "/personal/fees",
    "/personal/fee-schedule",
    "/personal/disclosures",
    "/personal-banking/fees",
    "/resources/disclosures",
]

# Keywords to match in link text or href
FEE_LINK_KEYWORDS = [
    "fee schedule",
    "fee disclosure",
    "schedule of fees",
    "schedule of charges",
    "service fee",
    "account fee",
    "truth in savings",
    "truth-in-savings",
    "reg dd",
    "fee information",
    "service charges",
    "pricing schedule",
]

# Broader keywords for secondary scoring
FEE_LINK_KEYWORDS_BROAD = [
    "fees",
    "disclosures",
    "pricing",
    "charges",
    "fee chart",
]

# Content keywords that confirm a page is about fees (need 3+ matches)
FEE_CONTENT_KEYWORDS = [
    "monthly maintenance fee",
    "monthly service fee",
    "monthly service charge",
    "overdraft fee",
    "nsf fee",
    "non-sufficient funds",
    "atm fee",
    "wire transfer fee",
    "stop payment",
    "insufficient funds",
    "account analysis",
    "service charge",
    "schedule of fees",
    "fee schedule",
    "account fee",
    "checking account",
    "savings account",
    "per item fee",
    "dormant account",
    "statement fee",
]

# URL path keywords that indicate a PDF is a fee schedule
# "fee" alone is a strong signal; other terms need compound matches
FEE_PDF_URL_KEYWORDS = [
    "fee-schedule", "fee_schedule", "feeschedule",
    "fee-disclosure", "fee_disclosure",
    "schedule-of-fees", "schedule_of_fees", "scheduleoffees",
    "truth-in-savings", "truth_in_savings",
    "reg-dd", "reg_dd",
    "account-fee", "account_fee",
    "service-fee", "service_fee",
    "pricing-schedule", "pricing_schedule",
    "deposit-fee", "deposit_fee",
]

# Single-word strong signals (if "fee" or "fees" is in URL path, likely relevant)
FEE_PDF_SINGLE_KEYWORDS = ["fee", "fees"]

# URL path keywords that indicate a PDF is NOT a fee schedule
NON_FEE_PDF_KEYWORDS = [
    "annual-report", "annual_report", "annualreport",
    "cra", "community-reinvestment", "complaint",
    "statement-of-condition", "statementofcondition",
    "privacy", "security", "bsa", "anti-money",
    "direct-deposit", "directdeposit", "worksheet",
    "newsletter", "press-release", "investor",
    "digital-services", "digital_services",
    "online-banking-agreement", "mobile-banking",
    "loan-disclosure", "loan_disclosure",
    "option-account", "option_account",
    "error-resolution", "errorresolution",
    "annual-error", "annualerror",
    "wire-transfer-agreement", "wire_transfer_agreement",
    "fund-prospectus", "mutual-fund",
    "credit-card-agreement", "creditcardagreement",
    "skip-a-pay", "skip_a_pay", "skipapay", "skip-a-payment",
    "switch-kit", "switch_kit", "switchkit",
    "membership-application", "membership_application",
    "account-opening", "account_opening",
    "new-member", "new_member",
    "signature-card", "signature_card",
]


@dataclass
class DiscoveryResult:
    """Result of URL discovery for a single institution."""

    found: bool = False
    fee_schedule_url: str | None = None
    document_type: str | None = None  # pdf | html
    method: str | None = None  # common_path | link_scan | deep_scan
    confidence: float = 0.0
    pages_checked: int = 0
    error: str | None = None
    candidate_urls: list[str] = field(default_factory=list)


@dataclass
class _LinkCandidate:
    """A candidate link found during scanning."""

    url: str
    text: str
    score: float
    is_pdf: bool


class UrlDiscoverer:
    """Discovers fee schedule URLs on a single institution's website."""

    def __init__(self, config: Config) -> None:
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": config.crawl.user_agent,
            "Accept": "text/html,application/xhtml+xml,application/pdf,*/*",
            "Accept-Language": "en-US,en;q=0.9",
        })
        self.delay = config.crawl.delay_seconds
        self._last_request_time: float = 0

    def _throttle(self) -> None:
        """Enforce minimum delay between requests."""
        elapsed = time.time() - self._last_request_time
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self._last_request_time = time.time()

    def _fetch(self, url: str, timeout: int = 15, method: str = "GET") -> requests.Response | None:
        """Fetch a URL with throttling and error handling."""
        self._throttle()
        try:
            if method == "HEAD":
                resp = self.session.head(url, timeout=timeout, allow_redirects=True)
            else:
                resp = self.session.get(url, timeout=timeout, allow_redirects=True)
            return resp
        except (requests.RequestException, Exception):
            return None

    def _probe_url(self, url: str, timeout: int = 10) -> requests.Response | None:
        """Light probe: HEAD first, GET only if needed. Uses shorter delay."""
        saved_delay = self.delay
        self.delay = min(self.delay, 0.5)  # Faster probing
        try:
            resp = self._fetch(url, timeout=timeout, method="HEAD")
            if resp is not None and resp.status_code == 200:
                # HEAD succeeded: now GET the full content
                self.delay = saved_delay
                return self._fetch(url, timeout=timeout)
            return resp
        finally:
            self.delay = saved_delay

    def _check_robots(self, base_url: str) -> RobotFileParser | None:
        """Parse robots.txt for the domain."""
        if not self.config.crawl.respect_robots_txt:
            return None

        robots_url = urljoin(base_url, "/robots.txt")
        rp = RobotFileParser()
        try:
            resp = self._fetch(robots_url, timeout=10)
            if resp and resp.status_code == 200:
                rp.parse(resp.text.splitlines())
                return rp
        except Exception:
            pass
        return None

    def _is_allowed(self, url: str, robots: RobotFileParser | None) -> bool:
        """Check if URL is allowed by robots.txt."""
        if robots is None:
            return True
        try:
            return robots.can_fetch(self.config.crawl.user_agent, url)
        except Exception:
            return True

    def _is_pdf_url(self, url: str) -> bool:
        """Check if a URL points to a PDF based on extension."""
        path = urlparse(url).path.lower()
        return path.endswith(".pdf")

    def _is_fee_content(self, text: str, strict: bool = False) -> bool:
        """Check if page content contains fee-related keywords.

        Args:
            text: Page text to check.
            strict: If True, require 5+ matches (use for pages that
                    might be homepages or marketing pages). If False,
                    require 3+ (for known fee-related paths).
        """
        lower = text.lower()
        matches = sum(1 for kw in FEE_CONTENT_KEYWORDS if kw in lower)
        threshold = 5 if strict else 3
        return matches >= threshold

    def _is_fee_pdf_url(self, url: str) -> bool:
        """Check if a PDF URL likely points to a fee schedule (not CRA file, etc.)."""
        path_lower = urlparse(url).path.lower()
        # Reject known non-fee PDFs first
        for kw in NON_FEE_PDF_KEYWORDS:
            if kw in path_lower:
                return False
        # Accept compound fee-related terms
        for kw in FEE_PDF_URL_KEYWORDS:
            if kw in path_lower:
                return True
        # Accept if "fee" or "fees" appears as a word boundary in the path
        for kw in FEE_PDF_SINGLE_KEYWORDS:
            if re.search(rf"\b{kw}\b", path_lower):
                return True
        # Unknown PDF: don't auto-accept
        return False

    @staticmethod
    def _normalize_domain(netloc: str) -> str:
        """Strip www. prefix for consistent domain comparison."""
        netloc = netloc.lower()
        if netloc.startswith("www."):
            netloc = netloc[4:]
        return netloc

    def _is_same_domain(self, url: str, base_url: str) -> bool:
        """Check if URL is on the same domain (or subdomain)."""
        base_domain = self._normalize_domain(urlparse(base_url).netloc)
        url_domain = self._normalize_domain(urlparse(url).netloc)
        return url_domain == base_domain or url_domain.endswith("." + base_domain)

    def _is_homepage_redirect(self, response_url: str, base_url: str) -> bool:
        """Check if a response URL is effectively the homepage (redirect detected)."""
        resp_parsed = urlparse(response_url)
        base_parsed = urlparse(base_url)
        resp_domain = self._normalize_domain(resp_parsed.netloc)
        base_domain = self._normalize_domain(base_parsed.netloc)
        resp_path = resp_parsed.path.rstrip("/")
        return resp_domain == base_domain and resp_path in ("", "/")

    def _score_link(self, href: str, text: str) -> float:
        """Score a link based on how likely it is a fee schedule."""
        score = 0.0
        href_lower = href.lower()
        text_lower = text.lower().strip()

        # Strong keyword matches in link text
        for kw in FEE_LINK_KEYWORDS:
            if kw in text_lower:
                score += 10.0
            if kw.replace(" ", "-") in href_lower or kw.replace(" ", "_") in href_lower:
                score += 8.0

        # Broad keyword matches
        for kw in FEE_LINK_KEYWORDS_BROAD:
            if kw in text_lower:
                score += 3.0
            if kw in href_lower:
                score += 2.0

        # PDF bonus (fee schedules are very often PDFs)
        if self._is_pdf_url(href):
            score += 5.0

        # PDF URL quality: bonus for fee-related PDF paths, penalty for non-fee PDFs
        if self._is_pdf_url(href):
            if self._is_fee_pdf_url(href):
                score += 8.0  # Strong signal: PDF with fee-related path
            else:
                path_lower = urlparse(href).path.lower()
                for kw in NON_FEE_PDF_KEYWORDS:
                    if kw in path_lower:
                        score -= 10.0  # Known non-fee PDF
                        break

        # Penalize likely non-fee pages
        penalty_words = [
            "login", "sign in", "apply", "open account", "careers",
            "contact", "branch", "atm locator", "privacy", "security",
            "cookie", "sitemap", "investor", "annual report", "press",
        ]
        for pw in penalty_words:
            if pw in text_lower or pw in href_lower:
                score -= 5.0

        # Penalize search result pages
        if "?s=" in href_lower or "?q=" in href_lower or "/search" in href_lower:
            score -= 8.0

        return max(score, 0.0)

    def _scan_links(self, html: str, base_url: str) -> list[_LinkCandidate]:
        """Extract and score all links from an HTML page."""
        soup = BeautifulSoup(html, "lxml")
        candidates: list[_LinkCandidate] = []
        seen_urls: set[str] = set()

        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"].strip()
            if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
                continue

            abs_url = urljoin(base_url, href)

            # Deduplicate
            if abs_url in seen_urls:
                continue
            seen_urls.add(abs_url)

            # Only follow same-domain links
            if not self._is_same_domain(abs_url, base_url):
                continue

            text = a_tag.get_text(separator=" ", strip=True)
            score = self._score_link(abs_url, text)

            if score > 0:
                candidates.append(_LinkCandidate(
                    url=abs_url,
                    text=text,
                    score=score,
                    is_pdf=self._is_pdf_url(abs_url),
                ))

        # Sort by score descending
        candidates.sort(key=lambda c: c.score, reverse=True)
        return candidates

    def _verify_fee_page(self, url: str, base_url: str | None = None) -> tuple[bool, str | None]:
        """Verify that a URL actually contains fee schedule content.

        Returns (is_fee_page, document_type).
        """
        resp = self._fetch(url)
        if resp is None or resp.status_code != 200:
            return False, None

        # Detect redirect back to homepage
        if base_url and self._is_homepage_redirect(resp.url, base_url):
            return False, None

        content_type = resp.headers.get("Content-Type", "").lower()

        # PDF: only trust if URL path suggests fee schedule content
        if "application/pdf" in content_type or self._is_pdf_url(url):
            if self._is_fee_pdf_url(resp.url):
                return True, "pdf"
            # Unknown PDF: reject (too many false positives)
            return False, None

        # HTML: check content for fee keywords (strict when we don't know the source)
        if "text/html" in content_type:
            if self._is_fee_content(resp.text, strict=True):
                return True, "html"

        return False, None

    def discover(self, website_url: str) -> DiscoveryResult:
        """Run the full discovery pipeline for an institution's website.

        Returns a DiscoveryResult with the best fee schedule URL found.
        """
        result = DiscoveryResult()

        # Normalize base URL
        parsed = urlparse(website_url)
        if not parsed.scheme:
            website_url = "https://" + website_url
        base_url = f"{urlparse(website_url).scheme}://{urlparse(website_url).netloc}"

        # Step 0: Check robots.txt
        robots = self._check_robots(base_url)

        # Step 1: Probe common paths (light HEAD check, then GET on 200)
        for path in COMMON_PATHS:
            probe_url = base_url + path
            result.pages_checked += 1

            if not self._is_allowed(probe_url, robots):
                continue

            resp = self._probe_url(probe_url)
            if resp is None or resp.status_code != 200:
                continue

            # Detect redirect to homepage (common: /fees -> /)
            if self._is_homepage_redirect(resp.url, base_url):
                continue

            content_type = resp.headers.get("Content-Type", "").lower()

            # PDF hit: verify URL path relates to fees
            if "application/pdf" in content_type:
                if self._is_fee_pdf_url(resp.url) or "fee" in path.lower():
                    result.found = True
                    result.fee_schedule_url = resp.url
                    result.document_type = "pdf"
                    result.method = "common_path"
                    result.confidence = 0.9
                    return result
                # PDF at a fee path but URL doesn't match: still likely a fee schedule
                result.found = True
                result.fee_schedule_url = resp.url
                result.document_type = "pdf"
                result.method = "common_path"
                result.confidence = 0.8
                return result

            # HTML hit: verify content (use strict=True since redirects could
            # land on marketing pages that mention fees in passing)
            if "text/html" in content_type and self._is_fee_content(resp.text, strict=True):
                # Check if this page links to a PDF (prefer PDF)
                page_candidates = self._scan_links(resp.text, resp.url)
                pdf_candidates = [c for c in page_candidates if c.is_pdf and c.score >= 5]
                if pdf_candidates:
                    result.found = True
                    result.fee_schedule_url = pdf_candidates[0].url
                    result.document_type = "pdf"
                    result.method = "common_path"
                    result.confidence = 0.85
                    return result

                result.found = True
                result.fee_schedule_url = resp.url
                result.document_type = "html"
                result.method = "common_path"
                result.confidence = 0.8
                return result

        # Step 2: Scan homepage for fee-related links
        if not self._is_allowed(website_url, robots):
            result.error = "robots.txt blocks homepage"
            return result

        homepage_resp = self._fetch(website_url)
        if homepage_resp is None or homepage_resp.status_code != 200:
            result.error = f"homepage unreachable (status={getattr(homepage_resp, 'status_code', 'timeout')})"
            return result

        result.pages_checked += 1
        candidates = self._scan_links(homepage_resp.text, homepage_resp.url)

        # Try top candidates
        for candidate in candidates[:5]:
            result.candidate_urls.append(candidate.url)

            if not self._is_allowed(candidate.url, robots):
                continue

            # Skip candidates that point to the homepage itself
            if self._is_homepage_redirect(candidate.url, base_url):
                continue

            # PDF link from homepage: verify URL path is fee-related
            if candidate.is_pdf and candidate.score >= 8 and self._is_fee_pdf_url(candidate.url):
                result.found = True
                result.fee_schedule_url = candidate.url
                result.document_type = "pdf"
                result.method = "link_scan"
                result.confidence = 0.85
                return result

            # Verify non-PDF pages (pass base_url for redirect detection)
            result.pages_checked += 1
            is_fee, doc_type = self._verify_fee_page(candidate.url, base_url)
            if is_fee:
                result.found = True
                result.fee_schedule_url = candidate.url
                result.document_type = doc_type
                result.method = "link_scan"
                result.confidence = 0.75
                return result

        # Step 3: Deep scan - follow top links and look for PDFs/fee content
        deep_candidates = candidates[:3]
        for candidate in deep_candidates:
            if candidate.is_pdf:
                continue  # Already tried above

            if not self._is_allowed(candidate.url, robots):
                continue

            resp = self._fetch(candidate.url)
            if resp is None or resp.status_code != 200:
                continue

            # Detect redirect to homepage
            if self._is_homepage_redirect(resp.url, base_url):
                continue

            result.pages_checked += 1
            content_type = resp.headers.get("Content-Type", "").lower()
            if "text/html" not in content_type:
                continue

            sub_candidates = self._scan_links(resp.text, resp.url)
            for sub in sub_candidates[:3]:
                if not self._is_allowed(sub.url, robots):
                    continue

                if sub.is_pdf and sub.score >= 5 and self._is_fee_pdf_url(sub.url):
                    result.found = True
                    result.fee_schedule_url = sub.url
                    result.document_type = "pdf"
                    result.method = "deep_scan"
                    result.confidence = 0.7
                    return result

                result.pages_checked += 1
                is_fee, doc_type = self._verify_fee_page(sub.url, base_url)
                if is_fee:
                    result.found = True
                    result.fee_schedule_url = sub.url
                    result.document_type = doc_type
                    result.method = "deep_scan"
                    result.confidence = 0.65
                    return result

        # Step 4: Subdomain probing - try common document hosting subdomains
        base_domain = self._normalize_domain(urlparse(base_url).netloc)
        subdomain_prefixes = ["pages", "docs", "documents", "files", "resources"]
        for prefix in subdomain_prefixes:
            sub_url = f"https://{prefix}.{base_domain}"
            resp = self._probe_url(sub_url)
            if resp is None or resp.status_code != 200:
                continue

            result.pages_checked += 1
            content_type = resp.headers.get("Content-Type", "").lower()
            if "text/html" not in content_type:
                continue

            # Scan for fee-related links on the subdomain page
            sub_links = self._scan_links(resp.text, resp.url)
            fee_links = [c for c in sub_links if c.score >= 8]
            for link in fee_links[:3]:
                if link.is_pdf and self._is_fee_pdf_url(link.url):
                    result.found = True
                    result.fee_schedule_url = link.url
                    result.document_type = "pdf"
                    result.method = "subdomain_scan"
                    result.confidence = 0.75
                    return result

                result.pages_checked += 1
                is_fee, doc_type = self._verify_fee_page(link.url, base_url)
                if is_fee:
                    result.found = True
                    result.fee_schedule_url = link.url
                    result.document_type = doc_type
                    result.method = "subdomain_scan"
                    result.confidence = 0.65
                    return result

        return result

    def close(self) -> None:
        """Close the HTTP session."""
        self.session.close()
