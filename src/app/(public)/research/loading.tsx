export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 animate-pulse">
      <div className="h-3 w-16 rounded bg-slate-200" />
      <div className="mt-2 h-7 w-64 rounded bg-slate-200" />
      <div className="mt-3 h-4 w-96 rounded bg-slate-200" />
      <div className="mt-10 h-5 w-32 rounded bg-slate-200" />
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg border border-slate-200 bg-slate-50" />
        ))}
      </div>
    </div>
  );
}
