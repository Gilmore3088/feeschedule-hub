import type { Metadata } from "next";
import { FeeChecker } from "@/components/fee-checker";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";

export const metadata: Metadata = {
  title: "Fee Checker - Compare Your Local Banking Fees | Bank Fee Index",
  description:
    "Check how banking fees in your state compare to national averages. Instant comparison of overdraft, NSF, ATM, maintenance, and wire transfer fees.",
};

export default function CheckPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Fee Checker", href: "/check" },
        ]}
      />

      {/* Header */}
      <div className="mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600">
          Consumer Tool
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Are you paying too much?
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-500 max-w-xl">
          Compare the most common banking fees in your state against the national
          average. See where your area ranks and find out if you could be saving
          money by switching institutions.
        </p>
      </div>

      <FeeChecker />

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "Bank Fee Checker",
            description:
              "Compare banking fees in your state against national averages",
            url: "https://bankfeeindex.com/check",
            applicationCategory: "FinanceApplication",
            operatingSystem: "Web",
            creator: {
              "@type": "Organization",
              name: "Bank Fee Index",
            },
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}
