import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3.5 w-56" />
      </div>

      {/* Insight cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="admin-card px-4 py-3 space-y-2">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-2.5 w-28" />
          </div>
        ))}
      </div>

      {/* Filter bar placeholder */}
      <Skeleton className="h-10 w-full rounded-md" />

      {/* Table */}
      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/80 dark:bg-white/[0.03]">
                {["Fee Type", "Family", "Inst.", "Median", "P25", "P75", "Range", "Banks", "CUs"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left">
                    <Skeleton className="h-3 w-12" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-4 py-2.5"><Skeleton className="h-3.5 w-36" /></td>
                  <td className="px-4 py-2.5"><Skeleton className="h-5 w-20 rounded-full" /></td>
                  <td className="px-4 py-2.5"><Skeleton className="h-3.5 w-8 ml-auto" /></td>
                  <td className="px-4 py-2.5"><Skeleton className="h-3.5 w-14 ml-auto" /></td>
                  <td className="px-4 py-2.5"><Skeleton className="h-3.5 w-14 ml-auto" /></td>
                  <td className="px-4 py-2.5"><Skeleton className="h-3.5 w-14 ml-auto" /></td>
                  <td className="px-4 py-2.5"><Skeleton className="h-2 w-full rounded-full" /></td>
                  <td className="px-4 py-2.5"><Skeleton className="h-5 w-8 mx-auto rounded-full" /></td>
                  <td className="px-4 py-2.5"><Skeleton className="h-5 w-8 mx-auto rounded-full" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
