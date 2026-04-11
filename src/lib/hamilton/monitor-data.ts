/**
 * Monitor Screen — Data Fetcher
 * Fetches all data for the /pro/monitor page.
 * Per D-11 pattern: NOT ISR cached — fresh on every page load.
 * All DB calls wrapped in try/catch, degrade gracefully to empty state.
 */

import { sql } from "@/lib/crawler-db/connection";
import type { SignalEntry, AlertEntry } from "@/lib/hamilton/home-data";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WatchlistEntry {
  institutionId: string;
  /** Display label derived from institutionId for v8.0 */
  displayName: string;
  /** Status derivation is deferred — always "unknown" for v8.0 */
  status: "current" | "review_due" | "unknown";
}

export interface MonitorPageData {
  status: {
    overall: "stable" | "watch" | "worsening";
    newSignals: number;
    highPriorityAlerts: number;
  };
  topAlert: AlertEntry | null;
  signalFeed: SignalEntry[];
  watchlist: WatchlistEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveDisplayName(institutionId: string): string {
  return institutionId
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function deriveOverallStatus(
  newSignals: number,
  highAlerts: number,
  recentHigh: number
): "stable" | "watch" | "worsening" {
  if (recentHigh > 0) return "worsening";
  if (highAlerts > 0 || newSignals > 2) return "watch";
  return "stable";
}

// ---------------------------------------------------------------------------
// DB queries
// ---------------------------------------------------------------------------

async function fetchSignalFeed(limit: number): Promise<SignalEntry[]> {
  try {
    const rows = await sql`
      SELECT id, institution_id, signal_type, severity, title, body, created_at
      FROM hamilton_signals
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: String(r.id),
      signalType: String(r.signal_type),
      severity: String(r.severity),
      title: String(r.title),
      body: String(r.body),
      createdAt: String(r.created_at),
    }));
  } catch {
    return [];
  }
}

async function fetchTopAlert(userId: number): Promise<AlertEntry | null> {
  try {
    const rows = await sql`
      SELECT
        pa.id,
        pa.signal_id,
        pa.status,
        pa.created_at,
        s.severity,
        s.title,
        s.body
      FROM hamilton_priority_alerts pa
      JOIN hamilton_signals s ON pa.signal_id = s.id
      WHERE pa.user_id = ${userId}
        AND pa.status = 'active'
      ORDER BY
        CASE s.severity
          WHEN 'high'   THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low'    THEN 3
          ELSE 4
        END ASC,
        pa.created_at DESC
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: String(r.id),
      signalId: String(r.signal_id),
      severity: String(r.severity),
      title: String(r.title),
      body: String(r.body),
      status: String(r.status),
      createdAt: String(r.created_at),
    };
  } catch {
    return null;
  }
}

async function fetchStatusMetrics(userId: number): Promise<{
  newSignals: number;
  highPriorityAlerts: number;
  recentHighSignals: number;
}> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [newRows, alertRows, recentHighRows] = await Promise.all([
      sql`
        SELECT COUNT(*)::int AS count
        FROM hamilton_signals
        WHERE created_at >= ${cutoff}
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM hamilton_priority_alerts pa
        JOIN hamilton_signals s ON pa.signal_id = s.id
        WHERE pa.user_id = ${userId}
          AND pa.status = 'active'
          AND s.severity = 'high'
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM hamilton_signals
        WHERE severity = 'high'
          AND created_at >= ${cutoff}
      `,
    ]);

    return {
      newSignals: Number(newRows[0]?.count ?? 0),
      highPriorityAlerts: Number(alertRows[0]?.count ?? 0),
      recentHighSignals: Number(recentHighRows[0]?.count ?? 0),
    };
  } catch {
    return { newSignals: 0, highPriorityAlerts: 0, recentHighSignals: 0 };
  }
}

async function fetchWatchlist(userId: number): Promise<WatchlistEntry[]> {
  try {
    const rows = await sql`
      SELECT institution_ids
      FROM hamilton_watchlists
      WHERE user_id = ${userId}
      LIMIT 1
    `;
    if (rows.length === 0) return [];

    const ids: string[] = Array.isArray(rows[0]?.institution_ids)
      ? (rows[0].institution_ids as string[])
      : [];

    return ids.map((id) => ({
      institutionId: String(id),
      displayName: deriveDisplayName(String(id)),
      status: "unknown" as const,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function fetchMonitorPageData(
  userId: number
): Promise<MonitorPageData> {
  const [signalFeed, topAlert, metrics, watchlist] = await Promise.all([
    fetchSignalFeed(20),
    fetchTopAlert(userId),
    fetchStatusMetrics(userId),
    fetchWatchlist(userId),
  ]);

  const overall = deriveOverallStatus(
    metrics.newSignals,
    metrics.highPriorityAlerts,
    metrics.recentHighSignals
  );

  return {
    status: {
      overall,
      newSignals: metrics.newSignals,
      highPriorityAlerts: metrics.highPriorityAlerts,
    },
    topAlert,
    signalFeed,
    watchlist,
  };
}
