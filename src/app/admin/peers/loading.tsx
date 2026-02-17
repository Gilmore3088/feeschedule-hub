import { Skeleton } from "@/components/skeleton";

export default function PeersLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-56" />
      </div>

      {/* Saved segments */}
      <div className="flex gap-2 items-center">
        <Skeleton className="h-3.5 w-12" />
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>

      {/* Filters + Preview */}
      <div className="admin-card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03]">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="p-5 space-y-5">
          {/* Filter controls */}
          <div className="space-y-5">
            <div>
              <Skeleton className="h-3 w-24 mb-2" />
              <Skeleton className="h-9 w-56 rounded-lg" />
            </div>
            <div>
              <Skeleton className="h-3 w-28 mb-2" />
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            </div>
          </div>

          {/* Preview stats */}
          <div className="border-t border-gray-100 dark:border-white/[0.04] pt-5">
            <Skeleton className="h-8 w-20 mb-3" />
            <div className="grid grid-cols-4 gap-3 mb-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex justify-between py-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3.5 w-12" />
                <Skeleton className="h-3.5 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="admin-card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03]">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="p-5">
          <Skeleton className="h-[400px] rounded-lg" />
        </div>
      </div>
    </div>
  );
}
