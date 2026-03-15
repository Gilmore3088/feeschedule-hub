export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10 animate-pulse">
      {/* Hero */}
      <div className="h-3 w-24 rounded bg-slate-200" />
      <div className="mt-2 h-9 w-80 rounded bg-slate-200" />
      <div className="mt-3 h-4 w-[28rem] max-w-full rounded bg-slate-200" />
      <div className="mt-5 flex gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-4 w-24 rounded bg-slate-100" />
        ))}
      </div>
      <div className="mt-5 flex gap-2">
        <div className="h-9 w-28 rounded-md bg-slate-200" />
        <div className="h-9 w-28 rounded-md bg-slate-100" />
        <div className="h-9 w-32 rounded-md bg-slate-100" />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-10 xl:grid-cols-[1fr_300px]">
        <div>
          {/* National Index hero module */}
          <div className="h-52 rounded-xl border-2 border-blue-100 bg-blue-50/20" />

          {/* Analysis previews */}
          <div className="mt-8">
            <div className="h-5 w-36 rounded bg-slate-200" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="h-44 rounded-lg border border-slate-200 bg-slate-50/30" />
              <div className="h-44 rounded-lg border border-slate-200 bg-slate-50/30" />
            </div>
          </div>

          {/* State grid */}
          <div className="mt-10">
            <div className="h-5 w-32 rounded bg-slate-200" />
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {Array.from({ length: 25 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[60px] rounded-lg border border-slate-200 bg-slate-50"
                />
              ))}
            </div>
          </div>

          {/* District grid */}
          <div className="mt-10">
            <div className="h-5 w-56 rounded bg-slate-200" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 rounded-lg border border-slate-200 bg-slate-50"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="hidden xl:block space-y-5">
          <div className="h-48 rounded-lg border border-slate-200" />
          <div className="h-56 rounded-lg border border-slate-200" />
          <div className="h-36 rounded-lg border border-slate-200" />
        </div>
      </div>
    </div>
  );
}
