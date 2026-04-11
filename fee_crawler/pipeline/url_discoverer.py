"""Discover fee schedule URLs on institution websites.

Strategy (in order):
1. Check robots.txt compliance
2. Parse sitemap.xml for fee schedule URLs
3. Probe common fee schedule URL paths
4. Scan homepage links for fee-related keywords
5. Follow promising internal links one level deep for PDF discovery
6. (Optional) Search API fallback via SerpAPI

Supports discovery caching to avoid re-trying methods that already failed.
"""

from __future__ import annotations

import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import TYPE_CHECKING
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

from fee_crawler.config import Config

if TYPE_CHECKING:
    from fee_crawler.pipeline.rate_limiter import DomainRateLimiter

# Sitemap XML namespaces
_SITEMAP_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

# Common paths where banks publish fee schedules (ordered by likelihood)
# Grouped by: generic, personal banking, business, CMS-specific, CU-specific, regulatory
COMMON_PATHS = [
    # Generic top-level
    "/fees",
    "/fee-schedule",
    "/feeschedule",
    "/fee-schedules",
    "/disclosures",
    "/rates-and-fees",
    "/account-fees",
    "/schedule-of-fees",
    "/pricing",
    "/service-fees",
    "/service-charges",
    "/fees-and-charges",
    "/fee-information",
    "/deposit-account-fees",
    # Personal banking paths
    "/personal/fees",
    "/personal/fee-schedule",
    "/personal/disclosures",
    "/personal-banking/fees",
    "/personal-banking/fee-schedule",
    "/personal-banking/disclosures",
    "/personal/checking/fees",
    "/personal-banking/checking/fees",
    "/consumer/fees",
    "/consumer/fee-schedule",
    "/consumer-banking/fees",
    # Business banking paths
    "/business/fees",
    "/business/fee-schedule",
    "/business-banking/fees",
    "/commercial/fees",
    # Nested resource paths
    "/resources/disclosures",
    "/resources/fee-schedule",
    "/resources/fees",
    "/about/fees",
    "/about/fee-schedule",
    "/legal/disclosures",
    "/legal/fees",
    "/documents/fee-schedule",
    "/accounts/fee-schedule",
    "/accounts/fees",
    # Credit union-specific paths
    "/membership/fees",
    "/membership/fee-schedule",
    "/share-account-fees",
    "/member-services/fees",
    "/member-services/fee-schedule",
    # Regulatory / disclosure document paths
    "/truth-in-savings",
    "/truth-in-savings-disclosure",
    "/reg-dd",
    "/reg-dd-disclosure",
    "/deposit-disclosures",
    # CMS-specific patterns (Drupal, WordPress, etc.)
    "/sites/default/files/fee-schedule.pdf",
    "/sites/default/files/fees.pdf",
    "/wp-content/uploads/fee-schedule.pdf",
    "/wp-content/uploads/schedule-of-fees.pdf",
    "/media/fee-schedule.pdf",
    "/assets/pdf/fee-schedule.pdf",
    "/docs/fee-schedule.pdf",
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
    "fees and disclosures",
    "fee and rate schedule",
    "rate and fee schedule",
    "account agreement",
    "deposit account disclosure",
    "deposit disclosures",
]

# Broader keywords for secondary scoring
FEE_LINK_KEYWORDS_BROAD = [
    "fees",
    "disclosures",
    "pricing",
    "charges",
    "fee chart",
    "rate sheet",
    "rate schedule",
    "account agreement",
    "deposit account",
    "checking account",
    "account disclosures",
    "personal banking",
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
    "truth-in-savings", "truth_in_savings", "truthinsavings",
    "reg-dd", "reg_dd",
    "account-fee", "account_fee",
    "service-fee", "service_fee",
    "pricing-schedule", "pricing_schedule",
    "deposit-fee", "deposit_fee",
    "feerateschedule", "fee-rate-schedule", "fee_rate_schedule",
    "rateandfeeschedule", "rate-and-fee-schedule",
    "rateandfee", "rate-fee",
    "accountagreement", "account-agreement",
    "depositaccountfee", "deposit-account-fee",
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
]


# PDF-specific probe paths for direct fee schedule PDFs
PDF_DIRECT_PROBE_PATHS = [
    "/fees.pdf",
    "/fee-schedule.pdf",
    "/fee_schedule.pdf",
    "/schedule-of-fees.pdf",
    "/service-fees.pdf",
    "/personal-fees.pdf",
    "/personal/fees.pdf",
    "/personal/fee-schedule.pdf",
    "/checking/fees.pdf",
    "/disclosure/fee-schedule.pdf",
    "/pdfs/fee-schedule.pdf",
    "/pdf/fee-schedule.pdf",
    "/files/fee-schedule.pdf",
    "/docs/fees.pdf",
]

# Domains known to produce false positive fee schedule matches
_BLACKLISTED_DOMAINS = {
    "accessibe.com",
    "ada.com",
    "levelaccess.com",
    "userway.org",
}


def _is_blacklisted(url: str) -> bool:
    """Check if URL belongs to a blacklisted domain (accessibility overlays etc.)."""
    hostname = urlparse(url).hostname or ""
    hostname = hostname.lower().rstrip(".")
    for domain in _BLACKLISTED_DOMAINS:
        if hostname == domain or hostname.endswith("." + domain):
            return True
    return False


# Ordered list of discovery methods for the cascade
DISCOVERY_METHODS = ["sitemap", "common_path", "link_scan", "deep_scan"]


@dataclass
class DiscoveryResult:
    """Result of URL discovery for a single institution."""

    found: bool = False
    fee_schedule_url: str | None = None
    document_type: str | None = None  # pdf | html
    method: str | None = None  # sitemap | common_path | link_scan | deep_scan | search_api
    confidence: float = 0.0
    pages_checked: int = 0
    error: str | None = None
    candidate_urls: list[str] = field(default_factory=list)
    methods_tried: list[str] = field(default_factory=list)


@dataclass
class _LinkCandidate:
    """A candidate link found during scanning."""

    url: str
    text: str
    score: float
    is_pdf: bool


class UrlDiscoverer:
    """Discovers fee schedule URLs on a single institution's website."""

    def __init__(
        self,
        config: Config,
        rate_limiter: "DomainRateLimiter | None" = None,
    ) -> None:
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": config.crawl.user_agent,
            "Accept": "text/html,application/xhtml+xml,application/pdf,*/*",
            "Accept-Language": "en-US,en;q=0.9",
        })
        self.delay = config.crawl.delay_seconds
        self._last_request_time: float = 0
        self._rate_limiter = rate_limiter

    def _throttle(self, url: str | None = None) -> None:
        """Enforce minimum delay between requests.

        If a DomainRateLimiter is configured, delegates to it for
        per-domain rate limiting. Otherwise uses the built-in simple delay.
        """
        if self._rate_limiter and url:
            self._rate_limiter.wait(url)
            return
        elapsed = time.time() - self._last_request_time
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self._last_request_time = time.time()

    def _fetch(self, url: str, timeout: int = 15, method: str = "GET") -> requests.Response | None:
        """Fetch a URL with throttling and error handling."""
        self._throttle(url)
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

    def _is_fee_content(self, text: str) -> bool:
        """Check if page content contains fee-related keywords (2+ required)."""
        lower = text.lower()
        matches = sum(1 for kw in FEE_CONTENT_KEYWORDS if kw in lower)
        return matches >= 2

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

    def _parse_sitemap(self, base_url: str, robots: RobotFileParser | None) -> str | None:
        """Parse sitemap.xml to find fee schedule URLs.

        Checks robots.txt for Sitemap directives first, then falls back
        to /sitemap.xml and /sitemap_index.xml.

        Returns the best fee schedule URL found, or None.
        """
        sitemap_urls: list[str] = []

        # Try to get sitemap URLs from robots.txt
        if robots is not None:
            try:
                site_maps = robots.site_maps()
                if site_maps:
                    sitemap_urls.extend(site_maps)
            except Exception:
                pass

        # Fallback to well-known sitemap locations
        if not sitemap_urls:
            sitemap_urls = [
                urljoin(base_url, "/sitemap.xml"),
                urljoin(base_url, "/sitemap_index.xml"),
            ]

        fee_urls: list[tuple[str, float]] = []  # (url, score)

        for sitemap_url in sitemap_urls[:3]:  # Cap at 3 sitemap sources
            try:
                urls = self._fetch_sitemap_urls(sitemap_url, depth=0)
                for url in urls:
                    score = self._score_sitemap_url(url)
                    if score > 0:
                        fee_urls.append((url, score))
            except Exception:
                continue

        if not fee_urls:
            return None

        # Return highest-scoring URL
        fee_urls.sort(key=lambda x: x[1], reverse=True)
        return fee_urls[0][0]

    def _fetch_sitemap_urls(self, sitemap_url: str, depth: int = 0) -> list[str]:
        """Fetch and parse a sitemap, following sitemap index entries up to depth 2."""
        if depth > 2:
            return []

        resp = self._fetch(sitemap_url, timeout=15)
        if resp is None or resp.status_code != 200:
            return []

        content_type = resp.headers.get("Content-Type", "").lower()
        if "xml" not in content_type and "text" not in content_type:
            return []

        try:
            root = ET.fromstring(resp.text)
        except ET.ParseError:
            return []

        urls: list[str] = []
        tag = root.tag.lower()

        # Sitemap index: follow child sitemaps
        if "sitemapindex" in tag:
            for sitemap in root.findall("sm:sitemap/sm:loc", _SITEMAP_NS):
                if sitemap.text:
                    child_urls = self._fetch_sitemap_urls(sitemap.text.strip(), depth + 1)
                    urls.extend(child_urls)
                    if len(urls) > 500:  # Cap total URLs parsed
                        break
            # Also try without namespace (some sitemaps don't use it)
            if not urls:
                for sitemap in root.iter():
                    if sitemap.tag.endswith("loc") and sitemap.text:
                        if sitemap.text.strip().endswith(".xml"):
                            child_urls = self._fetch_sitemap_urls(sitemap.text.strip(), depth + 1)
                            urls.extend(child_urls)
                            if len(urls) > 500:
                                break
        else:
            # URL set: extract all <loc> URLs
            for loc in root.findall("sm:url/sm:loc", _SITEMAP_NS):
                if loc.text:
                    urls.append(loc.text.strip())
            # Fallback: try without namespace
            if not urls:
                for elem in root.iter():
                    if elem.tag.endswith("loc") and elem.text:
                        text = elem.text.strip()
                        if not text.endswith(".xml"):
                            urls.append(text)

        return urls[:500]  # Cap

    def _score_sitemap_url(self, url: str) -> float:
        """Score a sitemap URL for fee schedule relevance."""
        path_lower = urlparse(url).path.lower()
        score = 0.0

        # Strong signals in URL path
        for kw in FEE_PDF_URL_KEYWORDS:
            if kw in path_lower:
                score += 10.0

        # Single-word signals
        for kw in FEE_PDF_SINGLE_KEYWORDS:
            if re.search(rf"\b{kw}\b", path_lower):
                score += 5.0

        # PDF bonus
        if path_lower.endswith(".pdf"):
            score += 3.0

        # Penalty for non-fee documents
        for kw in NON_FEE_PDF_KEYWORDS:
            if kw in path_lower:
                score -= 15.0

        return max(score, 0.0)

    def _is_same_domain(self, url: str, base_url: str) -> bool:
        """Check if URL is on the same domain (or subdomain)."""
        base_domain = urlparse(base_url).netloc.lower()
        url_domain = urlparse(url).netloc.lower()
        # Allow same domain or subdomains
        return url_domain == base_domain or url_domain.endswith("." + base_domain)

    def _score_link(self, href: str, text: str) -> float:
        """Score a link based on how likely it is a fee schedule."""
        # Reject blacklisted domains immediately
        if _is_blacklisted(href):
            return 0.0

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

    def _verify_fee_page(self, url: str) -> tuple[bool, str | None]:
        """Verify that a URL actually contains fee schedule content.

        Returns (is_fee_page, document_type).
        """
        resp = self._fetch(url)
        if resp is None or resp.status_code != 200:
            return False, None

        content_type = resp.headers.get("Content-Type", "").lower()

        # PDF: only trust if URL path suggests fee schedule content
        if "application/pdf" in content_type or self._is_pdf_url(url):
            if self._is_fee_pdf_url(resp.url):
                return True, "pdf"
            # Unknown PDF: reject (too many false positives)
            return False, None

        # HTML: check content for fee keywords
        if "text/html" in content_type:
            if self._is_fee_content(resp.text):
                return True, "html"

        return False, None

    def discover(
        self,
        website_url: str,
        *,
        skip_methods: set[str] | None = None,
    ) -> DiscoveryResult:
        """Run the full discovery pipeline for an institution's website.

        Args:
            website_url: The institution's website URL.
            skip_methods: Set of method names to skip (from discovery_cache).
                          Valid values: sitemap, common_path, link_scan, deep_scan.

        Returns a DiscoveryResult with the best fee schedule URL found.
        """
        result = DiscoveryResult()
        skip = skip_methods or set()

        # Normalize base URL
        parsed = urlparse(website_url)
        if not parsed.scheme:
            website_url = "https://" + website_url
        base_url = f"{urlparse(website_url).scheme}://{urlparse(website_url).netloc}"

        # Step 0: Check robots.txt
        robots = self._check_robots(base_url)

        # Step 0.5: Parse sitemap.xml for fee schedule URLs
        if "sitemap" not in skip:
            result.methods_tried.append("sitemap")
            sitemap_url = self._parse_sitemap(base_url, robots)
            if sitemap_url:
                result.pages_checked += 1
                if self._is_allowed(sitemap_url, robots):
                    if self._is_pdf_url(sitemap_url):
                        result.found = True
                        result.fee_schedule_url = sitemap_url
                        result.document_type = "pdf"
                        result.method = "sitemap"
                        result.confidence = 0.85
                        return result
                    else:
                        is_fee, doc_type = self._verify_fee_page(sitemap_url)
                        if is_fee:
                            result.found = True
                            result.fee_schedule_url = sitemap_url
                            result.document_type = doc_type
                            result.method = "sitemap"
                            result.confidence = 0.80
                            return result

        # Step 1: Probe common paths (light HEAD check, then GET on 200)
        if "common_path" in skip:
            pass  # Skip to link scan
        else:
            result.methods_tried.append("common_path")
        for path in COMMON_PATHS:
            if "common_path" in skip:
                break
            probe_url = base_url + path
            result.pages_checked += 1

            if not self._is_allowed(probe_url, robots):
                continue

            resp = self._probe_url(probe_url)
            if resp is None or resp.status_code != 200:
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

            # HTML hit: verify content
            if "text/html" in content_type and self._is_fee_content(resp.text):
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
        if "link_scan" in skip and "deep_scan" in skip:
            return result
        if not self._is_allowed(website_url, robots):
            result.error = "robots.txt blocks homepage"
            return result

        homepage_resp = self._fetch(website_url)
        if homepage_resp is None or homepage_resp.status_code != 200:
            result.error = f"homepage unreachable (status={getattr(homepage_resp, 'status_code', 'timeout')})"
            return result

        result.pages_checked += 1
        homepage_html = homepage_resp.text

        # CMS fingerprinting: detect platform and try CMS-specific paths
        from fee_crawler.pipeline.cms_fingerprint import fingerprint, get_cms_paths
        cms_result = fingerprint(
            homepage_resp.url,
            headers=dict(homepage_resp.headers),
            html=homepage_html,
        )
        if cms_result.platform:
            cms_paths = get_cms_paths(cms_result.platform)
            for path in cms_paths:
                cms_url = base_url + path
                if not self._is_allowed(cms_url, robots):
                    continue
                result.pages_checked += 1
                resp = self._probe_url(cms_url)
                if resp and resp.status_code == 200:
                    content_type = resp.headers.get("Content-Type", "").lower()
                    if "application/pdf" in content_type:
                        result.found = True
                        result.fee_schedule_url = resp.url
                        result.document_type = "pdf"
                        result.method = "cms_path"
                        result.confidence = 0.85
                        return result
                    if "text/html" in content_type and self._is_fee_content(resp.text):
                        result.found = True
                        result.fee_schedule_url = resp.url
                        result.document_type = "html"
                        result.method = "cms_path"
                        result.confidence = 0.80
                        return result

        # Playwright fallback: if BS4 yields thin content or zero fee-related links,
        # the site is likely JS-rendered. Try Playwright to get the real HTML.
        from bs4 import BeautifulSoup as BS4
        plain_text = BS4(homepage_html, "lxml").get_text(strip=True)
        initial_candidates = self._scan_links(homepage_html, homepage_resp.url)
        needs_playwright = len(plain_text) < 2000 or len(initial_candidates) == 0
        if needs_playwright:
            try:
                from fee_crawler.pipeline.playwright_fetcher import fetch_with_playwright
                rendered = fetch_with_playwright(website_url)
                if rendered and len(rendered) > len(homepage_html):
                    homepage_html = rendered
            except Exception:
                pass  # Playwright may not be available

        candidates = self._scan_links(homepage_html, homepage_resp.url)

        # Try top candidates (link scan)
        if "link_scan" not in skip:
            result.methods_tried.append("link_scan")
        for candidate in candidates[:5]:
            if "link_scan" in skip:
                break
            result.candidate_urls.append(candidate.url)

            if not self._is_allowed(candidate.url, robots):
                continue

            # PDF link from homepage: accept if URL path is fee-related OR link text scored very high
            if candidate.is_pdf and candidate.score >= 8 and (self._is_fee_pdf_url(candidate.url) or candidate.score >= 15):
                result.found = True
                result.fee_schedule_url = candidate.url
                result.document_type = "pdf"
                result.method = "link_scan"
                result.confidence = 0.85
                return result

            # Verify non-PDF pages
            result.pages_checked += 1
            is_fee, doc_type = self._verify_fee_page(candidate.url)
            if is_fee:
                result.found = True
                result.fee_schedule_url = candidate.url
                result.document_type = doc_type
                result.method = "link_scan"
                result.confidence = 0.75
                return result

        # Step 3: Deep scan - follow links and look for PDFs/fee content
        # First priority: specifically target disclosure/resource hub pages
        # These are where banks typically organize their fee schedules
        if "deep_scan" in skip:
            return result
        result.methods_tried.append("deep_scan")

        # 3a: Probe known hub pages that often contain fee schedule links
        hub_paths = [
            # Disclosure pages
            "/disclosures", "/personal/disclosures", "/personal-banking/disclosures",
            "/resources/disclosures", "/resources/fees-and-disclosures",
            "/about/disclosures", "/legal/disclosures",
            "/learn/disclosures", "/member-services/disclosures",
            "/fees-and-disclosures", "/fees-disclosures",
            # Resource/document hubs
            "/resources", "/documents", "/forms-and-documents",
            "/help", "/support", "/customer-resources",
            "/member-resources", "/member-services",
            # Rate and fee pages
            "/rates", "/rates-and-fees", "/rates-fees",
            "/fees-and-rates", "/more/rates",
            # Product pages that often embed fees
            "/checking", "/personal-banking/checking",
            "/personal/checking", "/accounts/checking",
            "/personal-banking/resources", "/personal/resources",
            "/personal-banking", "/personal",
            # CU-specific paths
            "/knowledge/references", "/knowledge/references/fee-schedule",
            "/documents/disclosures",
        ]
        for hub_path in hub_paths:
            hub_url = base_url + hub_path
            if not self._is_allowed(hub_url, robots):
                continue

            resp = self._fetch(hub_url)
            if resp is None or resp.status_code != 200:
                continue

            result.pages_checked += 1
            content_type = resp.headers.get("Content-Type", "").lower()
            if "text/html" not in content_type:
                continue

            # Check if this page itself IS the fee schedule
            if self._is_fee_content(resp.text):
                # Look for PDF links on this page first
                page_links = self._scan_links(resp.text, resp.url)
                pdf_hits = [c for c in page_links if c.is_pdf and c.score >= 5]
                if pdf_hits:
                    result.found = True
                    result.fee_schedule_url = pdf_hits[0].url
                    result.document_type = "pdf"
                    result.method = "deep_scan"
                    result.confidence = 0.80
                    return result

                result.found = True
                result.fee_schedule_url = resp.url
                result.document_type = "html"
                result.method = "deep_scan"
                result.confidence = 0.75
                return result

            # Even if not a fee page, scan ALL links (not just top 5) for fee content
            hub_links = self._scan_links(resp.text, resp.url)
            for sub in hub_links[:15]:  # Check more links on hub pages
                if not self._is_allowed(sub.url, robots):
                    continue

                if sub.is_pdf and sub.score >= 3:
                    # Lower threshold for PDFs found on disclosure pages
                    if self._is_fee_pdf_url(sub.url) or sub.score >= 8:
                        result.found = True
                        result.fee_schedule_url = sub.url
                        result.document_type = "pdf"
                        result.method = "deep_scan"
                        result.confidence = 0.70
                        return result

                if sub.score >= 10:
                    result.pages_checked += 1
                    is_fee, doc_type = self._verify_fee_page(sub.url)
                    if is_fee:
                        result.found = True
                        result.fee_schedule_url = sub.url
                        result.document_type = doc_type
                        result.method = "deep_scan"
                        result.confidence = 0.70
                        return result

        # 3b: Follow top candidates from homepage (original deep scan)
        deep_candidates = candidates[:8]
        for candidate in deep_candidates:
            if candidate.is_pdf:
                continue  # Already tried above

            if not self._is_allowed(candidate.url, robots):
                continue

            resp = self._fetch(candidate.url)
            if resp is None or resp.status_code != 200:
                continue

            result.pages_checked += 1
            content_type = resp.headers.get("Content-Type", "").lower()
            if "text/html" not in content_type:
                continue

            # Check if this intermediate page has fee content
            if self._is_fee_content(resp.text):
                page_links = self._scan_links(resp.text, resp.url)
                pdf_hits = [c for c in page_links if c.is_pdf and c.score >= 5]
                if pdf_hits:
                    result.found = True
                    result.fee_schedule_url = pdf_hits[0].url
                    result.document_type = "pdf"
                    result.method = "deep_scan"
                    result.confidence = 0.70
                    return result

                result.found = True
                result.fee_schedule_url = resp.url
                result.document_type = "html"
                result.method = "deep_scan"
                result.confidence = 0.65
                return result

            # Scan links on this page too (2 levels deep)
            sub_candidates = self._scan_links(resp.text, resp.url)
            for sub in sub_candidates[:10]:
                if not self._is_allowed(sub.url, robots):
                    continue

                if sub.is_pdf and sub.score >= 5 and self._is_fee_pdf_url(sub.url):
                    result.found = True
                    result.fee_schedule_url = sub.url
                    result.document_type = "pdf"
                    result.method = "deep_scan"
                    result.confidence = 0.65
                    return result

                if sub.score >= 10:
                    result.pages_checked += 1
                    is_fee, doc_type = self._verify_fee_page(sub.url)
                    if is_fee:
                        result.found = True
                        result.fee_schedule_url = sub.url
                        result.document_type = doc_type
                        result.method = "deep_scan"
                        result.confidence = 0.60
                        return result

        return result

    def _google_search_pdf_fallback(self, institution_name: str, website_url: str) -> list[str]:
        """Search Google for PDF fee schedules when pattern probing finds nothing.

        Per D-01: Google search showed 33% conversion rate in prior batches.
        Uses existing _search_google() from google_discover.py.
        """
        import httpx
        from fee_crawler.commands.google_discover import _search_google

        domain = urlparse(website_url).netloc
        query = f"site:{domain} filetype:pdf fee schedule"

        try:
            with httpx.Client(
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=15,
                follow_redirects=True,
            ) as client:
                results = _search_google(query, client)
        except Exception:
            return []

        pdf_urls = []
        for r in results:
            url = r.get("url", "")
            if not url:
                continue
            if _is_blacklisted(url):
                continue
            if url.lower().endswith(".pdf") or "application/pdf" in r.get("content_type", ""):
                pdf_urls.append(url)
        return pdf_urls

    def probe_pdf_urls(
        self,
        base_url: str,
        rate_limiter: "DomainRateLimiter | None" = None,
        institution_name: str = "",
    ) -> list[str]:
        """Probe common PDF paths, then fall back to Google search if nothing found.

        Per D-01: Both Google search AND pattern probing are required.
        Pattern probing runs first (faster, no external API).
        Google search is fallback when probing finds nothing (33% conversion rate).
        Returns list of discovered PDF URLs (may be empty).
        """
        found: list[str] = []
        parsed = urlparse(base_url)
        origin = f"{parsed.scheme}://{parsed.netloc}"

        # Strategy A: Pattern probing (fast, no external dependency)
        for path in PDF_DIRECT_PROBE_PATHS:
            probe_url = origin + path
            if _is_blacklisted(probe_url):
                continue
            try:
                if rate_limiter:
                    rate_limiter.wait(probe_url)
                resp = self.session.head(
                    probe_url, timeout=10, allow_redirects=True,
                )
                content_type = resp.headers.get("Content-Type", "").lower()
                if resp.status_code == 200 and "application/pdf" in content_type:
                    found.append(probe_url)
                    break  # first PDF found is enough
            except Exception:
                continue

        # Strategy B: Google search fallback (per D-01, when probing finds nothing)
        if not found and institution_name:
            google_results = self._google_search_pdf_fallback(institution_name, base_url)
            if google_results:
                found.extend(google_results[:1])  # take first result

        return found

    def close(self) -> None:
        """Close the HTTP session."""
        self.session.close()
