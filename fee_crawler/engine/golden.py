"""Golden-set regression — catch extraction/pipeline regressions before publish.

Compares the latest verified fees for each golden institution against a
hand-curated expected snapshot. A diff (missing key, wrong amount beyond
tolerance, or an unexpected extra key) is a regression. Runs as a gate before
the national roll-up publishes; failures alert and can block the swap.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import asyncpg


@dataclass
class GoldenDiff:
    crawl_target_id: int
    missing: list[str] = field(default_factory=list)          # expected but absent
    wrong_amount: list[tuple[str, float, float]] = field(default_factory=list)  # (key, expected, got)
    unexpected: list[str] = field(default_factory=list)       # present but not expected

    @property
    def clean(self) -> bool:
        return not (self.missing or self.wrong_amount or self.unexpected)


async def check_golden_set(pool: asyncpg.Pool) -> list[GoldenDiff]:
    """Return a diff per golden institution. Empty list => nothing configured."""
    async with pool.acquire() as conn:
        targets = await conn.fetch("SELECT crawl_target_id FROM golden_institutions")
        diffs: list[GoldenDiff] = []
        for t in targets:
            tid = t["crawl_target_id"]
            expected = {
                r["canonical_fee_key"]: (r["expected_amount"], r["tolerance"])
                for r in await conn.fetch(
                    "SELECT canonical_fee_key, expected_amount, tolerance "
                    "FROM golden_fees WHERE crawl_target_id=$1",
                    tid,
                )
            }
            # Latest verified value per canonical key for this institution.
            got = {
                r["canonical_fee_key"]: r["amount"]
                for r in await conn.fetch(
                    """
                    SELECT DISTINCT ON (canonical_fee_key) canonical_fee_key, amount
                      FROM fees_verified WHERE institution_id=$1
                     ORDER BY canonical_fee_key, created_at DESC
                    """,
                    tid,
                )
            }
            diff = GoldenDiff(tid)
            for key, (exp_amt, tol) in expected.items():
                if key not in got:
                    diff.missing.append(key)
                elif exp_amt is not None and got[key] is not None:
                    if abs(float(got[key]) - float(exp_amt)) > float(tol):
                        diff.wrong_amount.append((key, float(exp_amt), float(got[key])))
            for key in got:
                if key not in expected:
                    diff.unexpected.append(key)
            diffs.append(diff)
    return diffs


async def golden_regressions(pool: asyncpg.Pool) -> list[GoldenDiff]:
    """Only the golden institutions that regressed (non-clean diffs)."""
    return [d for d in await check_golden_set(pool) if not d.clean]
