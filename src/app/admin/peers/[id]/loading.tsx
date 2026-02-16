export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-3 w-48 bg-gray-200 rounded mb-2" />
        <div className="h-7 w-64 bg-gray-200 rounded mb-2" />
        <div className="flex gap-2">
          <div className="h-5 w-16 bg-gray-200 rounded-full" />
          <div className="h-5 w-24 bg-gray-200 rounded" />
          <div className="h-5 w-24 bg-gray-200 rounded" />
        </div>
      </div>
      <div className="bg-white rounded-lg border mb-6">
        <div className="px-6 py-3 border-b bg-gray-50">
          <div className="h-4 w-32 bg-gray-200 rounded" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="px-6 py-3 border-b last:border-0">
            <div className="h-4 w-full bg-gray-100 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-lg border">
        <div className="px-6 py-3 border-b bg-gray-50">
          <div className="h-4 w-40 bg-gray-200 rounded" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-6 py-3 border-b last:border-0">
            <div className="h-4 w-full bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
