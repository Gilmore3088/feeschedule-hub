"""Re-extract institutions with suspiciously low fee counts.

Banks with 1-5 fees almost certainly had incomplete extraction.
This command re-runs extraction on those institutions, clearing
old fees and replacing with a fresh full extraction.

Usage:
    python -m fee_crawler reextract-incomplete              # dry-run
    python -m fee_crawler reextract-incomplete --fix         # re-extract
    python -m fee_crawler reextract-incomplete --min-fees 5  # threshold
    python -m fee_crawler reextract-incomplete --limit 100   # batch size
"""

import os
import logging

import psycopg2
import psycopg2.extras

log = logging.getLogger(__name__)

# Institutions with fewer than this many fees are considered incomplete
DEFAULT_MIN_FEES = 6


def _connect():
    conn = psycopg2.connect(
        os.environ["DATABASE_URL"],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    conn.cursor().execute("SET statement_timeout = '180s'")
    conn.commit()
    return conn


def run(fix: bool = False, min_fees: int = DEFAULT_MIN_FEES, limit: int = 0):
    """Find and re-extract institutions with incomplete fee data."""
    conn = _connect()
    cur = conn.cursor()

    query = f"""
        SELECT ct.id, ct.institution_name, ct.state_code, ct.fee_schedule_url,
               ct.document_type, ct.asset_size, COUNT(ef.id) as fee_count
        FROM crawl_targets ct
        JOIN extracted_fees ef ON ef.crawl_target_id = ct.id AND ef.review_status != 'rejected'
        WHERE ct.fee_schedule_url IS NOT NULL
          AND ct.state_code IS NOT NULL
        GROUP BY ct.id, ct.institution_name, ct.state_code, ct.fee_schedule_url,
                 ct.document_type, ct.asset_size
        HAVING COUNT(ef.id) < {min_fees}
        ORDER BY ct.asset_size DESC NULLS LAST
    """
    if limit:
        query += f" LIMIT {limit}"

    cur.execute(query)
    targets = cur.fetchall()

    print(f"Incomplete extractions (< {min_fees} fees): {len(targets)} institutions")
    print(f"Mode: {'RE-EXTRACT' if fix else 'DRY RUN'}")
    print()

    if not fix:
        print(f"{'ST':<4} {'Institution':<40} {'Assets':>10} {'Fees':>5} {'Type':<12}")
        print("=" * 75)
        for t in targets[:50]:
            a = t["asset_size"]
            if a:
                real = a * 1000
                astr = f"${real/1e9:.1f}B" if real >= 1e9 else f"${real/1e6:.0f}M"
            else:
                astr = "?"
            print(f"{t['state_code']:<4} {t['institution_name'][:39]:<40} {astr:>10} {t['fee_count']:>5} {(t['document_type'] or '?'):<12}")
        if len(targets) > 50:
            print(f"... +{len(targets) - 50} more")
        print(f"\nRun with --fix to re-extract these institutions")
        conn.close()
        return {"found": len(targets), "extracted": 0}

    # Import extraction tools
    from fee_crawler.agents.classify import classify_document
    from fee_crawler.agents.extract_pdf import extract_pdf
    from fee_crawler.agents.extract_html import extract_html
    from fee_crawler.agents.extract_js import extract_js
    from fee_crawler.agents.state_agent import _write_fees

    success = 0
    improved = 0
    failed = 0

    for i, inst in enumerate(targets):
        url = inst["fee_schedule_url"]
        old_count = inst["fee_count"]

        try:
            # Re-classify (URL content may have changed)
            doc_type = classify_document(url)

            # Extract
            if doc_type == "pdf":
                fees = extract_pdf(url, inst)
            elif doc_type == "js_rendered":
                fees = extract_js(url, inst)
            else:
                fees = extract_html(url, inst)

            if fees and len(fees) > old_count:
                # Clear old fees and write new ones
                cur.execute(
                    "DELETE FROM extracted_fees WHERE crawl_target_id = %s",
                    (inst["id"],),
                )
                conn.commit()
                _write_fees(conn, inst["id"], fees)
                improved += 1
                success += 1

                a = inst["asset_size"]
                if a:
                    real = a * 1000
                    astr = f"${real/1e9:.1f}B" if real >= 1e9 else f"${real/1e6:.0f}M"
                else:
                    astr = "?"

                print(
                    f"[{i+1}] IMPROVED: {inst['state_code']} {inst['institution_name'][:35]} "
                    f"({astr}) {old_count} -> {len(fees)} fees ({doc_type})"
                )
            elif fees and len(fees) <= old_count:
                # New extraction not better — keep old
                success += 1
            else:
                failed += 1

        except Exception as e:
            failed += 1
            if (i + 1) % 50 == 0:
                log.warning(f"[{i+1}] Error: {e}")

        if (i + 1) % 25 == 0:
            print(
                f"[{i+1}/{len(targets)}] improved={improved} same={success-improved} failed={failed}"
            )

    print()
    print(f"=" * 60)
    print(f"RESULTS:")
    print(f"  Processed: {len(targets)}")
    print(f"  Improved:  {improved} (got more fees than before)")
    print(f"  Same/worse: {success - improved} (kept old data)")
    print(f"  Failed:    {failed}")
    print(f"=" * 60)

    conn.close()
    return {"found": len(targets), "improved": improved, "failed": failed}
