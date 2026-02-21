import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Bank Fee Index pricing — free national benchmarks for everyone, premium peer analytics for institutions at $500/year.",
};

const CHECK = (
  <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const DASH = <span className="text-slate-300">--</span>;

interface FeatureRow {
  name: string;
  free: React.ReactNode;
  starter: React.ReactNode;
}

const FEATURES: FeatureRow[] = [
  { name: "Institution profiles (1,900+)", free: CHECK, starter: CHECK },
  { name: "National fee index (15 featured)", free: CHECK, starter: CHECK },
  { name: "Fee category benchmarks", free: CHECK, starter: CHECK },
  { name: "State & district data", free: CHECK, starter: CHECK },
  { name: "Research articles", free: "3/month", starter: "Unlimited" },
  { name: "Peer benchmarking (49 categories)", free: "3 categories", starter: CHECK },
  { name: "Head-to-head comparison", free: "1/day", starter: "Unlimited" },
  { name: "CSV & PDF export", free: DASH, starter: CHECK },
  { name: "Fee change alerts (weekly email)", free: DASH, starter: CHECK },
  { name: "Historical trends (12 months)", free: DASH, starter: CHECK },
  { name: "Custom peer groups", free: DASH, starter: "Up to 5" },
  { name: "API access", free: DASH, starter: "1,000 req/mo" },
  { name: "Team seats", free: DASH, starter: "Unlimited" },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:py-24">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Simple, transparent pricing
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-slate-500">
          National benchmarks are free for everyone. Unlock peer analytics, exports, and alerts for your institution at a fraction of what legacy providers charge.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {/* Free */}
        <div className="rounded-xl border border-slate-200 p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Free
          </h2>
          <div className="mt-4 flex items-baseline">
            <span className="text-4xl font-bold text-slate-900">$0</span>
            <span className="ml-1 text-sm text-slate-400">forever</span>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Explore national benchmarks and fee data across 1,900+ institutions.
          </p>
          <Link
            href="/"
            className="mt-6 block rounded-md border border-slate-200 px-4 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Browse for free
          </Link>
        </div>

        {/* Starter */}
        <div className="rounded-xl border-2 border-slate-900 p-8 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900">
              Starter
            </h2>
            <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
              Most Popular
            </span>
          </div>
          <div className="mt-4 flex items-baseline">
            <span className="text-4xl font-bold text-slate-900">$500</span>
            <span className="ml-1 text-sm text-slate-400">/year</span>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Full peer analytics, exports, alerts, and API access for your whole team.
          </p>
          <Link
            href="/signup"
            className="mt-6 block rounded-md bg-slate-900 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-slate-800"
          >
            Get started
          </Link>
        </div>
      </div>

      {/* Feature Comparison */}
      <div className="mt-16">
        <h3 className="text-center text-lg font-bold text-slate-900">
          Compare plans
        </h3>
        <div className="mt-8 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Feature
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Free
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Starter
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {FEATURES.map((f) => (
                <tr key={f.name} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-700">{f.name}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center text-sm text-slate-500">
                      {f.free}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center text-sm font-medium text-slate-900">
                      {f.starter}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="mt-16 rounded-xl bg-slate-50 p-8 text-center">
        <h3 className="text-lg font-bold text-slate-900">
          Need more? Enterprise plans available.
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          Custom integrations, dedicated support, and volume pricing for large institutions.
        </p>
        <a
          href="mailto:enterprise@bankfeeindex.com"
          className="mt-4 inline-block rounded-md border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-white"
        >
          Contact sales
        </a>
      </div>

      {/* Trust bar */}
      <div className="mt-12 text-center text-xs text-slate-400">
        <p>
          Fee schedules are public documents. Bank Fee Index aggregates publicly available data
          from FDIC/NCUA-insured institutions. No proprietary data is used.
        </p>
      </div>
    </div>
  );
}
