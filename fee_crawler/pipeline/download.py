"""Download fee schedule documents and manage local storage.

Downloads PDFs/HTML from fee_schedule_url, computes content hash for
change detection, and stores files locally (Supabase Storage later).
"""

import hashlib
import time
from pathlib import Path

import requests

from fee_crawler.config import Config

# Status codes that warrant a retry (transient server errors + rate limiting)
_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

# Maximum retries and backoff base (seconds)
_MAX_RETRIES = 3
_BACKOFF_BASE = 2  # 2s, 4s, 8s


def compute_hash(content: bytes) -> str:
    """Compute SHA-256 hash of document content."""
    return hashlib.sha256(content).hexdigest()


def _download_with_retries(
    url: str, user_agent: str, max_retries: int = _MAX_RETRIES
) -> requests.Response:
    """Download a URL with exponential backoff on transient failures.

    Retries on 429/5xx status codes and connection errors.
    Respects Retry-After header on 429 responses.
    """
    last_error: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
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
        resp = _download_with_retries(url, config.crawl.user_agent, config.crawl.max_retries)
    except requests.RequestException as e:
        result["error"] = str(e)[:200]
        return result

    content = resp.content
    content_type = resp.headers.get("Content-Type", "").lower()
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

    result["success"] = True
    result["path"] = str(file_path)
    result["content_hash"] = content_hash
    result["content_type"] = content_type
    result["content"] = content
    return result
