"""Tests for classify_nulls command — LLM batch classification for NULL canonical keys.

Covers CLS-02: classification_cache hit/miss behavior, confidence threshold gate,
NEVER_MERGE guard at LLM write time, batch deduplication.

All tests use mocked DB connections and Anthropic API — no real calls made.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch, call


def _make_cursor(fetchone_return=None, fetchall_return=None):
    """Build a mock psycopg2 cursor with controlled fetch results."""
    cursor = MagicMock()
    cursor.fetchone.return_value = fetchone_return
    cursor.fetchall.return_value = fetchall_return or []
    cursor.__enter__ = lambda s: s
    cursor.__exit__ = MagicMock(return_value=False)
    return cursor


def _make_conn(cursor=None):
    """Build a mock psycopg2 connection."""
    conn = MagicMock()
    if cursor is not None:
        conn.cursor.return_value = cursor
    return conn


def _make_tool_use_response(results: list[dict]):
    """Build a mock Anthropic tool_use response for classify_fees."""
    block = MagicMock()
    block.type = "tool_use"
    block.name = "classify_fees"
    block.input = {"classifications": results}

    response = MagicMock()
    response.content = [block]
    return response


def test_cache_hit_returns_cached_result():
    """When normalized_name exists in classification_cache, return cached canonical_fee_key
    without making any LLM API call."""
    from fee_crawler.commands.classify_nulls import classify_with_cache

    # Cache row: (normalized_name, canonical_fee_key, confidence, model, created_at)
    cache_row = ("overdraft", "overdraft", 0.97, "claude-haiku-4-5-20251001", "2026-04-10")
    cursor = _make_cursor(fetchone_return=cache_row)
    conn = _make_conn(cursor=cursor)

    result_key, result_confidence = classify_with_cache(conn, "overdraft")

    assert result_key == "overdraft"
    assert result_confidence == 0.97
    cursor.execute.assert_called_once()


def test_cache_miss_sends_to_llm():
    """When normalized_name is NOT in classification_cache, return (None, 0.0)
    so the caller knows to send the name to the LLM."""
    from fee_crawler.commands.classify_nulls import classify_with_cache

    cursor = _make_cursor(fetchone_return=None)
    conn = _make_conn(cursor=cursor)

    result_key, result_confidence = classify_with_cache(conn, "some_unknown_fee_name")

    assert result_key is None
    assert result_confidence == 0.0


def test_confidence_below_090_leaves_canonical_key_null():
    """When LLM returns confidence < 0.90, write cache entry but leave
    canonical_fee_key = NULL in extracted_fees (goes to human review per D-02)."""
    from fee_crawler.commands.classify_nulls import run

    # extracted_fees returns one row with NULL canonical_fee_key
    fees_cursor = MagicMock()
    fees_cursor.fetchall.return_value = [("Some Odd Fee",)]
    fees_cursor.__enter__ = lambda s: s
    fees_cursor.__exit__ = MagicMock(return_value=False)

    # classification_cache returns no hit
    cache_cursor = MagicMock()
    cache_cursor.fetchone.return_value = None
    cache_cursor.__enter__ = lambda s: s
    cache_cursor.__exit__ = MagicMock(return_value=False)

    # write_cache_entry cursor
    write_cursor = MagicMock()
    write_cursor.__enter__ = lambda s: s
    write_cursor.__exit__ = MagicMock(return_value=False)

    conn = MagicMock()
    conn.cursor.side_effect = [fees_cursor, cache_cursor, write_cursor]

    llm_response = _make_tool_use_response([
        {"fee_name": "Some Odd Fee", "canonical_fee_key": "overdraft", "confidence": 0.75}
    ])

    with patch("fee_crawler.commands.classify_nulls._classify_batch_with_llm",
               return_value=[{"fee_name": "Some Odd Fee", "canonical_fee_key": "overdraft", "confidence": 0.75}]):
        result = run(conn, fix=True)

    # below threshold: extracted_fees not updated, but cache written
    assert result["below_threshold"] == 1
    assert result["llm_classified"] == 0

    # No UPDATE on extracted_fees for below-threshold
    for c in conn.cursor.return_value.execute.call_args_list:
        assert "UPDATE extracted_fees" not in str(c)


def test_confidence_at_090_updates_canonical_key():
    """When LLM returns confidence >= 0.90 AND passes NEVER_MERGE, update
    canonical_fee_key in extracted_fees."""
    from fee_crawler.commands.classify_nulls import run

    # Patch the internal LLM call and DB interaction
    fees_cursor = MagicMock()
    fees_cursor.fetchall.return_value = [("Returned Check Fee",)]
    fees_cursor.__enter__ = lambda s: s
    fees_cursor.__exit__ = MagicMock(return_value=False)

    cache_cursor = MagicMock()
    cache_cursor.fetchone.return_value = None
    cache_cursor.__enter__ = lambda s: s
    cache_cursor.__exit__ = MagicMock(return_value=False)

    write_cursor = MagicMock()
    write_cursor.__enter__ = lambda s: s
    write_cursor.__exit__ = MagicMock(return_value=False)

    update_cursor = MagicMock()
    update_cursor.__enter__ = lambda s: s
    update_cursor.__exit__ = MagicMock(return_value=False)
    update_cursor.rowcount = 1

    conn = MagicMock()
    conn.cursor.side_effect = [fees_cursor, cache_cursor, write_cursor, update_cursor]

    with patch("fee_crawler.commands.classify_nulls._classify_batch_with_llm",
               return_value=[{"fee_name": "Returned Check Fee", "canonical_fee_key": "nsf", "confidence": 0.95}]):
        result = run(conn, fix=True)

    assert result["llm_classified"] == 1
    assert result["below_threshold"] == 0


def test_never_merge_guard_rejects_llm_suggestion():
    """When LLM suggests 'overdraft' for a fee named containing 'nsf',
    reject the suggestion and leave canonical_fee_key = NULL."""
    from fee_crawler.commands.classify_nulls import _validate_llm_result

    # "nsf" fee name -> LLM suggests "overdraft" -> must be rejected
    result = _validate_llm_result("nsf returned item fee", "overdraft")
    assert result is False

    # "nsf" fee name -> LLM suggests "nsf" -> should pass
    result = _validate_llm_result("nsf returned item fee", "nsf")
    assert result is True

    # domestic wire -> LLM suggests international wire -> must be rejected
    result = _validate_llm_result("wire domestic outgoing fee", "wire_intl_outgoing")
    assert result is False


def test_batch_deduplicates_by_normalized_name():
    """When 5 extracted_fees rows have the same normalized fee name,
    only 1 LLM call is made (after dedup) and all 5 rows are updated
    from the single result."""
    from fee_crawler.commands.classify_nulls import run

    # 5 rows all with the same fee_name
    same_fee = "Overdraft Fee"
    fees_cursor = MagicMock()
    fees_cursor.fetchall.return_value = [
        (same_fee,), (same_fee,), (same_fee,), (same_fee,), (same_fee,),
    ]
    fees_cursor.__enter__ = lambda s: s
    fees_cursor.__exit__ = MagicMock(return_value=False)

    # no cache hits
    cache_cursor = MagicMock()
    cache_cursor.fetchone.return_value = None
    cache_cursor.__enter__ = lambda s: s
    cache_cursor.__exit__ = MagicMock(return_value=False)

    write_cursor = MagicMock()
    write_cursor.__enter__ = lambda s: s
    write_cursor.__exit__ = MagicMock(return_value=False)

    update_cursor = MagicMock()
    update_cursor.__enter__ = lambda s: s
    update_cursor.__exit__ = MagicMock(return_value=False)
    update_cursor.rowcount = 5

    conn = MagicMock()
    conn.cursor.side_effect = [fees_cursor, cache_cursor, write_cursor, update_cursor]

    llm_mock = MagicMock(return_value=[
        {"fee_name": same_fee, "canonical_fee_key": "overdraft", "confidence": 0.95}
    ])

    with patch("fee_crawler.commands.classify_nulls._classify_batch_with_llm", llm_mock):
        result = run(conn, fix=True)

    # LLM called exactly once (after dedup — 5 rows -> 1 unique name)
    assert llm_mock.call_count == 1
    names_sent = llm_mock.call_args[0][0]
    assert len(names_sent) == 1


def test_cache_write_idempotent():
    """Writing the same (normalized_name, canonical_fee_key, confidence, model)
    twice does not raise — uses ON CONFLICT DO UPDATE."""
    from fee_crawler.commands.classify_nulls import write_cache_entry

    cursor = MagicMock()
    cursor.__enter__ = lambda s: s
    cursor.__exit__ = MagicMock(return_value=False)
    conn = _make_conn(cursor=cursor)

    # Call twice with the same arguments
    write_cache_entry(conn, "overdraft fee", "overdraft", 0.97, "claude-haiku-4-5-20251001")
    write_cache_entry(conn, "overdraft fee", "overdraft", 0.97, "claude-haiku-4-5-20251001")

    # Both calls should use ON CONFLICT DO UPDATE — verify SQL contains it
    for call_args in cursor.execute.call_args_list:
        sql = call_args[0][0].upper()
        assert "ON CONFLICT" in sql, f"Expected ON CONFLICT in SQL: {call_args[0][0]}"

    # Two execute calls, two commits
    assert cursor.execute.call_count == 2
    assert conn.commit.call_count == 2
