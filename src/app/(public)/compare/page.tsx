import type { Metadata } from "next";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { CompareSelector } from "@/components/compare-selector";

export const metadata: Metadata = {
  title: "Compare Bank Fees: Head-to-Head | Bank Fee Index",
  description:
    "Compare fees between any two banks or credit unions side by side. See which institution charges less for overdraft, ATM, maintenance, and more.",
  alternates: { canonical: "/compare" },
};

export default function ComparePage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Compare", href: "/compare" },
        ]}
      />

      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Compare Bank Fees
      </h1>
      <p className="mt-2 text-[15px] text-slate-500">
        Select two institutions to see a side-by-side fee comparison with
        national median context.
      </p>

      <CompareSelector />
    </div>
  );
}
