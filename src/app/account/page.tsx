import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium, canAccessApiKey } from "@/lib/access";
import { getDb } from "@/lib/crawler-db/connection";
import { redirect } from "next/navigation";
import { ManageBillingButton } from "./manage-billing-button";
import { PremiumBadge } from "@/components/upgrade-gate";
import { LogoutButton } from "./logout-button";
import { ProfileForm } from "./profile-form";
import { ApiKeySection } from "./api-key-section";
import { STATE_TO_DISTRICT, DISTRICT_NAMES } from "@/lib/fed-districts";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account | Bank Fee Index",
};

function getApiKeyInfo(userId: number) {
  const db = getDb();
  try {
    const row = db
      .prepare(
        "SELECT key_prefix, call_count, monthly_limit FROM api_keys WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1"
      )
      .get(userId) as { key_prefix: string; call_count: number; monthly_limit: number } | undefined;
    return row || null;
  } catch {
    return null;
  }
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/account");

  const params = await searchParams;
  const isPro = canAccessPremium(user);
  const apiKey = getApiKeyInfo(user.id);

  // Personalization: derive district from state
  const district = user.state_code ? STATE_TO_DISTRICT[user.state_code] : null;
  const districtName = district ? DISTRICT_NAMES[district] : null;

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
      premium: false, // available to free (limited)
    },
    {
      label: "Fee Benchmarks",
      description: user.state_code ? `Fees in ${user.state_code}` : "National fee data",
      href: user.state_code ? `/research/state/${user.state_code}` : "/fees",
      icon: "M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z",
      premium: false, // shows limited data for free
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

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <header className="border-b border-[#E8DFD1] bg-[#FAF7F2]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-4 flex items-center justify-between h-14">
          <a href="/subscribe" className="flex items-center gap-2 text-[#1A1815] no-underline">
            <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] text-[#C44B2E]" stroke="currentColor" strokeWidth="1.5">
              <rect x="4" y="13" width="4" height="8" rx="1" />
              <rect x="10" y="8" width="4" height="13" rx="1" />
              <rect x="16" y="3" width="4" height="18" rx="1" />
            </svg>
            <span className="text-[15px] font-medium tracking-tight" style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}>
              Bank Fee Index
            </span>
          </a>
          <div className="flex items-center gap-4">
            <span className="text-[13px] text-[#7A7062]">
              {user.email || user.username}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8">
        {params.success && (
          <div className="mb-6 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3">
            Your subscription is now active! Welcome to Bank Fee Index.
          </div>
        )}

        <h1
          className="text-2xl font-normal tracking-tight text-[#1A1815] mb-6"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          {user.institution_name ? `${user.institution_name}` : "Your Account"}
        </h1>

        {/* Subscription Banner -- prominent when no plan */}
        {!isPro && (
          <div className="bg-[#FFFDF9] rounded-xl border-2 border-[#C44B2E] p-6 mb-6">
            <div className="md:flex md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-medium text-[#1A1815]" style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}>
                  Get full access to Bank Fee Index
                </h2>
                <p className="text-sm text-[#7A7062] mt-1">
                  Unlock fee benchmarks, peer analysis, AI research, data exports, and API access.
                </p>
              </div>
              <a
                href="/subscribe"
                className="mt-4 md:mt-0 inline-flex items-center rounded-md bg-[#C44B2E] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#A83D25] transition-colors flex-shrink-0"
              >
                View Plans
              </a>
            </div>
          </div>
        )}

        {/* Active subscription -- compact */}
        {isPro && (
          <div className="bg-[#FFFDF9] rounded-xl border border-[#E8DFD1] p-5 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-[10px] font-semibold text-[#A69D90] uppercase tracking-wider">
                  Plan
                </div>
                <span className="text-sm font-medium text-[#1A1815]">Seat License</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-600 uppercase">
                  Active
                </span>
                {user.subscription_status === "past_due" && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-600 uppercase">
                    Past Due
                  </span>
                )}
              </div>
              {user.stripe_customer_id && <ManageBillingButton />}
            </div>
          </div>
        )}

        {/* Profile */}
        <div className="mb-6">
          <ProfileForm user={user} />
        </div>

        {/* Quick Actions */}
        <div className="mb-6">
          <div className="text-[10px] font-semibold text-[#A69D90] uppercase tracking-wider mb-3">
            Quick Actions
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {quickActions.map((action) => (
              <a
                key={action.label}
                href={action.href}
                className={`bg-[#FFFDF9] rounded-xl border p-4 transition-colors group no-underline ${
                  action.premium && !isPro
                    ? "border-[#E8DFD1] opacity-75"
                    : "border-[#E8DFD1] hover:border-[#C44B2E]"
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" className={`h-5 w-5 mb-2 ${action.premium && !isPro ? "text-[#A69D90]" : "text-[#C44B2E]"}`} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d={action.icon} />
                </svg>
                <div className="text-sm font-medium text-[#1A1815] group-hover:text-[#C44B2E] transition-colors">
                  {action.label}
                  {action.premium && !isPro && <PremiumBadge />}
                </div>
                <div className="text-xs text-[#A69D90] mt-0.5">{action.description}</div>
              </a>
            ))}
          </div>
        </div>

        {/* API Key -- premium only */}
        <div className="mb-6">
          {canAccessApiKey(user) ? (
            <ApiKeySection
              existingKeyPrefix={apiKey?.key_prefix || null}
              callCount={apiKey?.call_count || 0}
              monthlyLimit={apiKey?.monthly_limit || 5000}
            />
          ) : (
            <div className="bg-[#FFFDF9] rounded-xl border border-[#E8DFD1] p-5">
              <div className="text-[10px] font-semibold text-[#A69D90] uppercase tracking-wider mb-3">
                API Access
              </div>
              <p className="text-sm text-[#7A7062] mb-3">
                Programmatic access to fee data is available with a Seat License.
              </p>
              <a
                href="/subscribe"
                className="inline-flex items-center rounded-md border border-[#D5CBBF] px-4 py-2 text-xs font-medium text-[#1A1815] hover:border-[#1A1815] transition-colors"
              >
                View Plans
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
