import { Skeleton } from "@/components/skeleton";

export default function MarketLoading() {
  return (
    <div className="space-y-6">
      {/* Breadcrumbs + heading */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-3.5 w-96" />
      </div>

      {/* Segment control bar */}
      <div className="py-3 border-b border-gray-200 dark:border-white/[0.06]">
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-7 w-24" />
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column */}
        <div className="lg:col-span-8 space-y-5">
          {/* Hero cards */}
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="admin-card p-4 space-y-2">
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            ))}
          </div>

          {/* Category explorer */}
          <div className="admin-card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03]">
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="divide-y divide-gray-100 dark:divide-white/[0.04]">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <Skeleton className="h-3 w-3" />
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3 w-12 ml-auto" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-4 space-y-4 order-first lg:order-last">
          {/* Map */}
          <div className="admin-card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03]">
              <Skeleton className="h-4 w-44" />
            </div>
            <div className="p-3">
              <Skeleton className="h-48 w-full" />
            </div>
          </div>

          {/* Stats */}
          <div className="admin-card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03]">
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3.5 w-12" />
                </div>
              ))}
            </div>
          </div>

          {/* Tier breakdown */}
          <div className="admin-card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03]">
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="p-4 space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-3 w-20" />
                  <div className="flex-1 h-2 skeleton rounded-full" />
                  <Skeleton className="h-3 w-8" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
