/**
 * Streaming fallback for the district report page's data-dependent content.
 * Mirrors the removed route-level loading.tsx — kept in-page (behind a
 * <Suspense> boundary placed AFTER the notFound()-determining district id
 * checks) so an unknown district still resolves a real 404 status instead
 * of Next flushing this shell with a 200 before the not-found check runs.
 */
export function DistrictReportSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10 animate-pulse">
      <div className="h-3 w-32 rounded bg-slate-200" />
      <div className="mt-2 h-7 w-80 rounded bg-slate-200" />
      <div className="mt-3 h-4 w-[28rem] rounded bg-slate-200" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg border border-slate-200 bg-slate-50" />
        ))}
      </div>
      <div className="mt-8 h-5 w-40 rounded bg-slate-200" />
      <div className="mt-3 flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 w-24 rounded-md border border-slate-200 bg-slate-50" />
        ))}
      </div>
      <div className="mt-8 h-5 w-48 rounded bg-slate-200" />
      <div className="mt-3 h-64 rounded-lg border border-slate-200 bg-slate-50" />
    </div>
  );
}
