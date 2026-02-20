export default function ArticleLoading() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="animate-pulse space-y-6">
        <div className="h-3 w-20 rounded bg-slate-200" />
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="h-5 w-24 rounded-full bg-slate-200" />
          </div>
          <div className="h-8 w-3/4 rounded bg-slate-200" />
          <div className="h-4 w-full rounded bg-slate-100" />
          <div className="h-3 w-40 rounded bg-slate-100" />
        </div>
        <div className="space-y-4 pt-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-4 w-full rounded bg-slate-100" />
          ))}
          <div className="h-4 w-2/3 rounded bg-slate-100" />
          <div className="h-6 w-48 rounded bg-slate-200 mt-6" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 w-full rounded bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
