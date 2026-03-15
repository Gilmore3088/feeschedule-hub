export default function DistrictsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="animate-pulse space-y-6">
        <div className="h-7 w-56 rounded bg-slate-200" />
        <div className="h-4 w-96 rounded bg-slate-200" />

        {/* District grid */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-slate-200 p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="h-5 w-36 rounded bg-slate-200" />
                <div className="h-4 w-8 rounded bg-slate-100" />
              </div>
              <div className="h-3 w-48 rounded bg-slate-100" />
              <div className="flex gap-4 pt-1">
                <div className="h-3 w-16 rounded bg-slate-100" />
                <div className="h-3 w-20 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
