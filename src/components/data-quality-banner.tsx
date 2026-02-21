export type DataQuality = "limited" | "provisional" | "sufficient";

export function getDataQuality(observationCount: number): DataQuality {
  if (observationCount < 5) return "limited";
  if (observationCount < 10) return "provisional";
  return "sufficient";
}

export function DataQualityBanner({
  quality,
  count,
}: {
  quality: DataQuality;
  count: number;
}) {
  if (quality === "sufficient") return null;

  if (quality === "limited") {
    return (
      <div
        className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3"
        role="status"
      >
        <p className="text-[13px] font-medium text-amber-800">
          Limited data
        </p>
        <p className="mt-0.5 text-[12px] text-amber-700">
          This page is based on {count} observation
          {count !== 1 ? "s" : ""}. Medians and comparisons may not be
          representative. Data will improve as coverage expands.
        </p>
      </div>
    );
  }

  return (
    <div
      className="mb-6 rounded-md border border-slate-200 bg-slate-50 px-4 py-3"
      role="status"
    >
      <p className="text-[13px] font-medium text-slate-600">
        Provisional data
      </p>
      <p className="mt-0.5 text-[12px] text-slate-500">
        Based on {count} observations. Results are directionally useful but
        may shift as more institutions are added.
      </p>
    </div>
  );
}
