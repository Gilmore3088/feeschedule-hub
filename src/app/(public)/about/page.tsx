import Link from "next/link";
import type { Metadata } from "next";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { TAXONOMY_COUNT } from "@/lib/fee-taxonomy";

export const metadata: Metadata = {
  title: "Methodology | Bank Fee Index",
  description:
    "How the Bank Fee Index collects, validates, and benchmarks retail banking fees across U.S. banks and credit unions.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Methodology", href: "/about" },
        ]}
      />
      <nav className="mb-6 text-[13px] text-slate-400">
        <Link href="/" className="hover:text-slate-600 transition-colors">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-600">Methodology</span>
      </nav>

      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Methodology
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
        How the Bank Fee Index collects, validates, and benchmarks retail banking
        fees.
      </p>

      <div className="mt-10 space-y-10">
        <Section title="Data Collection">
          <p>
            Fee schedule documents are collected from publicly available sources
            published by U.S. banks and credit unions. These include PDF fee
            schedules, HTML disclosures, and structured data posted on
            institutional websites.
          </p>
          <p>
            Automated crawlers identify and retrieve fee schedule documents on a
            rolling basis. Each document is timestamped and stored for audit
            purposes.
          </p>
        </Section>

        <Section title="Fee Extraction">
          <p>
            Structured fee data is extracted from raw documents using a
            combination of pattern matching and language model analysis. Each
            extraction identifies the fee category, dollar amount, and any
            conditions or qualifiers noted in the source document.
          </p>
          <p>
            The system classifies fees into {TAXONOMY_COUNT} standardized
            categories organized across 9 fee families: Account Maintenance,
            Overdraft &amp; NSF, ATM &amp; Card, Wire &amp; Transfer, Payment
            Services, Account Services, Lending Fees, Specialty, and Regulatory.
          </p>
        </Section>

        <Section title="Validation & Review">
          <p>
            Extracted fees pass through automated validation rules that flag
            statistical outliers, implausible amounts, and duplicate
            observations. Confidence scores are assigned based on extraction
            quality.
          </p>
          <p>
            Fees above confidence thresholds are automatically staged for
            inclusion. All fees are subject to manual review before final
            approval. The review workflow tracks pending, staged, approved, and
            rejected statuses independently.
          </p>
        </Section>

        <Section title="Statistical Methods">
          <p>
            Benchmark statistics are computed from all non-rejected fee
            observations (pending, staged, and approved). For each fee category,
            the index reports:
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] text-slate-600">
            <li>
              <strong>Median</strong> - the middle value, robust to outliers
            </li>
            <li>
              <strong>P25 and P75</strong> - the interquartile range (middle 50%
              of observations)
            </li>
            <li>
              <strong>Min and Max</strong> - the full observed range
            </li>
            <li>
              <strong>Institution count</strong> - the number of distinct
              institutions contributing data
            </li>
          </ul>
          <p className="mt-3">
            Peer benchmarks are computed by filtering the observation set by
            charter type (bank or credit union), asset tier, and Federal Reserve
            district before calculating statistics.
          </p>
        </Section>

        <Section title="Data Maturity">
          <p>
            Each fee category is assigned a maturity tier based on the depth of
            supporting data:
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] text-slate-600">
            <li>
              <strong>Strong</strong> - 10 or more approved observations
            </li>
            <li>
              <strong>Provisional</strong> - 10 or more total observations
              (including pending and staged)
            </li>
            <li>
              <strong>Insufficient</strong> - fewer than 10 observations
            </li>
          </ul>
        </Section>

        <Section title="Limitations">
          <p>
            This index covers institutions from which fee data was successfully
            collected and extracted. It may not be representative of the full
            U.S. banking market. Fee amounts reflect disclosed fee schedules and
            may not account for promotional rates, relationship pricing, fee
            waivers, or negotiated terms.
          </p>
          <p>
            Content is provided for informational and research purposes only and
            does not constitute financial advice or a recommendation regarding
            any specific institution.
          </p>
        </Section>

        <Section title="Updates">
          <p>
            The index is updated on a rolling basis as new fee schedule documents
            are collected and processed. Statistics are recomputed with each data
            refresh. Historical snapshots are retained for trend analysis.
          </p>
        </Section>

        <Section id="data-corrections" title="Data Corrections">
          <p>
            If you believe a fee amount or categorization is incorrect, please
            contact us at{" "}
            <a
              href="mailto:data@bankfeeindex.com"
              className="text-blue-600 hover:underline"
            >
              data@bankfeeindex.com
            </a>{" "}
            with the following information:
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] text-slate-600">
            <li>Institution name and state</li>
            <li>Fee category and the amount you believe is incorrect</li>
            <li>
              The correct amount with a link to the current fee schedule document
            </li>
          </ul>
          <p>
            We review all correction requests within 5 business days and will
            update the index if the correction is verified. You can also use the
            &ldquo;Report an error&rdquo; link found on each fee category page.
          </p>
        </Section>
      </div>

      <div className="mt-12 flex gap-3">
        <Link
          href="/fees"
          className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          Browse Fee Index
        </Link>
        <Link
          href="/districts"
          className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          View Districts
        </Link>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id}>
      <h2 className="mb-3 text-lg font-bold tracking-tight text-slate-900">
        {title}
      </h2>
      <div className="space-y-3 text-[14px] leading-relaxed text-slate-600">
        {children}
      </div>
    </section>
  );
}
