export default function ConsumerLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="space-y-4">
        <div className="h-10 w-80 rounded-lg bg-[#E8DFD1] animate-pulse" />
        <div className="h-5 w-96 rounded bg-[#E8DFD1]/60 animate-pulse" />
      </div>
      <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-48 rounded-xl bg-[#E8DFD1]/40 animate-pulse"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
