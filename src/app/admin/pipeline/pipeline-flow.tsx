import { getDb } from "@/lib/crawler-db/connection";

interface StageData {
  name: string;
  count: number;
  total: number;
  pct: number;
  color: string;
}

function getPipelineStageData(): StageData[] {
  const db = getDb();

  const total = (db.prepare("SELECT COUNT(*) as c FROM crawl_targets").get() as { c: number }).c;
  const withWebsite = (db.prepare("SELECT COUNT(*) as c FROM crawl_targets WHERE website_url IS NOT NULL AND website_url != ''").get() as { c: number }).c;
  const withFeeUrl = (db.prepare("SELECT COUNT(*) as c FROM crawl_targets WHERE fee_schedule_url IS NOT NULL AND fee_schedule_url != ''").get() as { c: number }).c;
  const withFees = (db.prepare("SELECT COUNT(DISTINCT crawl_target_id) as c FROM extracted_fees WHERE review_status != 'rejected'").get() as { c: number }).c;
  const totalFees = (db.prepare("SELECT COUNT(*) as c FROM extracted_fees WHERE review_status != 'rejected'").get() as { c: number }).c;
  const categorized = (db.prepare("SELECT COUNT(*) as c FROM extracted_fees WHERE fee_category IS NOT NULL AND fee_category != '' AND review_status != 'rejected'").get() as { c: number }).c;
  const approved = (db.prepare("SELECT COUNT(*) as c FROM extracted_fees WHERE review_status = 'approved'").get() as { c: number }).c;

  function pctColor(pct: number): string {
    if (pct >= 80) return "bg-emerald-500";
    if (pct >= 50) return "bg-amber-500";
    return "bg-red-500";
  }

  return [
    { name: "Institutions", count: total, total, pct: 100, color: "bg-gray-400" },
    { name: "Website Found", count: withWebsite, total, pct: total > 0 ? (withWebsite / total) * 100 : 0, color: pctColor(total > 0 ? (withWebsite / total) * 100 : 0) },
    { name: "Fee URL Found", count: withFeeUrl, total, pct: total > 0 ? (withFeeUrl / total) * 100 : 0, color: pctColor(total > 0 ? (withFeeUrl / total) * 100 : 0) },
    { name: "Fees Extracted", count: withFees, total, pct: total > 0 ? (withFees / total) * 100 : 0, color: pctColor(total > 0 ? (withFees / total) * 100 : 0) },
    { name: "Categorized", count: categorized, total: totalFees, pct: totalFees > 0 ? (categorized / totalFees) * 100 : 0, color: pctColor(totalFees > 0 ? (categorized / totalFees) * 100 : 0) },
    { name: "Approved", count: approved, total: totalFees, pct: totalFees > 0 ? (approved / totalFees) * 100 : 0, color: pctColor(totalFees > 0 ? (approved / totalFees) * 100 : 0) },
  ];
}

export function PipelineFlow() {
  const stages = getPipelineStageData();

  return (
    <div className="rounded-lg border border-gray-200 dark:border-white/[0.08] overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50/80 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/[0.06]">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Pipeline Stages
        </h3>
      </div>
      <div className="p-4">
        <div className="flex items-end gap-1">
          {stages.map((stage, i) => (
            <div key={stage.name} className="flex-1 text-center">
              {/* Count */}
              <div className="text-[13px] font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {stage.count.toLocaleString()}
              </div>
              {/* Percentage */}
              <div className="text-[10px] tabular-nums text-gray-400 mb-1">
                {stage.pct.toFixed(0)}%
              </div>
              {/* Bar */}
              <div className="mx-auto w-full max-w-[60px] bg-gray-100 dark:bg-white/[0.06] rounded-t overflow-hidden" style={{ height: "60px" }}>
                <div
                  className={`${stage.color} w-full rounded-t transition-all duration-500`}
                  style={{ height: `${Math.max(stage.pct, 3)}%`, marginTop: `${100 - Math.max(stage.pct, 3)}%` }}
                />
              </div>
              {/* Label */}
              <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mt-1.5 leading-tight">
                {stage.name}
              </div>
              {/* Arrow */}
              {i < stages.length - 1 && (
                <div className="hidden" />
              )}
            </div>
          ))}
        </div>

        {/* Flow arrows */}
        <div className="flex items-center mt-2 px-2">
          {stages.map((_, i) => (
            <div key={i} className="flex-1 flex items-center">
              {i < stages.length - 1 && (
                <div className="w-full h-px bg-gray-200 dark:bg-white/[0.08] relative">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-4 border-l-gray-300 dark:border-l-white/20 border-y-[3px] border-y-transparent" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
