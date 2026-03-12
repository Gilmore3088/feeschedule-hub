import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/lib/guides";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";

export const metadata: Metadata = {
  title: "Consumer Guides - Understanding Bank Fees",
  description:
    "Plain-language guides to understanding bank and credit union fees. Overdraft fees, NSF fees, ATM fees, wire transfers, and monthly maintenance fees explained with live data.",
};

export default function GuidesIndexPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Guides", href: "/guides" },
        ]}
      />

      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Consumer Guides
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
        Understanding Bank Fees
      </h1>
      <p className="mt-2 max-w-2xl text-[14px] text-slate-600">
        Plain-language guides to the most common bank and credit union fees.
        Each guide includes live benchmarking data from our database of
        thousands of financial institutions.
      </p>

      <div className="mt-8 space-y-4">
        {GUIDES.map((guide) => (
          <Link
            key={guide.slug}
            href={`/guides/${guide.slug}`}
            className="group block rounded-lg border border-slate-200 px-5 py-4 transition-colors hover:border-blue-200 hover:bg-blue-50/30"
          >
            <h2 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
              {guide.title}
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">
              {guide.description}
            </p>
          </Link>
        ))}
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Consumer Guides - Understanding Bank Fees",
            description: "Plain-language guides to understanding bank and credit union fees.",
            url: "https://bankfeeindex.com/guides",
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}
