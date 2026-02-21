export default function CheapestLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="animate-pulse space-y-6">
        <div className="h-3 w-32 rounded bg-slate-200" />
        <div className="h-5 w-20 rounded-full bg-slate-200" />
        <div className="h-8 w-64 rounded bg-slate-200" />
        <div className="h-4 w-48 rounded bg-slate-200" />

        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
          <div className="h-8 w-16 rounded bg-slate-200" />
          <div className="h-8 w-16 rounded bg-slate-100" />
          <div className="h-8 w-24 rounded bg-slate-100" />
        </div>

        <div className="rounded-lg border border-slate-200 p-4 space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="flex gap-3">
                <div className="h-4 w-6 rounded bg-slate-100" />
                <div className="h-4 w-40 rounded bg-slate-200" />
              </div>
              <div className="h-4 w-16 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
