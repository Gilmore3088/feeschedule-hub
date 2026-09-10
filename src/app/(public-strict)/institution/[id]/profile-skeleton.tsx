/**
 * Streaming fallback for the institution profile's data-dependent content.
 * Mirrors the removed route-level loading.tsx — kept in-page (behind a
 * <Suspense> boundary placed AFTER the notFound()-determining fetch) so a
 * missing institution still resolves a real 404 status instead of Next
 * flushing this shell with a 200 before the not-found check runs.
 */
export function InstitutionProfileSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10 animate-pulse">
      <div className="h-3 w-28 rounded bg-slate-200" />
      <div className="mt-2 h-7 w-72 rounded bg-slate-200" />
      <div className="mt-3 h-4 w-64 rounded bg-slate-200" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg border border-slate-200 bg-slate-50" />
        ))}
      </div>
      <div className="mt-8 h-5 w-32 rounded bg-slate-200" />
      <div className="mt-3 h-80 rounded-lg border border-slate-200 bg-slate-50" />
    </div>
  );
}
