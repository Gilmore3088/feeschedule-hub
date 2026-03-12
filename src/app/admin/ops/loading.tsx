import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3.5 w-56" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="admin-card px-4 py-3 space-y-2">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="admin-card p-4 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="admin-card p-4 space-y-3">
          <Skeleton className="h-4 w-28" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>

      <div className="admin-card overflow-hidden">
        <div className="px-4 py-3 border-b">
          <Skeleton className="h-4 w-28" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-b flex items-center gap-4">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-20 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
