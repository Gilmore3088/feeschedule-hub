"""Re-crawl institutions by clearing content hashes to force re-download.

Unlike rediscover_failed (which clears URLs entirely), this command keeps
the fee_schedule_url intact and only resets last_content_hash so the crawl
pipeline treats them as new downloads. This forces fresh R2 storage and
re-extraction without losing discovered URLs.

Targets:
1. Institutions with a fee_schedule_url but no R2 document key
2. Optionally, all institutions (--all flag)
3. Filter by content type (--type pdf|html) or state
"""

from __future__ import annotations

import time

from fee_crawler.config import Config
from fee_crawler.db import Database


def run(
    db: Database,
    config: Config,
    *,
    state: str | None = None,
    doc_type: str | None = None,
    limit: int | None = None,
    batch_size: int = 100,
    dry_run: bool = False,
    all_targets: bool = False,
) -> None:
    """Clear content hashes to force re-download and R2 storage.

    Args:
        db: Database connection.
        config: Application config.
        state: Filter by state code.
        doc_type: Filter by document type ('pdf' or 'html').
        limit: Max institutions to reset.
        batch_size: Commit every N updates.
        dry_run: Show what would be reset without modifying.
        all_targets: Reset all institutions, not just those missing R2 keys.
    """
    t0 = time.time()

    conditions = [
        "ct.fee_schedule_url IS NOT NULL",
        "ct.status = 'active'",
    ]
    params: list = []

    if not all_targets:
        conditions.append(
            "(ct.document_r2_key IS NULL OR ct.document_r2_key = '')"
        )

    if state:
        conditions.append("ct.state_code = ?")
        params.append(state.upper())

    if doc_type:
        if doc_type.lower() == "pdf":
            conditions.append(
                "(ct.document_type = 'pdf' OR ct.fee_schedule_url LIKE '%.pdf%')"
            )
        elif doc_type.lower() == "html":
            conditions.append(
                "(ct.document_type = 'html' OR ct.document_type IS NULL)"
            )

    where_sql = " AND ".join(conditions)
    limit_sql = f" LIMIT {limit}" if limit else ""

    query = f"""
        SELECT ct.id, ct.institution_name, ct.state_code, ct.document_type,
               ct.document_r2_key, ct.last_content_hash, ct.consecutive_failures
        FROM crawl_targets ct
        WHERE {where_sql}
        ORDER BY ct.asset_size DESC NULLS LAST
        {limit_sql}
    """
    targets = db.fetchall(query, tuple(params))

    if not targets:
        print("No institutions found matching criteria.")
        return

    has_r2 = sum(1 for t in targets if t["document_r2_key"])
    no_r2 = len(targets) - has_r2
    pdf_count = sum(1 for t in targets if (t["document_type"] or "") == "pdf")
    html_count = len(targets) - pdf_count

    print(f"Found {len(targets)} institutions to re-crawl:")
    print(f"  Missing R2 doc: {no_r2}")
    print(f"  Has R2 doc:     {has_r2}")
    print(f"  PDF: {pdf_count}  |  HTML: {html_count}")
    if state:
        print(f"  State filter: {state.upper()}")
    if doc_type:
        print(f"  Type filter: {doc_type}")
    print()

    for t in targets[:10]:
        r2_status = "R2" if t["document_r2_key"] else "no-R2"
        dtype = t["document_type"] or "unknown"
        print(f"  {t['institution_name'][:45]:<45s} ({t['state_code']}) {dtype:4s} [{r2_status}]")
    if len(targets) > 10:
        print(f"  ... and {len(targets) - 10} more")

    if dry_run:
        print(f"\n[DRY RUN] Would reset {len(targets)} content hashes.")
        return

    reset_count = 0
    for i, t in enumerate(targets, 1):
        db.execute(
            """UPDATE crawl_targets
               SET last_content_hash = NULL,
                   consecutive_failures = 0
               WHERE id = ?""",
            (t["id"],),
        )
        reset_count += 1

        if i % batch_size == 0:
            db.commit()
            print(f"  Committed batch {i // batch_size} ({i}/{len(targets)})")

    db.commit()

    elapsed = time.time() - t0
    print(f"\nReset {reset_count} content hashes in {elapsed:.1f}s")
    print(f"These institutions are ready for: crawl --include-failing --limit {reset_count}")

    result = {
        "version": 1,
        "command": "recrawl",
        "status": "completed",
        "duration_s": round(elapsed, 1),
        "processed": len(targets),
        "reset": reset_count,
        "missing_r2": no_r2,
        "pdf_count": pdf_count,
        "html_count": html_count,
    }
    from fee_crawler.job_result import emit_result
    emit_result(result)
