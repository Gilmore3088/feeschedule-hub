import Link from "next/link";
import { NavAccount } from "./nav-account";
import { ConsumerMobileNav } from "./consumer-mobile-nav";
import { SearchTrigger } from "./search-trigger";

/**
 * Reads no session on the server, so pages under the public layout can be prerendered.
 * The account corner is a client island; see `nav-account.tsx`.
 */
export function ConsumerNav() {

  const navItems = [
    { label: "Find Your Institution", href: "/institutions" },
    { label: "Fee Benchmarks", href: "/fees" },
    { label: "Research", href: "/research" },
    { label: "Guides", href: "/guides" },
    { label: "Pricing", href: "/subscribe" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[#E8DFD1] bg-[#FAF7F2]/95">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <Link
              href="/"
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
              <NavAccount />
            </div>
            <ConsumerMobileNav />
          </div>
        </div>
      </div>
    </header>
  );
}
