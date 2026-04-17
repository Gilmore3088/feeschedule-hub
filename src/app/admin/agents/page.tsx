import {
  getAgentHealthTiles,
  getAgentHealthSparkline,
  HEALTH_METRICS,
  type AgentHealthTile,
} from "@/lib/crawler-db/agent-console";
import { Tiles } from "./overview/tiles";

export const dynamic = "force-dynamic";

export default async function AgentsOverviewPage() {
  let tiles: AgentHealthTile[] = [];
  let sparklines: Record<string, number[]> = {};
  let loadError: string | null = null;

  try {
    tiles = await getAgentHealthTiles();

    // Fetch one sparkline per (agent, metric) pair. 7-day window @ 15-min buckets = 672 points.
    // Keep this query-count bounded: for typical 2-5 agents × 5 metrics = 10-25 lightweight
    // index-scan queries. If agent count grows, switch to a single UNPIVOTed query.
    const pairs = tiles.flatMap((t) =>
      HEALTH_METRICS.map((m) => ({ agent: t.agent_name, metric: m })),
    );
    const results = await Promise.all(
      pairs.map(async (p) => {
        try {
          const hist = await getAgentHealthSparkline(p.agent, p.metric, 672);
          return [`${p.agent}:${p.metric}`, hist] as const;
        } catch {
          return [`${p.agent}:${p.metric}`, []] as const;
        }
      }),
    );
    sparklines = Object.fromEntries(results);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  return (
    <section className="flex flex-col gap-3">
      {loadError && (
        <div className="admin-card p-4 text-[12px] text-red-600 dark:text-red-400">
          Failed to load agent health: {loadError}
        </div>
      )}
      <Tiles data={tiles} sparklines={sparklines} />
    </section>
  );
}
