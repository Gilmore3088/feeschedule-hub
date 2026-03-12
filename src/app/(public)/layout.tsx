import Link from "next/link";

const NAV_ITEMS = [
  { label: "Fee Index", href: "/fees" },
  { label: "Research", href: "/research" },
  { label: "Districts", href: "/districts" },
];

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-slate-900">
              Bank Fee Index
            </span>
          </Link>
          <nav className="flex items-center gap-6">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[13px] font-medium text-slate-500 hover:text-slate-900 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Bank Fee Index
              </p>
              <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-slate-500">
                Independent benchmarking data on bank and credit union fees
                across the United States. Data sourced from published fee
                schedules, FDIC Call Reports, and NCUA 5300 Reports.
              </p>
            </div>
            <div className="flex gap-10 text-[13px]">
              <div>
                <p className="font-semibold text-slate-700">Research</p>
                <ul className="mt-2 space-y-1.5 text-slate-500">
                  <li>
                    <Link href="/fees" className="hover:text-slate-900 transition-colors">
                      Fee Index
                    </Link>
                  </li>
                  <li>
                    <Link href="/research" className="hover:text-slate-900 transition-colors">
                      Reports
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-700">About</p>
                <ul className="mt-2 space-y-1.5 text-slate-500">
                  <li>
                    <Link href="/methodology" className="hover:text-slate-900 transition-colors">
                      Methodology
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8 border-t border-slate-200 pt-6 text-[11px] text-slate-400">
            Data from FDIC Call Reports, NCUA 5300 Reports, and published fee
            schedules. Not financial advice.
          </div>
        </div>
      </footer>
    </div>
  );
}
