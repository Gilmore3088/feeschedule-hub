"""CMS fingerprinting for targeted fee schedule discovery.

Detects the CMS platform of a bank website from HTTP headers,
HTML meta tags, and URL patterns. Knowing the CMS narrows the
search space for fee schedule URLs significantly.

Supported platforms:
- WordPress: /wp-content/, /wp-includes/, meta generator
- Drupal: /sites/default/, X-Drupal-Cache, Drupal.settings
- Banno (Jack Henry): /banno/, data-banno attributes
- Q2 (Centrix): /q2/, X-Q2 headers
- NCR Digital Banking (D3): /d3banking/, /ncr/
- FIS (Digital One): /fisdigital/, /digitalbanking/
- Fiserv: /corillian/, /architect/
- Custom: no known CMS detected
"""

import re
from dataclasses import dataclass


@dataclass
class CMSResult:
    """Result of CMS fingerprinting."""

    platform: str | None = None  # wordpress, drupal, banno, q2, ncr, fis, fiserv, custom
    confidence: float = 0.0
    evidence: str | None = None


# CMS-specific paths to try when the platform is known
CMS_FEE_PATHS: dict[str, list[str]] = {
    "wordpress": [
        "/wp-content/uploads/fee-schedule.pdf",
        "/wp-content/uploads/schedule-of-fees.pdf",
        "/wp-content/uploads/fees.pdf",
        "/wp-content/uploads/fee-disclosure.pdf",
        "/wp-content/uploads/truth-in-savings.pdf",
    ],
    "drupal": [
        "/sites/default/files/fee-schedule.pdf",
        "/sites/default/files/fees.pdf",
        "/sites/default/files/schedule-of-fees.pdf",
        "/sites/default/files/disclosures/fee-schedule.pdf",
    ],
    "banno": [
        "/resources/fee-schedule",
        "/fee-schedule",
        "/personal/fee-schedule",
    ],
    "q2": [
        "/fee-schedule",
        "/disclosures/fee-schedule",
        "/personal-banking/fees",
    ],
}

# Headers that identify CMS platforms
_HEADER_SIGNATURES: list[tuple[str, str, str]] = [
    # (header_name, pattern, platform)
    ("x-drupal-cache", "", "drupal"),
    ("x-drupal-dynamic-cache", "", "drupal"),
    ("x-generator", "drupal", "drupal"),
    ("x-powered-by", "drupal", "drupal"),
    ("x-powered-by", "wordpress", "wordpress"),
    ("x-powered-by", "wp engine", "wordpress"),
    ("x-q2", "", "q2"),
    ("x-powered-by", "q2", "q2"),
    ("x-powered-by", "fiserv", "fiserv"),
    ("x-powered-by", "fis", "fis"),
    ("server", "banno", "banno"),
]

# HTML patterns that identify CMS platforms
_HTML_SIGNATURES: list[tuple[str, str]] = [
    # (regex_pattern, platform)
    (r'<meta\s+name=["\']generator["\']\s+content=["\']WordPress', "wordpress"),
    (r'<meta\s+name=["\']generator["\']\s+content=["\']Drupal', "drupal"),
    (r"/wp-content/", "wordpress"),
    (r"/wp-includes/", "wordpress"),
    (r"/sites/default/files/", "drupal"),
    (r"Drupal\.settings", "drupal"),
    (r"data-banno", "banno"),
    (r"/banno/", "banno"),
    (r"/d3banking/", "ncr"),
    (r"/ncr-digital/", "ncr"),
    (r"/fisdigital/", "fis"),
    (r"/digitalbanking/", "fis"),
    (r"/corillian/", "fiserv"),
    (r"/architect/", "fiserv"),
    (r"/q2-?online/", "q2"),
]

# URL patterns that identify CMS platforms
_URL_SIGNATURES: list[tuple[str, str]] = [
    (r"/wp-content/", "wordpress"),
    (r"/wp-admin/", "wordpress"),
    (r"/sites/default/", "drupal"),
    (r"/node/\d+", "drupal"),
    (r"\.banno\.", "banno"),
    (r"\.q2\.", "q2"),
    (r"\.ncr\.", "ncr"),
]


def fingerprint_from_headers(headers: dict[str, str]) -> CMSResult:
    """Detect CMS from HTTP response headers."""
    for header_name, pattern, platform in _HEADER_SIGNATURES:
        value = headers.get(header_name, "")
        if not value:
            # Try case-insensitive header lookup
            for k, v in headers.items():
                if k.lower() == header_name.lower():
                    value = v
                    break
        if value:
            if not pattern or pattern.lower() in value.lower():
                return CMSResult(
                    platform=platform,
                    confidence=0.9,
                    evidence=f"header {header_name}: {value[:100]}",
                )
    return CMSResult()


def fingerprint_from_html(html: str) -> CMSResult:
    """Detect CMS from HTML content (meta tags, script paths, etc.)."""
    for pattern, platform in _HTML_SIGNATURES:
        if re.search(pattern, html, re.IGNORECASE):
            match = re.search(pattern, html, re.IGNORECASE)
            return CMSResult(
                platform=platform,
                confidence=0.8,
                evidence=f"html pattern: {match.group()[:100]}",
            )
    return CMSResult()


def fingerprint_from_url(url: str) -> CMSResult:
    """Detect CMS from URL patterns."""
    for pattern, platform in _URL_SIGNATURES:
        if re.search(pattern, url, re.IGNORECASE):
            return CMSResult(
                platform=platform,
                confidence=0.7,
                evidence=f"url pattern: {pattern}",
            )
    return CMSResult()


def fingerprint(
    url: str,
    headers: dict[str, str] | None = None,
    html: str | None = None,
) -> CMSResult:
    """Detect CMS platform using all available signals.

    Checks headers (highest confidence), then HTML, then URL patterns.
    Returns the first match found, or CMSResult(platform=None) if unknown.
    """
    # Headers are the most reliable signal
    if headers:
        result = fingerprint_from_headers(headers)
        if result.platform:
            return result

    # HTML meta tags and patterns
    if html:
        result = fingerprint_from_html(html)
        if result.platform:
            return result

    # URL patterns
    result = fingerprint_from_url(url)
    if result.platform:
        return result

    return CMSResult()


def get_cms_paths(platform: str) -> list[str]:
    """Get CMS-specific fee schedule paths for a known platform."""
    return CMS_FEE_PATHS.get(platform, [])
