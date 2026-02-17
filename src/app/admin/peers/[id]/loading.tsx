import { Skeleton, SkeletonTable } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-7 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-24" />
        </div>
      </div>

      {/* Summary table */}
      <SkeletonTable rows={3} cols={4} />

      {/* Fee details table */}
      <SkeletonTable rows={8} cols={5} />
    </div>
  );
}
