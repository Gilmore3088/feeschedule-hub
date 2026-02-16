"""Download fee schedule documents and manage local storage.

Downloads PDFs/HTML from fee_schedule_url, computes content hash for
change detection, and stores files locally (Supabase Storage later).
"""

import hashlib
from pathlib import Path

import requests

from fee_crawler.config import Config


def compute_hash(content: bytes) -> str:
    """Compute SHA-256 hash of document content."""
    return hashlib.sha256(content).hexdigest()


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
        resp = requests.get(
            url,
            timeout=30,
            headers={"User-Agent": config.crawl.user_agent},
            allow_redirects=True,
        )
        resp.raise_for_status()
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
