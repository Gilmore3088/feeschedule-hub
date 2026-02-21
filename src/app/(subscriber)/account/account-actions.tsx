"use client";

import { useState, useTransition } from "react";
import {
  logoutAction,
  startCheckoutAction,
  openBillingPortalAction,
  createApiKeyAction,
} from "../actions";

export function AccountActions({
  hasSubscription,
  apiKeyCount,
  showBilling,
}: {
  hasSubscription: boolean;
  apiKeyCount: number;
  showBilling?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (showBilling) {
    return (
      <div className="mt-8 flex gap-3">
        {hasSubscription && (
          <button
            onClick={() => {
              startTransition(async () => {
                const result = await openBillingPortalAction();
                if (result.url) window.location.href = result.url;
                if (result.error) setError(result.error);
              });
            }}
            disabled={isPending}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Manage Billing
          </button>
        )}
        {!hasSubscription && (
          <button
            onClick={() => {
              startTransition(async () => {
                const result = await startCheckoutAction();
                if (result.url) window.location.href = result.url;
                if (result.error) setError(result.error);
              });
            }}
            disabled={isPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Subscribe - $500/year
          </button>
        )}
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
          >
            Sign out
          </button>
        </form>
        {error && (
          <p className="self-center text-sm text-red-600">{error}</p>
        )}
      </div>
    );
  }

  // API key creation
  return (
    <div className="mt-4">
      {newKey && (
        <div className="mb-3 rounded-md bg-emerald-50 px-4 py-3 text-sm">
          <p className="font-medium text-emerald-800">
            API key created. Copy it now — it won&apos;t be shown again.
          </p>
          <code className="mt-1 block break-all font-mono text-xs text-emerald-700">
            {newKey}
          </code>
        </div>
      )}
      {apiKeyCount < 3 && (
        <button
          onClick={() => {
            startTransition(async () => {
              setError(null);
              setNewKey(null);
              const result = await createApiKeyAction("API Key " + (apiKeyCount + 1));
              if (result.key) setNewKey(result.key);
              if (result.error) setError(result.error);
            });
          }}
          disabled={isPending}
          className="text-sm font-medium text-slate-900 hover:underline disabled:opacity-50"
        >
          {isPending ? "Creating..." : "+ Create API key"}
        </button>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
