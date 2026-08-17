import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { HAMILTON_NAV } from "@/lib/hamilton/navigation";
import { ConsumerMobileNav } from "./consumer-mobile-nav";
import { SearchTrigger } from "./search-trigger";
import { PRODUCT_NAME, SITE_NAME } from "@/lib/constants";

export const PUBLIC_NAV_ITEMS = [
  { label: "Find Your Institution", href: "/institutions" },
  { label: PRODUCT_NAME, href: "/fees" },
  { label: "Research", href: "/research" },
  { label: "Guides", href: "/guides" },
  { label: "For Institutions", href: "/for-institutions" },
] as const;

export const PRO_NAV_ITEMS = HAMILTON_NAV.filter((item) => item.label !== "Admin");

/** The one nav pill for signed-out visitors: the money path, not a vague "Pro". */
export const REQUEST_REPORT_NAV = { label: "Request your report", href: "/for-institutions#report" } as const;

/**
 * The single public site header. Signed-out and free users see the public
 * items; Pro users see the Hamilton workspace items with a Pro badge.
 */
export async function ConsumerNav() {
  let user = null;
  let isPro = false;
  try {
    user = await getCurrentUser();
    if (user) isPro = canAccessPremium(user);
  } catch {
    // Not logged in or DB unavailable
  }

  const navItems = isPro
    ? PRO_NAV_ITEMS
    : [...PUBLIC_NAV_ITEMS, ...(user ? [] : [{ label: "Pricing", href: "/subscribe" }])];

  const userInitial = user
    ? (user.institution_name?.[0] || user.email?.[0] || user.username?.[0] || "U").toUpperCase()
    : null;

  return (
    <header className="sticky top-0 z-40 border-b border-[#E8DFD1] bg-[#FAF7F2]/95 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link
              href={user ? "/account" : "/"}
              className="flex items-center gap-2 text-[#1A1815] no-underline"
              aria-label="Fee Insight home"
            >
              <BrandMark className="h-[18px] w-[18px] text-[#C44B2E]" />
              <span
                className="text-[15px] font-medium tracking-tight"
                style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
              >
                {SITE_NAME}
              </span>
              {isPro && (
                <span className="inline-flex items-center rounded bg-[#C44B2E]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#A93D25]">
                  Pro
                </span>
              )}
            </Link>
            <nav className="hidden items-center gap-5 lg:flex" aria-label="Main navigation">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-[13px] font-medium text-[#6B6255] transition-colors hover:text-[#1A1815]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <SearchTrigger />
            <div className="hidden lg:block">
              {user ? (
                <Link
                  href="/account"
                  className="flex items-center gap-2 text-[13px] font-medium text-[#6B6255] transition-colors hover:text-[#1A1815]"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1A1815] text-[10px] font-bold text-white">
                    {userInitial}
                  </span>
                  <span className="hidden lg:inline">Account</span>
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="mr-2 text-[13px] font-medium text-[#6B6255] transition-colors hover:text-[#1A1815]"
                  >
                    Sign in
                  </Link>
                  <Link
                    href={REQUEST_REPORT_NAV.href}
                    className="inline-flex items-center rounded-md bg-[#C44B2E] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#A93D25]"
                  >
                    {REQUEST_REPORT_NAV.label}
                  </Link>
                </>
              )}
            </div>
            <ConsumerMobileNav isLoggedIn={!!user} isPro={isPro} />
          </div>
        </div>
      </div>
    </header>
  );
}

function BrandMark({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="4" y="13" width="4" height="8" rx="1" />
      <rect x="10" y="8" width="4" height="13" rx="1" />
      <rect x="16" y="3" width="4" height="18" rx="1" />
    </svg>
  );
}
