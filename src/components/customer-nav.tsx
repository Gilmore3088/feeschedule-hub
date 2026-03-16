import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

const NAV_ITEMS = [
  { label: "Institutions", href: "/institutions" },
  { label: "Fee Benchmarks", href: "/fees" },
  { label: "Research", href: "/research" },
  { label: "Guides", href: "/guides" },
  { label: "Pricing", href: "/subscribe" },
];

export async function CustomerNav() {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    // Not logged in or DB unavailable
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[#E8DFD1] bg-[#FAF7F2]/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <Link
              href={user ? "/account" : "/"}
              className="flex items-center gap-2 text-[#1A1815] no-underline"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-[18px] w-[18px] text-[#C44B2E]"
                stroke="currentColor"
                strokeWidth="1.5"
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
            <nav className="hidden md:flex items-center gap-6">
              {NAV_ITEMS.map((item) => (
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
          <div className="flex items-center gap-4">
            {user ? (
              <Link
                href="/account"
                className="text-[13px] font-medium text-[#7A7062] hover:text-[#1A1815] transition-colors"
              >
                Account
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
        </div>
      </div>
    </header>
  );
}
