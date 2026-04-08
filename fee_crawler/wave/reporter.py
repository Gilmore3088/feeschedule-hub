"""
Wave report module: query layer and Markdown renderer for post-wave summaries.

After run_wave() completes, print_wave_report() is called automatically to give
the operator a scannable view of what changed — no manual DB queries needed.

All SQL is parameterized (%s placeholders only — no f-string interpolation of
values). Designed to be readable in under 60 seconds (COV-01).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from fee_crawler.wave.models import get_wave_run, WaveRun

log = logging.getLogger(__name__)


# ─── Dataclasses ─────────────────────────────────────────────────────────────

@dataclass
class StateResult:
    state_code: str
    before_pct: float       # coverage % before this wave started
    after_pct: float        # coverage % now
    delta_pct: float        # after - before
    fees_added: int         # new extracted_fees rows added during wave
    status: str             # 'complete' | 'failed' | 'skipped'


@dataclass
class WaveReport:
    wave_run_id: int
    campaign_id: str | None
    started_at: str | None
    completed_at: str | None
    states: list[StateResult]
    national_before_pct: float
    national_after_pct: float
    national_delta_pct: float
    total_fees_added: int
    top_url_patterns: list[str]   # top 5 new fee_schedule_url patterns from wave
    top_discoveries: list[str]    # top 5 institution names with new fees this wave


# ─── Query helpers ────────────────────────────────────────────────────────────

def _get_coverage_pct(conn, state_code: str) -> float:
    """Current coverage % for a state (institutions with fee_schedule_url / total active)."""
    cur = conn.cursor()
    cur.execute(
        """SELECT
             COUNT(*) FILTER (WHERE fee_schedule_url IS NOT NULL) * 100.0
             / NULLIF(COUNT(*), 0) AS coverage_pct
           FROM crawl_targets
           WHERE state_code = %s AND status = 'active'""",
        (state_code,),
    )
    row = cur.fetchone()
    if row is None:
        return 0.0
    if isinstance(row, tuple):
        val = row[0]
    else:
        val = row.get("coverage_pct") if hasattr(row, "get") else row[list(row.keys())[0]]
    return float(val or 0.0)


def _get_fees_added(conn, wave_run_id: int, state_code: str) -> int:
    """Count extracted_fees rows added for a state during this wave."""
    cur = conn.cursor()
    cur.execute(
        """SELECT wsr.started_at
           FROM wave_state_runs wsr
           WHERE wsr.wave_run_id = %s AND wsr.state_code = %s""",
        (wave_run_id, state_code),
    )
    row = cur.fetchone()
    if row is None:
        return 0

    started_at = row["started_at"] if hasattr(row, "__getitem__") and not isinstance(row, tuple) else row[0]
    if started_at is None:
        return 0

    cur.execute(
        """SELECT COUNT(*) AS fee_count
           FROM extracted_fees ef
           WHERE ef.crawl_target_id IN (
               SELECT id FROM crawl_targets WHERE state_code = %s
           )
           AND ef.created_at >= %s""",
        (state_code, started_at),
    )
    row2 = cur.fetchone()
    if row2 is None:
        return 0
    if isinstance(row2, tuple):
        return int(row2[0] or 0)
    return int(row2.get("fee_count") or 0)


def _get_new_fee_institutions(conn, wave_run_id: int, state_code: str) -> int:
    """Count institutions that got their FIRST fee during this wave (for before-pct estimate)."""
    cur = conn.cursor()
    cur.execute(
        """SELECT wsr.started_at
           FROM wave_state_runs wsr
           WHERE wsr.wave_run_id = %s AND wsr.state_code = %s""",
        (wave_run_id, state_code),
    )
    row = cur.fetchone()
    if row is None:
        return 0

    started_at = row["started_at"] if hasattr(row, "__getitem__") and not isinstance(row, tuple) else row[0]
    if started_at is None:
        return 0

    cur.execute(
        """SELECT COUNT(DISTINCT ef.crawl_target_id) AS new_insts
           FROM extracted_fees ef
           WHERE ef.crawl_target_id IN (
               SELECT id FROM crawl_targets WHERE state_code = %s
           )
           AND ef.created_at >= %s
           AND NOT EXISTS (
               SELECT 1 FROM extracted_fees ef2
               WHERE ef2.crawl_target_id = ef.crawl_target_id
               AND ef2.created_at < %s
           )""",
        (state_code, started_at, started_at),
    )
    row2 = cur.fetchone()
    if row2 is None:
        return 0
    if isinstance(row2, tuple):
        return int(row2[0] or 0)
    return int(row2.get("new_insts") or 0)


def _get_total_active_institutions(conn, state_code: str) -> int:
    """Total active crawl_targets for a state."""
    cur = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) AS total FROM crawl_targets WHERE state_code = %s AND status = 'active'",
        (state_code,),
    )
    row = cur.fetchone()
    if row is None:
        return 0
    if isinstance(row, tuple):
        return int(row[0] or 0)
    return int(row.get("total") or 0)


def _get_top_url_patterns(conn, wave_run_id: int, limit: int = 5) -> list[str]:
    """Top fee_schedule_url values from institutions that received fees in this wave."""
    cur = conn.cursor()
    cur.execute(
        """SELECT ct.fee_schedule_url, COUNT(*) AS inst_count
           FROM crawl_targets ct
           JOIN wave_state_runs wsr
             ON wsr.wave_run_id = %s AND wsr.state_code = ct.state_code
           JOIN extracted_fees ef
             ON ef.crawl_target_id = ct.id AND ef.created_at >= wsr.started_at
           WHERE ct.fee_schedule_url IS NOT NULL
           GROUP BY ct.fee_schedule_url
           ORDER BY inst_count DESC
           LIMIT %s""",
        (wave_run_id, limit),
    )
    rows = cur.fetchall()
    results = []
    for row in rows:
        if isinstance(row, tuple):
            url, count = row[0], row[1]
        else:
            url = row.get("fee_schedule_url") or row[list(row.keys())[0]]
            count = row.get("inst_count") or row[list(row.keys())[1]]
        truncated = (url[:77] + "...") if url and len(url) > 80 else (url or "")
        results.append(f"{truncated} ({count} insts)")
    return results


def _get_top_discoveries(conn, wave_run_id: int, limit: int = 5) -> list[str]:
    """Top institutions by fee count that received new fees in this wave."""
    cur = conn.cursor()
    cur.execute(
        """SELECT ct.institution_name, ct.state_code, COUNT(ef.id) AS fee_count
           FROM crawl_targets ct
           JOIN wave_state_runs wsr
             ON wsr.wave_run_id = %s AND wsr.state_code = ct.state_code
           JOIN extracted_fees ef
             ON ef.crawl_target_id = ct.id AND ef.created_at >= wsr.started_at
           GROUP BY ct.id, ct.institution_name, ct.state_code
           ORDER BY fee_count DESC
           LIMIT %s""",
        (wave_run_id, limit),
    )
    rows = cur.fetchall()
    results = []
    for row in rows:
        if isinstance(row, tuple):
            name, state, count = row[0], row[1], row[2]
        else:
            name = row.get("institution_name") or ""
            state = row.get("state_code") or ""
            count = row.get("fee_count") or 0
        results.append(f"{name} ({state}, {count} fees)")
    return results


def _get_national_coverage(conn) -> float:
    """National coverage % across all active crawl_targets."""
    cur = conn.cursor()
    cur.execute(
        """SELECT
             COUNT(*) FILTER (WHERE fee_schedule_url IS NOT NULL) * 100.0
             / NULLIF(COUNT(*), 0) AS coverage_pct
           FROM crawl_targets
           WHERE status = 'active'""",
    )
    row = cur.fetchone()
    if row is None:
        return 0.0
    if isinstance(row, tuple):
        val = row[0]
    else:
        val = row.get("coverage_pct") if hasattr(row, "get") else row[list(row.keys())[0]]
    return float(val or 0.0)


# ─── Build and render ─────────────────────────────────────────────────────────

def build_wave_report(conn, wave_run_id: int) -> WaveReport:
    """Query DB to build a WaveReport for the given wave_run_id.

    Raises ValueError if wave_run_id is not found.
    """
    wave = get_wave_run(conn, wave_run_id)
    if wave is None:
        raise ValueError(f"Wave run {wave_run_id} not found")

    # Fetch wave_state_runs statuses
    cur = conn.cursor()
    cur.execute(
        """SELECT state_code, status
           FROM wave_state_runs
           WHERE wave_run_id = %s""",
        (wave_run_id,),
    )
    state_rows = cur.fetchall()
    state_statuses: dict[str, str] = {}
    for row in state_rows:
        if isinstance(row, tuple):
            state_statuses[row[0]] = row[1]
        else:
            state_statuses[row.get("state_code")] = row.get("status", "unknown")

    state_results: list[StateResult] = []
    total_fees_added = 0

    for state_code in wave.states:
        after_pct = _get_coverage_pct(conn, state_code)
        fees_added = _get_fees_added(conn, wave_run_id, state_code)
        new_insts = _get_new_fee_institutions(conn, wave_run_id, state_code)
        total_active = _get_total_active_institutions(conn, state_code)

        if total_active > 0:
            delta_from_new = (new_insts / total_active) * 100.0
        else:
            delta_from_new = 0.0

        before_pct = max(0.0, after_pct - delta_from_new)
        delta_pct = after_pct - before_pct

        total_fees_added += fees_added
        status = state_statuses.get(state_code, "unknown")

        state_results.append(StateResult(
            state_code=state_code,
            before_pct=round(before_pct, 1),
            after_pct=round(after_pct, 1),
            delta_pct=round(delta_pct, 1),
            fees_added=fees_added,
            status=status,
        ))

    national_after_pct = _get_national_coverage(conn)
    total_new_insts = sum(
        _get_new_fee_institutions(conn, wave_run_id, s) for s in wave.states
    )
    cur.execute("SELECT COUNT(*) AS total FROM crawl_targets WHERE status = 'active'")
    row = cur.fetchone()
    total_national_active = int(
        (row[0] if isinstance(row, tuple) else row.get("total") or 0) if row else 0
    )
    if total_national_active > 0:
        national_delta = (total_new_insts / total_national_active) * 100.0
    else:
        national_delta = 0.0
    national_before_pct = max(0.0, national_after_pct - national_delta)

    # Format timestamps to strings
    started_at = wave.created_at.isoformat() if wave.created_at else None
    completed_at = wave.completed_at.isoformat() if wave.completed_at else None

    top_url_patterns = _get_top_url_patterns(conn, wave_run_id)
    top_discoveries = _get_top_discoveries(conn, wave_run_id)

    return WaveReport(
        wave_run_id=wave_run_id,
        campaign_id=wave.campaign_id,
        started_at=started_at,
        completed_at=completed_at,
        states=state_results,
        national_before_pct=round(national_before_pct, 1),
        national_after_pct=round(national_after_pct, 1),
        national_delta_pct=round(national_delta, 1),
        total_fees_added=total_fees_added,
        top_url_patterns=top_url_patterns,
        top_discoveries=top_discoveries,
    )


def _fmt_delta(delta: float) -> str:
    """Format delta with +/=/- prefix."""
    if delta > 0:
        return f"+{delta:.1f}%"
    elif delta < 0:
        return f"{delta:.1f}%"
    else:
        return "=0.0%"


def render_wave_report(report: WaveReport) -> str:
    """Render a WaveReport as a Markdown string. Scannable in under 60 seconds."""
    lines: list[str] = []

    lines.append(f"# Wave #{report.wave_run_id} Report")
    lines.append(f"Campaign: {report.campaign_id or 'standalone'}")
    lines.append(
        f"Started: {report.started_at or 'N/A'}  "
        f"Completed: {report.completed_at or 'N/A'}"
    )
    lines.append("")

    lines.append("## National Coverage")
    lines.append(
        f"Before: {report.national_before_pct:.1f}%  "
        f"After: {report.national_after_pct:.1f}%  "
        f"Delta: {_fmt_delta(report.national_delta_pct)}"
    )
    lines.append(f"Total fees added: {report.total_fees_added:,}")
    lines.append("")

    lines.append("## Per-State Results")
    lines.append("| State | Before | After | Delta | Fees Added | Status |")
    lines.append("|-------|--------|-------|-------|------------|--------|")

    # Sort: complete states first by delta DESC, then failed/skipped
    complete_states = sorted(
        [s for s in report.states if s.status == "complete"],
        key=lambda s: s.delta_pct,
        reverse=True,
    )
    other_states = [s for s in report.states if s.status != "complete"]

    for s in complete_states + other_states:
        lines.append(
            f"| {s.state_code:<5} "
            f"| {s.before_pct:.1f}% "
            f"| {s.after_pct:.1f}% "
            f"| {_fmt_delta(s.delta_pct)} "
            f"| {s.fees_added:<10,} "
            f"| {s.status} |"
        )
    lines.append("")

    lines.append("## Top Discoveries")
    if report.top_discoveries:
        for i, item in enumerate(report.top_discoveries, start=1):
            lines.append(f"{i}. {item}")
    else:
        lines.append("None found this wave.")
    lines.append("")

    lines.append("## Top URL Patterns")
    if report.top_url_patterns:
        for i, item in enumerate(report.top_url_patterns, start=1):
            lines.append(f"{i}. {item}")
    else:
        lines.append("None found this wave.")
    lines.append("")

    return "\n".join(lines)


def print_wave_report(
    conn,
    wave_run_id: int,
    output_path: str | None = None,
) -> None:
    """Build and print the wave report to stdout (and optionally a file).

    Catches all exceptions and logs at WARNING — never raises. Safe to call
    from orchestrator without disrupting the return value.
    """
    try:
        report = build_wave_report(conn, wave_run_id)
        rendered = render_wave_report(report)
        print(rendered)
        if output_path is not None:
            with open(output_path, "w", encoding="utf-8") as fh:
                fh.write(rendered)
    except Exception as exc:  # noqa: BLE001
        log.warning("Wave report failed: %s", exc)
