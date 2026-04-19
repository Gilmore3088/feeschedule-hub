import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Hamilton | Bank Fee Index",
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
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    // DB not available or session expired
  }

  if (!user) {
    redirect("/login");
  }

  if (!canAccessPremium(user)) {
    redirect("/subscribe");
  }

  // Admins jumping from /admin → /pro lose their admin shell entirely.
  // Surface a slim "Back to Admin" banner so context is preserved without
  // overriding the Pro-tier nav that subscribers expect.
  const isAdmin = user.role === "admin" || user.role === "analyst";

  return (
    <>
      {isAdmin && (
        <div className="bg-gray-900 text-white text-xs px-4 py-1.5 flex items-center justify-between">
          <span className="text-gray-400">
            Viewing as {user.role} — this is the Pro subscriber view
          </span>
          <Link
            href="/admin"
            className="text-blue-400 hover:text-blue-300 font-medium"
          >
            Back to Admin
          </Link>
        </div>
      )}
      {children}
    </>
  );
}
