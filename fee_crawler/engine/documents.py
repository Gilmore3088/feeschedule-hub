"""Content-addressed document capture + the change-gate.

The change-gate is the engine's throughput lever (plan §5): fetch is cheap,
extraction is expensive, so we hash the *normalized* text of every fetched
document and only extract when it differs from what we stored last cycle. In
steady state 85-95% of documents are unchanged and stop here.

`normalize_text` strips the volatile parts of a document (whitespace, page
furniture, PDF-regeneration timestamps) so a byte-different-but-content-identical
re-fetch hashes to the same value. Raw bytes are content-addressed in R2 by
their raw hash so identical documents (shared templates) store once.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Optional

import asyncpg

# Lines that change between regenerations without the fee content changing.
_VOLATILE_LINE = re.compile(
    r"""^\s*(
        (generated|printed|updated|revised|effective|as\ of|retrieved|downloaded)
        \b.*\d.*            # "... 2026" / "01/02/2026" etc.
      | page\s+\d+\s+of\s+\d+
      | \d{1,2}[/-]\d{1,2}[/-]\d{2,4}
    )\s*$""",
    re.IGNORECASE | re.VERBOSE,
)
_WS = re.compile(r"[ \t ]+")
_BLANKS = re.compile(r"\n{2,}")


def normalize_text(text: str) -> str:
    """Return a stable, comparable form of document text for the change-gate."""
    lines = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = _WS.sub(" ", raw).strip()
        if not line:
            lines.append("")
            continue
        if _VOLATILE_LINE.match(line):
            continue  # drop regeneration timestamps / page numbers
        lines.append(line.lower())
    joined = "\n".join(lines)
    return _BLANKS.sub("\n\n", joined).strip()


def content_hash(text: str) -> str:
    """SHA-256 of the normalized text (the change-gate key)."""
    return hashlib.sha256(normalize_text(text).encode("utf-8")).hexdigest()


def raw_hash(data: bytes) -> str:
    """SHA-256 of raw bytes (the R2 content address)."""
    return hashlib.sha256(data).hexdigest()


def r2_key_for(digest: str) -> str:
    """Content-addressed R2 object key. Identical bytes -> one object."""
    # shard by first two hex chars to avoid a single huge prefix
    return f"documents/{digest[:2]}/{digest}"


@dataclass
class CapturedDocument:
    document_id: Optional[int]
    content_sha256: str
    raw_sha256: str
    r2_key: str
    changed: bool  # False => change-gate hit; no downstream work


async def record_document(
    conn: asyncpg.Connection,
    *,
    crawl_target_id: int,
    state_code: str,
    source_url: str,
    text: str,
    raw_bytes: bytes,
    http_status: Optional[int],
    render_mode: str,
    doc_type: str,
    run_id: Optional[int] = None,
) -> CapturedDocument:
    """Insert a document row iff its normalized content changed for this target.

    Returns a CapturedDocument. `changed=False` means the (target, content_sha256)
    already exists — the caller should short-circuit and enqueue no read job.

    Idempotent: re-running the same fetch yields the same row (ON CONFLICT DO
    NOTHING on the (crawl_target_id, content_sha256) unique key).
    """
    c_hash = content_hash(text)
    r_hash = raw_hash(raw_bytes)
    key = r2_key_for(r_hash)

    row = await conn.fetchrow(
        """
        INSERT INTO documents (
            crawl_target_id, state_code, source_url, content_sha256, raw_sha256,
            r2_key, http_status, render_mode, doc_type, byte_size, run_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (crawl_target_id, content_sha256) DO NOTHING
        RETURNING id
        """,
        crawl_target_id,
        state_code,
        source_url,
        c_hash,
        r_hash,
        key,
        http_status,
        render_mode,
        doc_type,
        len(raw_bytes),
        run_id,
    )
    if row is not None:
        return CapturedDocument(int(row["id"]), c_hash, r_hash, key, changed=True)

    # Unchanged: fetch the existing id for provenance, mark not-changed.
    existing = await conn.fetchval(
        "SELECT id FROM documents WHERE crawl_target_id=$1 AND content_sha256=$2",
        crawl_target_id,
        c_hash,
    )
    return CapturedDocument(
        int(existing) if existing is not None else None,
        c_hash,
        r_hash,
        key,
        changed=False,
    )
