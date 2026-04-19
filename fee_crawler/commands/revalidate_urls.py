"""Re-validate existing fee_schedule_urls with tightened rejection logic.

Prior health check (2026-04-07) flagged 490 URLs as dead, but treated HTTP 403
as terminal — producing false positives against bot-blocking origins. This
command reruns validation across every non-null fee_schedule_url with a
narrower definition of "dead."

Rejection rules (applied to terminal status after retries):
    - hard 404            -> reject
    - hard 410            -> reject
    - persistent 5xx      -> reject only if >= MIN_5XX_FAILURES consecutive
                             failures across the retry budget

Never-reject rules (treated as transient / bot-block, NOT dead):
    - 403                 -> bot-blocking; keep URL, record reason
    - 429                 -> rate-limited; keep URL, record reason
    - timeout             -> transient; keep URL, record reason
    - connection reset    -> transient; keep URL, record reason
    - DNS temp failure    -> transient; keep URL, record reason

Every URL gets up to MAX_ATTEMPTS probes (HEAD then GET fallback) spaced by an
exponential backoff. A URL is only marked reject-candidate if the terminal
status after all attempts matches one of the hard-reject rules.

Usage:
    python -m fee_crawler revalidate-urls                     # dry-run (default)
    python -m fee_crawler revalidate-urls --limit 100         # sample
    python -m fee_crawler revalidate-urls --report out.md     # custom report path
    python -m fee_crawler revalidate-urls --fix               # apply DB writes
                                                              # (NOT run here)

A dry-run NEVER writes to fee_schedule_urls, crawl_targets, fees_raw, or
extracted_fees. It only reads + writes the markdown report file.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# ─── Tightened rejection rules ────────────────────────────────────────────
HARD_REJECT_STATUSES = {404, 410}
PERSISTENT_5XX_REJECT = True
MIN_5XX_FAILURES = 3   # need >=3 consecutive 5xx across attempts to reject
MAX_ATTEMPTS = 3       # 1 initial + 2 retries (meets "at least 2 more attempts")
BACKOFF_BASE_SECONDS = 1.5
PER_REQUEST_TIMEOUT = 15.0

# Statuses we explicitly DO NOT treat as dead (even if they're the terminal
# response after all retries). These get logged with their reason code but
# the URL is preserved in the DB.
SOFT_NEVER_REJECT_STATUSES = {403, 429, 401}

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


@dataclass
class ProbeResult:
    target_id: int
    institution_name: str
    state_code: Optional[str]
    url: str
    terminal_status: Optional[int] = None
    terminal_reason: str = ""        # short failure_reason tag
    attempts: int = 0
    status_history: list = field(default_factory=list)  # list[int|str]
    would_reject: bool = False

    def to_row(self) -> dict:
        return {
            "institution_name": self.institution_name,
            "state_code": self.state_code or "",
            "url": self.url,
            "http_status": self.terminal_status if self.terminal_status is not None else "",
            "failure_reason": self.terminal_reason,
            "retry_count": self.attempts,
            "status_history": "|".join(str(s) for s in self.status_history),
        }


def _connect():
    conn = psycopg2.connect(
        os.environ["DATABASE_URL"],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    return conn


def _classify_exception(exc: BaseException) -> str:
    """Map an httpx/asyncio exception to one of our transient reason tags."""
    if isinstance(exc, httpx.ConnectTimeout):
        return "timeout_connect"
    if isinstance(exc, httpx.ReadTimeout):
        return "timeout_read"
    if isinstance(exc, httpx.PoolTimeout):
        return "timeout_pool"
    if isinstance(exc, httpx.TimeoutException):
        return "timeout"
    if isinstance(exc, httpx.ConnectError):
        # Covers DNS temp failures and connection resets at the transport layer.
        msg = str(exc).lower()
        if "name or service not known" in msg or "nodename nor servname" in msg \
                or "temporary failure in name resolution" in msg:
            return "dns_temp_failure"
        if "connection reset" in msg or "reset by peer" in msg:
            return "connection_reset"
        return "connect_error"
    if isinstance(exc, httpx.RemoteProtocolError):
        return "protocol_error"
    if isinstance(exc, httpx.TooManyRedirects):
        return "too_many_redirects"
    if isinstance(exc, httpx.UnsupportedProtocol):
        return "unsupported_protocol"
    return f"exception:{type(exc).__name__}"


async def _probe_once(
    client: httpx.AsyncClient, url: str
) -> tuple[Optional[int], str]:
    """Single HEAD-then-GET probe. Returns (status_code, reason_tag)."""
    # HEAD first (cheap). Many origins reject HEAD with 405/403 even when GET works,
    # so we fall back to GET on any non-2xx/3xx result.
    try:
        resp = await client.head(url, follow_redirects=True, timeout=PER_REQUEST_TIMEOUT)
        if resp.status_code < 400:
            return resp.status_code, "ok"
        # HEAD returned a non-success — retry with GET to disambiguate
        # (e.g., a 403 from HEAD might succeed on GET).
    except Exception as exc:  # noqa: BLE001 — we reclassify below
        # HEAD failed; fall through to GET attempt
        _ = exc

    try:
        # Stream GET so we don't download the whole body (HTTPX will close on exit).
        async with client.stream(
            "GET", url, follow_redirects=True, timeout=PER_REQUEST_TIMEOUT,
        ) as resp:
            return resp.status_code, "ok" if resp.status_code < 400 else f"http_{resp.status_code}"
    except Exception as exc:  # noqa: BLE001
        return None, _classify_exception(exc)


async def _validate_url(
    client: httpx.AsyncClient, target: dict, sem: asyncio.Semaphore
) -> ProbeResult:
    """Run up to MAX_ATTEMPTS probes against a single URL and classify."""
    result = ProbeResult(
        target_id=target["id"],
        institution_name=target["institution_name"],
        state_code=target.get("state_code"),
        url=target["fee_schedule_url"],
    )

    async with sem:
        consecutive_5xx = 0
        for attempt in range(MAX_ATTEMPTS):
            result.attempts = attempt + 1
            status, reason = await _probe_once(client, result.url)
            result.status_history.append(status if status is not None else reason)
            result.terminal_status = status
            result.terminal_reason = reason

            # Hard reject on first authoritative hit — 404/410 don't need retries.
            if status in HARD_REJECT_STATUSES:
                result.would_reject = True
                result.terminal_reason = f"http_{status}"
                return result

            # Count consecutive 5xx across attempts.
            if status is not None and 500 <= status < 600:
                consecutive_5xx += 1
            else:
                consecutive_5xx = 0

            # Success — URL is alive, stop.
            if status is not None and status < 400:
                result.terminal_reason = "ok"
                return result

            # Not a terminal-yet state — back off and retry (unless last attempt).
            if attempt < MAX_ATTEMPTS - 1:
                await asyncio.sleep(BACKOFF_BASE_SECONDS * (2 ** attempt))

        # Exhausted retries. Decide if terminal state warrants rejection.
        if (
            PERSISTENT_5XX_REJECT
            and consecutive_5xx >= MIN_5XX_FAILURES
            and result.terminal_status is not None
            and 500 <= result.terminal_status < 600
        ):
            result.would_reject = True
            result.terminal_reason = f"persistent_5xx_{result.terminal_status}"
            return result

        # Soft-never-reject statuses (403/429/etc.) — log reason, don't reject.
        if result.terminal_status in SOFT_NEVER_REJECT_STATUSES:
            result.terminal_reason = f"soft_{result.terminal_status}"
        # Transient exceptions — keep reason tag from the last attempt.

        result.would_reject = False
        return result


async def _run_async(
    targets: list[dict], concurrency: int
) -> list[ProbeResult]:
    sem = asyncio.Semaphore(concurrency)
    limits = httpx.Limits(
        max_connections=concurrency * 2,
        max_keepalive_connections=concurrency,
    )
    async with httpx.AsyncClient(
        headers=HEADERS, limits=limits, follow_redirects=True, http2=False,
    ) as client:
        tasks = [_validate_url(client, t, sem) for t in targets]
        results: list[ProbeResult] = []
        done = 0
        for fut in asyncio.as_completed(tasks):
            r = await fut
            results.append(r)
            done += 1
            if done % 250 == 0:
                print(f"  [{done}/{len(targets)}] candidates_so_far="
                      f"{sum(1 for x in results if x.would_reject)}")
        return results


def _render_report(
    results: list[ProbeResult],
    output_path: Path,
    total_checked: int,
    dry_run: bool,
    elapsed_s: float,
) -> None:
    candidates = [r for r in results if r.would_reject]

    by_reason: dict[str, int] = {}
    for r in candidates:
        by_reason[r.terminal_reason] = by_reason.get(r.terminal_reason, 0) + 1

    alive = sum(1 for r in results if not r.would_reject and r.terminal_status and r.terminal_status < 400)
    soft = sum(1 for r in results if not r.would_reject and r.terminal_status in SOFT_NEVER_REJECT_STATUSES)
    transient = len(results) - alive - soft - len(candidates)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    lines: list[str] = []
    lines.append("# URL Re-Validation Dry-Run Report")
    lines.append("")
    lines.append(f"- Generated: {now}")
    lines.append(f"- Mode: {'DRY-RUN (no DB writes)' if dry_run else 'FIX'}")
    lines.append(f"- Elapsed: {elapsed_s:.1f}s")
    lines.append(f"- URLs checked: {total_checked}")
    lines.append(f"- Alive (<400): {alive}")
    lines.append(f"- Soft-keep (403/429/401 — NOT rejected): {soft}")
    lines.append(f"- Transient (timeouts / DNS / reset — NOT rejected): {transient}")
    lines.append(f"- **Rejection candidates: {len(candidates)}**")
    lines.append("")
    lines.append("## Tightened rejection rules applied")
    lines.append("")
    lines.append("- Reject on: 404, 410, persistent 5xx (>=3 consecutive across retries)")
    lines.append("- Never reject on: 403, 429, 401, timeouts, connection reset, DNS temp failure")
    lines.append(f"- Max attempts per URL: {MAX_ATTEMPTS} (HEAD -> GET, exponential backoff)")
    lines.append("")
    lines.append("## Candidates grouped by reason")
    lines.append("")
    if by_reason:
        lines.append("| Reason | Count |")
        lines.append("|---|---:|")
        for reason, count in sorted(by_reason.items(), key=lambda kv: -kv[1]):
            lines.append(f"| `{reason}` | {count} |")
    else:
        lines.append("_No rejection candidates._")
    lines.append("")
    lines.append("## Candidate URLs (CSV-compatible)")
    lines.append("")
    lines.append("institution_name,state_code,url,http_status,failure_reason,retry_count,status_history")
    for r in sorted(candidates, key=lambda x: (x.terminal_reason, x.institution_name)):
        row = r.to_row()
        # Escape embedded commas by wrapping in quotes.
        fields_out = []
        for key in ("institution_name", "state_code", "url", "http_status",
                    "failure_reason", "retry_count", "status_history"):
            v = str(row[key])
            if "," in v or '"' in v:
                v = '"' + v.replace('"', '""') + '"'
            fields_out.append(v)
        lines.append(",".join(fields_out))
    lines.append("")
    lines.append("## Sample soft-keep URLs (would have been rejected under old logic)")
    lines.append("")
    soft_samples = [r for r in results if r.terminal_status in SOFT_NEVER_REJECT_STATUSES][:20]
    if soft_samples:
        lines.append("| Institution | State | Status | URL |")
        lines.append("|---|---|---:|---|")
        for r in soft_samples:
            lines.append(
                f"| {r.institution_name[:40]} | {r.state_code or ''} "
                f"| {r.terminal_status} | {r.url[:80]} |"
            )
    else:
        lines.append("_None_")
    lines.append("")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines))
    print(f"\nReport written: {output_path}")


def run(
    *,
    fix: bool = False,
    limit: int = 0,
    concurrency: int = 16,
    report_path: Optional[str] = None,
    state: Optional[str] = None,
) -> dict:
    """Entry point used by __main__.py dispatcher.

    `fix=False` (default) is the DRY-RUN path: reads URLs, probes them,
    writes a markdown/CSV report. No DB writes.
    """
    from fee_crawler.db import require_postgres
    require_postgres("revalidate-urls needs crawl_targets.fee_schedule_url in Postgres")

    # Respect concurrency hint from config.yaml (crawl.concurrent_per_domain is
    # per-domain; we size the overall pool larger but bounded).
    try:
        from fee_crawler.config import load_config
        cfg = load_config()
        per_domain = getattr(getattr(cfg, "crawl", None), "concurrent_per_domain", 1) or 1
        # Overall concurrency = max(concurrency, per_domain * 8) but never beyond 32
        effective = max(per_domain, min(concurrency, 32))
    except Exception:
        effective = concurrency

    conn = _connect()
    cur = conn.cursor()

    query = """
        SELECT id, institution_name, state_code, fee_schedule_url
        FROM crawl_targets
        WHERE status = 'active'
          AND fee_schedule_url IS NOT NULL
    """
    params: list = []
    if state:
        query += " AND state_code = %s"
        params.append(state.upper())
    query += " ORDER BY asset_size DESC NULLS LAST"
    if limit:
        query += f" LIMIT {limit}"

    cur.execute(query, tuple(params))
    targets = cur.fetchall()
    conn.close()

    print(f"Re-validating {len(targets)} URLs (concurrency={effective}, "
          f"max_attempts={MAX_ATTEMPTS}, mode={'FIX' if fix else 'DRY-RUN'})")
    print()

    t0 = datetime.now(timezone.utc)
    results = asyncio.run(_run_async(targets, concurrency=effective))
    elapsed = (datetime.now(timezone.utc) - t0).total_seconds()

    # Resolve report path
    if report_path:
        out = Path(report_path)
    else:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
        out = Path("docs/reliability") / f"url-dry-run-{stamp}.md"

    _render_report(results, out, total_checked=len(results),
                   dry_run=not fix, elapsed_s=elapsed)

    candidates = [r for r in results if r.would_reject]
    by_reason: dict[str, int] = {}
    for r in candidates:
        by_reason[r.terminal_reason] = by_reason.get(r.terminal_reason, 0) + 1

    print()
    print("=" * 60)
    print(f"CHECKED:    {len(results)}")
    print(f"CANDIDATES: {len(candidates)}")
    for reason, count in sorted(by_reason.items(), key=lambda kv: -kv[1]):
        print(f"   - {reason}: {count}")

    cleared = 0
    if fix and candidates:
        cleared = _apply_fixes(candidates)
        print(f"\nFIX applied: cleared fee_schedule_url on {cleared} crawl_targets")
        print("(extracted_fees rows untouched by design; Magellan will rediscover.)")
    elif not fix:
        print("\nNO DB WRITES PERFORMED (dry-run). Re-run with --fix to apply.")

    return {
        "checked": len(results),
        "candidates": len(candidates),
        "cleared": cleared,
        "by_reason": by_reason,
        "report": str(out),
        "elapsed_s": elapsed,
    }


def _apply_fixes(candidates: list[ProbeResult]) -> int:
    """Clear crawl_targets.fee_schedule_url for each would-reject candidate.

    Writes are narrow: the URL returned hard 404, so we detach it from the
    target and let Magellan rediscover. extracted_fees rows are deliberately
    untouched (they are FROZEN and their content pre-dates the URL death).
    """
    ids = [r.target_id for r in candidates]
    if not ids:
        return 0
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE crawl_targets SET fee_schedule_url = NULL "
            "WHERE id = ANY(%s::bigint[]) AND fee_schedule_url IS NOT NULL",
            (ids,),
        )
        affected = cur.rowcount
        conn.commit()
        return affected
    finally:
        conn.close()


def _cli() -> None:
    """Standalone CLI: python -m fee_crawler.commands.revalidate_urls ..."""
    load_dotenv(Path(".env.local"))
    load_dotenv(Path(".env"))

    parser = argparse.ArgumentParser(
        prog="revalidate-urls",
        description="Re-validate crawl_targets.fee_schedule_url with tightened rules.",
    )
    parser.add_argument("--fix", action="store_true",
                        help="Apply DB writes. Default is dry-run.")
    parser.add_argument("--limit", type=int, default=0,
                        help="Max URLs to probe (0 = all active).")
    parser.add_argument("--concurrency", type=int, default=16,
                        help="Max concurrent probes (bounded by config).")
    parser.add_argument("--report", type=str, default=None,
                        help="Output report path (default: docs/reliability/url-dry-run-YYYYMMDD.md).")
    parser.add_argument("--state", type=str, default=None,
                        help="Optional state-code filter (e.g. TX).")
    args = parser.parse_args()

    run(
        fix=bool(args.fix),
        limit=args.limit,
        concurrency=args.concurrency,
        report_path=args.report,
        state=args.state,
    )


if __name__ == "__main__":
    _cli()
