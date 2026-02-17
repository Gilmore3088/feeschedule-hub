import { Skeleton, SkeletonTable } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-48" />
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-white/[0.06] pb-px">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-4 py-2.5">
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>

      {/* Search bar */}
      <Skeleton className="h-10 w-full" />

      {/* Table */}
      <SkeletonTable rows={10} cols={7} />
    </div>
  );
}
