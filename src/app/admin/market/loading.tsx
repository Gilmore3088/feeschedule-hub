export default function MarketLoading() {
  return (
    <div className="animate-pulse">
      {/* Breadcrumbs + heading */}
      <div className="mb-4 space-y-2">
        <div className="h-3 w-40 bg-gray-200 rounded" />
        <div className="h-6 w-64 bg-gray-200 rounded" />
        <div className="h-4 w-96 bg-gray-100 rounded" />
      </div>

      {/* Segment control bar */}
      <div className="py-3 border-b mb-6">
        <div className="flex items-center gap-3">
          <div className="h-7 w-24 bg-gray-200 rounded" />
          <div className="h-7 w-32 bg-gray-200 rounded" />
          <div className="h-7 w-24 bg-gray-200 rounded" />
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column */}
        <div className="lg:col-span-8 space-y-6">
          {/* Hero cards */}
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-white p-4 space-y-2">
                <div className="h-3 w-24 bg-gray-200 rounded" />
                <div className="h-8 w-20 bg-gray-200 rounded" />
                <div className="h-3 w-16 bg-gray-100 rounded" />
              </div>
            ))}
          </div>

          {/* Category explorer */}
          <div className="rounded-lg border bg-white">
            <div className="px-5 py-3 border-b bg-gray-50/80">
              <div className="h-4 w-40 bg-gray-200 rounded" />
            </div>
            <div className="divide-y">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <div className="h-3 w-3 bg-gray-200 rounded" />
                  <div className="h-4 w-36 bg-gray-200 rounded" />
                  <div className="h-3 w-12 bg-gray-100 rounded ml-auto" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-4 space-y-4 order-first lg:order-last">
          {/* Map */}
          <div className="rounded-lg border bg-white">
            <div className="px-4 py-3 border-b bg-gray-50/80">
              <div className="h-4 w-44 bg-gray-200 rounded" />
            </div>
            <div className="p-3">
              <div className="h-48 bg-gray-100 rounded" />
            </div>
          </div>

          {/* Stats */}
          <div className="rounded-lg border bg-white">
            <div className="px-4 py-3 border-b bg-gray-50/80">
              <div className="h-4 w-32 bg-gray-200 rounded" />
            </div>
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="h-3 w-20 bg-gray-200 rounded" />
                  <div className="h-4 w-12 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Tier breakdown */}
          <div className="rounded-lg border bg-white">
            <div className="px-4 py-3 border-b bg-gray-50/80">
              <div className="h-4 w-28 bg-gray-200 rounded" />
            </div>
            <div className="p-4 space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 w-20 bg-gray-200 rounded" />
                  <div className="flex-1 h-2 bg-gray-100 rounded-full" />
                  <div className="h-3 w-8 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
