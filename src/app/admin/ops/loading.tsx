import { SkeletonCards, SkeletonTable } from "@/components/skeleton";

export default function Loading() {
  return (
    <>
      <div className="mb-6">
        <div className="h-5 w-40 skeleton rounded mb-2" />
        <div className="h-4 w-64 skeleton rounded" />
      </div>
      <SkeletonCards count={5} />
      <div className="mt-6">
        <SkeletonTable rows={10} cols={7} />
      </div>
    </>
  );
}
