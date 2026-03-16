import { getDb } from "@/lib/crawler-db/connection";
import { timeAgo } from "@/lib/format";

interface ActivityItem {
  id: number;
  command: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  stdout_tail: string | null;
  result_summary: string | null;
}

function getRecentActivity(): ActivityItem[] {
  const db = getDb();
  try {
    return db
      .prepare(
        `SELECT id, command, status, started_at, completed_at, stdout_tail, result_summary
         FROM ops_jobs
         WHERE status IN ('completed', 'failed')
         ORDER BY completed_at DESC
         LIMIT 8`
      )
      .all() as ActivityItem[];
  } catch {
    return [];
  }
}

function extractKeyMetrics(stdout: string | null): string {
  if (!stdout) return "";
  const lines = stdout.split("\n").filter((l) => l.trim());

  // Look for key result lines
  for (const line of lines.reverse()) {
    if (line.includes("Fees found:")) return line.trim();
    if (line.includes("auto-approved")) return line.trim();
    if (line.includes("Auto-Review Complete")) return line.trim();
    if (line.includes("ingestion complete")) return line.trim();
    if (line.includes("Detected")) return line.trim();
    if (line.includes("complete:")) return line.trim();
    if (line.includes("Matched:")) return line.trim();
  }

  // Fallback: last non-empty line
  const last = lines.filter((l) => l.trim()).pop();
  return last ? last.trim().slice(0, 120) : "";
}

const STATUS_ICONS: Record<string, string> = {
  completed: "text-emerald-500",
  failed: "text-red-500",
};

export function ActivityFeed() {
  const items = getRecentActivity();

  if (items.length === 0) {
    return (
      <div className="admin-card p-4 text-center text-sm text-gray-400">
        No completed jobs yet.
      </div>
    );
  }

  return (
    <div className="admin-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 dark:border-white/[0.06]">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Recent Activity
        </h3>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-white/[0.04]">
        {items.map((item) => {
          const metric = extractKeyMetrics(item.stdout_tail);
          return (
            <div key={item.id} className="px-4 py-2.5 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors">
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 ${STATUS_ICONS[item.status] || "text-gray-400"}`}>
                  {item.status === "completed" ? (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm3.1 4.9a.6.6 0 00-.85-.85L7 8.3 5.75 7.05a.6.6 0 00-.85.85l1.68 1.67a.6.6 0 00.84 0l3.68-3.67z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 3a.6.6 0 00-.6.6v3.8a.6.6 0 001.2 0V4.6A.6.6 0 008 4zm0 7.2a.7.7 0 100-1.4.7.7 0 000 1.4z" />
                    </svg>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-800 dark:text-gray-200 font-mono">
                      {item.command}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {item.completed_at ? timeAgo(item.completed_at) : ""}
                    </span>
                  </div>
                  {metric && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {metric}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
