import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Bank Fee Index",
  description: "How Bank Fee Index collects, uses, and protects your personal information.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Last updated: February 2026
      </p>

      <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-slate-700">
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Information We Collect</h2>
          <p className="mt-2">
            When you submit a request for access, we collect the following information:
            name, job title, institution name, email address, asset size tier, and
            area of interest. This information is stored in our database and used solely
            to evaluate and respond to your request.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">How We Use Your Information</h2>
          <p className="mt-2">
            We use the information you provide to process access requests, communicate
            with you about our services, and improve the Bank Fee Index platform. We do
            not sell, rent, or share your personal information with third parties for
            marketing purposes.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Data Sources</h2>
          <p className="mt-2">
            Fee data published on this site is sourced from publicly available fee
            schedule documents published by U.S. banks and credit unions. Institution
            names, charter types, and asset sizes are sourced from public regulatory
            filings (FDIC and NCUA).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Data Retention</h2>
          <p className="mt-2">
            Access request information is retained for up to 12 months. You may
            request deletion of your information at any time by contacting us.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Cookies & Analytics</h2>
          <p className="mt-2">
            This site does not use tracking cookies or third-party analytics that
            collect personal information. We may use privacy-focused analytics
            (such as Plausible) that do not require cookie consent.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Security</h2>
          <p className="mt-2">
            We implement industry-standard security measures to protect your
            information, including encrypted connections (HTTPS), secure session
            management, and access controls.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Contact</h2>
          <p className="mt-2">
            For questions about this privacy policy or to request deletion of your
            data, please contact us at{" "}
            <span className="font-medium text-slate-900">privacy@bankfeeindex.com</span>.
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
