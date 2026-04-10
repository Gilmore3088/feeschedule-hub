"""Batch LLM classification for fees with canonical_fee_key IS NULL.

Post-crawl batch job (D-01): queries all extracted_fees with NULL canonical_fee_key,
deduplicates by normalized name, checks classification_cache, sends misses to
Claude Haiku in batches of 50, writes cache entries, updates extracted_fees.

Cache-first strategy (D-03): same fee name string never triggers a second API call.
NEVER_MERGE guard (T-56-05): blocks cross-category LLM suggestions.
CANONICAL_KEY_MAP validation (T-56-04): rejects hallucinated canonical keys.

Usage:
    python -m fee_crawler classify-nulls          # dry-run
    python -m fee_crawler classify-nulls --fix    # apply classifications
"""

from __future__ import annotations

import logging
import os
from typing import Any

import anthropic
import psycopg2
import psycopg2.extras

from fee_crawler.fee_analysis import (
    CANONICAL_KEY_MAP,
    NEVER_MERGE_PAIRS,
    normalize_fee_name,
)

log = logging.getLogger(__name__)

BATCH_SIZE = 50
CONFIDENCE_THRESHOLD = 0.90
MODEL = "claude-haiku-4-5-20251001"

_CLASSIFY_SYSTEM = """\
You are a bank fee taxonomy specialist. For each fee name, identify the canonical
fee category from the approved taxonomy. Only use canonical keys from the provided list.
If a fee does not match any canonical category, respond with null and confidence 0.0.
Never infer NSF from overdraft or vice versa — they are distinct regulatory categories.
"""

_CLASSIFY_TOOL = {
    "name": "classify_fees",
    "description": (
        "Return classification results for each fee name provided. "
        "Use only canonical_fee_key values from the approved taxonomy list. "
        "Set canonical_fee_key to null and confidence to 0.0 if no match found."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "classifications": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "fee_name": {"type": "string"},
                        "canonical_fee_key": {
                            "type": ["string", "null"],
                            "description": "Must be a key from the approved taxonomy or null.",
                        },
                        "confidence": {
                            "type": "number",
                            "minimum": 0.0,
                            "maximum": 1.0,
                        },
                    },
                    "required": ["fee_name", "canonical_fee_key", "confidence"],
                },
            }
        },
        "required": ["classifications"],
    },
}


def classify_with_cache(
    conn: Any, normalized_name: str
) -> tuple[str | None, float]:
    """Look up a normalized fee name in the classification_cache.

    Args:
        conn: psycopg2 connection
        normalized_name: cleaned fee name (output of normalize_fee_name())

    Returns:
        (canonical_fee_key, confidence) on cache hit.
        (None, 0.0) on cache miss.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT canonical_fee_key, confidence FROM classification_cache "
            "WHERE normalized_name = %s",
            (normalized_name,),
        )
        row = cur.fetchone()

    if row is None:
        return None, 0.0
    return row[0], row[1]


def write_cache_entry(
    conn: Any,
    normalized_name: str,
    canonical_key: str | None,
    confidence: float,
    model: str,
) -> None:
    """Upsert a classification result into the cache.

    Idempotent via ON CONFLICT DO UPDATE — safe to call multiple times
    for the same normalized_name (e.g., if re-running after a model upgrade).

    Args:
        conn: psycopg2 connection
        normalized_name: cache key
        canonical_key: LLM-suggested canonical key (or None for unclassified)
        confidence: LLM confidence score (0.0–1.0)
        model: model identifier used for this classification
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO classification_cache
                (normalized_name, canonical_fee_key, confidence, model)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (normalized_name) DO UPDATE SET
                canonical_fee_key = EXCLUDED.canonical_fee_key,
                confidence = EXCLUDED.confidence,
                model = EXCLUDED.model
            """,
            (normalized_name, canonical_key, confidence, model),
        )
    conn.commit()


def _validate_llm_result(normalized_name: str, suggested_key: str) -> bool:
    """Validate an LLM-suggested canonical key before writing to extracted_fees.

    Two checks (per threat model T-56-04 and T-56-05):
    1. Key must exist in CANONICAL_KEY_MAP — rejects hallucinated keys.
    2. NEVER_MERGE_PAIRS guard — rejects cross-category suggestions where
       the fee name contains one member of a pair and the suggestion is the other.

    Args:
        normalized_name: cleaned fee name string (used for NEVER_MERGE check)
        suggested_key: canonical_fee_key returned by the LLM

    Returns:
        True if suggestion passes all checks, False to reject.
    """
    if suggested_key not in CANONICAL_KEY_MAP:
        log.warning(
            "LLM returned unknown canonical_fee_key %r for %r — rejected",
            suggested_key,
            normalized_name,
        )
        return False

    for member_a, member_b in NEVER_MERGE_PAIRS:
        name_has_a = member_a.replace("_", " ") in normalized_name or member_a in normalized_name
        name_has_b = member_b.replace("_", " ") in normalized_name or member_b in normalized_name
        suggestion_is_b = suggested_key == member_b
        suggestion_is_a = suggested_key == member_a

        if name_has_a and suggestion_is_b:
            log.warning(
                "NEVER_MERGE guard: fee name %r contains %r but LLM suggested %r — rejected",
                normalized_name,
                member_a,
                suggested_key,
            )
            return False
        if name_has_b and suggestion_is_a:
            log.warning(
                "NEVER_MERGE guard: fee name %r contains %r but LLM suggested %r — rejected",
                normalized_name,
                member_b,
                suggested_key,
            )
            return False

    return True


def _classify_batch_with_llm(names: list[str]) -> list[dict]:
    """Send a batch of fee names to Claude Haiku for classification.

    Uses the classify_fees tool so results are machine-parseable.
    Valid canonical keys are injected into the user message so Haiku
    knows the full approved taxonomy.

    Args:
        names: list of normalized fee name strings (deduped, cache-miss only)

    Returns:
        list of dicts with keys: fee_name, canonical_fee_key, confidence
    """
    valid_keys = sorted(CANONICAL_KEY_MAP.keys())
    keys_text = ", ".join(valid_keys)

    fee_list = "\n".join(f"- {name}" for name in names)
    user_message = (
        f"Classify each of the following bank fee names using only keys from the "
        f"approved taxonomy.\n\n"
        f"Approved canonical keys:\n{keys_text}\n\n"
        f"Fee names to classify:\n{fee_list}"
    )

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    response = client.messages.create(
        model=MODEL,
        max_tokens=2048,
        system=_CLASSIFY_SYSTEM,
        tools=[_CLASSIFY_TOOL],
        tool_choice={"type": "tool", "name": "classify_fees"},
        messages=[{"role": "user", "content": user_message}],
    )

    for block in response.content:
        if block.type == "tool_use" and block.name == "classify_fees":
            return block.input.get("classifications", [])

    return []


def run(conn: Any, *, fix: bool = True) -> dict:
    """Main entry point: classify all extracted_fees with canonical_fee_key IS NULL.

    Pipeline:
      1. Query unique fee_names with NULL canonical_fee_key (skip rejected rows).
      2. Normalize each name with normalize_fee_name() for the cache key.
      3. Check classification_cache for each normalized name.
      4. Collect cache misses into batches of BATCH_SIZE.
      5. For each batch: call LLM, validate each result, write cache entries.
      6. If confidence >= CONFIDENCE_THRESHOLD and validation passes and fix=True:
         UPDATE extracted_fees SET canonical_fee_key = %s WHERE fee_name = %s AND canonical_fee_key IS NULL.

    Args:
        conn: psycopg2 connection
        fix: if False, classify and cache but do not update extracted_fees

    Returns:
        dict with summary counts:
          total_null, cache_hits, llm_classified, below_threshold,
          never_merge_rejected, invalid_key_rejected
    """
    stats = {
        "total_null": 0,
        "cache_hits": 0,
        "llm_classified": 0,
        "below_threshold": 0,
        "never_merge_rejected": 0,
        "invalid_key_rejected": 0,
    }

    with conn.cursor() as cur:
        cur.execute(
            "SELECT DISTINCT fee_name FROM extracted_fees "
            "WHERE canonical_fee_key IS NULL AND review_status != 'rejected'"
        )
        rows = cur.fetchall()

    unique_names = [row[0] for row in rows if row[0]]
    stats["total_null"] = len(unique_names)

    if not unique_names:
        log.info("No fees with NULL canonical_fee_key found.")
        return stats

    cache_misses: list[str] = []
    # Map: normalized_name -> raw fee_name (first seen; used for DB update)
    norm_to_raw: dict[str, str] = {}

    # Deduplicate by normalized name before cache lookups
    seen_normalized: set[str] = set()
    deduped: list[tuple[str, str]] = []  # [(raw_name, normalized)]
    for raw_name in unique_names:
        normalized = normalize_fee_name(raw_name)
        norm_to_raw[normalized] = raw_name
        if normalized not in seen_normalized:
            seen_normalized.add(normalized)
            deduped.append((raw_name, normalized))

    for raw_name, normalized in deduped:
        cached_key, cached_conf = classify_with_cache(conn, normalized)
        if cached_key is not None or cached_conf > 0.0:
            stats["cache_hits"] += 1
            if (
                cached_key
                and float(cached_conf) >= CONFIDENCE_THRESHOLD
                and fix
                and _validate_llm_result(normalized, cached_key)
            ):
                _apply_classification(conn, raw_name, cached_key)
                stats["llm_classified"] += 1
        else:
            cache_misses.append(normalized)

    for i in range(0, len(cache_misses), BATCH_SIZE):
        batch = cache_misses[i : i + BATCH_SIZE]
        llm_results = _classify_batch_with_llm(batch)

        for result in llm_results:
            fee_name_from_llm = result.get("fee_name", "")
            suggested_key = result.get("canonical_fee_key")
            confidence = float(result.get("confidence", 0.0))

            normalized = normalize_fee_name(fee_name_from_llm) if fee_name_from_llm else fee_name_from_llm

            if confidence < CONFIDENCE_THRESHOLD:
                write_cache_entry(conn, normalized, suggested_key, confidence, MODEL)
                stats["below_threshold"] += 1
                continue

            if not suggested_key:
                write_cache_entry(conn, normalized, None, confidence, MODEL)
                stats["below_threshold"] += 1
                continue

            if not _validate_llm_result(normalized, suggested_key):
                write_cache_entry(conn, normalized, None, confidence, MODEL)
                if "nsf" in normalized and suggested_key == "overdraft":
                    stats["never_merge_rejected"] += 1
                elif "overdraft" in normalized and suggested_key == "nsf":
                    stats["never_merge_rejected"] += 1
                elif suggested_key not in CANONICAL_KEY_MAP:
                    stats["invalid_key_rejected"] += 1
                else:
                    stats["never_merge_rejected"] += 1
                continue

            write_cache_entry(conn, normalized, suggested_key, confidence, MODEL)

            if fix:
                raw_name = norm_to_raw.get(normalized, fee_name_from_llm)
                _apply_classification(conn, raw_name, suggested_key)
                stats["llm_classified"] += 1

    return stats


def _apply_classification(conn: Any, fee_name: str, canonical_key: str) -> int:
    """Update extracted_fees rows with the validated canonical_fee_key.

    Only updates rows that still have canonical_fee_key IS NULL to avoid
    overwriting manually reviewed classifications.

    Args:
        conn: psycopg2 connection
        fee_name: original raw fee name string (matches extracted_fees.fee_name)
        canonical_key: validated canonical key to set

    Returns:
        Number of rows updated.
    """
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE extracted_fees SET canonical_fee_key = %s "
            "WHERE fee_name = %s AND canonical_fee_key IS NULL",
            (canonical_key, fee_name),
        )
        count = cur.rowcount
    conn.commit()
    return count
