import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { derivePersonalizationContext } from "@/lib/personalization";
import { ProNav } from "@/components/pro-nav";
import { ProMobileNav } from "@/components/pro-mobile-nav";
import { CustomerFooter } from "@/components/customer-footer";
import { SearchModal } from "@/components/public/search-modal";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Research | Bank Fee Index",
    template: "%s | Bank Fee Index",
  },
};

export default function ProLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <ProLayoutInner>{children}</ProLayoutInner>
    </Suspense>
  );
}

async function ProLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get current user
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    // DB not available or session expired
  }

  // Redirect unauthenticated users to login
  if (!user) {
    redirect("/login");
  }

  // Redirect non-premium users to subscribe
  if (!canAccessPremium(user)) {
    redirect("/subscribe");
  }

  // Derive personalization context from user profile
  const personalization = derivePersonalizationContext(user);

  // Prepare user props for nav components
  const userProps = {
    displayName: user.display_name,
    institutionName: user.institution_name,
    initial: (user.institution_name?.[0] || user.display_name?.[0] || "U").toUpperCase(),
  };

  const isAdmin = user.role === "admin" || user.role === "analyst";

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {isAdmin && (
        <div className="bg-gray-900 text-white text-xs px-4 py-1.5 flex items-center justify-between">
          <span className="text-gray-400">Viewing as admin — this is the pro subscriber view</span>
          <Link href="/admin" className="text-blue-400 hover:text-blue-300 font-medium">
            Back to Admin
          </Link>
        </div>
      )}
      <ProNav user={userProps} personalization={personalization} />
      <ProMobileNav user={userProps} personalization={personalization} />
      <main>{children}</main>
      <CustomerFooter />
      <SearchModal />
    </div>
  );
}
