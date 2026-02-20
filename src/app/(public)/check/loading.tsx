export default function CheckLoading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="space-y-2 mb-10">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
        <div className="h-8 w-64 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-96 animate-pulse rounded bg-slate-100" />
      </div>

      <div className="mb-8 flex gap-3">
        <div className="h-12 flex-1 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-12 w-32 animate-pulse rounded-lg bg-slate-100" />
      </div>

      <div className="rounded-xl border border-dashed border-slate-200 px-8 py-16 flex flex-col items-center">
        <div className="h-10 w-10 animate-pulse rounded bg-slate-100" />
        <div className="mt-4 h-4 w-48 animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-3 w-40 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}
