import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser, type User } from "@/lib/auth";
import { LogoutButton } from "./logout-button";
import { AdminNav, AdminNavInline } from "./admin-nav";
import {
  CommandPalette,
  CommandPaletteTrigger,
} from "@/components/command-palette";
import { DarkModeToggle } from "@/components/dark-mode-toggle";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </Suspense>
  );
}

async function AdminLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  let user: User | null = null;
  try {
    user = await getCurrentUser();
  } catch {
    // DB not available or session expired
  }

  if (!user) {
    return <>{children}</>;
  }

  // Only admin and analyst roles can access the admin panel
  if (user.role !== "admin" && user.role !== "analyst") {
    const { redirect } = await import("next/navigation");
    redirect("/account");
  }

  const roleBadgeColor =
    user.role === "admin"
      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
      : user.role === "analyst"
        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
        : "bg-gray-500/10 text-gray-500 dark:text-gray-400";

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-[oklch(0.13_0_0)]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-[oklch(0.16_0_0)]/90 backdrop-blur-xl border-b border-black/[0.04] dark:border-white/[0.05]">
        <div className="flex items-center justify-between h-11 px-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-[18px] w-[18px] text-[#C44B2E]"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="13" width="4" height="8" rx="1" />
                <rect x="10" y="8" width="4" height="13" rx="1" />
                <rect x="16" y="3" width="4" height="18" rx="1" />
              </svg>
              <span className="text-[13px] font-extrabold tracking-tight text-gray-900 dark:text-gray-100 hidden sm:inline">
                Bank Fee Index
              </span>
            </Link>
            <AdminNavInline />
          </div>

          <div className="flex items-center gap-1.5">
            <CommandPaletteTrigger />
            <DarkModeToggle />
            <div className="hidden sm:block h-3.5 w-px bg-gray-200/80 dark:bg-white/[0.06] mx-1" />
            <div className="hidden sm:flex items-center gap-2">
              <div className="text-right">
                <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 leading-none">
                  {user.display_name}
                </p>
                <span
                  className={`inline-block rounded-full px-1.5 py-px text-[9px] font-bold mt-0.5 ${roleBadgeColor}`}
                >
                  {user.role}
                </span>
              </div>
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-[180px] shrink-0 sticky top-11 h-[calc(100vh-2.75rem)] border-r border-black/[0.04] dark:border-white/[0.04] bg-white/60 dark:bg-[oklch(0.15_0_0)]/60 backdrop-blur-sm overflow-y-auto">
          <div className="flex-1 py-2.5">
            <AdminNav />
          </div>
          <div className="border-t border-black/[0.04] dark:border-white/[0.04] px-3 py-2.5">
            <Link
              href="/"
              className="flex items-center gap-2 text-[11px] text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors font-medium"
            >
              <svg
                className="w-3 h-3"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              >
                <path d="M6 12H3.5a1 1 0 01-1-1V5a1 1 0 011-1H6M10.5 12l3.5-4-3.5-4M6.5 8h7" />
              </svg>
              Public site
            </Link>
          </div>
        </aside>

        {/* Main content */}
        <main className="admin-content flex-1 min-w-0 px-5 py-5 lg:px-7">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}
