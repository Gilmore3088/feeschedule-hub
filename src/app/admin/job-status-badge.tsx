import Link from "next/link";
import { getDb } from "@/lib/crawler-db/connection";

function getJobCounts(): { running: number; failed: number } {
  const db = getDb();
  try {
    const running = (db.prepare(
      "SELECT COUNT(*) as c FROM ops_jobs WHERE status IN ('running', 'queued')"
    ).get() as { c: number }).c;
    const failed = (db.prepare(
      "SELECT COUNT(*) as c FROM ops_jobs WHERE status = 'failed' AND completed_at > datetime('now', '-24 hours')"
    ).get() as { c: number }).c;
    return { running, failed };
  } catch {
    return { running: 0, failed: 0 };
  }
}

export function JobStatusBadge() {
  const { running, failed } = getJobCounts();

  if (running === 0 && failed === 0) return null;

  return (
    <div className="mx-3 mt-2 pt-2 border-t border-black/[0.04] dark:border-white/[0.04]">
      {running > 0 && (
        <Link
          href="/admin/ops"
          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
        >
          <span className="relative flex h-2 w-2">
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
          <span className="inline-flex rounded-full h-2 w-2 bg-red-500" />
          <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
            {failed} failed (24h)
          </span>
        </Link>
      )}
    </div>
  );
}
