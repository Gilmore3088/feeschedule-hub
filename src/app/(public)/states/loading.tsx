export default function StatesIndexLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-64 rounded bg-slate-200" />
        <div className="h-4 w-96 rounded bg-slate-200" />

        <div className="mx-auto h-64 max-w-3xl rounded bg-slate-100" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"
            >
              <div className="space-y-1.5">
                <div className="h-4 w-28 rounded bg-slate-200" />
                <div className="h-3 w-20 rounded bg-slate-100" />
              </div>
              <div className="h-5 w-8 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
