import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Bank Fee Index",
  description: "Terms governing use of the Bank Fee Index platform and data.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Last updated: February 2026
      </p>

      <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-slate-700">
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Acceptance of Terms</h2>
          <p className="mt-2">
            By accessing or using Bank Fee Index, you agree to be bound by these
            terms of service. If you do not agree to these terms, do not use the site.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Data Accuracy Disclaimer</h2>
          <p className="mt-2">
            Fee data is extracted from publicly available fee schedule documents using
            automated methods. While we strive for accuracy, we cannot guarantee that
            all fee amounts are correct or current. Fee schedules change frequently, and
            there may be a delay between when an institution updates its fees and when
            our data reflects the change.
          </p>
          <p className="mt-2">
            Always verify fee information directly with your financial institution
            before making decisions based on the data presented here.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Not Financial Advice</h2>
          <p className="mt-2">
            The information provided on Bank Fee Index is for informational and
            research purposes only. It does not constitute financial advice,
            a recommendation, or an endorsement of any specific financial institution
            or product. Consult a qualified financial professional before making
            financial decisions.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Limitation of Liability</h2>
          <p className="mt-2">
            Bank Fee Index is provided &ldquo;as is&rdquo; without warranties of any
            kind, express or implied. We are not liable for any damages arising from
            your use of or inability to use this service, including but not limited
            to inaccurate data, service interruptions, or data loss.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Acceptable Use</h2>
          <p className="mt-2">
            You may use Bank Fee Index data for personal research and internal
            business analysis. You may not scrape, redistribute, or commercially
            resell the data without prior written consent. Automated access beyond
            normal browsing is prohibited.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">AI-Generated Content</h2>
          <p className="mt-2">
            Some research articles and analysis on this site are generated with AI
            assistance and reviewed by the Bank Fee Index team. AI-generated content
            is clearly marked where applicable.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Changes to Terms</h2>
          <p className="mt-2">
            We may update these terms at any time. Continued use of the site after
            changes constitutes acceptance of the updated terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Contact</h2>
          <p className="mt-2">
            For questions about these terms, contact us at{" "}
            <span className="font-medium text-slate-900">legal@bankfeeindex.com</span>.
          </p>
        </section>
      </div>

      <div className="mt-12">
        <Link
          href="/"
          className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          &larr; Back to home
        </Link>
      </div>
    </div>
  );
}
