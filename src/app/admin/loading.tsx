import { Skeleton, SkeletonCards } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Peer filter bar */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28" />
        ))}
      </div>

      {/* Row 1: Command center + crawl strip */}
      <div className="space-y-3">
        <div className="admin-card px-6 py-5 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-48" />
          <div className="flex gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-20 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
        <div className="admin-card px-5 py-3 flex gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-24" />
          ))}
        </div>
      </div>

      {/* Row 2: Index snapshot */}
      <div className="admin-card overflow-hidden">
        <div className="border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03] px-5 py-3">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="space-y-2 p-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-2 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Health tiles */}
      <SkeletonCards />

      {/* Row 4: Map + summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 admin-card p-4">
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="admin-card">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.04]">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="p-5 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 5: Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="admin-card h-64" />
        <div className="admin-card h-64" />
      </div>

      {/* Row 6: Operational tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="admin-card h-48" />
        <div className="admin-card h-48" />
      </div>
    </div>
  );
}
