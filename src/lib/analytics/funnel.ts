/**
 * Demand read model.
 *
 * This codebase has roughly forty admin surfaces describing data quality and,
 * until now, none describing demand. Every instrument pointed at what might be
 * broken; nothing pointed at whether anyone is trying to buy. This module is the
 * other gauge.
 *
 * Everything here comes from our own tables rather than from Plausible. Page
 * views live in Plausible and are useful, but the numbers that decide anything —
 * did someone ask for a report, did someone register, did someone pay — are
 * rows we own, and they survive an ad blocker.
 */
import { getSql } from "@/lib/data-store/connection";

export interface FunnelWindow {
  /** Days back from now, inclusive. */
  days: number;
  /** Anyone who handed over an email: contact form, sample request, lead capture. */
  leads: number;
  /** Email-gated report requests. */
  reportRequests: number;
  /** Accounts created. */
  registrations: number;
  /** Accounts carrying a paying Stripe subscription status. */
  paying: number;
  /** Reports actually generated on demand, all types. */
  reportsGenerated: number;
}

export interface ReportTypeCount {
  reportType: string;
  count: number;
}

export interface DemandSnapshot {
  windows: FunnelWindow[];
  byReportType: ReportTypeCount[];
  /** Populated when a table is missing or unreadable, so the page can say so. */
  warnings: string[];
}

/** Stripe statuses that mean money is actually moving. */
const PAYING_STATUSES = ["active", "trialing", "past_due"] as const;

const WINDOWS = [7, 30] as const;

async function countSince(
  label: string,
  warnings: string[],
  run: () => Promise<Array<{ n: number | string }>>,
): Promise<number> {
  try {
    const rows = await run();
    return Number(rows[0]?.n ?? 0);
  } catch {
    // A missing table should degrade one number, not blank the whole page.
    if (!warnings.includes(label)) warnings.push(label);
    return 0;
  }
}

export async function getDemandSnapshot(): Promise<DemandSnapshot> {
  const sql = getSql();
  const warnings: string[] = [];

  const windows = await Promise.all(
    WINDOWS.map(async (days) => {
      const [leads, reportRequests, registrations, reportsGenerated] = await Promise.all([
        countSince("leads", warnings, () => sql`
          SELECT count(*)::int AS n FROM leads
           WHERE created_at >= now() - make_interval(days => ${days})
        `),
        countSince("report_leads", warnings, () => sql`
          SELECT count(*)::int AS n FROM report_leads
           WHERE requested_at >= now() - make_interval(days => ${days})
        `),
        countSince("users", warnings, () => sql`
          SELECT count(*)::int AS n FROM users
           WHERE created_at >= now() - make_interval(days => ${days})
        `),
        countSince("hamilton_reports", warnings, () => sql`
          SELECT count(*)::int AS n FROM hamilton_reports
           WHERE created_at >= now() - make_interval(days => ${days})
        `),
      ]);

      // Subscription status is current state, not an event, so it is not
      // windowed — the same total shows against every window on purpose.
      const paying = await countSince("users.subscription_status", warnings, () => sql`
        SELECT count(*)::int AS n FROM users
         WHERE subscription_status = ANY(${PAYING_STATUSES as unknown as string[]})
      `);

      return { days, leads, reportRequests, registrations, paying, reportsGenerated };
    }),
  );

  let byReportType: ReportTypeCount[] = [];
  try {
    const rows = await sql<Array<{ report_type: string; n: number | string }>>`
      SELECT report_type, count(*)::int AS n
        FROM hamilton_reports
       WHERE created_at >= now() - make_interval(days => 30)
       GROUP BY report_type
       ORDER BY n DESC
    `;
    byReportType = rows.map((r) => ({ reportType: r.report_type, count: Number(r.n) }));
  } catch {
    if (!warnings.includes("hamilton_reports")) warnings.push("hamilton_reports");
  }

  return { windows, byReportType, warnings };
}

/**
 * One line for the session brief. Deliberately terse and deliberately about
 * demand, since everything else that greets you at session start is about
 * what is open or broken.
 */
export function formatDemandLine(snapshot: DemandSnapshot): string {
  const week = snapshot.windows.find((w) => w.days === 7);
  if (!week) return "Demand: no window";
  return (
    `${week.leads} leads · ${week.registrations} signups · ` +
    `${week.reportsGenerated} reports · ${week.paying} paying`
  );
}
