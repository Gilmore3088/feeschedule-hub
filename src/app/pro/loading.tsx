export default function ProLoading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-16">
      <div className="space-y-4">
        <div className="h-8 w-64 rounded bg-white/[0.04] animate-pulse" />
        <div className="h-5 w-96 rounded bg-white/[0.03] animate-pulse" />
      </div>
      <div className="mt-8 grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-lg bg-white/[0.03] animate-pulse"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
      <div className="mt-8 h-96 rounded-lg bg-white/[0.03] animate-pulse" />
    </div>
  );
}
