export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-3 w-32 bg-gray-200 rounded mb-2" />
        <div className="h-6 w-48 bg-gray-200 rounded" />
      </div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-white px-4 py-3">
            <div className="h-3 w-20 bg-gray-200 rounded" />
            <div className="h-5 w-32 bg-gray-200 rounded mt-2" />
          </div>
        ))}
      </div>
      <div className="h-10 w-full bg-gray-200 rounded mb-4" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg border mb-4">
          <div className="px-6 py-3 border-b bg-gray-50">
            <div className="h-4 w-32 bg-gray-200 rounded" />
          </div>
          {Array.from({ length: 3 }).map((_, j) => (
            <div key={j} className="px-6 py-3 border-b last:border-0">
              <div className="h-4 w-full bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
