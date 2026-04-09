import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { ensureHamiltonProTables } from "@/lib/hamilton/pro-tables";

export const metadata: Metadata = {
  title: {
    default: "Hamilton | Bank Fee Index",
    template: "%s | Hamilton",
  },
};

export default function HamiltonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <HamiltonLayoutInner>{children}</HamiltonLayoutInner>
    </Suspense>
  );
}

async function HamiltonLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    // DB not available or session expired
  }

  if (!user || !canAccessPremium(user)) {
    return (
      <div className="hamilton-shell min-h-screen">
        <HamiltonUpgradeGate />
      </div>
    );
  }

  // Fire-and-forget: ensure Hamilton Pro tables exist (non-blocking per D-15)
  ensureHamiltonProTables().catch(() => {});

  const isAdmin = user.role === "admin" || user.role === "analyst";
  const institutionContext = {
    name: user.institution_name,
    type: user.institution_type,
    assetTier: user.asset_tier,
  };

  return (
    <div className="hamilton-shell min-h-screen" data-institution={institutionContext.name ?? undefined}>
      {isAdmin && (
        <div className="bg-gray-900 text-white text-xs px-4 py-1.5 flex items-center justify-between">
          <span className="text-gray-400">Admin Mode — viewing Hamilton Pro</span>
          <Link href="/admin" className="text-blue-400 hover:text-blue-300 font-medium">
            Back to Admin
          </Link>
        </div>
      )}
      {/* HamiltonTopNav, HamiltonContextBar, HamiltonLeftRail — wired in Plan 02 */}
      <main>{children}</main>
    </div>
  );
}

function HamiltonUpgradeGate() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1
          className="text-3xl font-bold text-[#1A1815]"
          style={{ fontFamily: "var(--hamilton-font-serif)" }}
        >
          Hamilton
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#5A5347]">
          Fee intelligence for financial executives.
        </p>
        <p className="mt-6 text-[13px] text-[#7A7062]">
          $500/mo or $5,000/yr
        </p>
        <Link
          href="/subscribe?plan=hamilton"
          className="mt-8 inline-flex items-center rounded-md bg-[#1A1815] px-6 py-3 text-[13px] font-semibold text-white hover:bg-[#333] transition-colors no-underline"
        >
          Upgrade to Hamilton
        </Link>
      </div>
    </div>
  );
}
