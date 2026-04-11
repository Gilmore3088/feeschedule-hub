"""Unit tests for classify_fee() wrapper and related functions.

Tests the (fee_category, canonical_fee_key, variant_type) contract.
"""

import pytest

from fee_crawler.fee_analysis import classify_fee, CANONICAL_KEY_MAP, FEE_FAMILIES


class TestClassifyFeeBasicCases:
    """Core classify_fee() behavior: (fee_category, canonical_fee_key, variant_type)."""

    def test_overdraft_fee_returns_correct_tuple(self):
        fee_category, canonical_fee_key, variant_type = classify_fee("Overdraft Fee")
        assert fee_category == "overdraft"
        assert canonical_fee_key == "overdraft"
        assert variant_type is None

    def test_nsf_fee_returns_nsf_not_overdraft(self):
        """NSF must NEVER resolve to overdraft — regulatory boundary."""
        fee_category, canonical_fee_key, variant_type = classify_fee("NSF Fee")
        assert fee_category == "nsf"
        assert canonical_fee_key == "nsf"
        assert variant_type is None

    def test_rush_card_returns_rush_variant(self):
        fee_category, canonical_fee_key, variant_type = classify_fee("Rush Debit Card Fee")
        assert fee_category == "rush_card"
        assert canonical_fee_key is not None
        assert variant_type == "rush"

    def test_express_wire_domestic_returns_express_variant(self):
        fee_category, canonical_fee_key, variant_type = classify_fee("Express Wire Transfer Domestic")
        assert fee_category is not None
        assert variant_type == "express"

    def test_unmatched_fee_returns_null_canonical_key(self):
        """Unmatched long-tail fees get a cleaned slug but no canonical key."""
        fee_category, canonical_fee_key, variant_type = classify_fee("xyzzy gobbledygook fee")
        assert fee_category == "xyzzy_gobbledygook_fee"
        assert canonical_fee_key is None
        assert variant_type is None

    def test_overdraft_daily_cap_returns_cap_category(self):
        """Cap detection must still route od_daily_cap correctly."""
        fee_category, canonical_fee_key, variant_type = classify_fee("Overdraft Daily Cap")
        assert fee_category == "od_daily_cap"
        assert canonical_fee_key == "od_daily_cap"

    def test_nsf_daily_cap_returns_cap_category(self):
        fee_category, canonical_fee_key, variant_type = classify_fee("NSF Daily Cap Fee")
        assert fee_category == "nsf_daily_cap"
        assert canonical_fee_key == "nsf_daily_cap"


class TestCanonicalKeyMapCompleteness:
    """CANONICAL_KEY_MAP must cover all 49 base fee categories."""

    def test_all_fee_families_categories_in_canonical_key_map(self):
        all_categories = [
            cat for members in FEE_FAMILIES.values() for cat in members
        ]
        missing = [cat for cat in all_categories if cat not in CANONICAL_KEY_MAP]
        assert not missing, (
            f"CANONICAL_KEY_MAP is missing {len(missing)} categories: {missing}"
        )

    def test_canonical_key_map_has_at_least_49_entries(self):
        assert len(CANONICAL_KEY_MAP) >= 49, (
            f"Expected at least 49 entries, got {len(CANONICAL_KEY_MAP)}"
        )

    def test_base_categories_map_to_themselves(self):
        """All 49 base fee_category slugs are identity-mapped in CANONICAL_KEY_MAP."""
        all_categories = [
            cat for members in FEE_FAMILIES.values() for cat in members
        ]
        non_identity = [
            cat for cat in all_categories
            if CANONICAL_KEY_MAP.get(cat) != cat
        ]
        assert not non_identity, (
            f"These base categories are not identity-mapped: {non_identity}"
        )


class TestClassifyFeeReturnsTuple:
    """classify_fee() always returns a 3-tuple."""

    def test_returns_three_element_tuple(self):
        result = classify_fee("Monthly Maintenance Fee")
        assert isinstance(result, tuple)
        assert len(result) == 3

    def test_empty_string_returns_tuple(self):
        result = classify_fee("")
        assert isinstance(result, tuple)
        assert len(result) == 3

    def test_whitespace_only_returns_tuple(self):
        result = classify_fee("   ")
        assert isinstance(result, tuple)
        assert len(result) == 3


class TestNeverMergeInClassifyFee:
    """classify_fee() must respect NEVER_MERGE regulatory boundaries."""

    def test_nsf_fee_does_not_return_overdraft_canonical(self):
        _, canonical, _ = classify_fee("NSF Fee")
        assert canonical != "overdraft"

    def test_overdraft_fee_does_not_return_nsf_canonical(self):
        _, canonical, _ = classify_fee("Overdraft Fee")
        assert canonical != "nsf"

    def test_domestic_wire_out_does_not_return_intl_canonical(self):
        _, canonical, _ = classify_fee("Outgoing Domestic Wire Transfer")
        assert canonical != "wire_intl_outgoing"

    def test_intl_wire_out_does_not_return_domestic_canonical(self):
        _, canonical, _ = classify_fee("International Wire Transfer Outgoing")
        assert canonical != "wire_domestic_outgoing"
