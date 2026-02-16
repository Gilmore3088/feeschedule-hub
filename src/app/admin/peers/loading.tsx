export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-3 w-32 bg-gray-200 rounded mb-2" />
        <div className="h-6 w-48 bg-gray-200 rounded" />
      </div>
      <div className="bg-white rounded-lg border mb-6">
        <div className="px-6 py-3 border-b bg-gray-50">
          <div className="h-4 w-32 bg-gray-200 rounded" />
        </div>
        <div className="p-4 flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border px-4 py-2 w-40">
              <div className="h-4 w-28 bg-gray-200 rounded" />
              <div className="h-3 w-20 bg-gray-100 rounded mt-1" />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-lg border mb-6">
        <div className="px-6 py-3 border-b bg-gray-50">
          <div className="h-4 w-48 bg-gray-200 rounded" />
        </div>
        <div className="p-4 flex flex-wrap gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-lg border px-3 py-2 w-32">
              <div className="h-4 w-24 bg-gray-200 rounded" />
              <div className="h-3 w-12 bg-gray-100 rounded mt-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
