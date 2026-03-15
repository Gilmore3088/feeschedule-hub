import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Fee Insight - Professional Platform",
    template: "%s | Fee Insight Pro",
  },
};

const NAV_ITEMS = [
  { label: "National Index", href: "/research/national-fee-index" },
  { label: "Research", href: "/research" },
  { label: "State Reports", href: "/research" },
  { label: "API", href: "/api-docs" },
];

export default function ProLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#080B14]">
      {/* Professional navigation - dark, technical */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#080B14]/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="flex items-center gap-2 text-white/80 no-underline"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-[18px] w-[18px] text-blue-400"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="4" y="13" width="4" height="8" rx="1" />
                <rect x="10" y="8" width="4" height="13" rx="1" />
                <rect x="16" y="3" width="4" height="18" rx="1" />
              </svg>
              <span
                className="text-[15px] font-medium tracking-tight"
                style={{
                  fontFamily: "var(--font-jetbrains), monospace",
                }}
              >
                FI
              </span>
              <span className="ml-1 rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-400">
                Pro
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-6">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  className="text-[13px] text-slate-500 hover:text-slate-200 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/consumer"
              className="text-[12px] text-slate-600 hover:text-slate-400 transition-colors"
            >
              Consumer Site
            </Link>
            <Link
              href="/admin/login"
              className="rounded border border-blue-500/30 bg-blue-500/10 px-3.5 py-1.5 text-[12px] font-medium text-blue-300 hover:bg-blue-500/20 transition-colors no-underline"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      <main>{children}</main>

      {/* Professional footer - minimal, dark */}
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p
                className="text-sm font-medium text-white/70"
                style={{
                  fontFamily: "var(--font-jetbrains), monospace",
                }}
              >
                Fee Insight
              </p>
              <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-slate-600">
                Institutional-grade fee benchmarking derived from public sources.
                Not affiliated with the Federal Reserve or any regulatory
                authority.
              </p>
            </div>
            <div className="flex gap-8 text-[13px] text-slate-600">
              <div>
                <p className="font-semibold text-slate-400">Platform</p>
                <ul className="mt-2 space-y-1.5">
                  <li>
                    <Link
                      href="/research/national-fee-index"
                      className="hover:text-slate-300 transition-colors"
                    >
                      National Index
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/research"
                      className="hover:text-slate-300 transition-colors"
                    >
                      Research
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/api-docs"
                      className="hover:text-slate-300 transition-colors"
                    >
                      API
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-400">Access</p>
                <ul className="mt-2 space-y-1.5">
                  <li>
                    <Link
                      href="/admin/login"
                      className="hover:text-slate-300 transition-colors"
                    >
                      Sign In
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/waitlist"
                      className="hover:text-slate-300 transition-colors"
                    >
                      Request Access
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8 border-t border-white/[0.04] pt-6 text-[11px] text-slate-700">
            Data from FDIC Call Reports, NCUA 5300 Reports, and published fee
            schedules.
          </div>
        </div>
      </footer>
    </div>
  );
}
