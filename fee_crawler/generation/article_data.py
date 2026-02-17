"""Data query layer for article generation.

Pulls structured data payloads from SQLite for each article type.
All statistics are computed here — the LLM never sees raw SQL.
"""

from __future__ import annotations

import json
import statistics
from dataclasses import asdict, dataclass, field
from datetime import date

from fee_crawler.db import Database
from fee_crawler.fee_analysis import (
    CANONICAL_DISPLAY_NAMES,
    FEE_FAMILIES,
)
from fee_crawler.peer import FED_DISTRICT_NAMES, TIER_ORDER


@dataclass
class FeeStats:
    """Statistical summary for a set of fee amounts."""

    median: float | None = None
    mean: float | None = None
    p25: float | None = None
    p75: float | None = None
    min: float | None = None
    max: float | None = None
    count: int = 0

    @classmethod
    def from_amounts(cls, amounts: list[float]) -> FeeStats:
        if not amounts:
            return cls()
        sorted_a = sorted(amounts)
        n = len(sorted_a)
        return cls(
            median=statistics.median(sorted_a),
            mean=round(statistics.mean(sorted_a), 2),
            p25=sorted_a[n // 4] if n >= 4 else sorted_a[0],
            p75=sorted_a[(3 * n) // 4] if n >= 4 else sorted_a[-1],
            min=sorted_a[0],
            max=sorted_a[-1],
            count=n,
        )


@dataclass
class TierStats:
    """Fee stats for one asset tier."""

    tier: str
    tier_label: str
    stats: FeeStats


@dataclass
class DistrictStats:
    """Fee stats for one Fed district."""

    district: int
    district_name: str
    stats: FeeStats


@dataclass
class InstitutionFee:
    """A single institution's fee amount."""

    institution_name: str
    amount: float
    charter_type: str
    state_code: str | None = None
    city: str | None = None


@dataclass
class NationalBenchmarkData:
    """Full data payload for a national benchmark article."""

    category: str
    display_name: str
    quarter: str
    national: FeeStats
    by_charter: dict[str, FeeStats] = field(default_factory=dict)
    by_tier: list[TierStats] = field(default_factory=list)
    by_district: list[DistrictStats] = field(default_factory=list)
    sample_date: str = ""

    def to_json(self) -> str:
        return json.dumps(asdict(self), default=str)


@dataclass
class DistrictComparisonData:
    """Full data payload for a district comparison article."""

    category: str
    display_name: str
    district: int
    district_name: str
    district_stats: FeeStats = field(default_factory=FeeStats)
    national_stats: FeeStats = field(default_factory=FeeStats)
    delta_pct: float = 0.0
    beige_book_summary: str | None = None
    top_lowest: list[InstitutionFee] = field(default_factory=list)
    sample_date: str = ""

    def to_json(self) -> str:
        return json.dumps(asdict(self), default=str)


@dataclass
class CharterComparisonData:
    """Full data payload for a charter comparison article."""

    quarter: str
    bank_stats: dict[str, FeeStats] = field(default_factory=dict)
    cu_stats: dict[str, FeeStats] = field(default_factory=dict)
    categories: list[str] = field(default_factory=list)
    sample_date: str = ""

    def to_json(self) -> str:
        return json.dumps(asdict(self), default=str)


@dataclass
class RankedInstitution:
    """An institution in a top-N ranking."""

    rank: int
    institution_name: str
    amount: float
    charter_type: str
    state_code: str | None = None
    city: str | None = None
    asset_size_tier: str | None = None


@dataclass
class Top10Data:
    """Full data payload for a top-10 article."""

    category: str
    display_name: str
    direction: str  # "lowest" or "highest"
    ranked: list[RankedInstitution] = field(default_factory=list)
    national_median: float | None = None
    total_institutions: int = 0
    sample_date: str = ""

    def to_json(self) -> str:
        return json.dumps(asdict(self), default=str)


TIER_LABELS = {
    "community_small": "Community (Small)",
    "community_mid": "Community (Mid)",
    "community_large": "Community (Large)",
    "regional": "Regional",
    "large_regional": "Large Regional",
    "super_regional": "Super Regional",
}


def _current_quarter() -> str:
    today = date.today()
    q = (today.month - 1) // 3 + 1
    return f"Q{q} {today.year}"


def _get_fee_amounts(
    db: Database,
    category: str,
    charter_type: str | None = None,
    district: int | None = None,
    tier: str | None = None,
) -> list[dict]:
    """Get fee amounts with optional filters."""
    conditions = ["ef.fee_category = ?", "ef.review_status != 'rejected'", "ef.amount > 0"]
    params: list = [category]

    if charter_type:
        conditions.append("ct.charter_type = ?")
        params.append(charter_type)
    if district:
        conditions.append("ct.fed_district = ?")
        params.append(district)
    if tier:
        conditions.append("ct.asset_size_tier = ?")
        params.append(tier)

    where = " AND ".join(conditions)
    rows = db.fetchall(
        f"""SELECT ef.amount, ct.institution_name, ct.charter_type,
                   ct.state_code, ct.city, ct.asset_size_tier
            FROM extracted_fees ef
            JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
            WHERE {where}""",
        tuple(params),
    )
    return [dict(r) for r in rows]


def query_national_benchmark(db: Database, category: str) -> NationalBenchmarkData:
    """Build full data payload for a national benchmark article."""
    display_name = CANONICAL_DISPLAY_NAMES.get(
        category, category.replace("_", " ").title()
    )
    all_rows = _get_fee_amounts(db, category)
    all_amounts = [r["amount"] for r in all_rows]

    # By charter
    bank_amounts = [r["amount"] for r in all_rows if r["charter_type"] == "bank"]
    cu_amounts = [r["amount"] for r in all_rows if r["charter_type"] == "credit_union"]

    # By tier
    tier_stats = []
    for tier_key in TIER_ORDER:
        tier_amounts = [r["amount"] for r in all_rows if r["asset_size_tier"] == tier_key]
        if tier_amounts:
            tier_stats.append(
                TierStats(
                    tier=tier_key,
                    tier_label=TIER_LABELS.get(tier_key, tier_key),
                    stats=FeeStats.from_amounts(tier_amounts),
                )
            )

    # By district
    district_stats = []
    for d in range(1, 13):
        d_amounts = _get_fee_amounts(db, category, district=d)
        d_vals = [r["amount"] for r in d_amounts]
        if d_vals:
            district_stats.append(
                DistrictStats(
                    district=d,
                    district_name=FED_DISTRICT_NAMES.get(d, f"District {d}"),
                    stats=FeeStats.from_amounts(d_vals),
                )
            )

    return NationalBenchmarkData(
        category=category,
        display_name=display_name,
        quarter=_current_quarter(),
        national=FeeStats.from_amounts(all_amounts),
        by_charter={"bank": FeeStats.from_amounts(bank_amounts), "credit_union": FeeStats.from_amounts(cu_amounts)},
        by_tier=tier_stats,
        by_district=district_stats,
        sample_date=date.today().isoformat(),
    )


def query_district_comparison(
    db: Database, category: str, district: int
) -> DistrictComparisonData:
    """Build data payload for a district comparison article."""
    display_name = CANONICAL_DISPLAY_NAMES.get(
        category, category.replace("_", " ").title()
    )
    district_name = FED_DISTRICT_NAMES.get(district, f"District {district}")

    # National stats
    nat_rows = _get_fee_amounts(db, category)
    nat_amounts = [r["amount"] for r in nat_rows]
    nat_stats = FeeStats.from_amounts(nat_amounts)

    # District stats
    dist_rows = _get_fee_amounts(db, category, district=district)
    dist_amounts = [r["amount"] for r in dist_rows]
    dist_stats = FeeStats.from_amounts(dist_amounts)

    # Delta
    delta_pct = 0.0
    if nat_stats.median and dist_stats.median and nat_stats.median > 0:
        delta_pct = round(
            ((dist_stats.median - nat_stats.median) / nat_stats.median) * 100, 1
        )

    # Top 5 lowest
    dist_rows.sort(key=lambda r: r["amount"])
    top_lowest = [
        InstitutionFee(
            institution_name=r["institution_name"],
            amount=r["amount"],
            charter_type=r["charter_type"],
            state_code=r.get("state_code"),
            city=r.get("city"),
        )
        for r in dist_rows[:5]
    ]

    # Beige Book summary
    beige = db.fetchone(
        """SELECT content_text FROM fed_beige_book
           WHERE fed_district = ? AND section_name = 'Overall Economic Activity'
           ORDER BY release_date DESC LIMIT 1""",
        (district,),
    )
    beige_summary = beige["content_text"][:500] if beige else None

    return DistrictComparisonData(
        category=category,
        display_name=display_name,
        district=district,
        district_name=district_name,
        district_stats=dist_stats,
        national_stats=nat_stats,
        delta_pct=delta_pct,
        beige_book_summary=beige_summary,
        top_lowest=top_lowest,
        sample_date=date.today().isoformat(),
    )


def query_charter_comparison(db: Database) -> CharterComparisonData:
    """Build data payload for a charter comparison article."""
    # Use spotlight categories for the comparison
    spotlight = [
        "monthly_maintenance", "overdraft", "nsf",
        "atm_non_network", "card_foreign_txn", "wire_domestic_outgoing",
    ]

    bank_stats: dict[str, FeeStats] = {}
    cu_stats: dict[str, FeeStats] = {}

    for cat in spotlight:
        bank_rows = _get_fee_amounts(db, cat, charter_type="bank")
        cu_rows = _get_fee_amounts(db, cat, charter_type="credit_union")
        bank_stats[cat] = FeeStats.from_amounts([r["amount"] for r in bank_rows])
        cu_stats[cat] = FeeStats.from_amounts([r["amount"] for r in cu_rows])

    return CharterComparisonData(
        quarter=_current_quarter(),
        bank_stats=bank_stats,
        cu_stats=cu_stats,
        categories=spotlight,
        sample_date=date.today().isoformat(),
    )


def query_top_10(
    db: Database,
    category: str,
    direction: str = "lowest",
    limit: int = 10,
) -> Top10Data:
    """Build data payload for a top-10 article."""
    display_name = CANONICAL_DISPLAY_NAMES.get(
        category, category.replace("_", " ").title()
    )
    all_rows = _get_fee_amounts(db, category)
    all_amounts = [r["amount"] for r in all_rows]
    nat_stats = FeeStats.from_amounts(all_amounts)

    # Deduplicate by institution (keep lowest/highest per institution)
    inst_map: dict[str, dict] = {}
    for r in all_rows:
        name = r["institution_name"]
        if name not in inst_map:
            inst_map[name] = r
        else:
            existing = inst_map[name]["amount"]
            if direction == "lowest" and r["amount"] < existing:
                inst_map[name] = r
            elif direction == "highest" and r["amount"] > existing:
                inst_map[name] = r

    sorted_insts = sorted(
        inst_map.values(),
        key=lambda r: r["amount"],
        reverse=(direction == "highest"),
    )

    ranked = []
    for i, r in enumerate(sorted_insts[:limit], 1):
        ranked.append(
            RankedInstitution(
                rank=i,
                institution_name=r["institution_name"],
                amount=r["amount"],
                charter_type=r["charter_type"],
                state_code=r.get("state_code"),
                city=r.get("city"),
                asset_size_tier=r.get("asset_size_tier"),
            )
        )

    return Top10Data(
        category=category,
        display_name=display_name,
        direction=direction,
        ranked=ranked,
        national_median=nat_stats.median,
        total_institutions=len(inst_map),
        sample_date=date.today().isoformat(),
    )
