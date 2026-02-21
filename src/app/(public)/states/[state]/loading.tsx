export default function StateOverviewLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="animate-pulse space-y-6">
        <div className="h-3 w-20 rounded bg-slate-200" />
        <div className="flex gap-2">
          <div className="h-5 w-12 rounded-full bg-slate-200" />
          <div className="h-5 w-32 rounded-full bg-slate-200" />
        </div>
        <div className="h-8 w-64 rounded bg-slate-200" />
        <div className="h-4 w-48 rounded bg-slate-200" />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-slate-200 p-5 space-y-2"
            >
              <div className="h-3 w-20 rounded bg-slate-100" />
              <div className="h-7 w-12 rounded bg-slate-200" />
              <div className="h-3 w-16 rounded bg-slate-100" />
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-slate-200 p-4 space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-36 rounded bg-slate-100" />
              <div className="flex gap-4">
                <div className="h-4 w-16 rounded bg-slate-100" />
                <div className="h-4 w-14 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
