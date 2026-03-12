import { Skeleton } from "@/components/skeleton";

export default function IndexLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3.5 w-72" />
      </div>

      {/* Insight cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="admin-card px-4 py-3 space-y-2">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        ))}
      </div>

      {/* Filter bar placeholder */}
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-36" />
      </div>

      {/* Table */}
      <div className="admin-card overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-gray-50/80 dark:bg-white/[0.03]">
          <div className="flex gap-8">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-14 ml-auto" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-2.5 border-b last:border-0"
          >
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3.5 w-16 ml-auto" />
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
