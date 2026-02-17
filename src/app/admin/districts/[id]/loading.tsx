export default function DistrictLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-3 w-40 bg-gray-200 rounded mb-2" />
        <div className="h-6 w-64 bg-gray-200 rounded mb-1" />
        <div className="h-4 w-80 bg-gray-200 rounded" />
      </div>

      <div className="space-y-6">
        {/* Beige Book skeleton */}
        <div className="rounded-lg border bg-white">
          <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-3 w-32 bg-gray-200 rounded" />
          </div>
          <div className="p-5 space-y-3">
            <div className="h-4 w-56 bg-gray-200 rounded" />
            <div className="h-3 w-full bg-gray-200 rounded" />
            <div className="h-3 w-full bg-gray-200 rounded" />
            <div className="h-3 w-3/4 bg-gray-200 rounded" />
            <div className="h-3 w-full bg-gray-200 rounded" />
            <div className="h-3 w-2/3 bg-gray-200 rounded" />
          </div>
        </div>

        {/* Speeches skeleton */}
        <div className="rounded-lg border bg-white">
          <div className="px-5 py-3 border-b bg-gray-50">
            <div className="h-4 w-48 bg-gray-200 rounded" />
          </div>
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-5 py-3 flex justify-between">
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-3/4 bg-gray-200 rounded" />
                  <div className="h-3 w-40 bg-gray-200 rounded" />
                </div>
                <div className="h-5 w-16 bg-gray-200 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        {/* Indicators skeleton */}
        <div className="rounded-lg border bg-white">
          <div className="px-5 py-3 border-b bg-gray-50">
            <div className="h-4 w-44 bg-gray-200 rounded" />
          </div>
          <div className="p-5 grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="h-3 w-32 bg-gray-200 rounded mb-2" />
                <div className="h-6 w-16 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
