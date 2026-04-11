/**
 * Server-side daily report limit enforcement.
 *
 * Limits are checked against the report_jobs table at generation time.
 * This prevents DoS via repeated report generation and controls API cost.
 */

import { getSql } from '@/lib/crawler-db/connection';

export const REPORT_DAILY_LIMITS: Record<string, number> = {
  admin: 200,
  analyst: 200,
  premium: 5,
};

export function getReportDailyLimit(role: string): number {
  return REPORT_DAILY_LIMITS[role] ?? 5;
}

export interface DailyLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
}

export async function checkReportDailyLimit(
  userId: number | string,
  role: string
): Promise<DailyLimitResult> {
  const limit = getReportDailyLimit(role);
  const sql = getSql();

  const [row] = await sql`
    SELECT COUNT(*)::int AS used
    FROM report_jobs
    WHERE user_id = ${String(userId)}
      AND created_at > NOW() - INTERVAL '1 day'
  `;

  const used = (row?.used as number) ?? 0;

  return {
    allowed: used < limit,
    used,
    limit,
  };
}
