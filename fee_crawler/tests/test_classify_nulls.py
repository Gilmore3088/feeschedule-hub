"""Tests for classify_nulls command — LLM batch classification for NULL canonical keys.

Covers CLS-02: classification_cache hit/miss behavior, confidence threshold gate,
NEVER_MERGE guard at LLM write time, batch deduplication.
"""
import pytest


def test_cache_hit_returns_cached_result():
    """When normalized_name exists in classification_cache, return cached canonical_fee_key
    without making any LLM API call."""
    pytest.skip("Not yet implemented — Plan 02")


def test_cache_miss_sends_to_llm():
    """When normalized_name is NOT in classification_cache, send to Haiku for classification."""
    pytest.skip("Not yet implemented — Plan 02")


def test_confidence_below_090_leaves_canonical_key_null():
    """When LLM returns confidence < 0.90, write cache entry but leave
    canonical_fee_key = NULL in extracted_fees (goes to human review per D-02)."""
    pytest.skip("Not yet implemented — Plan 02")


def test_confidence_at_090_updates_canonical_key():
    """When LLM returns confidence >= 0.90 AND passes NEVER_MERGE, update
    canonical_fee_key in extracted_fees."""
    pytest.skip("Not yet implemented — Plan 02")


def test_never_merge_guard_rejects_llm_suggestion():
    """When LLM suggests 'overdraft' for a fee named containing 'nsf',
    reject the suggestion and leave canonical_fee_key = NULL."""
    pytest.skip("Not yet implemented — Plan 02")


def test_batch_deduplicates_by_normalized_name():
    """When 5 extracted_fees rows have the same normalized fee name,
    only 1 LLM call is made and all 5 rows are updated from the single result."""
    pytest.skip("Not yet implemented — Plan 02")


def test_cache_write_idempotent():
    """Writing the same (normalized_name, canonical_fee_key, confidence, model)
    twice does not raise — uses ON CONFLICT DO UPDATE."""
    pytest.skip("Not yet implemented — Plan 02")
