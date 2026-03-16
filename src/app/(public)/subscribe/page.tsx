import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { redirect } from "next/navigation";
import { SubscribeButton } from "./subscribe-button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing | Bank Fee Index",
  description:
    "Access the most comprehensive bank fee benchmarking platform. Seat licenses, annual plans, and custom research reports.",
};

const MONTHLY_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || "";
const ANNUAL_PRICE_ID = process.env.STRIPE_ANNUAL_PRICE_ID || "";
const REPORT_PRICE_ID = process.env.STRIPE_REPORT_PRICE_ID || "";

const FEATURES = [
  "Full dataset: all 49 fee categories, 9,000+ institutions",
  "Peer comparison by charter type, asset tier, Fed district",
  "National and regional fee index with percentiles",
  "CSV and bulk data exports",
  "AI research agent for custom analysis",
  "Executive research reports",
  "Fed district economic context and Beige Book summaries",
  "CFPB complaint correlation data",
  "Daily-updated economic indicators (FRED, BLS, NY Fed)",
];

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (user && canAccessPremium(user)) {
    redirect("/account");
  }

  const isLoggedIn = !!user;

  return (
    <div className="min-h-screen bg-[#FAF7F2] px-4 py-12">
      <div className="mx-auto max-w-4xl">
        {params.success && (
          <div className="mb-6 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3 text-center">
            Subscription activated! You now have full access.
          </div>
        )}

        <div className="text-center mb-10">
          <h1
            className="text-3xl font-normal tracking-tight text-[#1A1815] mb-3"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Simple, transparent pricing
          </h1>
          <p className="text-[#7A7062] text-base max-w-lg mx-auto">
            One platform, full access. No hidden fees, no per-query charges.
          </p>
        </div>

        {/* Two main plans side by side */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Monthly Seat License */}
          <div className="bg-[#FFFDF9] border border-[#E8DFD1] rounded-xl p-6">
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#7A7062] mb-1">
                Monthly
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-[#1A1815]">
                  $499.99
                </span>
                <span className="text-[#7A7062] text-sm">/mo per seat</span>
              </div>
            </div>
            <ul className="space-y-2 mb-6 text-sm text-[#5A5347]">
              {FEATURES.slice(0, 6).map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="text-[#C44B2E] mt-0.5 flex-shrink-0">
                    &#10003;
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            {isLoggedIn ? (
              <SubscribeButton
                priceId={MONTHLY_PRICE_ID}
                mode="subscription"
                label="Start Monthly -- $499.99/mo"
                className="w-full rounded-md bg-[#1A1815] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2A2825] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              />
            ) : (
              <a
                href="/register"
                className="block w-full text-center rounded-md bg-[#1A1815] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2A2825] transition-colors"
              >
                Create account
              </a>
            )}
          </div>

          {/* Annual License -- highlighted */}
          <div className="bg-[#FFFDF9] border-2 border-[#C44B2E] rounded-xl p-6 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-[#C44B2E] text-white text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full">
                Best Value
              </span>
            </div>
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#7A7062] mb-1">
                Annual
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-[#1A1815]">
                  $5,000
                </span>
                <span className="text-[#7A7062] text-sm">/year per seat</span>
              </div>
              <div className="text-xs text-[#C44B2E] font-medium mt-1">
                Save $1,000 vs monthly
              </div>
            </div>
            <ul className="space-y-2 mb-6 text-sm text-[#5A5347]">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="text-[#C44B2E] mt-0.5 flex-shrink-0">
                    &#10003;
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            {isLoggedIn ? (
              <SubscribeButton
                priceId={ANNUAL_PRICE_ID}
                mode="subscription"
                label="Start Annual -- $5,000/year"
                className="w-full rounded-md bg-[#C44B2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#A83D25] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              />
            ) : (
              <a
                href="/register"
                className="block w-full text-center rounded-md bg-[#C44B2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#A83D25] transition-colors"
              >
                Create account
              </a>
            )}
          </div>
        </div>

        {/* On-Demand Report -- full width below */}
        <div className="bg-[#FFFDF9] border border-[#E8DFD1] rounded-xl p-6 mb-6">
          <div className="md:flex md:items-center md:justify-between md:gap-8">
            <div className="mb-4 md:mb-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#7A7062] mb-1">
                On Demand
              </div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-3xl font-bold text-[#1A1815]">$250</span>
                <span className="text-[#7A7062] text-sm">/report</span>
              </div>
              <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-[#5A5347]">
                <li className="flex items-center gap-1.5">
                  <span className="text-[#C44B2E]">&#10003;</span>
                  Custom peer analysis for your institution
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-[#C44B2E]">&#10003;</span>
                  Competitive fee positioning report
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-[#C44B2E]">&#10003;</span>
                  District or state deep-dive
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-[#C44B2E]">&#10003;</span>
                  Delivered within 48 hours
                </li>
              </ul>
            </div>
            <div className="flex-shrink-0 md:w-56">
              {isLoggedIn ? (
                <SubscribeButton
                  priceId={REPORT_PRICE_ID}
                  mode="payment"
                  label="Order Report -- $250"
                  className="w-full rounded-md border border-[#D5CBBF] bg-transparent px-4 py-2.5 text-sm font-medium text-[#1A1815] hover:border-[#1A1815] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                />
              ) : (
                <a
                  href="/register"
                  className="block w-full text-center rounded-md border border-[#D5CBBF] px-4 py-2.5 text-sm font-medium text-[#1A1815] hover:border-[#1A1815] transition-colors"
                >
                  Create account
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Enterprise CTA */}
        <div className="text-center bg-[#FFFDF9] border border-[#E8DFD1] rounded-xl p-8">
          <h2
            className="text-xl font-normal text-[#1A1815] mb-2"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Need a custom solution?
          </h2>
          <p className="text-sm text-[#7A7062] mb-4">
            Multi-seat licenses, raw data feeds, SLA, and dedicated support for
            large institutions and vendors.
          </p>
          <a
            href="mailto:hello@bankfeeindex.com"
            className="inline-block rounded-md border border-[#D5CBBF] px-6 py-2.5 text-sm font-medium text-[#1A1815] hover:border-[#1A1815] transition-colors"
          >
            Contact Sales
          </a>
        </div>

        {!isLoggedIn && (
          <p className="text-center text-xs text-[#A69D90] mt-8">
            Already have an account?{" "}
            <a href="/admin/login" className="text-[#7A7062] hover:underline">
              Sign in
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
