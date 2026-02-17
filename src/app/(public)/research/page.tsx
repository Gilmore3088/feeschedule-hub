import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Research & Analysis | Bank Fee Index",
  description:
    "Data-driven research and analysis on U.S. banking fees. Benchmark reports, trend analysis, and peer comparisons.",
};

export default function ResearchPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Research & Analysis
        </h1>
        <p className="mt-2 text-[15px] text-slate-500">
          Data-driven research on U.S. banking fees. Benchmark reports, trend
          analysis, and peer comparisons.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-8 text-center">
        <p className="text-sm text-slate-500">
          Research articles are coming soon. Check back for national benchmark
          reports, district comparisons, and fee trend analysis.
        </p>
      </div>
    </div>
  );
}
