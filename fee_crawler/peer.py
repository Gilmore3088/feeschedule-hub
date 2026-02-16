"""Peer group matching: asset tiers, Fed districts, and scored peer selection."""

from __future__ import annotations

from fee_crawler.db import Database

# ---------------------------------------------------------------------------
# Federal Reserve districts (1-12) by state code
# Source: https://www.federalreserve.gov/aboutthefed/federal-reserve-system.htm
# ---------------------------------------------------------------------------

STATE_TO_FED_DISTRICT: dict[str, int] = {
    # District 1 - Boston
    "CT": 1, "ME": 1, "MA": 1, "NH": 1, "RI": 1, "VT": 1,
    # District 2 - New York
    "NY": 2, "NJ": 2, "PR": 2, "VI": 2,
    # District 3 - Philadelphia
    "PA": 3, "DE": 3,
    # District 4 - Cleveland
    "OH": 4, "WV": 4, "KY": 4,
    # District 5 - Richmond
    "VA": 5, "MD": 5, "DC": 5, "NC": 5, "SC": 5,
    # District 6 - Atlanta
    "GA": 6, "FL": 6, "AL": 6, "TN": 6, "MS": 6, "LA": 6,
    # District 7 - Chicago
    "IL": 7, "IN": 7, "IA": 7, "MI": 7, "WI": 7,
    # District 8 - St. Louis
    "MO": 8, "AR": 8,
    # District 9 - Minneapolis
    "MN": 9, "MT": 9, "ND": 9, "SD": 9,
    # District 10 - Kansas City
    "KS": 10, "NE": 10, "OK": 10, "CO": 10, "WY": 10, "NM": 10,
    # District 11 - Dallas
    "TX": 11, "AZ": 11,
    # District 12 - San Francisco
    "CA": 12, "WA": 12, "OR": 12, "NV": 12, "UT": 12, "ID": 12,
    "HI": 12, "AK": 12, "GU": 12, "AS": 12,
}

# Adjacent districts (geographic neighbors) for widening peer search
ADJACENT_DISTRICTS: dict[int, list[int]] = {
    1: [2],
    2: [1, 3],
    3: [2, 4, 5],
    4: [3, 5, 7],
    5: [3, 4, 6, 8],
    6: [5, 7, 8, 11],
    7: [4, 8, 9],
    8: [5, 6, 7, 10],
    9: [7, 10],
    10: [8, 9, 11, 12],
    11: [6, 10, 12],
    12: [10, 11],
}

FED_DISTRICT_NAMES: dict[int, str] = {
    1: "Boston", 2: "New York", 3: "Philadelphia", 4: "Cleveland",
    5: "Richmond", 6: "Atlanta", 7: "Chicago", 8: "St. Louis",
    9: "Minneapolis", 10: "Kansas City", 11: "Dallas", 12: "San Francisco",
}

# ---------------------------------------------------------------------------
# Asset size tiers (values in thousands, matching FDIC convention)
# ---------------------------------------------------------------------------

ASSET_TIERS: dict[str, tuple[int, int | None]] = {
    "community_small": (0, 300_000),
    "community_mid": (300_000, 1_000_000),
    "community_large": (1_000_000, 10_000_000),
    "regional": (10_000_000, 50_000_000),
    "large_regional": (50_000_000, 250_000_000),
    "super_regional": (250_000_000, None),
}

TIER_ORDER = list(ASSET_TIERS.keys())

TIER_DISPLAY: dict[str, str] = {
    "community_small": "Community (<$300M)",
    "community_mid": "Community ($300M-$1B)",
    "community_large": "Community ($1B-$10B)",
    "regional": "Regional ($10B-$50B)",
    "large_regional": "Large Regional ($50B-$250B)",
    "super_regional": "Super Regional ($250B+)",
}


def get_fed_district(state_code: str | None) -> int | None:
    """Look up Federal Reserve district for a state code."""
    if not state_code:
        return None
    return STATE_TO_FED_DISTRICT.get(state_code.upper().strip())


def classify_asset_tier(asset_size_thousands: int | None) -> str:
    """Classify an institution into an asset tier.

    Args:
        asset_size_thousands: Asset size in thousands of dollars.

    Returns:
        Tier key string (e.g., "community_small").
    """
    if asset_size_thousands is None or asset_size_thousands <= 0:
        return "community_small"

    for tier, (low, high) in ASSET_TIERS.items():
        if high is None:
            return tier
        if low <= asset_size_thousands < high:
            return tier

    return "super_regional"


def _adjacent_tiers(tier: str) -> list[str]:
    """Return tier names adjacent to the given tier."""
    idx = TIER_ORDER.index(tier)
    result = []
    if idx > 0:
        result.append(TIER_ORDER[idx - 1])
    if idx < len(TIER_ORDER) - 1:
        result.append(TIER_ORDER[idx + 1])
    return result


def find_peers(
    db: Database,
    target_id: int,
    *,
    max_results: int = 20,
    require_fees: bool = False,
) -> list[dict]:
    """Find peer institutions for a given target using scored matching.

    Scoring:
        - Same asset_size_tier: +3, adjacent tier: +1
        - Same fed_district: +2, adjacent district: +1
        - Same state: +1
        - charter_type must match (hard filter)

    Args:
        db: Database connection.
        target_id: Institution to find peers for.
        max_results: Maximum peers to return.
        require_fees: If True, only return peers that have extracted fees.

    Returns:
        List of dicts with institution info + peer_score, sorted by score desc.
    """
    target = db.fetchone(
        """SELECT id, charter_type, asset_size, asset_size_tier,
                  fed_district, state_code
           FROM crawl_targets WHERE id = ?""",
        (target_id,),
    )
    if not target:
        return []

    t_charter = target["charter_type"]
    t_tier = target["asset_size_tier"] or "community_small"
    t_district = target["fed_district"]
    t_state = target["state_code"]
    t_assets = target["asset_size"] or 0

    adj_tiers = _adjacent_tiers(t_tier)
    adj_districts = ADJACENT_DISTRICTS.get(t_district, []) if t_district else []

    # Fetch candidates: same charter type, exclude self
    fee_join = ""
    if require_fees:
        fee_join = "JOIN extracted_fees ef ON ct.id = ef.crawl_target_id"

    candidates = db.fetchall(
        f"""SELECT DISTINCT ct.id, ct.institution_name, ct.charter_type,
                   ct.asset_size, ct.asset_size_tier, ct.fed_district,
                   ct.state_code, ct.city
            FROM crawl_targets ct
            {fee_join}
            WHERE ct.charter_type = ? AND ct.id != ?
            ORDER BY ct.asset_size DESC NULLS LAST""",
        (t_charter, target_id),
    )

    scored = []
    for c in candidates:
        score = 0

        # Asset tier scoring
        c_tier = c["asset_size_tier"] or "community_small"
        if c_tier == t_tier:
            score += 3
        elif c_tier in adj_tiers:
            score += 1

        # Fed district scoring
        c_district = c["fed_district"]
        if t_district and c_district:
            if c_district == t_district:
                score += 2
            elif c_district in adj_districts:
                score += 1

        # State scoring
        if t_state and c["state_code"] == t_state:
            score += 1

        # Asset ratio for tiebreaking (closer = better)
        c_assets = c["asset_size"] or 0
        if t_assets > 0 and c_assets > 0:
            ratio = min(t_assets, c_assets) / max(t_assets, c_assets)
        else:
            ratio = 0.0

        scored.append({
            "id": c["id"],
            "institution_name": c["institution_name"],
            "charter_type": c["charter_type"],
            "asset_size": c["asset_size"],
            "asset_size_tier": c_tier,
            "fed_district": c_district,
            "state_code": c["state_code"],
            "city": c["city"],
            "peer_score": score,
            "asset_ratio": ratio,
        })

    # Sort by score desc, then asset ratio desc (closer in size = better)
    scored.sort(key=lambda x: (x["peer_score"], x["asset_ratio"]), reverse=True)

    # Progressive widening: if fewer than 5 good matches (score >= 3),
    # we still return what we have - the scoring naturally widens
    return scored[:max_results]


def get_institutions_by_filter(
    db: Database,
    *,
    charter_type: str | None = None,
    asset_tier: str | None = None,
    fed_district: int | None = None,
    state_code: str | None = None,
    limit: int = 100,
) -> list[dict]:
    """Filter institutions by peer group criteria."""
    conditions = []
    params: list = []

    if charter_type:
        conditions.append("ct.charter_type = ?")
        params.append(charter_type)
    if asset_tier:
        conditions.append("ct.asset_size_tier = ?")
        params.append(asset_tier)
    if fed_district:
        conditions.append("ct.fed_district = ?")
        params.append(fed_district)
    if state_code:
        conditions.append("ct.state_code = ?")
        params.append(state_code)

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    params.append(limit)

    rows = db.fetchall(
        f"""SELECT ct.id, ct.institution_name, ct.charter_type,
                   ct.asset_size, ct.asset_size_tier, ct.fed_district,
                   ct.state_code, ct.city,
                   COUNT(ef.id) as fee_count
            FROM crawl_targets ct
            LEFT JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
            {where}
            GROUP BY ct.id
            ORDER BY ct.asset_size DESC NULLS LAST
            LIMIT ?""",
        tuple(params),
    )

    return [dict(r) for r in rows]
