import { Skeleton, SkeletonTable } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-6 w-56" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="admin-card px-4 py-3 space-y-2">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>

      {/* Distribution chart placeholder */}
      <div className="admin-card p-5">
        <Skeleton className="h-48 w-full" />
      </div>

      {/* Institution table */}
      <SkeletonTable rows={8} cols={5} />
    </div>
  );
}
