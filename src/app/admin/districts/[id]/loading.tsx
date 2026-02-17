import { Skeleton } from "@/components/skeleton";

export default function DistrictLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-3.5 w-80" />
      </div>

      {/* Beige Book */}
      <div className="admin-card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03] flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="p-5 space-y-3">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>

      {/* Speeches */}
      <div className="admin-card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03]">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="divide-y divide-gray-100 dark:divide-white/[0.04]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 py-3 flex justify-between">
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Indicators */}
      <div className="admin-card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03]">
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="admin-card p-3 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
