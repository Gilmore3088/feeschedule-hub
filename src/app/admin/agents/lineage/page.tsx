import {
  getLineageGraph,
  type LineageError,
  type LineageGraph,
} from "@/lib/crawler-db/agent-console";
import { TreeView } from "./tree-view";

export const dynamic = "force-dynamic";

type SearchParams = { fee?: string };

const LINEAGE_ERROR_MESSAGES: Record<LineageError["code"], string> = {
  fee_published_not_found:
    "Fee not found. The fee_published_id does not exist in fees_published.",
  tier_2_missing:
    "Lineage broken: Tier-2 (fees_verified) row missing. Data integrity issue — check promote_to_tier3 handshake.",
  tier_1_missing:
    "Lineage broken: Tier-1 (fees_raw) row missing. Data integrity issue — the extraction source row was deleted or never written.",
};

export default async function AgentsLineagePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const feeParam = params.fee?.trim();
  const feeId = feeParam ? Number(feeParam) : null;
  const validFeeId =
    feeId !== null && Number.isFinite(feeId) && Number.isInteger(feeId) && feeId > 0
      ? feeId
      : null;

  let graph: LineageGraph = null;
  let loadError: string | null = null;
  let lineageError: LineageError | null = null;

  if (validFeeId !== null) {
    try {
      const result = await getLineageGraph(validFeeId);
      if (result.ok) {
        graph = result.graph;
      } else {
        lineageError = result.error;
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <form
        method="GET"
        action="/admin/agents/lineage"
        className="admin-card p-3 flex items-center gap-2"
      >
        <label
          htmlFor="fee"
          className="text-[11px] font-semibold uppercase tracking-wider text-gray-500"
        >
          Fee Published ID
        </label>
        <input
          id="fee"
          name="fee"
          type="number"
          defaultValue={feeParam ?? ""}
          placeholder="e.g. 123"
          className="h-8 rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-2 text-[12px] tabular-nums w-36"
        />
        <button
          type="submit"
          className="min-h-11 rounded-md bg-gray-900 dark:bg-white/10 text-white text-[12px] font-semibold px-3 py-2 hover:bg-gray-800 dark:hover:bg-white/20"
        >
          Trace
        </button>
        <span className="text-[11px] text-gray-500 dark:text-gray-400 ml-auto">
          3-click bar: Tier 3 default-expanded → Tier 2 → Tier 1 → R2 link
        </span>
      </form>

      {feeParam && validFeeId === null && (
        <div className="admin-card p-4 text-[12px] text-amber-600 dark:text-amber-400">
          Invalid fee_published_id. Enter a positive integer.
        </div>
      )}
      {loadError && (
        <div className="admin-card p-4 text-[12px] text-red-600 dark:text-red-400">
          Query failed: {loadError}
        </div>
      )}
      {lineageError && (
        <div className="admin-card p-4 text-[12px] text-red-600 dark:text-red-400">
          <div className="font-semibold">
            {LINEAGE_ERROR_MESSAGES[lineageError.code] ?? lineageError.code}
          </div>
          {Object.keys(lineageError.details).length > 0 && (
            <pre className="mt-2 text-[10px] font-mono text-red-500/80 dark:text-red-300/70">
              {JSON.stringify(lineageError.details, null, 2)}
            </pre>
          )}
        </div>
      )}

      {validFeeId !== null && !loadError && !lineageError && (
        <TreeView graph={graph} />
      )}

      {validFeeId === null && !feeParam && (
        <div className="admin-card p-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Enter a fee_published_id to trace its full lineage chain.
        </div>
      )}
    </section>
  );
}
