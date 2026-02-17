import { Skeleton, SkeletonTable } from "@/components/skeleton";

export default function ExploreLoading() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-64" />
      </div>

      <SkeletonTable rows={10} cols={6} />
    </div>
  );
}
