"""
State prioritization and recommendation engine.

Per D-02: states are ranked by coverage gap % (lowest current coverage first),
maximizing new fee data per wave. Tiebreaker: larger institution count first
(more institutions = higher impact per wave).
"""
from __future__ import annotations

from fee_crawler.wave.coverage import get_state_coverage, StateCoverage


def recommend_states(
    conn,
    wave_size: int = 8,
    exclude: list[str] | None = None,
) -> list[StateCoverage]:
    """Return top wave_size states ranked by coverage gap (lowest coverage first).

    Per D-02: prioritizes most underserved states to maximize new fee data
    per wave. Excludes states in the exclude list (already in a running wave)
    and states with 0 institutions (no crawl targets).

    Sort order: coverage_pct ASC, then total_institutions DESC (tiebreaker —
    more institutions = higher impact).
    """
    exclude_set = set(exclude or [])
    all_coverage = get_state_coverage(conn)

    filtered = [
        sc for sc in all_coverage
        if sc.total_institutions > 0 and sc.state_code not in exclude_set
    ]

    ranked = sorted(filtered, key=lambda sc: (sc.coverage_pct, -sc.total_institutions))

    return ranked[:wave_size]


def print_recommendations(states: list[StateCoverage], wave_size: int = 8) -> None:
    """Print formatted recommendation table to stdout.

    Output format:
    Wave Recommendation: Top {wave_size} states by coverage gap
    ─────────────────────────────────────────────────────────────
    Rank  State  Institutions  With Fees  Coverage %
       1  WY               45          2       4.4%
       2  MT               62          5       8.1%
    ...
    """
    print(f"\nWave Recommendation: Top {wave_size} states by coverage gap")
    print("\u2500" * 57)
    print(f"{'Rank':>4}  {'State':<6}  {'Institutions':>12}  {'With Fees':>9}  {'Coverage %':>10}")
    print("\u2500" * 57)

    for rank, sc in enumerate(states, start=1):
        pct_str = f"{sc.coverage_pct:.1f}%"
        print(
            f"{rank:>4}  {sc.state_code:<6}  {sc.total_institutions:>12}  "
            f"{sc.institutions_with_fees:>9}  {pct_str:>10}"
        )

    print("\u2500" * 57)
    print(f"Total: {len(states)} states recommended\n")
