"""Playwright-based fetcher for JS-rendered bank websites.

Many bank websites render fee schedules via JavaScript frameworks (React,
Angular, Vue). The standard requests.get() returns an empty HTML shell
(100-500 bytes) for these sites. This module uses Playwright to launch
a headless Chromium browser, wait for JS to execute, and return the
fully rendered HTML.

Falls back gracefully when playwright is not installed.

Security:
- SSRF protection: blocks RFC 1918, link-local, and cloud metadata IPs
- Fresh browser context per fetch (no cookie leakage between institutions)
- Resource blocking: images, fonts, media are not loaded (bandwidth savings)
"""

from __future__ import annotations

import hashlib
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
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

_BLOCKED_HOSTS = {
    "metadata.google.internal",
    "metadata.google.internal.",
}

# Resource types to block (bandwidth savings, faster page loads)
_BLOCKED_RESOURCE_TYPES = {"image", "media", "font", "stylesheet"}

# Strings indicating bot protection / JS challenge pages
_CHALLENGE_MARKERS = [
    "incapsula",
    "imperva",
    "cloudflare",
    "challenge-platform",
    "cf-browser-verification",
    "captcha",
    "recaptcha",
    "hcaptcha",
    "just a moment",
    "checking your browser",
    "please enable javascript",
    "enable cookies",
]

# Minimum HTML body length to consider the page successfully rendered
_MIN_RENDERED_BYTES = 500


def is_playwright_available() -> bool:
    """Check if playwright and chromium are importable."""
    try:
        from playwright.sync_api import sync_playwright  # noqa: F401
        return True
    except ImportError:
        return False


def _is_safe_url(url: str) -> bool:
    """SSRF protection: resolve hostname and check against blocked ranges."""
    parsed = urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        return False

    if hostname.lower() in _BLOCKED_HOSTS:
        return False

    try:
        addr_infos = socket.getaddrinfo(hostname, None)
        for _, _, _, _, sockaddr in addr_infos:
            ip = ipaddress.ip_address(sockaddr[0])
            for network in _BLOCKED_NETWORKS:
                if ip in network:
                    logger.warning(
                        "SSRF blocked: %s resolves to private IP %s",
                        hostname, ip,
                    )
                    return False
    except (socket.gaierror, ValueError):
        # DNS resolution failed; allow attempt (may be transient)
        pass

    return True


def needs_browser_fallback(content: bytes, content_type: str) -> bool:
    """Determine if an HTTP response needs Playwright re-fetch.

    Returns True when the response is HTML but appears to be:
    - A JS shell (suspiciously small body, < 500 bytes)
    - A JS app shell (has <script> tags but little visible text)
    - A bot-protection challenge page (Incapsula, Cloudflare, captcha)

    PDFs and other binary content types always return False.
    """
    if not content_type or "text/html" not in content_type:
        return False

    body_len = len(content)

    # Very small HTML bodies are almost always JS shells
    if body_len < _MIN_RENDERED_BYTES:
        logger.info(
            "HTML body too small (%d bytes), needs browser rendering",
            body_len,
        )
        return True

    try:
        html = content.decode("utf-8", errors="replace")
        html_lower = html.lower()
    except Exception:
        return False

    # Check for bot-protection / challenge markers
    for marker in _CHALLENGE_MARKERS:
        if marker in html_lower[:4096]:
            logger.info(
                "Challenge marker '%s' detected, needs browser rendering",
                marker,
            )
            return True

    # JS app shell detection: strip all <script>, <style>, and <noscript> tags,
    # then check if remaining visible text is too short
    import re
    stripped = re.sub(r"<(script|style|noscript|head)[^>]*>.*?</\1>", "", html_lower, flags=re.DOTALL)
    stripped = re.sub(r"<[^>]+>", " ", stripped)  # remove remaining tags
    visible_text = re.sub(r"\s+", " ", stripped).strip()

    if len(visible_text) < 200 and "<script" in html_lower:
        logger.info(
            "JS app shell detected (%d bytes HTML, %d chars visible text), needs browser",
            body_len, len(visible_text),
        )
        return True

    # React/Angular/Vue root div with no content
    if ('id="root"' in html_lower or 'id="app"' in html_lower or 'id="__next"' in html_lower):
        if len(visible_text) < 500:
            logger.info(
                "SPA root div detected with %d chars visible text, needs browser",
                len(visible_text),
            )
            return True

    return False


def fetch_with_browser(url: str, timeout: int = 30) -> dict:
    """Fetch a URL using headless Chromium with full JS rendering.

    Returns a dict matching the format of download.py results:
        success: bool
        content: bytes | None - fully rendered HTML as bytes
        content_type: str | None
        content_hash: str | None - SHA-256 of content
        error: str | None

    Each call creates a fresh browser context (no cookie leakage).
    Blocks images/fonts/media for faster loads.
    Dismisses common cookie banners and popups.
    """
    result: dict = {
        "success": False,
        "content": None,
        "content_type": None,
        "content_hash": None,
        "error": None,
    }

    if not is_playwright_available():
        result["error"] = "Playwright not installed"
        return result

    if not _is_safe_url(url):
        result["error"] = "URL blocked by SSRF protection"
        return result

    timeout_ms = timeout * 1000

    from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=[
                    "--disable-gpu",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-setuid-sandbox",
                ],
            )
            try:
                context = browser.new_context(
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36"
                    ),
                    java_script_enabled=True,
                    ignore_https_errors=True,
                    viewport={"width": 1280, "height": 800},
                )

                # Block heavy resource types for faster loads
                def _block_resources(route, request):
                    if request.resource_type in _BLOCKED_RESOURCE_TYPES:
                        route.abort()
                    else:
                        route.continue_()

                page = context.new_page()
                page.route("**/*", _block_resources)

                try:
                    # Navigate and wait for initial load
                    page.goto(
                        url,
                        timeout=timeout_ms,
                        wait_until="domcontentloaded",
                    )

                    # Wait for network to settle (JS frameworks finish loading)
                    # Use networkidle with a shorter timeout as a best-effort wait
                    try:
                        page.wait_for_load_state(
                            "networkidle",
                            timeout=min(timeout_ms, 15_000),
                        )
                    except PwTimeout:
                        # Network didn't fully idle; page may still be usable
                        logger.debug(
                            "Network idle timeout for %s, proceeding with current content",
                            url,
                        )

                    # Dismiss common cookie banners / popups (best-effort)
                    _dismiss_popups(page)

                    # Small delay for any final rendering
                    page.wait_for_timeout(500)

                    # Get the fully rendered HTML
                    html = page.content()
                    content_bytes = html.encode("utf-8")

                    if len(content_bytes) < _MIN_RENDERED_BYTES:
                        result["error"] = (
                            f"Rendered page still too small "
                            f"({len(content_bytes)} bytes)"
                        )
                        return result

                    result["success"] = True
                    result["content"] = content_bytes
                    result["content_type"] = "text/html; charset=utf-8"
                    result["content_hash"] = hashlib.sha256(
                        content_bytes
                    ).hexdigest()

                    logger.info(
                        "Playwright fetched %s: %d bytes",
                        url, len(content_bytes),
                    )
                    return result

                except PwTimeout:
                    result["error"] = f"Navigation timeout ({timeout}s)"
                    return result
                except Exception as e:
                    result["error"] = f"Navigation error: {str(e)[:200]}"
                    return result
                finally:
                    page.close()
                    context.close()
            finally:
                browser.close()

    except Exception as e:
        result["error"] = f"Browser launch failed: {str(e)[:200]}"
        return result


def _dismiss_popups(page) -> None:
    """Try to dismiss common cookie banners and overlay popups.

    Best-effort: failures are silently ignored. Bank websites frequently
    show cookie consent banners or interstitial overlays that can obscure
    the main content.
    """
    # Common button selectors for cookie/consent banners
    dismiss_selectors = [
        # Cookie consent buttons
        'button:has-text("Accept")',
        'button:has-text("Accept All")',
        'button:has-text("I Agree")',
        'button:has-text("Got It")',
        'button:has-text("OK")',
        'button:has-text("Close")',
        # Common class/id patterns
        '[id*="cookie"] button',
        '[class*="cookie"] button',
        '[id*="consent"] button',
        '[class*="consent"] button',
        '[id*="banner"] button',
        # Aria-label patterns
        'button[aria-label="Close"]',
        'button[aria-label="close"]',
        'button[aria-label="Dismiss"]',
    ]

    for selector in dismiss_selectors:
        try:
            btn = page.query_selector(selector)
            if btn and btn.is_visible():
                btn.click(timeout=1000)
                logger.debug("Dismissed popup via selector: %s", selector)
                # Only dismiss one; avoid clicking random buttons
                break
        except Exception:
            continue
