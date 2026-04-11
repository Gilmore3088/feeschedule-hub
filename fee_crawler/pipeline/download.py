"""Download fee schedule documents and manage local storage.

Downloads PDFs/HTML from fee_schedule_url, computes content hash for
change detection, and stores files locally (Supabase Storage later).

Includes SSRF protection: blocks private IPs and cloud metadata endpoints.
"""

from __future__ import annotations

import hashlib
import ipaddress
import os
import socket
import time
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import urlparse

import logging
import requests

from fee_crawler.config import Config

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from fee_crawler.pipeline.rate_limiter import DomainRateLimiter

# SSRF protection: blocked IP ranges
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
_BLOCKED_HOSTS = {"metadata.google.internal", "metadata.google.internal."}


def _is_safe_url(url: str) -> bool:
    """Check if URL is safe to fetch (not a private/internal address)."""
    hostname = urlparse(url).hostname
    if not hostname:
        return False
    if hostname.lower() in _BLOCKED_HOSTS:
        return False
    try:
        for info in socket.getaddrinfo(hostname, None):
            ip = ipaddress.ip_address(info[4][0])
            for network in _BLOCKED_NETWORKS:
                if ip in network:
                    return False
    except (socket.gaierror, ValueError):
        pass
    return True

# Status codes that warrant a retry (transient server errors + rate limiting)
_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

# Maximum retries and backoff base (seconds)
_MAX_RETRIES = 3
_BACKOFF_BASE = 2  # 2s, 4s, 8s


def compute_hash(content: bytes) -> str:
    """Compute SHA-256 hash of document content."""
    return hashlib.sha256(content).hexdigest()


def _download_with_retries(
    url: str,
    user_agent: str,
    max_retries: int = _MAX_RETRIES,
    rate_limiter: DomainRateLimiter | None = None,
) -> requests.Response:
    """Download a URL with exponential backoff on transient failures.

    Retries on 429/5xx status codes and connection errors.
    Respects Retry-After header on 429 responses.
    If a rate_limiter is provided, waits for domain rate limit before each attempt.
    """
    last_error: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            # Wait for domain rate limit before each attempt
            if rate_limiter:
                rate_limiter.wait(url)
            resp = requests.get(
                url,
                timeout=(30, 60),  # (connect, read) timeouts
                headers={"User-Agent": user_agent},
                allow_redirects=True,
            )

            # Success or non-retryable error — return immediately
            if resp.status_code not in _RETRYABLE_STATUS_CODES:
                resp.raise_for_status()
                return resp

            # Retryable status code — back off and retry
            if attempt < max_retries:
                wait = _BACKOFF_BASE * (2 ** attempt)
                # Respect Retry-After header on 429
                if resp.status_code == 429:
                    retry_after = resp.headers.get("Retry-After")
                    if retry_after:
                        try:
                            wait = max(wait, min(float(retry_after), 60))
                        except ValueError:
                            pass
                time.sleep(wait)
                continue

            # Final attempt — raise the status error
            resp.raise_for_status()
            return resp  # unreachable, raise_for_status throws

        except requests.ConnectionError as e:
            last_error = e
            if attempt < max_retries:
                time.sleep(_BACKOFF_BASE * (2 ** attempt))
                continue
            raise
        except requests.Timeout as e:
            last_error = e
            if attempt < max_retries:
                time.sleep(_BACKOFF_BASE * (2 ** attempt))
                continue
            raise

    # Should not reach here, but just in case
    raise last_error or requests.RequestException("Download failed after retries")


def download_document(
    url: str,
    target_id: int,
    config: Config,
    *,
    last_hash: str | None = None,
    rate_limiter: DomainRateLimiter | None = None,
    stealth: bool = False,
) -> dict:
    """Download a document and save locally.

    Returns dict with keys:
        success: bool
        path: str | None - local file path
        content_hash: str | None
        content_type: str | None
        unchanged: bool - True if hash matches last_hash
        content: bytes | None - raw content (for extraction)
        error: str | None
    """
    result = {
        "success": False,
        "path": None,
        "content_hash": None,
        "content_type": None,
        "unchanged": False,
        "content": None,
        "error": None,
    }

    # SSRF protection
    if not _is_safe_url(url):
        result["error"] = "URL blocked by SSRF protection (private/internal address)"
        return result

    try:
        resp = _download_with_retries(
            url, config.crawl.user_agent, config.crawl.max_retries,
            rate_limiter=rate_limiter,
        )
    except requests.RequestException as e:
        result["error"] = str(e)[:200]
        return result

    content = resp.content
    content_type = resp.headers.get("Content-Type", "").lower()

    # Playwright fallback: if HTML response looks like a JS shell or
    # bot-protection challenge, re-fetch with headless Chromium
    from fee_crawler.pipeline.playwright_fetcher import (
        needs_browser_fallback,
        fetch_with_browser,
        is_playwright_available,
    )

    browser_rendered = False
    if needs_browser_fallback(content, content_type) and is_playwright_available():
        logger.info("Thin HTML detected for %s (%d bytes), trying Playwright", url, len(content))
        browser_result = fetch_with_browser(url, stealth=stealth)
        if browser_result["success"] and browser_result["content"]:
            content = browser_result["content"]
            content_type = browser_result["content_type"] or content_type
            browser_rendered = True
            logger.info("Playwright succeeded for %s: %d bytes", url, len(content))
        else:
            logger.warning(
                "Playwright fallback failed for %s: %s",
                url, browser_result.get("error", "unknown"),
            )

    content_hash = compute_hash(content)

    # Change detection: skip if unchanged
    if last_hash and content_hash == last_hash:
        result["success"] = True
        result["unchanged"] = True
        result["content_hash"] = content_hash
        result["content_type"] = content_type
        return result

    # Determine file extension
    if "application/pdf" in content_type or url.lower().endswith(".pdf"):
        ext = ".pdf"
    elif "text/html" in content_type:
        ext = ".html"
    else:
        ext = ".bin"

    # Save to local storage
    storage_dir = Path(config.extraction.document_storage_dir) / str(target_id)
    storage_dir.mkdir(parents=True, exist_ok=True)
    file_path = storage_dir / f"fee_schedule{ext}"
    file_path.write_bytes(content)

    # Store in R2 (content-addressed, mandatory)
    r2_key = None
    if os.environ.get("R2_ENDPOINT"):
        from fee_crawler.pipeline.r2_store import upload_document
        try:
            r2_key = upload_document(
                content,
                content_type=content_type or "application/octet-stream",
                metadata={"target_id": str(target_id), "source_url": url},
            )
        except Exception as e:
            logger.error("R2 upload failed for target %d: %s", target_id, e)
            result["error"] = f"R2 upload failed: {str(e)[:150]}"
            return result
    else:
        logger.warning("R2_ENDPOINT not set — skipping R2 storage for target %d", target_id)

    result["success"] = True
    result["path"] = str(file_path)
    result["content_hash"] = content_hash
    result["content_type"] = content_type
    result["content"] = content
    result["r2_key"] = r2_key
    result["browser_rendered"] = browser_rendered
    return result
