export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Filter bar placeholder */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-28 bg-gray-200 rounded-md" />
        ))}
      </div>

      {/* Row 1: Command center */}
      <div className="space-y-4 mb-8">
        <div className="rounded-lg border bg-white px-6 py-5">
          <div className="h-3 w-24 bg-gray-200 rounded" />
          <div className="h-9 w-48 bg-gray-200 rounded mt-2" />
          <div className="flex gap-3 mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-6 w-20 bg-gray-100 rounded-full" />
            ))}
          </div>
          <div className="h-2 w-full bg-gray-100 rounded-full mt-4" />
        </div>
        <div className="rounded-lg border bg-white px-5 py-3 flex gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 w-24 bg-gray-200 rounded" />
          ))}
        </div>
      </div>

      {/* Row 2: Health tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-white px-4 py-3">
            <div className="h-3 w-24 bg-gray-200 rounded" />
            <div className="h-7 w-16 bg-gray-200 rounded mt-2" />
          </div>
        ))}
      </div>

      {/* Row 3: Map + summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 rounded-lg border bg-white h-72" />
        <div className="rounded-lg border bg-white">
          <div className="px-5 py-3 border-b">
            <div className="h-4 w-32 bg-gray-200 rounded" />
          </div>
          <div className="p-5 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 w-24 bg-gray-200 rounded" />
                <div className="h-4 w-12 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 4: Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="rounded-lg border bg-white h-64" />
        <div className="rounded-lg border bg-white h-64" />
      </div>

      {/* Row 5: Operational tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border bg-white h-48" />
        <div className="rounded-lg border bg-white h-48" />
      </div>
    </div>
  );
}
