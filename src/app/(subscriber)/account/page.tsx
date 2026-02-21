import type { Metadata } from "next";
import { requireSubscriber } from "@/lib/subscriber-auth";
import { getActiveSubscription, getApiKeysByOrg } from "@/lib/subscriber-db";
import { AccountActions } from "./account-actions";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your Bank Fee Index subscription and API keys",
};

export default async function AccountPage() {
  const session = await requireSubscriber();
  const subscription = getActiveSubscription(session.organizationId);
  const apiKeys = getApiKeysByOrg(session.organizationId);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Account
      </h1>
      <p className="mt-1 text-sm text-slate-500">{session.orgName}</p>

      {/* Subscription Status */}
      <section className="mt-8 rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Subscription
        </h2>
        {subscription ? (
          <div className="mt-3">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-slate-900 capitalize">
                {subscription.plan} Plan
              </span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                {subscription.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Renews{" "}
              {new Date(subscription.current_period_end).toLocaleDateString(
                "en-US",
                { month: "long", day: "numeric", year: "numeric" }
              )}
            </p>
            {subscription.cancel_at_period_end === 1 && (
              <p className="mt-1 text-sm text-amber-600">
                Cancels at end of billing period
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-slate-600">No active subscription</p>
            <a
              href="/pricing"
              className="mt-2 inline-block text-sm font-medium text-slate-900 hover:underline"
            >
              View plans
            </a>
          </div>
        )}
      </section>

      {/* Account Details */}
      <section className="mt-6 rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Account Details
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium text-slate-900">{session.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Organization</dt>
            <dd className="font-medium text-slate-900">{session.orgName}</dd>
          </div>
        </dl>
      </section>

      {/* API Keys (subscribers only) */}
      {subscription && (
        <section className="mt-6 rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            API Keys
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Use API keys to access the Bank Fee Index API programmatically
          </p>

          {apiKeys.length > 0 && (
            <div className="mt-4 space-y-2">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between rounded border border-slate-100 px-3 py-2"
                >
                  <div>
                    <span className="text-sm font-medium text-slate-900">
                      {key.name}
                    </span>
                    <span className="ml-2 font-mono text-xs text-slate-400">
                      {key.key_prefix}...
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {key.last_used_at
                      ? `Used ${new Date(key.last_used_at).toLocaleDateString()}`
                      : "Never used"}
                  </span>
                </div>
              ))}
            </div>
          )}

          <AccountActions
            hasSubscription={!!subscription}
            apiKeyCount={apiKeys.length}
          />
        </section>
      )}

      {/* Billing & Logout */}
      <AccountActions
        hasSubscription={!!subscription}
        apiKeyCount={apiKeys.length}
        showBilling
      />
    </div>
  );
}
