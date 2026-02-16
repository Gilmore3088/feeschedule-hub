export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-3 w-32 bg-gray-200 rounded mb-2" />
        <div className="h-6 w-48 bg-gray-200 rounded" />
      </div>
      <div className="flex gap-1 mb-4 border-b pb-px">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-4 py-2.5">
            <div className="h-4 w-16 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      <div className="h-10 w-full bg-gray-100 rounded mb-4" />
      <div className="bg-white rounded-lg border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-b last:border-0">
            <div className="h-4 w-full bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
