"""Probe common URL patterns to discover fee schedule pages.

Many banks put fee schedules at predictable paths. Instead of navigating
the website, directly HEAD-check common patterns and classify/extract
any that return 200.

Usage:
    python -m fee_crawler probe-urls              # dry-run (report finds)
    python -m fee_crawler probe-urls --fix        # update DB with found URLs
    python -m fee_crawler probe-urls --limit 500  # limit institutions
    python -m fee_crawler probe-urls --extract    # also extract fees from found URLs
    python -m fee_crawler probe-urls --revalidate # Reliability Roadmap #11 —
                                                    HEAD-check every existing
                                                    fee_schedule_url for stale
                                                    4xx/5xx responses.
"""

import os
import logging
from urllib.parse import urlparse

import httpx
import psycopg2
import psycopg2.extras

log = logging.getLogger(__name__)

# Common fee schedule URL patterns (appended to institution website base URL)
COMMON_PATHS = [
    "/fee-schedule",
    "/fees",
    "/fee-schedule.pdf",
    "/fees.pdf",
    "/disclosures/fee-schedule",
    "/disclosures/fees",
    "/disclosures",
    "/personal/fee-schedule",
    "/personal/fees",
    "/resources/fee-schedule",
    "/resources/fees",
    "/documents/fee-schedule.pdf",
    "/documents/fees.pdf",
    "/wp-content/uploads/fee-schedule.pdf",
    "/rates-fees",
    "/rates-and-fees",
    "/service-charges",
    "/schedule-of-fees",
    "/truth-in-savings",
    "/personal-banking/fees",
    "/checking/fees",
    "/account-fees",
    "/fee-information",
    "/getmedia/fee-schedule.pdf",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
}


def _connect():
    conn = psycopg2.connect(
        os.environ["DATABASE_URL"],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    conn.cursor().execute("SET statement_timeout = '120s'")
    conn.commit()
    return conn


def _normalize_base(website_url: str) -> str:
    """Extract base URL from website."""
    parsed = urlparse(website_url)
    scheme = parsed.scheme or "https"
    netloc = parsed.netloc or parsed.path.split("/")[0]
    return f"{scheme}://{netloc}"


def probe_institution(website_url: str, client: httpx.Client) -> str | None:
    """Try common URL patterns against an institution's website. Returns first hit URL or None."""
    base = _normalize_base(website_url)

    for path in COMMON_PATHS:
        url = base + path
        try:
            resp = client.head(url, follow_redirects=True, timeout=10)
            if resp.status_code == 200:
                content_type = resp.headers.get("content-type", "")
                # Accept HTML pages and PDFs
                if "text/html" in content_type or "application/pdf" in content_type:
                    # Verify it's not a generic redirect to homepage
                    final_url = str(resp.url)
                    final_path = urlparse(final_url).path
                    if final_path and final_path != "/" and len(final_path) > 2:
                        return final_url
        except Exception:
            continue

    return None


def run(fix: bool = False, limit: int = 0, extract: bool = False):
    """Probe URL patterns for institutions without fee_schedule_url."""
    conn = _connect()
    cur = conn.cursor()

    query = """
        SELECT ct.id, ct.institution_name, ct.state_code, ct.website_url, ct.asset_size
        FROM crawl_targets ct
        WHERE ct.status = 'active'
          AND ct.website_url IS NOT NULL
          AND ct.fee_schedule_url IS NULL
          AND (ct.document_type IS NULL OR ct.document_type != 'offline')
        ORDER BY ct.asset_size DESC NULLS LAST
    """
    if limit:
        query += f" LIMIT {limit}"

    cur.execute(query)
    targets = cur.fetchall()

    print(f"Probing {len(targets)} institutions for fee schedule URLs...")
    print(f"Testing {len(COMMON_PATHS)} URL patterns per institution")
    print(f"Mode: {'FIX' if fix else 'DRY RUN'}")
    print()

    found = 0
    checked = 0

    with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=10) as client:
        for i, inst in enumerate(targets):
            checked += 1
            url = probe_institution(inst["website_url"], client)

            if url:
                found += 1
                a = inst["asset_size"]
                if a:
                    real = a * 1000
                    astr = f"${real/1e9:.1f}B" if real >= 1e9 else f"${real/1e6:.0f}M"
                else:
                    astr = "?"
                is_pdf = url.lower().endswith(".pdf")
                doc_type = "pdf" if is_pdf else None

                print(f"  FOUND: {inst['state_code']} {inst['institution_name'][:35]:<35} ({astr}) -> {url[:60]}")

                if fix:
                    cur.execute("""
                        UPDATE crawl_targets
                        SET fee_schedule_url = %s, document_type = %s
                        WHERE id = %s
                    """, (url, doc_type, inst["id"]))
                    conn.commit()

            if (i + 1) % 100 == 0:
                print(f"  [{i+1}/{len(targets)}] checked={checked} found={found} ({round(100*found/checked) if checked else 0}%)")

    print()
    print(f"=" * 60)
    print(f"RESULTS: {found} URLs found out of {checked} checked ({round(100*found/checked) if checked else 0}%)")
    if not fix:
        print("Run with --fix to update database")
    else:
        print(f"Updated {found} institutions with new fee_schedule_url")

    if extract and fix and found:
        print(f"\nExtracting fees from {found} newly discovered URLs...")
        from fee_crawler.agents.extract_pdf import extract_pdf
        from fee_crawler.agents.extract_js import extract_js
        from fee_crawler.agents.classify import classify_document
        from fee_crawler.agents.state_agent import _write_fees

        extracted = 0
        for i, inst in enumerate(targets):
            cur.execute("SELECT fee_schedule_url, document_type FROM crawl_targets WHERE id = %s", (inst["id"],))
            row = cur.fetchone()
            if not row or not row["fee_schedule_url"]:
                continue

            try:
                url = row["fee_schedule_url"]
                doc_type = row["document_type"] or classify_document(url)

                if doc_type == "pdf":
                    fees = extract_pdf(url, inst)
                elif doc_type == "js_rendered":
                    fees = extract_js(url, inst)
                else:
                    fees = extract_pdf(url, inst)  # try PDF as default

                if fees:
                    _write_fees(conn, inst["id"], fees)
                    extracted += 1
                    print(f"  Extracted: {inst['institution_name'][:35]} — {len(fees)} fees")
            except Exception as e:
                log.warning(f"Extract failed for {inst['institution_name']}: {e}")

        print(f"Extracted fees from {extracted} institutions")

    conn.close()
    return {"found": found, "checked": checked}


# ---------------------------------------------------------------------------
# Reliability Roadmap #11 — URL re-validation
#
# HEAD-checks every existing fee_schedule_url, marks stale ones, and surfaces
# them for the crawler's backoff logic (#14) to skip. Run quarterly; an
# institution that's moved its fee page to a new URL will appear as a 404
# here before we waste a day of crawl budget extracting garbage from a
# redirect.
# ---------------------------------------------------------------------------


def check_url(url: str, client: httpx.Client) -> tuple[int, bool]:
    """HEAD-check a URL. Returns (status_code, is_ok).

    is_ok means: 2xx response with html/pdf content-type. Anything else —
    3xx chain to homepage, 4xx, 5xx, timeout — is considered stale.
    """
    try:
        resp = client.head(url, follow_redirects=True, timeout=15)
    except Exception:
        return (0, False)

    code = resp.status_code
    if code != 200:
        return (code, False)

    content_type = resp.headers.get("content-type", "")
    if "text/html" not in content_type and "application/pdf" not in content_type:
        return (code, False)

    # Defence against 200-OK-but-redirected-to-homepage
    final_path = urlparse(str(resp.url)).path
    if not final_path or final_path == "/" or len(final_path) <= 2:
        return (code, False)

    return (code, True)


def run_revalidate(fix: bool = False, limit: int = 0) -> dict:
    """Re-validate every known fee_schedule_url; flag stale ones.

    Args:
        fix: When True, persist findings by incrementing consecutive_failures
             and setting failure_reason='url_stale' on stale URLs. When False
             (default), only prints the report — safe to run any time.
        limit: Cap number of institutions checked (0 = all).

    Returns:
        {"checked": n, "stale": n, "ok": n}
    """
    conn = _connect()
    cur = conn.cursor()

    query = """
        SELECT ct.id, ct.institution_name, ct.state_code, ct.fee_schedule_url,
               ct.consecutive_failures, ct.failure_reason
          FROM crawl_targets ct
         WHERE ct.status = 'active'
           AND ct.fee_schedule_url IS NOT NULL
         ORDER BY ct.asset_size DESC NULLS LAST
    """
    if limit:
        query += f" LIMIT {limit}"

    cur.execute(query)
    targets = cur.fetchall()

    print(f"Re-validating {len(targets)} existing fee_schedule_urls...")
    print(f"Mode: {'FIX (will mark stale rows)' if fix else 'DRY RUN'}")
    print()

    stale = 0
    ok = 0
    checked = 0

    with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=15) as client:
        for i, inst in enumerate(targets):
            checked += 1
            url = inst["fee_schedule_url"]
            status, is_ok = check_url(url, client)

            if is_ok:
                ok += 1
                continue

            stale += 1
            print(
                f"  STALE [{status or 'timeout'}]: "
                f"{inst['state_code']} {inst['institution_name'][:35]:<35} -> {url[:60]}"
            )

            if fix:
                # Bump consecutive_failures; backoff logic (#14) will then skip
                # the institution for 3+ days. Don't null the URL — a human
                # should confirm the 404 before we drop the record.
                cur.execute(
                    """
                    UPDATE crawl_targets
                       SET consecutive_failures = consecutive_failures + 1,
                           failure_reason = 'url_stale',
                           failure_reason_note = %s,
                           failure_reason_updated_at = NOW()
                     WHERE id = %s
                    """,
                    (f"revalidate: HTTP {status}", inst["id"]),
                )
                conn.commit()

            if (i + 1) % 100 == 0:
                print(f"  [{i+1}/{len(targets)}] checked={checked} stale={stale} ok={ok}")

    print()
    print("=" * 60)
    pct = round(100 * stale / checked) if checked else 0
    print(f"RESULTS: {stale} stale URLs out of {checked} checked ({pct}%)")
    if not fix:
        print("Run with --revalidate --fix to mark stale rows in the DB.")
    else:
        print(f"Marked {stale} institutions with failure_reason='url_stale'.")

    conn.close()
    return {"checked": checked, "stale": stale, "ok": ok}
