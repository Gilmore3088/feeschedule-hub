"""Fee change alert email sender.

Queries fee_alert_subscriptions joined with fee_change_events to find
changes since each subscription's last alert, groups by user, and sends
a single digest email per user via the Resend API.

Usage:
    DATABASE_URL=... RESEND_API_KEY=... python -m fee_crawler.workers.alert_sender
"""

import json
import logging
import os
import urllib.request
import urllib.error
from collections import defaultdict
from datetime import datetime
from typing import Any

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
FROM_ADDRESS = "alerts@bankfeeindex.com"
BASE_URL = os.environ.get("BFI_BASE_URL", "https://bankfeeindex.com")

CHANGE_TYPE_LABELS = {
    "increase": "Increased",
    "decrease": "Decreased",
    "new": "New Fee",
    "removed": "Removed",
}

CHANGE_TYPE_COLORS = {
    "increase": "#dc2626",
    "decrease": "#059669",
    "new": "#2563eb",
    "removed": "#6b7280",
}


def _get_connection():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL environment variable is required")
    return psycopg2.connect(db_url)


def _fetch_pending_alerts(cur) -> list[dict[str, Any]]:
    """Fetch subscriptions with un-alerted fee change events.

    Returns rows with user info, subscription info, and change event details.
    Only includes active subscriptions where changes happened after the
    last alert (or all changes if never alerted).
    """
    cur.execute("""
        SELECT
            u.id AS user_id,
            u.email,
            u.display_name,
            a.id AS subscription_id,
            a.crawl_target_id,
            a.fee_categories,
            a.last_alerted_at,
            ct.institution_name,
            fce.id AS event_id,
            fce.fee_category,
            fce.previous_amount,
            fce.new_amount,
            fce.change_type,
            fce.detected_at
        FROM fee_alert_subscriptions a
        JOIN users u ON u.id = a.user_id
        JOIN crawl_targets ct ON ct.id = a.crawl_target_id
        JOIN fee_change_events fce
            ON fce.crawl_target_id = a.crawl_target_id
            AND fce.detected_at > COALESCE(a.last_alerted_at, '1970-01-01'::timestamptz)
        WHERE a.is_active = TRUE
          AND u.email IS NOT NULL
        ORDER BY u.id, ct.institution_name, fce.detected_at DESC
    """)
    return cur.fetchall()


def _filter_by_categories(
    row: dict[str, Any],
) -> bool:
    """Check if the event's fee_category matches the subscription filter.

    If fee_categories is NULL or empty, all categories match.
    """
    subscribed = row["fee_categories"]
    if not subscribed:
        return True
    return row["fee_category"] in subscribed


def _format_amount(amount: float | None) -> str:
    if amount is None:
        return "N/A"
    return f"${amount:,.2f}"


def _format_category(slug: str) -> str:
    """Convert fee_category slug to human-readable label."""
    return slug.replace("_", " ").title()


def _build_change_row(event: dict[str, Any]) -> str:
    change_label = CHANGE_TYPE_LABELS.get(event["change_type"], event["change_type"])
    color = CHANGE_TYPE_COLORS.get(event["change_type"], "#374151")
    detected = event["detected_at"]
    date_str = detected.strftime("%b %d, %Y") if isinstance(detected, datetime) else str(detected)[:10]

    return f"""
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 10px 12px; font-size: 14px; color: #111827;">
        {_format_category(event["fee_category"])}
      </td>
      <td style="padding: 10px 12px; font-size: 14px; color: #6b7280; text-align: right;">
        {_format_amount(event["previous_amount"])}
      </td>
      <td style="padding: 10px 12px; font-size: 14px; text-align: center; color: #9ca3af;">
        &rarr;
      </td>
      <td style="padding: 10px 12px; font-size: 14px; font-weight: 600; text-align: right;">
        {_format_amount(event["new_amount"])}
      </td>
      <td style="padding: 10px 12px; text-align: center;">
        <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px;
                      font-size: 12px; font-weight: 500; color: {color};
                      background-color: {color}15;">
          {change_label}
        </span>
      </td>
      <td style="padding: 10px 12px; font-size: 12px; color: #9ca3af; text-align: right;">
        {date_str}
      </td>
    </tr>"""


def _build_institution_section(
    institution_name: str,
    crawl_target_id: int,
    events: list[dict[str, Any]],
) -> str:
    rows = "".join(_build_change_row(e) for e in events)
    inst_url = f"{BASE_URL}/institution/{crawl_target_id}"

    return f"""
    <div style="margin-bottom: 24px;">
      <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #111827;">
        <a href="{inst_url}" style="color: #111827; text-decoration: none;">
          {institution_name}
        </a>
      </h3>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 6px;">
        <thead>
          <tr style="background-color: #f9fafb;">
            <th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: 600;
                        text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">
              Fee
            </th>
            <th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: 600;
                        text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">
              Previous
            </th>
            <th style="padding: 8px 12px; width: 30px;"></th>
            <th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: 600;
                        text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">
              New
            </th>
            <th style="padding: 8px 12px; text-align: center; font-size: 11px; font-weight: 600;
                        text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">
              Type
            </th>
            <th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: 600;
                        text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">
              Detected
            </th>
          </tr>
        </thead>
        <tbody>
          {rows}
        </tbody>
      </table>
    </div>"""


def _build_email_html(
    display_name: str,
    user_id: int,
    grouped: dict[tuple[str, int], list[dict[str, Any]]],
    total_changes: int,
) -> str:
    """Build the full HTML email body."""
    unsubscribe_url = f"{BASE_URL}/account?tab=alerts"

    sections = ""
    for (inst_name, target_id), events in grouped.items():
        sections += _build_institution_section(inst_name, target_id, events)

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
             background-color: #f3f4f6;">
  <div style="max-width: 640px; margin: 0 auto; padding: 32px 16px;">
    <div style="background-color: #ffffff; border-radius: 8px; padding: 32px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #111827;">
          Bank Fee Index
        </h1>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #6b7280;">
          Fee Change Alert
        </p>
      </div>

      <p style="font-size: 15px; color: #374151; margin: 0 0 20px 0;">
        Hi {display_name or "there"},
      </p>
      <p style="font-size: 15px; color: #374151; margin: 0 0 24px 0;">
        We detected <strong>{total_changes} fee change{"s" if total_changes != 1 else ""}</strong>
        at institutions you're tracking:
      </p>

      {sections}

      <div style="text-align: center; margin-top: 24px;">
        <a href="{BASE_URL}/account?tab=alerts"
           style="display: inline-block; padding: 10px 24px; background-color: #111827;
                  color: #ffffff; text-decoration: none; border-radius: 6px;
                  font-size: 14px; font-weight: 500;">
          View All Alerts
        </a>
      </div>
    </div>

    <div style="text-align: center; margin-top: 16px; font-size: 12px; color: #9ca3af;">
      <p style="margin: 0;">
        You're receiving this because you subscribed to fee change alerts.
      </p>
      <p style="margin: 4px 0 0 0;">
        <a href="{unsubscribe_url}" style="color: #6b7280;">Manage subscriptions</a>
        &middot;
        <a href="{BASE_URL}/api/alerts/unsubscribe?user={user_id}" style="color: #6b7280;">
          Unsubscribe from all alerts
        </a>
      </p>
    </div>
  </div>
</body>
</html>"""


def _send_email(to: str, subject: str, html: str, api_key: str) -> bool:
    """Send email via Resend API. Returns True on success."""
    payload = json.dumps({
        "from": FROM_ADDRESS,
        "to": [to],
        "subject": subject,
        "html": html,
    }).encode("utf-8")

    req = urllib.request.Request(
        RESEND_API_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status in (200, 201):
                logger.info("Email sent to %s (status=%d)", to, resp.status)
                return True
            logger.warning("Resend API returned status %d for %s", resp.status, to)
            return False
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:500]
        logger.error("Resend API error %d for %s: %s", e.code, to, body)
        return False
    except urllib.error.URLError as e:
        logger.error("Network error sending to %s: %s", to, e.reason)
        return False


def _update_last_alerted(cur, subscription_ids: list[int]) -> None:
    """Mark subscriptions as alerted so events aren't re-sent."""
    if not subscription_ids:
        return
    cur.execute(
        """
        UPDATE fee_alert_subscriptions
        SET last_alerted_at = NOW()
        WHERE id = ANY(%s)
        """,
        (subscription_ids,),
    )


def send_alerts(dry_run: bool = False) -> dict[str, Any]:
    """Main entry point: find pending changes and send digest emails.

    Args:
        dry_run: If True, build emails but don't send or update timestamps.

    Returns:
        Summary dict with counts of users notified, emails sent, etc.
    """
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key and not dry_run:
        logger.warning(
            "RESEND_API_KEY not set. Skipping alert emails. "
            "Set the environment variable to enable sending."
        )
        return {"skipped": True, "reason": "RESEND_API_KEY not set"}

    conn = _get_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        rows = _fetch_pending_alerts(cur)

        if not rows:
            logger.info("No pending fee change alerts to send.")
            return {"users_notified": 0, "total_changes": 0}

        # Group: user_id -> { (institution_name, target_id) -> [events] }
        # Also track subscription IDs per user for updating last_alerted_at
        user_events: dict[int, dict[tuple[str, int], list[dict]]] = defaultdict(
            lambda: defaultdict(list)
        )
        user_info: dict[int, dict[str, Any]] = {}
        user_sub_ids: dict[int, set[int]] = defaultdict(set)

        for row in rows:
            if not _filter_by_categories(row):
                continue

            uid = row["user_id"]
            key = (row["institution_name"], row["crawl_target_id"])
            user_events[uid][key].append(row)
            user_sub_ids[uid].add(row["subscription_id"])

            if uid not in user_info:
                user_info[uid] = {
                    "email": row["email"],
                    "display_name": row["display_name"],
                }

        emails_sent = 0
        emails_failed = 0

        for uid, grouped in user_events.items():
            info = user_info[uid]
            total = sum(len(evts) for evts in grouped.values())

            subject = f"Fee Change Alert: {total} change{'s' if total != 1 else ''} detected"
            html = _build_email_html(info["display_name"], uid, grouped, total)

            if dry_run:
                logger.info(
                    "[DRY RUN] Would send to %s: %d changes across %d institutions",
                    info["email"], total, len(grouped),
                )
                emails_sent += 1
                continue

            success = _send_email(info["email"], subject, html, api_key)
            if success:
                emails_sent += 1
                _update_last_alerted(cur, list(user_sub_ids[uid]))
                conn.commit()
            else:
                emails_failed += 1
                conn.rollback()

        summary = {
            "users_notified": emails_sent,
            "emails_failed": emails_failed,
            "total_changes": sum(
                sum(len(evts) for evts in grouped.values())
                for grouped in user_events.values()
            ),
            "dry_run": dry_run,
        }
        logger.info("Alert sender complete: %s", summary)
        return summary

    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    import argparse

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="Send fee change alert emails")
    parser.add_argument("--dry-run", action="store_true", help="Preview without sending")
    args = parser.parse_args()

    result = send_alerts(dry_run=args.dry_run)
    print(json.dumps(result, indent=2, default=str))
