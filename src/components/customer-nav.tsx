import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { MobileNav } from "./mobile-nav";
import { SearchTrigger } from "./search-trigger";

export async function CustomerNav() {
  let user = null;
  let isPro = false;
  try {
    user = await getCurrentUser();
    if (user) isPro = canAccessPremium(user);
  } catch {
    // Not logged in or DB unavailable
  }

  const navItems = isPro
    ? [
        { label: "Dashboard", href: "/pro" },
        { label: "Market", href: "/pro/market" },
        { label: "Peers", href: "/pro/peers" },
        { label: "Categories", href: "/pro/categories" },
        { label: "Districts", href: "/pro/districts" },
        { label: "Data", href: "/pro/data" },
        { label: "Wire", href: "/pro/news" },
        { label: "AI Research", href: "/pro/research" },
      ]
    : [
        { label: "Find Your Institution", href: "/institutions" },
        { label: "Fee Benchmarks", href: "/fees" },
        { label: "Research", href: "/research" },
        { label: "Guides", href: "/guides" },
        ...(user ? [] : [{ label: "Pricing", href: "/subscribe" }]),
      ];

  // Get user initial for avatar
  const userInitial = user
    ? (user.institution_name?.[0] || user.email?.[0] || user.username?.[0] || "U").toUpperCase()
    : null;

  return (
    <header className="sticky top-0 z-40 border-b border-[#E8DFD1] bg-[#FAF7F2]/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <Link
              href={user ? "/account" : "/"}
              className="flex items-center gap-2 text-[#1A1815] no-underline"
              aria-label="Bank Fee Index home"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-[18px] w-[18px] text-[#C44B2E]"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <rect x="4" y="13" width="4" height="8" rx="1" />
                <rect x="10" y="8" width="4" height="13" rx="1" />
                <rect x="16" y="3" width="4" height="18" rx="1" />
              </svg>
              <span
                className="text-[15px] font-medium tracking-tight"
                style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
              >
                Bank Fee Index
              </span>
              {isPro && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#C44B2E]/10 text-[#C44B2E] uppercase tracking-wider">
                  Pro
                </span>
              )}
            </Link>
            <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-[13px] font-medium text-[#7A7062] hover:text-[#1A1815] transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <SearchTrigger />
            <div className="hidden md:block">
              {user ? (
                <Link
                  href="/account"
                  className="flex items-center gap-2 text-[13px] font-medium text-[#7A7062] hover:text-[#1A1815] transition-colors"
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1A1815] text-[10px] font-bold text-white"
                  >
                    {userInitial}
                  </span>
                  <span className="hidden lg:inline">Account</span>
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="text-[13px] font-medium text-[#7A7062] hover:text-[#1A1815] transition-colors"
                >
                  Sign in
                </Link>
              )}
            </div>
            <MobileNav isLoggedIn={!!user} isPro={isPro} />
          </div>
        </div>
      </div>
    </header>
  );
}
