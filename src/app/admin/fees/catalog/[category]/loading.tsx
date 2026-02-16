export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-3 w-48 bg-gray-200 rounded mb-2" />
        <div className="h-6 w-56 bg-gray-200 rounded" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-white px-4 py-3">
            <div className="h-3 w-16 bg-gray-200 rounded" />
            <div className="h-7 w-20 bg-gray-200 rounded mt-2" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-lg border p-6 mb-6">
        <div className="h-48 w-full bg-gray-100 rounded" />
      </div>
      <div className="bg-white rounded-lg border">
        <div className="px-6 py-3 border-b">
          <div className="h-4 w-40 bg-gray-200 rounded" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-6 py-3 border-b last:border-0">
            <div className="h-4 w-full bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
