import { getCoverageSnapshots } from "@/lib/crawler-db/pipeline";
import { Sparkline } from "@/components/sparkline";

export async function CoverageTrend() {
  const snapshots = await getCoverageSnapshots(14);

  if (snapshots.length < 2) return null;

  // Reverse so oldest is first (sparkline expects left-to-right chronological)
  const ordered = [...snapshots].reverse();

  const coveragePcts = ordered.map((s) =>
    s.total_institutions > 0 ? (s.with_fees / s.total_institutions) * 100 : 0
  );
  const approvedPcts = ordered.map((s) =>
    s.total_fees > 0 ? (s.approved_fees / s.total_fees) * 100 : 0
  );
  const feeUrlPcts = ordered.map((s) =>
    s.total_institutions > 0 ? (s.with_fee_url / s.total_institutions) * 100 : 0
  );

  const latest = snapshots[0];
  const oldest = snapshots[snapshots.length - 1];
  const coverageChange = latest && oldest
    ? ((latest.with_fees / latest.total_institutions) - (oldest.with_fees / oldest.total_institutions)) * 100
    : 0;

  return (
    <div className="admin-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 dark:border-white/[0.06]">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Coverage Trend
        </h3>
        <p className="text-[10px] text-gray-400 mt-0.5">
          Last {snapshots.length} snapshots
          {coverageChange !== 0 && (
            <span className={coverageChange > 0 ? " text-emerald-500" : " text-red-500"}>
              {" "}({coverageChange > 0 ? "+" : ""}{coverageChange.toFixed(1)}pp coverage)
            </span>
          )}
        </p>
      </div>
      <div className="px-4 py-3 grid grid-cols-3 gap-4">
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Fee URL Discovery</div>
          <Sparkline data={feeUrlPcts} width={120} height={28} color="#3b82f6" />
          <div className="text-[11px] tabular-nums text-gray-600 dark:text-gray-400 mt-1">
            {feeUrlPcts[feeUrlPcts.length - 1]?.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Fee Extraction</div>
          <Sparkline data={coveragePcts} width={120} height={28} color="#10b981" />
          <div className="text-[11px] tabular-nums text-gray-600 dark:text-gray-400 mt-1">
            {coveragePcts[coveragePcts.length - 1]?.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Approval Rate</div>
          <Sparkline data={approvedPcts} width={120} height={28} color="#f59e0b" />
          <div className="text-[11px] tabular-nums text-gray-600 dark:text-gray-400 mt-1">
            {approvedPcts[approvedPcts.length - 1]?.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}
