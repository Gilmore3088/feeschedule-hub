import type { Metadata } from "next";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { InstitutionSearch } from "@/components/institution-search";

export const metadata: Metadata = {
  title: "Find Your Bank - Compare Fees | Bank Fee Index",
  description:
    "Search for your bank or credit union and see how their fees compare to local and national competitors.",
  alternates: { canonical: "/institutions" },
};

export const revalidate = 86400;

export default function InstitutionsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Find Your Bank", href: "/institutions" },
        ]}
      />

      <nav
        aria-label="Breadcrumb"
        className="mb-6 text-[13px] text-slate-400"
      >
        <a href="/" className="hover:text-slate-600 transition-colors">
          Home
        </a>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="text-slate-600" aria-current="page">
          Find Your Bank
        </span>
      </nav>

      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Find Your Bank or Credit Union
        </h1>
        <p className="mt-2 text-[15px] text-slate-500">
          Search by name to see how your institution&apos;s fees compare to
          national benchmarks.
        </p>
      </div>

      <div className="mx-auto max-w-xl">
        <InstitutionSearch />
      </div>

      <p className="mt-8 text-center text-[12px] text-slate-400">
        Covering 8,700+ U.S. banks and credit unions. Data sourced from
        publicly available fee schedules.
      </p>
    </div>
  );
}
