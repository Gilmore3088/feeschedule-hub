import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { redirect } from "next/navigation";
import { ManageBillingButton } from "./manage-billing-button";
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
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-lg">
        {params.success && (
          <div className="mb-6 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3">
            Your Pro subscription is now active!
          </div>
        )}

        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-6">
          Account
        </h1>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm divide-y divide-gray-100">
          <div className="p-5">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Name
            </div>
            <div className="text-sm text-gray-900">{user.display_name}</div>
          </div>

          <div className="p-5">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Email
            </div>
            <div className="text-sm text-gray-900">
              {user.email || user.username}
            </div>
          </div>

          <div className="p-5">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Plan
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                {isPro ? "Pro" : "Free"}
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
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500 uppercase tracking-wider">
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
                className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
              >
                Upgrade to Pro
              </a>
            ) : null}
          </div>
        </div>

        <div className="mt-6 text-center">
          <a
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Back to home
          </a>
        </div>
      </div>
    </div>
  );
}
