"""
Strategy tiers for iterative deepening.

Each pass of the state agent escalates to a more aggressive discovery
strategy. TIER1 is fast and cheap; TIER3 is exhaustive.

Phase: 20-iterative-deepening
Decision refs: D-01 (tier1), D-02 (tier2), D-03 (tier3), D-10 (defaults)
"""
from dataclasses import dataclass

# ─── StrategyTier dataclass ───────────────────────────────────────────────────

@dataclass(frozen=True)
class StrategyTier:
    """Immutable description of which discovery strategies are active for a pass."""

    name: str
    """Identifier string: 'tier1' | 'tier2' | 'tier3'."""

    use_sitemap: bool
    """Check sitemap.xml for fee schedule links."""

    use_common_paths: bool
    """Probe common fee schedule URL paths (/fee-schedule, /disclosures, etc.)."""

    use_deep_crawl: bool
    """Follow links 2+ levels deep from fee-keyword pages; increase page budget."""

    use_pdf_hunt: bool
    """Aggressive PDF link scoring: score and follow PDF links found on any page."""

    use_keyword_search: bool
    """Site-internal keyword search: probe /search?q=fee+schedule on the institution domain."""


# ─── Tier constants ───────────────────────────────────────────────────────────

TIER1 = StrategyTier(
    name="tier1",
    use_sitemap=True,
    use_common_paths=True,
    use_deep_crawl=False,
    use_pdf_hunt=False,
    use_keyword_search=False,
)
"""Pass 1: Fast direct discovery. AI navigation + common paths only."""

TIER2 = StrategyTier(
    name="tier2",
    use_sitemap=True,
    use_common_paths=True,
    use_deep_crawl=True,
    use_pdf_hunt=True,
    use_keyword_search=False,
)
"""Pass 2: Medium depth. Adds Playwright deep crawl and aggressive PDF scoring."""

TIER3 = StrategyTier(
    name="tier3",
    use_sitemap=True,
    use_common_paths=True,
    use_deep_crawl=True,
    use_pdf_hunt=True,
    use_keyword_search=True,
)
"""Pass 3+: Exhaustive. Adds site-internal keyword search for hardest institutions."""


# ─── Configuration constants ──────────────────────────────────────────────────

DEFAULT_MAX_PASSES: int = 3
"""Default number of iterative passes per state."""

EARLY_STOP_COVERAGE_PCT: float = 90.0
"""Stop early when state coverage reaches this percentage."""


# ─── Tier selection ───────────────────────────────────────────────────────────

def tier_for_pass(pass_number: int) -> StrategyTier:
    """Return the StrategyTier for a given pass number.

    Pass 1  -> TIER1
    Pass 2  -> TIER2
    Pass 3+ -> TIER3
    """
    if pass_number == 1:
        return TIER1
    if pass_number == 2:
        return TIER2
    return TIER3
