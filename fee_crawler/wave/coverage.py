"""
Per-state coverage computation from crawl_targets.

Coverage = institutions with at least 1 extracted_fee / total active institutions.
Per D-02: coverage_pct is the ranking metric for wave prioritization (lowest first).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class StateCoverage:
    state_code: str
    total_institutions: int
    institutions_with_fees: int
    coverage_pct: float  # 0.0 to 100.0


_COVERAGE_SQL = """
SELECT
  ct.state_code,
  COUNT(*)                                                               AS total_institutions,
  COUNT(DISTINCT CASE WHEN ef.id IS NOT NULL THEN ct.id END)             AS institutions_with_fees
FROM crawl_targets ct
LEFT JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
WHERE ct.status = 'active'
  AND ct.state_code IS NOT NULL
GROUP BY ct.state_code
HAVING COUNT(*) > 0
ORDER BY ct.state_code
"""


def get_state_coverage(conn) -> list[StateCoverage]:
    """Compute per-state coverage from crawl_targets.

    Queries the DB for all active institutions grouped by state, joining
    extracted_fees to count institutions that have at least one fee record.
    Returns a list of StateCoverage objects sorted by state_code.
    """
    cur = conn.cursor()
    cur.execute(_COVERAGE_SQL)
    rows = cur.fetchall()

    result: list[StateCoverage] = []
    for row in rows:
        total = int(row["total_institutions"])
        with_fees = int(row["institutions_with_fees"])
        pct = (with_fees / total) * 100.0 if total > 0 else 0.0
        result.append(
            StateCoverage(
                state_code=row["state_code"],
                total_institutions=total,
                institutions_with_fees=with_fees,
                coverage_pct=round(pct, 2),
            )
        )

    return result
