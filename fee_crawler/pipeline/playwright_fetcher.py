"""Playwright-based fetcher for JS-rendered bank websites.

Falls back gracefully when playwright is not installed.
Used when BeautifulSoup extraction yields < 100 chars of content,
indicating the site is likely a SPA that requires JS rendering.

Security:
- SSRF protection: blocks RFC 1918, link-local, and cloud metadata IPs
- Fresh browser context per institution (no cookie leakage)
- Resource blocking: images, fonts, media are not loaded
"""

import ipaddress
import logging
import socket
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Block private/internal IP ranges (SSRF protection)
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),  # IPv6 private
    ipaddress.ip_network("fe80::/10"),  # IPv6 link-local
]

# Cloud metadata endpoints to block
_BLOCKED_HOSTS = {
    "metadata.google.internal",
    "metadata.google.internal.",
}

# Resource types to block (bandwidth savings)
_BLOCKED_RESOURCE_TYPES = {"image", "media", "font", "stylesheet"}

# Minimum content length to consider a page "rendered"
_MIN_RENDERED_CONTENT = 100


def _is_available() -> bool:
    """Check if playwright is installed."""
    try:
        from playwright.sync_api import sync_playwright  # noqa: F401
        return True
    except ImportError:
        return False


def _is_safe_url(url: str) -> bool:
    """Check if URL is safe to fetch (SSRF protection).

    Resolves hostname and checks against blocked IP ranges.
    """
    parsed = urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        return False

    # Block known metadata endpoints
    if hostname.lower() in _BLOCKED_HOSTS:
        return False

    try:
        # Resolve hostname to IP
        addr_infos = socket.getaddrinfo(hostname, None)
        for _, _, _, _, sockaddr in addr_infos:
            ip = ipaddress.ip_address(sockaddr[0])
            for network in _BLOCKED_NETWORKS:
                if ip in network:
                    logger.warning("SSRF blocked: %s resolves to private IP %s", hostname, ip)
                    return False
    except (socket.gaierror, ValueError):
        # DNS resolution failed — allow (might be temporary)
        return True

    return True


def fetch_with_playwright(
    url: str,
    *,
    timeout_ms: int = 30_000,
    wait_until: str = "domcontentloaded",
) -> str | None:
    """Fetch a page using Playwright with JS rendering.

    Returns the rendered HTML content, or None on failure.
    Each call creates a fresh browser context (no cookie leakage).

    Args:
        url: The URL to fetch.
        timeout_ms: Navigation timeout in milliseconds.
        wait_until: When to consider navigation done.

    Returns:
        Rendered page HTML, or None if Playwright isn't available or fetch fails.
    """
    if not _is_available():
        logger.debug("Playwright not installed, skipping JS rendering")
        return None

    if not _is_safe_url(url):
        logger.warning("URL blocked by SSRF protection: %s", url)
        return None

    from playwright.sync_api import sync_playwright

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                context = browser.new_context(
                    user_agent="BankFeeIndex/1.0 (fee-benchmarking)",
                    java_script_enabled=True,
                )

                # Block unnecessary resource types
                def _block_resources(route, request):
                    if request.resource_type in _BLOCKED_RESOURCE_TYPES:
                        route.abort()
                    else:
                        route.continue_()

                page = context.new_page()
                page.route("**/*", _block_resources)

                try:
                    page.goto(url, timeout=timeout_ms, wait_until=wait_until)
                    content = page.content()
                    return content
                except Exception as e:
                    logger.warning("Playwright navigation failed for %s: %s", url, e)
                    return None
                finally:
                    page.close()
                    context.close()
            finally:
                browser.close()
    except Exception as e:
        logger.warning("Playwright launch failed: %s", e)
        return None
