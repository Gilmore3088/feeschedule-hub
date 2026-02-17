import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-48" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="admin-card px-4 py-3 space-y-2">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-5 w-32" />
          </div>
        ))}
      </div>

      {/* Search bar */}
      <Skeleton className="h-10 w-full" />

      {/* Category families */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="admin-card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03]">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="divide-y divide-gray-100 dark:divide-white/[0.04]">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center gap-4 px-4 py-2.5">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3.5 w-16 ml-auto" />
                <Skeleton className="h-3.5 w-16" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
