export default function PublicLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="animate-pulse space-y-6">
        <div className="h-3 w-32 rounded bg-slate-200" />
        <div className="h-7 w-64 rounded bg-slate-200" />
        <div className="h-4 w-96 rounded bg-slate-200" />
        <div className="mt-8 rounded-lg border border-slate-200 p-6 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-40 rounded bg-slate-100" />
              <div className="h-4 w-20 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
