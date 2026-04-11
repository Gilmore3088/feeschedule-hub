import { Suspense } from "react";
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

  // Auth verified — children render their own nav
  // Hamilton routes: (hamilton)/layout.tsx handles HamiltonShell + TopNav
  // Legacy routes: render with minimal wrapper
  return <>{children}</>;
}
