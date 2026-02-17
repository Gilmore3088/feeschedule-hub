export default function ExploreLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-3 w-48 bg-gray-200 rounded mb-2" />
        <div className="h-6 w-40 bg-gray-200 rounded mb-1" />
        <div className="h-4 w-64 bg-gray-200 rounded" />
      </div>

      <div className="bg-white rounded-lg border">
        <div className="border-b bg-gray-50 px-6 py-3">
          <div className="h-4 w-32 bg-gray-200 rounded" />
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-3 border-b last:border-0">
            <div className="h-4 w-48 bg-gray-200 rounded" />
            <div className="h-4 w-8 bg-gray-200 rounded" />
            <div className="h-5 w-12 bg-gray-200 rounded-full" />
            <div className="h-4 w-20 bg-gray-200 rounded ml-auto" />
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-4 w-8 bg-gray-200 rounded" />
            <div className="h-4 w-8 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
