import { Skeleton, SkeletonTable, SkeletonCards } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-48" />
      </div>

      {/* Funnel */}
      <div className="admin-card p-5">
        <Skeleton className="h-3 w-24 mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* Cards */}
      <SkeletonCards count={6} />

      {/* Filters */}
      <div className="flex gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-48" />
      </div>

      {/* Table */}
      <SkeletonTable rows={10} cols={9} />
    </div>
  );
}
