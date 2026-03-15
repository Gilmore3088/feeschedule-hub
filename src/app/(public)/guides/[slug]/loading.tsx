export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10 animate-pulse">
      <div className="h-3 w-24 rounded bg-slate-200" />
      <div className="mt-2 h-9 w-[32rem] max-w-full rounded bg-slate-200" />
      <div className="mt-3 h-4 w-[28rem] max-w-full rounded bg-slate-200" />
      <div className="mt-3 h-3 w-80 max-w-full rounded bg-slate-100" />

      {/* Data strip */}
      <div className="mt-6 h-24 rounded-lg border border-slate-200 bg-slate-50/60" />

      {/* Action buttons */}
      <div className="mt-4 flex gap-2">
        <div className="h-8 w-32 rounded-md bg-slate-200" />
        <div className="h-8 w-44 rounded-md bg-slate-200" />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_340px]">
        <div>
          {/* Chart placeholder */}
          <div className="mb-10">
            <div className="h-5 w-48 rounded bg-slate-200" />
            <div className="mt-4 h-[260px] rounded-lg border border-slate-200 bg-slate-50/30" />
          </div>
          {/* Guide sections */}
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-slate-200 px-6 py-5">
                <div className="h-5 w-52 rounded bg-slate-200" />
                <div className="mt-3 h-14 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-5">
          <div className="h-56 rounded-lg border border-blue-200 bg-blue-50/20" />
          <div className="h-36 rounded-lg border border-emerald-200 bg-emerald-50/20" />
          <div className="h-36 rounded-lg border border-red-200 bg-red-50/20" />
          <div className="h-28 rounded-lg border border-slate-200" />
        </div>
      </div>
    </div>
  );
}
