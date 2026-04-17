"""agent-graduate CLI (Phase 62b BOOT-01 / D-22 + D-23).

Usage:
    python -m fee_crawler agent-graduate <agent_name> --to <state>

States: ``q1_validation`` | ``q2_high_confidence`` | ``q3_autonomy`` | ``paused``

Named per-agent SQL predicates gate forward transitions (q1 -> q2, q2 -> q3).
Pausing is always allowed (rollback per D-25). Predicates are FIXED strings
keyed on ``(agent_name, from_state, to_state)`` — there is no interpolation
of user input anywhere in the SQL path (research §Pitfall 6).

Exit codes (surfaced to the shell / runbook):
    0 -- graduated (or already in the target state)
    2 -- invalid --to value
    3 -- unknown agent (no row in agent_registry)
    4 -- no predicate registered for this transition
    5 -- predicate returned FALSE; lifecycle_state stays on ``current``
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from typing import Dict, Optional, Tuple

from fee_crawler.agent_tools.pool import get_pool


# ---------------------------------------------------------------------------
# Graduation predicates (D-23).
#
# Each value is a FIXED SQL string. A predicate returns a single BOOLEAN;
# asyncpg fetches it via ``conn.fetchval(predicate)``. There is NO dynamic
# interpolation in any entry — that would re-open the injection surface
# research §Pitfall 6 warns against. Darwin and Atlas predicates land in
# Phases 64 / 65; ``knox`` is the canonical example per CONTEXT D-23.
# ---------------------------------------------------------------------------

_KNOX_Q1_TO_Q2 = """
    SELECT COALESCE(
      (100.0 * SUM(CASE WHEN outlier_flags ? 'human_accepted' THEN 1 ELSE 0 END)
             / NULLIF(COUNT(*), 0)) > 95,
      FALSE
    )
      FROM fees_raw
     WHERE source = 'knox'
       AND created_at > NOW() - INTERVAL '30 days'
"""

_KNOX_Q2_TO_Q3 = """
    SELECT COALESCE(AVG(extraction_confidence) > 0.90, FALSE)
      FROM fees_raw
     WHERE source = 'knox'
       AND created_at > NOW() - INTERVAL '90 days'
"""


PREDICATES: Dict[Tuple[str, str, str], str] = {
    ("knox", "q1_validation", "q2_high_confidence"): _KNOX_Q1_TO_Q2,
    ("knox", "q2_high_confidence", "q3_autonomy"): _KNOX_Q2_TO_Q3,
}


ALLOWED_STATES: Tuple[str, ...] = (
    "q1_validation",
    "q2_high_confidence",
    "q3_autonomy",
    "paused",
)


async def graduate(agent_name: str, to_state: str) -> int:
    """Run the graduation check + state flip. Returns a process exit code.

    The function deliberately validates in this order so tests can exercise
    each failure mode independently:

      1. Invalid ``--to`` value (exit 2)
      2. Unknown agent (exit 3)
      3. ``--to paused`` short-circuit (always allowed; exit 0)
      4. Already in target state (no-op; exit 0)
      5. No predicate registered for this transition (exit 4)
      6. Predicate returns FALSE (exit 5)
      7. Success (exit 0)
    """
    if to_state not in ALLOWED_STATES:
        print(f"error: --to must be one of {ALLOWED_STATES}", file=sys.stderr)
        return 2

    pool = await get_pool()
    async with pool.acquire() as conn:
        current = await conn.fetchval(
            "SELECT lifecycle_state FROM agent_registry WHERE agent_name = $1",
            agent_name,
        )
        if current is None:
            print(f"error: unknown agent: {agent_name}", file=sys.stderr)
            return 3

        # Pausing is always allowed — D-25 rollback semantics. Skip predicate.
        if to_state == "paused":
            await conn.execute(
                "UPDATE agent_registry SET lifecycle_state = 'paused' "
                "WHERE agent_name = $1",
                agent_name,
            )
            print(f"graduated {agent_name}: {current} -> paused")
            return 0

        if current == to_state:
            print(f"noop: {agent_name} already in {to_state}")
            return 0

        predicate = PREDICATES.get((agent_name, current, to_state))
        if predicate is None:
            print(
                f"error: no graduation predicate registered for "
                f"({agent_name}, {current} -> {to_state}). "
                f"Add entry to PREDICATES dict.",
                file=sys.stderr,
            )
            return 4

        passed = await conn.fetchval(predicate)
        if not passed:
            print(
                f"graduation FAILED: predicate for "
                f"({agent_name}, {current} -> {to_state}) returned FALSE. "
                f"State stays on {current}.",
                file=sys.stderr,
            )
            return 5

        await conn.execute(
            "UPDATE agent_registry SET lifecycle_state = $2 "
            "WHERE agent_name = $1",
            agent_name,
            to_state,
        )
        print(f"graduated {agent_name}: {current} -> {to_state}")
        return 0


def main(argv: Optional[list[str]] = None) -> int:
    """argparse entry. Returns an exit code suitable for ``sys.exit``."""
    ap = argparse.ArgumentParser(
        prog="agent-graduate",
        description=(
            "Advance (or rollback) an agent's lifecycle_state gated by a "
            "named per-agent SQL predicate (D-22 + D-23)."
        ),
    )
    ap.add_argument("agent_name", help="agent_registry.agent_name (e.g. knox)")
    ap.add_argument(
        "--to",
        required=True,
        choices=list(ALLOWED_STATES),
        help="target lifecycle_state",
    )
    args = ap.parse_args(argv)
    return asyncio.run(graduate(args.agent_name, args.to))


if __name__ == "__main__":
    raise SystemExit(main())
