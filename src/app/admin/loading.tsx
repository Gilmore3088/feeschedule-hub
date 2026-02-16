export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-white px-4 py-3">
            <div className="h-3 w-24 bg-gray-200 rounded" />
            <div className="h-7 w-16 bg-gray-200 rounded mt-2" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-white px-4 py-3">
            <div className="h-3 w-24 bg-gray-200 rounded" />
            <div className="h-7 w-16 bg-gray-200 rounded mt-2" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-lg border mb-8">
        <div className="px-6 py-4 border-b">
          <div className="h-5 w-40 bg-gray-200 rounded" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-6 py-3 border-b last:border-0">
            <div className="h-4 w-full bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
