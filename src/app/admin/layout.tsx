import Link from "next/link";
import { getCurrentUser, type User } from "@/lib/auth";
import { LogoutButton } from "./logout-button";
import { AdminNav, AdminNavInline } from "./admin-nav";
import { CommandPalette, CommandPaletteTrigger } from "@/components/command-palette";
import { DarkModeToggle } from "@/components/dark-mode-toggle";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user: User | null = null;
  try {
    user = await getCurrentUser();
  } catch {
    // DB not available or session expired - render children (login page)
  }

  // No user = render children directly (login page provides its own layout)
  if (!user) {
    return <>{children}</>;
  }

  const roleBadgeColor =
    user.role === "admin"
      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
      : user.role === "analyst"
        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-[oklch(0.145_0_0)]">
      {/* ─── Top header bar ─── */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-[oklch(0.17_0_0)]/80 backdrop-blur-md border-b border-gray-200/60 dark:border-white/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between h-12 px-4">
          {/* Left: Brand */}
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-5 w-5 text-blue-600"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M3 17l4-8 4 5 4-10 6 13" />
              </svg>
              <span className="text-sm font-bold tracking-tight text-gray-900 dark:text-gray-100 hidden sm:inline">
                Bank Fee Index
              </span>
            </Link>
            {/* Mobile inline nav */}
            <AdminNavInline />
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <CommandPaletteTrigger />
            <DarkModeToggle />
            <div className="hidden sm:block h-4 w-px bg-gray-200 dark:bg-white/[0.08]" />
            <div className="hidden sm:flex items-center gap-2">
              <div className="text-right">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  {user.display_name}
                </p>
                <span
                  className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${roleBadgeColor}`}
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
        {/* ─── Sidebar (desktop) ─── */}
        <aside className="hidden md:flex flex-col w-48 shrink-0 sticky top-12 h-[calc(100vh-3rem)] border-r border-gray-200/60 dark:border-white/[0.06] bg-white/50 dark:bg-[oklch(0.17_0_0)]/50 backdrop-blur-sm overflow-y-auto">
          <div className="flex-1 py-3">
            <AdminNav />
          </div>
          {/* Sidebar footer */}
          <div className="border-t border-gray-200/60 dark:border-white/[0.06] px-4 py-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                <path d="M6 12H3.5a1 1 0 01-1-1V5a1 1 0 011-1H6M10.5 12l3.5-4-3.5-4M6.5 8h7" />
              </svg>
              Public site
            </Link>
          </div>
        </aside>

        {/* ─── Main content ─── */}
        <main className="admin-content flex-1 min-w-0 px-6 py-6 lg:px-8">
          <div className="mx-auto max-w-[1200px]">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}
