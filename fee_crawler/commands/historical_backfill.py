"""Historical fee-snapshot backfill (S-03 + C-01).

Ingests archived fee-schedule snapshots from external sources so the
product can answer "how have fees moved over the last 5 years?"
(survey signal P-02: "I'll cancel two S&P seats if you ship this").

Architecture: a small pluggable framework with one ingester per
source. The CLI orchestrates: pick source → enumerate snapshots in
the requested window → for each, write a row into `fee_snapshots`.

Sources planned (one at a time):
  - FDIC SDP (Statistical Data Pull) archives — quarterly fee survey
    rows
  - Wayback Machine — for institutions whose fee-schedule URL we
    already know, grab past captures and re-run the extractor on
    each one. Most labor-intensive but most accurate.
  - NCUA call reports — quarterly fee revenue summary, joinable to
    fee-rate inferences.

This module ships the SKELETON + a working --dry-run path that lists
what would be ingested. The actual fetcher implementations need
operator network access (firewall allowlists for archive.org, FDIC
download servers) and are deliberately stubbed with NotImplementedError
so a misconfigured run fails loudly instead of silently producing
incomplete data.
"""

from __future__ import annotations

import argparse
import logging
import sys
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from typing import Iterable, Optional, Protocol

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Ingester contract
# ---------------------------------------------------------------------------

@dataclass
class SnapshotRow:
    """One historical fee observation. Maps 1:1 onto fee_snapshots."""
    crawl_target_id: Optional[int]   # may be None for cert-keyed FDIC rows
    cert_number: Optional[str]
    snapshot_date: date
    fee_category: str
    fee_name: str
    amount: Optional[float]
    frequency: Optional[str] = None
    conditions: Optional[str] = None
    extraction_confidence: Optional[float] = None
    source: str = ""                  # set by the ingester ('fdic_sdp', 'wayback', etc.)


class Ingester(Protocol):
    """Protocol every source ingester must implement."""

    source: str

    def list_available(
        self, since: date, until: date,
    ) -> Iterable[tuple[date, str]]:
        """Yield (snapshot_date, source_url|identifier) tuples for the window.

        Lets --dry-run report what WOULD be ingested without downloading.
        """
        ...

    def fetch(
        self, snapshot_date: date, source_id: str,
    ) -> Iterable[SnapshotRow]:
        """Fetch one archived snapshot and yield SnapshotRow per fee.

        May raise on network failure; caller handles + records as 'failed'.
        """
        ...


# ---------------------------------------------------------------------------
# FDIC SDP stub
# ---------------------------------------------------------------------------

@dataclass
class FdicSdpIngester:
    source: str = "fdic_sdp"
    base_url: str = "https://www7.fdic.gov/sdp/"   # placeholder; verify with FDIC

    def list_available(
        self, since: date, until: date,
    ) -> Iterable[tuple[date, str]]:
        """FDIC publishes quarterly. Yield one tuple per quarter-end in
        the window. We don't hit the network here — quarter ends are
        deterministic — so this stub is safe to call without auth."""
        q_ends = [date(y, m, d) for y, m, d in (
            (y, m, d)
            for y in range(since.year, until.year + 1)
            for m, d in [(3, 31), (6, 30), (9, 30), (12, 31)]
        )]
        for q in q_ends:
            if since <= q <= until:
                yield (q, f"{self.base_url}fee_survey_{q.year}q{(q.month - 1) // 3 + 1}.csv")

    def fetch(self, snapshot_date, source_id):
        raise NotImplementedError(
            "FDIC SDP ingester is a stub. Operator action required: "
            "(1) verify the public CSV download URL for the FDIC fee survey "
            "for the requested quarter, (2) implement HTTP fetch with retry, "
            "(3) map CSV rows to SnapshotRow."
        )


@dataclass
class WaybackIngester:
    source: str = "wayback_machine"
    api_base: str = "https://archive.org/wayback/available"

    def list_available(self, since, until):
        # Wayback availability is per-URL, not per-quarter. Without a
        # target institution list this stub yields nothing; the real
        # implementation joins crawl_targets.fee_schedule_url + asks
        # the Wayback CDX API for captures in the window.
        return []

    def fetch(self, snapshot_date, source_id):
        raise NotImplementedError(
            "Wayback ingester is a stub. Operator action required: "
            "(1) implement CDX API enumeration per institution URL, "
            "(2) fetch the archived HTML/PDF, "
            "(3) run extract_llm against it to derive SnapshotRow."
        )


INGESTERS: dict[str, Ingester] = {
    "fdic_sdp":         FdicSdpIngester(),
    "wayback_machine":  WaybackIngester(),
}


# ---------------------------------------------------------------------------
# CLI orchestration
# ---------------------------------------------------------------------------

@dataclass
class BackfillResult:
    source: str
    window_since: date
    window_until: date
    enumerated: int = 0
    fetched: int = 0
    rows_inserted: int = 0
    failed: int = 0
    dry_run: bool = True

    def to_dict(self) -> dict:
        d = asdict(self)
        d["window_since"] = self.window_since.isoformat()
        d["window_until"] = self.window_until.isoformat()
        return d


def run_backfill(
    source: str,
    *,
    since: date,
    until: date,
    apply: bool = False,
) -> BackfillResult:
    """Orchestrator. --dry-run is the default; --apply must be explicit."""
    ingester = INGESTERS.get(source)
    if ingester is None:
        raise ValueError(
            f"unknown source {source!r}; supported: {sorted(INGESTERS)}"
        )

    result = BackfillResult(
        source=source, window_since=since, window_until=until,
        dry_run=not apply,
    )

    candidates = list(ingester.list_available(since, until))
    result.enumerated = len(candidates)

    if not apply:
        print(
            f"DRY RUN — {source}: {len(candidates)} snapshot(s) "
            f"in window {since}..{until}"
        )
        for snap_date, src_id in candidates[:20]:
            print(f"  {snap_date}  {src_id}")
        if len(candidates) > 20:
            print(f"  ...({len(candidates) - 20} more)")
        print("Re-run with --apply to actually fetch + insert.")
        return result

    # Apply path — would loop, fetch, insert. Wired to NotImplementedError
    # in the stub ingesters so an early operator run fails loudly rather
    # than silently producing empty rows.
    for snap_date, src_id in candidates:
        try:
            for row in ingester.fetch(snap_date, src_id):
                # TODO: write row → fee_snapshots via SQL or a future
                # gateway-wrapped tool. Wrap in a single transaction per
                # snapshot_date so a partial failure is recoverable.
                result.rows_inserted += 1
            result.fetched += 1
        except NotImplementedError:
            # Expected during operator setup — re-raise so they see
            # exactly which source needs implementation.
            raise
        except Exception as exc:
            log.warning(
                "historical_backfill %s %s failed: %s", source, snap_date, exc,
            )
            result.failed += 1

    return result


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(
        prog="historical-backfill",
        description="Ingest archived fee snapshots into fee_snapshots.",
    )
    p.add_argument("--source", required=True, choices=sorted(INGESTERS))
    p.add_argument(
        "--years", type=int, default=5,
        help="Window length in years back from today (default: 5)",
    )
    p.add_argument(
        "--since", type=lambda s: datetime.fromisoformat(s).date(),
        help="Explicit window start (overrides --years)",
    )
    p.add_argument(
        "--until", type=lambda s: datetime.fromisoformat(s).date(),
        default=date.today(),
        help="Window end (default: today)",
    )
    p.add_argument(
        "--apply", action="store_true",
        help="Actually fetch + insert. Default is dry-run.",
    )
    args = p.parse_args(argv)

    until = args.until
    since = args.since or (until - timedelta(days=365 * args.years))

    result = run_backfill(args.source, since=since, until=until, apply=args.apply)
    print(f"\nResult: {result.to_dict()}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
