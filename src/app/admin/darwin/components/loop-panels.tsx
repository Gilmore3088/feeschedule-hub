import { sql } from "@/lib/crawler-db/connection";

const LOOP_STEPS = [
  { key: "LOG", title: "Log", subtitle: "every action → agent_events" },
  { key: "REVIEW", title: "Review", subtitle: "periodic self-examination" },
  { key: "DISSECT", title: "Dissect", subtitle: "what was missed" },
  { key: "UNDERSTAND", title: "Understand", subtitle: "root cause + pattern" },
  { key: "IMPROVE", title: "Improve", subtitle: "update rules + knowledge" },
] as const;

interface AgentEvent {
  event_id: string;
  action: string;
  entity: string;
  status: string;
  created_at: string;
}

async function recentDarwinEvents(limit: number): Promise<AgentEvent[]> {
  try {
    const rows = await sql`
      SELECT event_id::text, action, entity, status, created_at
        FROM agent_events
       WHERE agent_name = 'darwin'
       ORDER BY created_at DESC
       LIMIT ${limit}
    `;
    return rows as unknown as AgentEvent[];
  } catch {
    return [];
  }
}

export async function LoopPanels() {
  const logEntries = await recentDarwinEvents(8);

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      {LOOP_STEPS.map((s) => (
        <div key={s.key} className="admin-card p-4 min-h-40">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {s.key}
          </div>
          <div className="text-sm font-bold text-gray-800 mt-1">{s.title}</div>
          <div className="text-[11px] text-gray-400">{s.subtitle}</div>
          <div className="mt-3">
            {s.key === "LOG" ? (
              <ul className="space-y-1 text-[11px] text-gray-600">
                {logEntries.length === 0 && (
                  <li className="text-gray-400">No events yet.</li>
                )}
                {logEntries.map((e) => (
                  <li key={e.event_id} className="truncate">
                    {e.action}/{e.entity} — {e.status}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-[11px] text-gray-400 italic">
                Activates in later slices.
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
