import Link from "next/link";

export function UpgradePrompt({
  feature,
  remaining,
  limit,
}: {
  feature: string;
  remaining?: number;
  limit?: number;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-6 py-5">
      <h3 className="text-sm font-semibold text-amber-900">
        {remaining !== undefined && limit !== undefined
          ? `${remaining} of ${limit} free ${feature} remaining this period`
          : `Unlock ${feature}`}
      </h3>
      <p className="mt-1 text-sm text-amber-700">
        Upgrade to Starter for unlimited access to {feature}, plus CSV/PDF
        exports, fee change alerts, and API access.
      </p>
      <div className="mt-3 flex gap-3">
        <Link
          href="/pricing"
          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
        >
          View plans — $500/year
        </Link>
        <Link
          href="/signup"
          className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
        >
          Create free account
        </Link>
      </div>
    </div>
  );
}

export function SoftPaywall({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="max-h-[400px] overflow-hidden">
        {children}
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/95 to-transparent pt-24 pb-2">
        <div className="mx-auto max-w-md text-center">
          <p className="text-sm font-medium text-slate-900">
            Continue reading with Bank Fee Index
          </p>
          <p className="mt-1 text-xs text-slate-500">
            You&apos;ve reached your free article limit this month
          </p>
          <div className="mt-3 flex justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
            >
              Subscribe — $500/year
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
