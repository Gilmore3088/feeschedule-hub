import { FeesSkeleton } from "./fees-skeleton";

export default function FeesLoading() {
  return (
    <div className="mx-auto max-w-7xl bg-[#FAF7F2] px-6 py-14">
      <div className="max-w-3xl">
        <div className="h-px w-8 bg-[#F3EDE3]" />
        <div className="mt-4 h-8 w-80 max-w-full animate-pulse rounded-xl bg-[#F3EDE3]" />
      </div>
      <FeesSkeleton />
    </div>
  );
}
