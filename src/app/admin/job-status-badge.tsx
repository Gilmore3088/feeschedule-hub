import Link from "next/link";
import { sql } from "@/lib/crawler-db/connection";

async function getJobCounts(): Promise<{ running: number; failed: number }> {
  try {
    const [runningRow] = await sql`SELECT COUNT(*) as c FROM ops_jobs WHERE status IN ('running', 'queued')`;
    const [failedRow] = await sql`SELECT COUNT(*) as c FROM ops_jobs WHERE status = 'failed' AND completed_at > NOW() - INTERVAL '24 hours'`;
    return { running: Number(runningRow.c), failed: Number(failedRow.c) };
  } catch {
    return { running: 0, failed: 0 };
  }
}

export async function JobStatusBadge() {
  const { running, failed } = await getJobCounts();

  if (running === 0 && failed === 0) return null;

  return (
    <div className="mx-3 mt-2 pt-2 border-t border-black/[0.04] dark:border-white/[0.04]">
      {running > 0 && (
        <Link
          href="/admin/ops"
          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
        >
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
          <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
            {running} job{running > 1 ? "s" : ""} running
          </span>
        </Link>
      )}
      {failed > 0 && (
        <Link
          href="/admin/ops"
          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <span className="inline-flex rounded-full h-2 w-2 bg-red-500" aria-hidden="true" />
          <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
            {failed} failed (24h)
          </span>
        </Link>
      )}
    </div>
  );
}
