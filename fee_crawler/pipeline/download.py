"""Download fee schedule documents and manage local storage.

Downloads PDFs/HTML from fee_schedule_url, computes content hash for
change detection, and stores files locally (Supabase Storage later).
"""

import hashlib
import logging
from pathlib import Path
from urllib.parse import urlparse

import requests
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from fee_crawler.config import Config

logger = logging.getLogger(__name__)

MAX_DOCUMENT_SIZE = 50 * 1024 * 1024  # 50 MB

RETRIABLE_EXCEPTIONS = (
    requests.ConnectionError,
    requests.Timeout,
)

PDF_MAGIC = b"%PDF"

LOGIN_PATHS = frozenset([
    "/login", "/signin", "/sign-in", "/logon", "/auth",
    "/online-banking", "/onlinebanking", "/ebanking",
    "/digital-banking", "/sso", "/saml",
])


def compute_hash(content: bytes) -> str:
    """Compute SHA-256 hash of document content."""
    return hashlib.sha256(content).hexdigest()


def detect_content_type(content: bytes, declared: str = "") -> str:
    """Detect content type via magic bytes, falling back to declared header."""
    stripped = content[:20].lstrip(b"\xef\xbb\xbf")  # strip BOM
    if stripped.startswith(PDF_MAGIC):
        return "application/pdf"
    lower = stripped.lower()
    if lower.startswith(b"<html") or lower.startswith(b"<!doctype"):
        return "text/html"
    return declared.split(";")[0].strip().lower() or "application/octet-stream"


def is_login_redirect(response: requests.Response) -> bool:
    """Check if the response was redirected to a login page."""
    final_path = urlparse(str(response.url)).path.lower().rstrip("/")
    return any(
        final_path == lp or final_path.startswith(lp + "/")
        for lp in LOGIN_PATHS
    )


@retry(
    retry=retry_if_exception_type(RETRIABLE_EXCEPTIONS),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def _fetch(url: str, headers: dict, timeout: int = 30) -> requests.Response:
    """Fetch URL with retry on transient failures."""
    resp = requests.get(
        url, timeout=timeout, headers=headers, allow_redirects=True,
        stream=True,
    )
    resp.raise_for_status()
    return resp


def download_document(
    url: str,
    target_id: int,
    config: Config,
    *,
    last_hash: str | None = None,
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

    try:
        headers = {
            "User-Agent": config.crawl.user_agent,
            "Accept": "text/html,application/pdf,*/*",
        }
        resp = _fetch(url, headers)
    except requests.RequestException as e:
        result["error"] = str(e)[:200]
        return result

    # Check for login-wall redirect
    if is_login_redirect(resp):
        result["error"] = "Redirected to login page"
        return result

    # Read content with size guard
    content = resp.content
    if len(content) > MAX_DOCUMENT_SIZE:
        result["error"] = f"Document too large: {len(content):,} bytes"
        return result

    # Use magic bytes for content type detection
    declared_ct = resp.headers.get("Content-Type", "").lower()
    content_type = detect_content_type(content, declared_ct)
    content_hash = compute_hash(content)

    # Change detection: skip if unchanged
    if last_hash and content_hash == last_hash:
        result["success"] = True
        result["unchanged"] = True
        result["content_hash"] = content_hash
        result["content_type"] = content_type
        return result

    # Determine file extension
    if "application/pdf" in content_type:
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

    result["success"] = True
    result["path"] = str(file_path)
    result["content_hash"] = content_hash
    result["content_type"] = content_type
    result["content"] = content
    return result
