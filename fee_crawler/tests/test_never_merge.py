"""NEVER_MERGE guard tests.

These tests enforce that categories which are regulatory or semantically distinct
NEVER share aliases in FEE_NAME_ALIASES. Any alias expansion must pass these
guards before shipping to production.

Pairs enforced:
  - nsf / overdraft (regulatory distinction: returned vs. paid)
  - wire_domestic_outgoing / wire_intl_outgoing (domestic vs. international)
  - wire_domestic_incoming / wire_intl_incoming (domestic vs. international)
  - atm_non_network / card_replacement (ATM fee vs. card issuance fee)
  - od_protection_transfer / overdraft (transfer fee vs. item fee)
  - od_daily_cap / overdraft (aggregate cap vs. per-item fee)
  - nsf_daily_cap / nsf (aggregate cap vs. per-item fee)
"""

import pytest

from fee_crawler.fee_analysis import FEE_NAME_ALIASES, NEVER_MERGE_PAIRS


class TestNeverMergePairsExist:
    """NEVER_MERGE_PAIRS must exist and contain at least 7 required pairs."""

    def test_never_merge_pairs_exists(self):
        from fee_crawler.fee_analysis import NEVER_MERGE_PAIRS  # noqa: F401 — import check

        assert isinstance(NEVER_MERGE_PAIRS, list), "NEVER_MERGE_PAIRS must be a list"

    def test_never_merge_pairs_has_at_least_7_entries(self):
        assert len(NEVER_MERGE_PAIRS) >= 7, (
            f"Expected at least 7 NEVER_MERGE pairs, got {len(NEVER_MERGE_PAIRS)}"
        )

    @pytest.mark.parametrize("pair", [
        ("nsf", "overdraft"),
        ("wire_domestic_outgoing", "wire_intl_outgoing"),
        ("wire_domestic_incoming", "wire_intl_incoming"),
        ("atm_non_network", "card_replacement"),
        ("od_protection_transfer", "overdraft"),
        ("od_daily_cap", "overdraft"),
        ("nsf_daily_cap", "nsf"),
    ])
    def test_required_pair_present(self, pair):
        a, b = pair
        assert (a, b) in NEVER_MERGE_PAIRS or (b, a) in NEVER_MERGE_PAIRS, (
            f"Required NEVER_MERGE pair ({a!r}, {b!r}) is missing from NEVER_MERGE_PAIRS"
        )


class TestNeverMergeAliasIsolation:
    """No alias key should map to BOTH members of any NEVER_MERGE pair."""

    @pytest.fixture(scope="class")
    def reverse_map(self) -> dict[str, set[str]]:
        """Build reverse map: canonical -> set of alias strings pointing to it."""
        result: dict[str, set[str]] = {}
        for alias, canonical in FEE_NAME_ALIASES.items():
            result.setdefault(canonical, set()).add(alias)
        return result

    def test_no_shared_alias_key_across_pair(self, reverse_map):
        """For each NEVER_MERGE pair, the alias sets for a and b must be disjoint."""
        violations = []
        for a, b in NEVER_MERGE_PAIRS:
            aliases_a = reverse_map.get(a, set())
            aliases_b = reverse_map.get(b, set())
            overlap = aliases_a & aliases_b
            if overlap:
                violations.append(
                    f"({a!r}, {b!r}) share aliases: {sorted(overlap)}"
                )
        assert not violations, (
            "NEVER_MERGE violations found — aliases map to both members of a pair:\n"
            + "\n".join(violations)
        )

    @pytest.mark.parametrize("pair", [
        ("nsf", "overdraft"),
        ("wire_domestic_outgoing", "wire_intl_outgoing"),
        ("wire_domestic_incoming", "wire_intl_incoming"),
        ("atm_non_network", "card_replacement"),
        ("od_protection_transfer", "overdraft"),
        ("od_daily_cap", "overdraft"),
        ("nsf_daily_cap", "nsf"),
    ])
    def test_pair_members_are_distinct(self, pair):
        a, b = pair
        assert a != b, f"NEVER_MERGE pair ({a!r}, {b!r}) has identical members"

    @pytest.mark.parametrize("pair", [
        ("nsf", "overdraft"),
        ("wire_domestic_outgoing", "wire_intl_outgoing"),
        ("wire_domestic_incoming", "wire_intl_incoming"),
        ("atm_non_network", "card_replacement"),
        ("od_protection_transfer", "overdraft"),
        ("od_daily_cap", "overdraft"),
        ("nsf_daily_cap", "nsf"),
    ])
    def test_both_members_exist_as_known_categories(self, pair):
        from fee_crawler.fee_analysis import FEE_FAMILIES

        a, b = pair
        # Some categories (od_daily_cap, nsf_daily_cap) are detected via cap logic,
        # not via alias lookup, so check FEE_FAMILIES membership instead.
        all_categories = set(
            cat for members in FEE_FAMILIES.values() for cat in members
        )
        assert a in all_categories, (
            f"NEVER_MERGE member {a!r} is not a recognized category in FEE_FAMILIES"
        )
        assert b in all_categories, (
            f"NEVER_MERGE member {b!r} is not a recognized category in FEE_FAMILIES"
        )
