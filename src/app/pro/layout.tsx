import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Research | Bank Fee Index",
    template: "%s | Bank Fee Index",
  },
};

const NAV_ITEMS = [
  { label: "Dashboard", href: "/account" },
  { label: "Fee Benchmarks", href: "/fees" },
  { label: "National Index", href: "/research/national-fee-index" },
  { label: "Research", href: "/research" },
];

export default function ProLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <header className="sticky top-0 z-40 border-b border-[#E8DFD1] bg-[#FAF7F2]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <Link
              href="/account"
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
            <Link
              href="/account"
              className="text-[13px] font-medium text-[#7A7062] hover:text-[#1A1815] transition-colors"
            >
              Account
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>

      <footer className="border-t border-[#E8DFD1]">
        <div className="mx-auto max-w-7xl px-6 py-6 text-center text-xs text-[#A69D90]">
          Bank Fee Index &mdash; Fee Insight Research &mdash; hello@bankfeeindex.com
        </div>
      </footer>
    </div>
  );
}
