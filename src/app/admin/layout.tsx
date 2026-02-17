import Link from "next/link";
import { getCurrentUser, type User } from "@/lib/auth";
import { LogoutButton } from "./logout-button";
import { AdminNav } from "./admin-nav";
import { CommandPalette, CommandPaletteTrigger } from "@/components/command-palette";

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
      ? "bg-purple-100 text-purple-700"
      : user.role === "analyst"
        ? "bg-blue-100 text-blue-700"
        : "bg-gray-100 text-gray-600";

  return (
    <div className="min-h-screen bg-gray-50/50">
      <header className="border-b bg-white sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-5">
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
              <span className="text-[15px] font-bold tracking-tight text-gray-900">
                Bank Fee Index
              </span>
            </Link>
            <AdminNav />
          </div>
          <div className="flex items-center gap-3">
            <CommandPaletteTrigger />
            <div className="text-right">
              <p className="text-xs font-medium text-gray-600">
                {user.display_name}
              </p>
              <span
                className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${roleBadgeColor}`}
              >
                {user.role}
              </span>
            </div>
            <LogoutButton />
            <Link
              href="/"
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Site
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      <CommandPalette />
    </div>
  );
}
