import Link from "next/link";
import { getCurrentUser, type User } from "@/lib/auth";
import { LogoutButton } from "./logout-button";

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
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <Link
                href="/admin"
                className="text-xl font-semibold text-gray-900 hover:text-gray-700"
              >
                FeeSchedule Hub Admin
              </Link>
              <p className="text-sm text-gray-500">Crawler dashboard</p>
            </div>
            <nav className="hidden md:flex items-center gap-4 ml-4">
              <Link
                href="/admin"
                className="text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Dashboard
              </Link>
              <Link
                href="/admin/review"
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Review Fees
              </Link>
              <Link
                href="/admin/peers"
                className="text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Peer Groups
              </Link>
              <Link
                href="/admin/fees"
                className="text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                All Fees
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-700">
                {user.display_name}
              </p>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeColor}`}
              >
                {user.role}
              </span>
            </div>
            <LogoutButton />
            <Link
              href="/"
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Site
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
