import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES, getGuide } from "@/lib/guides";
import { getFeeCategorySummaries } from "@/lib/crawler-db";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return { title: "Guide Not Found" };

  return {
    title: guide.title,
    description: guide.description,
    keywords: guide.feeCategories.map((c) => `${getDisplayName(c)} guide`),
  };
}

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const allSummaries = getFeeCategorySummaries();
  const relevantFees = allSummaries.filter((s) =>
    guide.feeCategories.includes(s.fee_category)
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Guides", href: "/guides" },
          { name: guide.title.split(":")[0], href: `/guides/${slug}` },
        ]}
      />

      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Consumer Guide
      </p>
      <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
        {guide.title}
      </h1>
      <p className="mt-2 text-[14px] text-slate-600">
        {guide.description}
      </p>

      {/* Live data snapshot */}
      {relevantFees.length > 0 && (
        <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50/30 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">
            Live Data — National Benchmarks
          </p>
          <div className="mt-3 space-y-2">
            {relevantFees.map((fee) => (
              <div
                key={fee.fee_category}
                className="flex items-center justify-between"
              >
                <Link
                  href={`/fees/${fee.fee_category}`}
                  className="text-sm text-blue-900 hover:text-blue-600 hover:underline"
                >
                  {getDisplayName(fee.fee_category)}
                </Link>
                <div className="flex items-center gap-4 text-sm">
                  <span className="tabular-nums font-medium text-blue-900">
                    {formatAmount(fee.median_amount)} median
                  </span>
                  <span className="text-[11px] text-blue-600/70">
                    {formatAmount(fee.min_amount)} &ndash; {formatAmount(fee.max_amount)}
                  </span>
                  <span className="text-[11px] text-blue-600/50">
                    {fee.institution_count.toLocaleString()} institutions
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guide content */}
      <div className="mt-8 space-y-8">
        {guide.sections.map((section, i) => (
          <section key={i}>
            <h2 className="text-base font-bold text-slate-900">
              {section.heading}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
              {section.content}
            </p>
          </section>
        ))}
      </div>

      {/* Related fees */}
      {relevantFees.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-bold text-slate-800">
            Explore the Data
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {relevantFees.map((fee) => (
              <Link
                key={fee.fee_category}
                href={`/fees/${fee.fee_category}`}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50/30 hover:text-blue-600"
              >
                {getDisplayName(fee.fee_category)} Deep Dive
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Other guides */}
      <section className="mt-10 border-t border-slate-200 pt-8">
        <h2 className="text-sm font-bold text-slate-800">
          More Guides
        </h2>
        <div className="mt-3 space-y-2">
          {GUIDES.filter((g) => g.slug !== slug).map((g) => (
            <Link
              key={g.slug}
              href={`/guides/${g.slug}`}
              className="block text-sm text-slate-600 hover:text-blue-600 transition-colors"
            >
              {g.title}
            </Link>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: guide.title,
            description: guide.description,
            url: `https://bankfeeindex.com/guides/${slug}`,
            mainEntity: {
              "@type": "FAQPage",
              mainEntity: guide.sections.map((s) => ({
                "@type": "Question",
                name: s.heading,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: s.content,
                },
              })),
            },
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}
