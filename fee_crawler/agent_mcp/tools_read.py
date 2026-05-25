"""Read-only MCP tools.

Every tool in this module MUST be decorated with @read_only_tool, which sets
`_bfi_read_only=True` on the underlying function before delegating to the
FastMCP tool decorator. server.py asserts this attribute on startup; any
missing marker raises RuntimeError and the server refuses to boot.

Tool surface (D-07):
  - get_national_index        — Tier 3 (fees_published) medians by canonical_fee_key
  - get_institution_dossier   — Knox's per-institution strategy dossier
  - get_call_report_snapshot  — Most recent Call Report row for an institution
  - trace_published_fee       — OBS-02 lineage: Tier 3 -> Tier 2 -> Tier 1 -> source

Out of scope for 62a: any write/mutation tool. Those stay behind the
service-role gateway in fee_crawler/agent_tools/ and are exercised by the
internal agents, never by external MCP clients.
"""

from __future__ import annotations

import functools
from typing import Any, Callable, Optional

from fee_crawler.agent_mcp.server import mcp
from fee_crawler.agent_tools.pool import get_pool


def read_only_tool(**mcp_kwargs: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Marker decorator: stamps _bfi_read_only=True then delegates to @mcp.tool().

    The marker propagates to the FastMCP-registered wrapper via functools.wraps
    (which copies __dict__ by default), so the server-side assertion sees the
    attribute on `tool.fn._bfi_read_only`.
    """

    def _decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        fn._bfi_read_only = True  # type: ignore[attr-defined]

        @mcp.tool(**mcp_kwargs)
        @functools.wraps(fn)
        async def _wrapper(*args: Any, **kwargs: Any) -> Any:
            return await fn(*args, **kwargs)

        # Defensive: ensure the wrapper itself also carries the marker even if
        # a future functools.wraps change drops __dict__ copying.
        _wrapper._bfi_read_only = True  # type: ignore[attr-defined]
        return _wrapper

    return _decorator


@read_only_tool(
    name="get_national_index",
    description=(
        "Return the national fee index medians by canonical_fee_key from Tier 3 "
        "(fees_published). Optionally filter to a single canonical_fee_key."
    ),
)
async def get_national_index(canonical_fee_key: Optional[str] = None) -> list[dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Hamilton must never cite rolled-back fees as live evidence
        # (20260419_fees_published_rollback.sql contract).
        if canonical_fee_key:
            rows = await conn.fetch(
                """
                SELECT canonical_fee_key,
                       COUNT(DISTINCT institution_id)                             AS institution_count,
                       PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY amount)       AS median,
                       PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY amount)       AS p25,
                       PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY amount)       AS p75
                  FROM fees_published
                 WHERE canonical_fee_key = $1
                   AND rolled_back_at IS NULL
                 GROUP BY canonical_fee_key
                """,
                canonical_fee_key,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT canonical_fee_key,
                       COUNT(DISTINCT institution_id)                             AS institution_count,
                       PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY amount)       AS median,
                       PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY amount)       AS p25,
                       PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY amount)       AS p75
                  FROM fees_published
                 WHERE rolled_back_at IS NULL
                 GROUP BY canonical_fee_key
                 ORDER BY canonical_fee_key
                """,
            )
    return [dict(r) for r in rows]


@read_only_tool(
    name="get_institution_dossier",
    description=(
        "Return Knox's per-institution strategy dossier: last URL tried, document "
        "format, outcome, cost, and next-try recommendation."
    ),
)
async def get_institution_dossier(institution_id: int) -> dict[str, Any] | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT institution_id,
                   last_url_tried,
                   last_document_format,
                   last_strategy,
                   last_outcome,
                   last_cost_cents,
                   next_try_recommendation,
                   notes,
                   updated_at
              FROM institution_dossiers
             WHERE institution_id = $1
            """,
            institution_id,
        )
    return dict(row) if row else None


@read_only_tool(
    name="get_call_report_snapshot",
    description=(
        "Return the most recent Call Report snapshot for an institution (read-only "
        "passthrough of the pre-62a call_reports table)."
    ),
)
async def get_call_report_snapshot(institution_id: int) -> dict[str, Any] | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT institution_id,
                   period_end,
                   total_assets,
                   service_charge_revenue_thousands,
                   payload
              FROM call_reports
             WHERE institution_id = $1
             ORDER BY period_end DESC
             LIMIT 1
            """,
            institution_id,
        )
    return dict(row) if row else None


@read_only_tool(
    name="trace_published_fee",
    description=(
        "OBS-02 lineage trace: given a Tier 3 fee_published_id, return the full "
        "chain back to Tier 2 (fees_verified), Tier 1 (fees_raw), the owning "
        "institution, and the crawl event id."
    ),
)
async def trace_published_fee(fee_published_id: int) -> dict[str, Any] | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                fp.fee_published_id,
                fp.canonical_fee_key,
                fp.amount,
                fp.source_url,
                fp.document_r2_key,
                fp.agent_event_id,
                fp.verified_by_agent_event_id,
                fp.published_by_adversarial_event_id,
                fv.fee_verified_id,
                fv.fee_raw_id,
                fr.institution_id,
                fr.crawl_event_id
              FROM fees_published fp
              JOIN fees_verified  fv ON fp.lineage_ref = fv.fee_verified_id
              JOIN fees_raw       fr ON fv.fee_raw_id   = fr.fee_raw_id
             WHERE fp.fee_published_id = $1
            """,
            fee_published_id,
        )
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Agent introspection tools — added 2026-05-25 so Hamilton (and external MCP
# clients) can see fleet state without leaving the read-only surface.
# ---------------------------------------------------------------------------

@read_only_tool(
    name="get_agent_budgets",
    description=(
        "Return current budget state for every agent (or a single agent if "
        "agent_name is provided). Includes spent_cents, limit_cents, "
        "halted_at, budget_window. Useful for 'why isn't agent X running' "
        "questions."
    ),
)
async def get_agent_budgets(agent_name: Optional[str] = None) -> list[dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if agent_name:
            rows = await conn.fetch(
                """SELECT agent_name, budget_window, limit_cents, spent_cents,
                          halted_at, halted_reason, window_started_at
                     FROM agent_budgets
                    WHERE agent_name = $1
                    ORDER BY budget_window""",
                agent_name,
            )
        else:
            rows = await conn.fetch(
                """SELECT agent_name, budget_window, limit_cents, spent_cents,
                          halted_at, halted_reason, window_started_at
                     FROM agent_budgets
                    ORDER BY agent_name, budget_window""",
            )
    return [dict(r) for r in rows]


@read_only_tool(
    name="get_recent_agent_events",
    description=(
        "Recent agent_events for one agent. Returns counts by status + the "
        "last N rows for inspection. Window: last `hours` hours (default 24)."
    ),
)
async def get_recent_agent_events(
    agent_name: str,
    hours: int = 24,
    limit: int = 20,
) -> dict[str, Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        summary = await conn.fetch(
            """SELECT status, COUNT(*) AS n
                 FROM agent_events
                WHERE agent_name = $1
                  AND created_at > NOW() - ($2 || ' hours')::interval
                GROUP BY status
                ORDER BY n DESC""",
            agent_name, str(hours),
        )
        recent = await conn.fetch(
            """SELECT event_id, action, tool_name, entity, status, cost_cents, created_at
                 FROM agent_events
                WHERE agent_name = $1
                  AND created_at > NOW() - ($2 || ' hours')::interval
                ORDER BY created_at DESC
                LIMIT $3""",
            agent_name, str(hours), limit,
        )
    return {
        "summary_by_status": [dict(r) for r in summary],
        "recent_events": [dict(r) for r in recent],
    }


@read_only_tool(
    name="get_agent_lessons",
    description=(
        "Latest committed lessons (LOOP-05 output) — optionally filtered "
        "by agent. Useful for 'what has the system learned recently'."
    ),
)
async def get_agent_lessons(
    agent_name: Optional[str] = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if agent_name:
            rows = await conn.fetch(
                """SELECT lesson_id, agent_name, lesson_name, description,
                          confidence, created_at, source_event_id
                     FROM agent_lessons
                    WHERE agent_name = $1
                      AND superseded_by IS NULL
                    ORDER BY created_at DESC
                    LIMIT $2""",
                agent_name, limit,
            )
        else:
            rows = await conn.fetch(
                """SELECT lesson_id, agent_name, lesson_name, description,
                          confidence, created_at, source_event_id
                     FROM agent_lessons
                    WHERE superseded_by IS NULL
                    ORDER BY created_at DESC
                    LIMIT $1""",
                limit,
            )
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Trend aggregation — m/m and q/q deltas computed from fee_snapshots.
# Replaces the "no trend aggregation job" 🟡 item with an on-demand query.
# ---------------------------------------------------------------------------

@read_only_tool(
    name="simulate_fee_change",
    description=(
        "C-03 what-if simulator. Given (institution_id, canonical_fee_key, "
        "proposed_amount), return where the proposed amount sits in the peer "
        "distribution: current_percentile vs proposed_percentile, plus the "
        "peer cohort's p25/p50/p75/p90/p100 to give the asker context. "
        "Cohort filter: same charter_type + same state by default; override "
        "with cohort='national' for a US-wide comparison."
    ),
)
async def simulate_fee_change(
    institution_id: int,
    canonical_fee_key: str,
    proposed_amount: float,
    cohort: str = "state",   # 'state' | 'national'
) -> dict[str, Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Step 1: this institution's current posture for the fee.
        cur_row = await conn.fetchrow(
            """SELECT fp.amount,
                      ct.state_code, ct.charter_type, ct.institution_name
                 FROM fees_published fp
                 JOIN crawl_targets ct ON ct.id = fp.institution_id
                WHERE fp.institution_id = $1
                  AND fp.canonical_fee_key = $2
                  AND fp.rolled_back_at IS NULL
                ORDER BY fp.published_at DESC
                LIMIT 1""",
            institution_id, canonical_fee_key,
        )
        if cur_row is None:
            return {
                "error": "institution_or_fee_not_found",
                "institution_id": institution_id,
                "canonical_fee_key": canonical_fee_key,
            }

        cur_amount = float(cur_row["amount"]) if cur_row["amount"] is not None else None
        state = cur_row["state_code"]
        charter = cur_row["charter_type"]
        inst_name = cur_row["institution_name"]

        # Step 2: peer cohort amounts. Same charter_type; same state
        # (default) or national.
        peer_where = [
            "fp.canonical_fee_key = $1",
            "fp.rolled_back_at IS NULL",
            "ct.charter_type = $2",
            "fp.amount IS NOT NULL",
            "fp.institution_id <> $3",
        ]
        params: list[Any] = [canonical_fee_key, charter, institution_id]
        if cohort == "state":
            peer_where.append(f"ct.state_code = ${len(params) + 1}")
            params.append(state)

        peers = await conn.fetch(
            f"""SELECT fp.amount::float AS amt
                  FROM fees_published fp
                  JOIN crawl_targets ct ON ct.id = fp.institution_id
                 WHERE {' AND '.join(peer_where)}""",
            *params,
        )
        peer_amounts = sorted([float(r["amt"]) for r in peers])

        if not peer_amounts:
            return {
                "error": "no_peer_cohort_data",
                "institution_id": institution_id,
                "canonical_fee_key": canonical_fee_key,
                "cohort": cohort,
                "current_amount": cur_amount,
            }

        # Step 3: percentile helpers
        def _pct_at(values: list[float], target: float) -> float:
            """Returns the percentile rank (0-100) of `target` in `values`.
            Linear interpolation between neighboring entries."""
            n = len(values)
            below = sum(1 for v in values if v < target)
            equal = sum(1 for v in values if v == target)
            # Standard "average percentile" definition; same one
            # scipy.stats.percentileofscore uses with kind='mean'.
            return round(((below + equal / 2) / n) * 100, 1)

        def _percentile(values: list[float], p: float) -> float:
            if not values:
                return 0.0
            k = (len(values) - 1) * (p / 100.0)
            f, c = int(k), min(int(k) + 1, len(values) - 1)
            if f == c:
                return values[f]
            return values[f] + (values[c] - values[f]) * (k - f)

        return {
            "institution_id": institution_id,
            "institution_name": inst_name,
            "canonical_fee_key": canonical_fee_key,
            "cohort": cohort,
            "cohort_state": state if cohort == "state" else None,
            "cohort_charter": charter,
            "cohort_size": len(peer_amounts),
            "current_amount": cur_amount,
            "proposed_amount": float(proposed_amount),
            "current_percentile": (
                _pct_at(peer_amounts, cur_amount) if cur_amount is not None else None
            ),
            "proposed_percentile": _pct_at(peer_amounts, float(proposed_amount)),
            "peer_p25": round(_percentile(peer_amounts, 25), 2),
            "peer_p50": round(_percentile(peer_amounts, 50), 2),
            "peer_p75": round(_percentile(peer_amounts, 75), 2),
            "peer_p90": round(_percentile(peer_amounts, 90), 2),
            "peer_min": peer_amounts[0],
            "peer_max": peer_amounts[-1],
        }


@read_only_tool(
    name="get_my_digest_subscriptions",
    description=(
        "Active Hamilton digest subscriptions for a user. Returns each "
        "subscription's label, cadence, next_due_at, last_run_at, and "
        "the most recent run's status. C-02 surface for the admin UI."
    ),
)
async def get_my_digest_subscriptions(user_id: int) -> list[dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.subscription_id, s.label, s.cadence, s.delivery,
                   s.next_due_at, s.last_run_at, s.active,
                   r.status   AS last_run_status,
                   r.started_at AS last_run_started_at,
                   r.cost_cents AS last_run_cost_cents
              FROM hamilton_digest_subscriptions s
              LEFT JOIN LATERAL (
                SELECT status, started_at, cost_cents
                  FROM hamilton_digest_runs
                 WHERE subscription_id = s.subscription_id
                 ORDER BY started_at DESC
                 LIMIT 1
              ) r ON TRUE
             WHERE s.user_id = $1
             ORDER BY s.next_due_at ASC
            """,
            user_id,
        )
    return [dict(r) for r in rows]


@read_only_tool(
    name="get_knox_rejection_summary",
    description=(
        "Top reasons Knox is rejecting fees over a recent window. "
        "Optional: days (default 7), top_n (default 10). Returns "
        "total_rejections, distinct_institutions, and top_reasons[] "
        "sorted by frequency. Backed by the same data the weekly "
        "summarizer writes to agent_lessons; this tool computes live "
        "so Hamilton can ask 'what's Knox been rejecting today?' "
        "without waiting for the next batch."
    ),
)
async def get_knox_rejection_summary(
    days: int = 7,
    top_n: int = 10,
) -> dict[str, Any]:
    from fee_crawler.agents.knox.rejections import summarize_recent_rejections
    pool = await get_pool()
    async with pool.acquire() as conn:
        s = await summarize_recent_rejections(
            conn, days=days, top_n=top_n, write_lesson=False,
        )
    return s.to_dict()


@read_only_tool(
    name="get_fee_change_events",
    description=(
        "Recent fee_change_events: amount changes detected by the crawler, "
        "with previous + new amounts and change_type. Optional filters: "
        "fee_category, days (default 30, max 365), institution_id. "
        "Returns up to `limit` events most-recent-first. Lets Hamilton "
        "answer 'what changed recently?' without lineage trace."
    ),
)
async def get_fee_change_events(
    fee_category: Optional[str] = None,
    institution_id: Optional[int] = None,
    days: int = 30,
    limit: int = 50,
) -> list[dict[str, Any]]:
    days = max(1, min(int(days or 30), 365))
    limit = max(1, min(int(limit or 50), 200))
    pool = await get_pool()
    async with pool.acquire() as conn:
        where = ["detected_at > NOW() - ($1 || ' days')::interval"]
        params: list[Any] = [str(days)]
        if fee_category:
            where.append(f"fee_category = ${len(params) + 1}")
            params.append(fee_category)
        if institution_id is not None:
            where.append(f"crawl_target_id = ${len(params) + 1}")
            params.append(int(institution_id))
        params.append(limit)
        sql = (
            "SELECT id, crawl_target_id, fee_category, previous_amount, "
            "       new_amount, change_type, detected_at "
            "  FROM fee_change_events "
            " WHERE " + " AND ".join(where) +
            f" ORDER BY detected_at DESC LIMIT ${len(params)}"
        )
        rows = await conn.fetch(sql, *params)
    return [dict(r) for r in rows]


@read_only_tool(
    name="get_fee_trend",
    description=(
        "Month-over-month and quarter-over-quarter deltas for a given "
        "fee_category, computed live from fee_snapshots. Returns "
        "current_median, mom_pct, qoq_pct, sample_size_current, "
        "sample_size_prev_month, sample_size_prev_quarter. Defaults to the "
        "most recent snapshot date when no date is provided."
    ),
)
async def get_fee_trend(
    fee_category: str,
    as_of_date: Optional[str] = None,
) -> dict[str, Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Resolve as_of to most recent snapshot for this category if not given.
        if not as_of_date:
            row = await conn.fetchrow(
                """SELECT MAX(snapshot_date) AS d
                     FROM fee_snapshots
                    WHERE fee_category = $1""",
                fee_category,
            )
            as_of_date = row["d"] if row else None

        if not as_of_date:
            return {
                "fee_category": fee_category,
                "as_of_date": None,
                "current_median": None,
                "mom_pct": None,
                "qoq_pct": None,
                "sample_size_current": 0,
                "sample_size_prev_month": 0,
                "sample_size_prev_quarter": 0,
            }

        # snapshot_date is TEXT (YYYY-MM-DD); use date arithmetic in PG.
        row = await conn.fetchrow(
            """
            WITH
              cur AS (
                SELECT amount FROM fee_snapshots
                 WHERE fee_category = $1 AND snapshot_date = $2
                   AND amount IS NOT NULL
              ),
              mo AS (
                SELECT amount FROM fee_snapshots
                 WHERE fee_category = $1
                   AND snapshot_date = (($2::date - INTERVAL '1 month')::date)::text
                   AND amount IS NOT NULL
              ),
              qt AS (
                SELECT amount FROM fee_snapshots
                 WHERE fee_category = $1
                   AND snapshot_date = (($2::date - INTERVAL '3 months')::date)::text
                   AND amount IS NOT NULL
              )
            SELECT
              (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY amount) FROM cur)::float AS cur_med,
              (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY amount) FROM mo)::float  AS mo_med,
              (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY amount) FROM qt)::float  AS qt_med,
              (SELECT count(*) FROM cur)::int AS cur_n,
              (SELECT count(*) FROM mo)::int  AS mo_n,
              (SELECT count(*) FROM qt)::int  AS qt_n
            """,
            fee_category, as_of_date,
        )

    def _pct(cur, prev):
        if cur is None or prev is None or prev == 0:
            return None
        return round(((cur - prev) / prev) * 100, 2)

    return {
        "fee_category": fee_category,
        "as_of_date": as_of_date,
        "current_median": row["cur_med"],
        "mom_pct": _pct(row["cur_med"], row["mo_med"]),
        "qoq_pct": _pct(row["cur_med"], row["qt_med"]),
        "sample_size_current": row["cur_n"],
        "sample_size_prev_month": row["mo_n"],
        "sample_size_prev_quarter": row["qt_n"],
    }
