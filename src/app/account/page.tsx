import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { redirect } from "next/navigation";
import { ManageBillingButton } from "./manage-billing-button";
import { LogoutButton } from "./logout-button";
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
  const isPro = canAccessPremium(user);

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <header className="border-b border-[#E8DFD1] bg-[#FAF7F2]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-4 flex items-center justify-between h-14">
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

      <div className="mx-auto max-w-2xl px-4 py-10">
        {params.success && (
          <div className="mb-6 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3">
            Your subscription is now active!
          </div>
        )}

        <h1
          className="text-2xl font-normal tracking-tight text-[#1A1815] mb-8"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Account
        </h1>

        <div className="bg-[#FFFDF9] rounded-xl border border-[#E8DFD1] divide-y divide-[#E8DFD1]">
          <div className="p-5">
            <div className="text-[10px] font-semibold text-[#A69D90] uppercase tracking-wider mb-1">
              Name
            </div>
            <div className="text-sm text-[#1A1815]">{user.display_name}</div>
          </div>

          <div className="p-5">
            <div className="text-[10px] font-semibold text-[#A69D90] uppercase tracking-wider mb-1">
              Email
            </div>
            <div className="text-sm text-[#1A1815]">
              {user.email || user.username}
            </div>
          </div>

          <div className="p-5">
            <div className="text-[10px] font-semibold text-[#A69D90] uppercase tracking-wider mb-1">
              Plan
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[#1A1815]">
                {isPro ? "Seat License" : "No active plan"}
              </span>
              {isPro && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-600 uppercase tracking-wider">
                  Active
                </span>
              )}
              {user.subscription_status === "past_due" && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-600 uppercase tracking-wider">
                  Past Due
                </span>
              )}
              {user.subscription_status === "canceled" && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-[#7A7062] uppercase tracking-wider">
                  Canceled
                </span>
              )}
            </div>
          </div>

          <div className="p-5">
            {user.stripe_customer_id ? (
              <ManageBillingButton />
            ) : !isPro ? (
              <a
                href="/subscribe"
                className="inline-flex items-center rounded-md bg-[#C44B2E] px-4 py-2 text-sm font-medium text-white hover:bg-[#A83D25] transition-colors"
              >
                View Plans
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
