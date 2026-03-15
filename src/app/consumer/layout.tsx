import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Fee Insight - Compare Your Bank's Fees",
    template: "%s | Fee Insight",
  },
};

const NAV_ITEMS = [
  { label: "Fee Comparison", href: "/fees" },
  { label: "Guides", href: "/guides" },
  { label: "Research", href: "/research" },
];

export default function ConsumerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Consumer navigation - warm, editorial */}
      <header className="sticky top-0 z-40 border-b border-[#E8DFD1] bg-[#FAF7F2]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <Link
              href="/"
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
                style={{
                  fontFamily: "var(--font-newsreader), Georgia, serif",
                }}
              >
                Fee Insight
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
          <Link
            href="/pro"
            className="text-[12px] text-[#A09788] hover:text-[#7A7062] transition-colors"
          >
            For Professionals
          </Link>
        </div>
      </header>

      <main>{children}</main>

      {/* Consumer footer - warm, trustworthy */}
      <footer className="border-t border-[#E8DFD1] bg-[#F5EFE6]">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p
                className="text-sm font-medium text-[#1A1815]"
                style={{
                  fontFamily: "var(--font-newsreader), Georgia, serif",
                }}
              >
                Fee Insight
              </p>
              <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-[#8A8176]">
                Free, independent data on bank and credit union fees. We help
                consumers make informed decisions about their banking
                relationships.
              </p>
            </div>
            <div className="flex gap-8 text-[13px] text-[#8A8176]">
              <div>
                <p className="font-semibold text-[#5A5347]">Explore</p>
                <ul className="mt-2 space-y-1.5">
                  <li>
                    <Link
                      href="/fees"
                      className="hover:text-[#1A1815] transition-colors"
                    >
                      Fee Comparison
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/guides"
                      className="hover:text-[#1A1815] transition-colors"
                    >
                      Guides
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/research"
                      className="hover:text-[#1A1815] transition-colors"
                    >
                      Research
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-[#5A5347]">About</p>
                <ul className="mt-2 space-y-1.5">
                  <li>
                    <Link
                      href="/pro"
                      className="hover:text-[#1A1815] transition-colors"
                    >
                      For Professionals
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8 border-t border-[#E0D7C9] pt-6 text-[11px] text-[#B0A89C]">
            Data sourced from published fee schedules, FDIC Call Reports, and
            NCUA 5300 Reports. Not financial advice.
          </div>
        </div>
      </footer>
    </div>
  );
}
