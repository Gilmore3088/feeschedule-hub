export default function PeersLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-3 w-32 bg-gray-200 rounded mb-2" />
        <div className="h-6 w-40 bg-gray-200 rounded mb-1" />
        <div className="h-4 w-56 bg-gray-200 rounded" />
      </div>

      {/* Saved segments skeleton */}
      <div className="flex gap-2 mb-4">
        <div className="h-4 w-12 bg-gray-200 rounded" />
        <div className="h-6 w-32 bg-gray-200 rounded-full" />
        <div className="h-6 w-28 bg-gray-200 rounded-full" />
      </div>

      <div className="space-y-6">
        {/* Combined: Filters + Preview */}
        <div className="rounded-lg border bg-white">
          <div className="px-5 py-3 border-b bg-gray-50">
            <div className="h-4 w-48 bg-gray-200 rounded" />
          </div>
          <div className="p-5 space-y-5">
            {/* Filter controls */}
            <div className="space-y-5">
              <div>
                <div className="h-3 w-24 bg-gray-200 rounded mb-2" />
                <div className="h-9 w-56 bg-gray-200 rounded-lg" />
              </div>
              <div>
                <div className="h-3 w-28 bg-gray-200 rounded mb-2" />
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-14 bg-gray-200 rounded-lg" />
                  ))}
                </div>
              </div>
            </div>

            {/* Preview stats */}
            <div className="border-t pt-5">
              <div className="h-8 w-20 bg-gray-200 rounded mb-3" />
              <div className="grid grid-cols-4 gap-3 mb-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-14 bg-gray-200 rounded-lg" />
                ))}
              </div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex justify-between py-1.5">
                  <div className="h-4 w-40 bg-gray-200 rounded" />
                  <div className="h-4 w-12 bg-gray-200 rounded" />
                  <div className="h-4 w-16 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Full-width map */}
        <div className="rounded-lg border bg-white">
          <div className="px-5 py-3 border-b bg-gray-50">
            <div className="h-4 w-40 bg-gray-200 rounded" />
          </div>
          <div className="p-5">
            <div className="h-[400px] bg-gray-200 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
