export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 animate-pulse">
      <div className="h-3 w-24 rounded bg-slate-200" />
      <div className="mt-2 h-7 w-[28rem] rounded bg-slate-200" />
      <div className="mt-3 h-4 w-96 rounded bg-slate-200" />
      <div className="mt-6 h-32 rounded-lg border border-blue-200 bg-blue-50/20" />
      <div className="mt-8 space-y-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <div className="h-5 w-48 rounded bg-slate-200" />
            <div className="mt-3 h-16 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
