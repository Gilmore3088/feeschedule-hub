export const dynamic = "force-dynamic";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { redirect } from "next/navigation";
import { ManageBillingButton } from "./manage-billing-button";
import { PremiumBadge } from "@/components/upgrade-gate";
import { LogoutButton } from "./logout-button";
import { ProfileForm } from "./profile-form";
import { STATE_TO_DISTRICT, DISTRICT_NAMES } from "@/lib/fed-districts";
import { STATE_NAMES } from "@/lib/us-states";
import { CustomerNav } from "@/components/customer-nav";
import { CustomerFooter } from "@/components/customer-footer";
import { SearchModal } from "@/components/public/search-modal";
import { getNationalIndex, getPeerIndex } from "@/lib/crawler-db";
import { getDisplayName } from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account | Bank Fee Index",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/account");

  const params = await searchParams;
  // Fallback: if webhook missed, verify payment directly with Stripe
  if (user.subscription_status !== "active" && user.stripe_customer_id) {
    try {
      const { getStripe } = await import("@/lib/stripe");
      const stripe = getStripe();
      const subs = await stripe.subscriptions.list({
        customer: user.stripe_customer_id,
        status: "active",
        limit: 1,
      });
      if (subs.data.length > 0) {
        const { sql: sqlConn } = await import("@/lib/crawler-db/connection");
        await sqlConn`
          UPDATE users SET subscription_status = 'active', role = 'premium'
          WHERE id = ${user.id} AND role NOT IN ('admin')`;
        user.subscription_status = "active";
        user.role = "premium";
      }
    } catch {
      // Stripe not configured or error -- continue with current status
    }
  }

  const isPro = canAccessPremium(user);
  const district = user.state_code ? STATE_TO_DISTRICT[user.state_code] : null;
  const districtName = district ? DISTRICT_NAMES[district] : null;
  const stateName = user.state_code ? STATE_NAMES[user.state_code] : null;

  // Personalized fee insight
  let feeInsight: { category: string; stateMedian: number | null; nationalMedian: number | null } | null = null;
  if (user.state_code) {
    try {
      const nationalIndex = await getNationalIndex();
      const stateIndex = await getPeerIndex({ state_code: user.state_code });
      const odNational = nationalIndex.find((e) => e.fee_category === "overdraft");
      const odState = stateIndex.find((e) => e.fee_category === "overdraft");
      if (odNational && odState && odState.median_amount !== null) {
        feeInsight = {
          category: "overdraft",
          stateMedian: odState.median_amount,
          nationalMedian: odNational.median_amount,
        };
      }
    } catch {
      // DB not available
    }
  }

  // Build personalized quick action links
  const peerParams = new URLSearchParams();
  if (user.state_code) peerParams.set("state", user.state_code);
  if (user.institution_type === "bank") peerParams.set("charter", "bank");
  if (user.institution_type === "credit_union") peerParams.set("charter", "credit_union");
  if (user.asset_tier) peerParams.set("tier", user.asset_tier);

  const quickActions = [
    {
      label: "Research Agent",
      description: isPro ? "Ask questions about fee data with AI" : "3 free queries/day",
      href: "/pro/research",
      icon: "M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
      premium: false,
    },
    {
      label: "Fee Benchmarks",
      description: user.state_code ? `Fees in ${user.state_code}` : "National fee data",
      href: user.state_code ? `/research/state/${user.state_code}` : "/fees",
      icon: "M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z",
      premium: false,
    },
    {
      label: "Peer Analysis",
      description: "Compare against your peer group",
      href: isPro ? `/research/national-fee-index${peerParams.toString() ? "?" + peerParams.toString() : ""}` : "/subscribe",
      icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m14 0v-6a2 2 0 00-2-2h-2a2 2 0 00-2 2v6m14-10V9a2 2 0 00-2-2h-2a2 2 0 00-2 2v4",
      premium: true,
    },
    {
      label: "District Report",
      description: districtName ? `${districtName} district` : "Fed district data",
      href: isPro ? (district ? `/research/district/${district}` : "/research") : "/subscribe",
      icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064",
      premium: true,
    },
    {
      label: "Export Data",
      description: "Download CSV reports",
      href: isPro ? "/api/v1/fees?format=csv" : "/subscribe",
      icon: "M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
      premium: true,
    },
    {
      label: "API Docs",
      description: "Integrate with your systems",
      href: "/api-docs",
      icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
      premium: false,
    },
  ];

  const userInitial = (user.institution_name?.[0] || user.email?.[0] || user.username?.[0] || "U").toUpperCase();

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <CustomerNav />

      <div className="mx-auto max-w-4xl px-6 py-14">
        {params.success && (
          <div className="mb-6 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            Your subscription is now active! Welcome to Bank Fee Index.
          </div>
        )}

        {/* ── Welcome Header ── */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1A1815] text-[16px] font-bold text-white shrink-0">
              {userInitial}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="h-px w-6 bg-[#C44B2E]/40" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C44B2E]/60">
                  {isPro ? "Pro Account" : "Free Account"}
                </span>
              </div>
              <h1
                className="mt-1 text-[1.5rem] sm:text-[1.75rem] leading-[1.15] tracking-[-0.02em] text-[#1A1815]"
                style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
              >
                {user.institution_name || "Your Account"}
              </h1>
              <p className="mt-1 text-[13px] text-[#7A7062]">
                {user.email || user.username}
                {stateName && <> &middot; {stateName}</>}
                {districtName && <> &middot; District {district}</>}
              </p>
            </div>
          </div>
          <LogoutButton />
        </div>

        {/* ── Subscription Status ── */}
        {!isPro && (
          <div className="rounded-xl border-2 border-[#C44B2E] bg-white/70 backdrop-blur-sm p-6 mb-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C44B2E]/60 to-transparent" />
            <div className="md:flex md:items-center md:justify-between">
              <div>
                <h2
                  className="text-[18px] font-medium text-[#1A1815]"
                  style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
                >
                  Unlock the full platform
                </h2>
                <p className="text-[13px] text-[#7A7062] mt-1">
                  All 49 fee categories, peer benchmarks, AI research, data exports, and API access.
                </p>
              </div>
              <a
                href="/subscribe"
                className="mt-4 md:mt-0 inline-flex items-center gap-2 rounded-full bg-[#C44B2E] px-6 py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-[#C44B2E]/15 hover:shadow-md hover:shadow-[#C44B2E]/25 transition-all flex-shrink-0 no-underline"
              >
                View Plans
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        )}

        {isPro && (
          <div className="rounded-xl border border-[#E8DFD1] bg-white/70 backdrop-blur-sm p-5 mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#A09788]">
                  Plan
                </span>
                <span className="text-[14px] font-medium text-[#1A1815]">Seat License</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 uppercase">
                  Active
                </span>
                {user.subscription_status === "past_due" && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 uppercase">
                    Past Due
                  </span>
                )}
              </div>
              {user.stripe_customer_id && <ManageBillingButton />}
            </div>
          </div>
        )}

        {/* ── Personalized Fee Insight ── */}
        {feeInsight && feeInsight.stateMedian !== null && feeInsight.nationalMedian !== null && (
          <div className="rounded-xl border border-[#E8DFD1] bg-white/70 backdrop-blur-sm p-5 mb-8">
            <div className="flex items-start gap-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#C44B2E]/8 text-[#C44B2E]">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#A09788]">
                  Your State Insight
                </p>
                <p className="mt-1 text-[14px] text-[#1A1815]">
                  The median overdraft fee in{" "}
                  <span className="font-semibold">{stateName}</span> is{" "}
                  <span
                    className="font-semibold tabular-nums"
                    style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
                  >
                    {formatAmount(feeInsight.stateMedian)}
                  </span>
                  {" "}vs the national median of{" "}
                  <span className="tabular-nums">{formatAmount(feeInsight.nationalMedian)}</span>.
                  {feeInsight.stateMedian > feeInsight.nationalMedian
                    ? <span className="text-red-500 text-[12px] ml-1">+{(((feeInsight.stateMedian - feeInsight.nationalMedian) / feeInsight.nationalMedian) * 100).toFixed(0)}% above national</span>
                    : feeInsight.stateMedian < feeInsight.nationalMedian
                      ? <span className="text-emerald-600 text-[12px] ml-1">{(((feeInsight.stateMedian - feeInsight.nationalMedian) / feeInsight.nationalMedian) * 100).toFixed(0)}% below national</span>
                      : null
                  }
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Profile ── */}
        <div className="mb-8">
          <ProfileForm user={user} />
        </div>

        {/* ── Quick Actions ── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#A09788]">
              Quick Actions
            </span>
            <span className="h-px flex-1 bg-[#E8DFD1]" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {quickActions.map((action) => (
              <a
                key={action.label}
                href={action.href}
                className={`relative rounded-xl border bg-white/70 backdrop-blur-sm p-5 transition-all duration-300 group no-underline overflow-hidden ${
                  action.premium && !isPro
                    ? "border-[#E8DFD1] opacity-60"
                    : "border-[#E8DFD1]/80 hover:border-[#C44B2E]/20 hover:shadow-md hover:shadow-[#C44B2E]/5 hover:-translate-y-0.5"
                }`}
              >
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C44B2E]/0 to-transparent group-hover:via-[#C44B2E]/30 transition-all duration-700" />
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className={`h-6 w-6 mb-3 ${action.premium && !isPro ? "text-[#A09788]" : "text-[#C44B2E]"}`}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={action.icon} />
                </svg>
                <div className="text-[14px] font-medium text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
                  {action.label}
                  {action.premium && !isPro && <PremiumBadge />}
                </div>
                <div className="text-[12px] text-[#A09788] mt-1">{action.description}</div>
              </a>
            ))}
          </div>
        </div>

        {/* ── API Access ── */}
        <div className="mb-8">
          <div className="rounded-xl border border-[#E8DFD1] bg-white/70 backdrop-blur-sm p-5 opacity-50">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#A09788]">
                API Access
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#E8DFD1]/60 text-[#7A7062] uppercase">
                Soon
              </span>
            </div>
            <p className="text-[13px] text-[#7A7062]">
              Programmatic access to fee data is coming soon.
            </p>
          </div>
        </div>
      </div>
      <CustomerFooter />
      <SearchModal />
    </div>
  );
}
