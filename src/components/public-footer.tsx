import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div>
            <Link href="/" className="flex items-center gap-2">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-5 w-5 text-amber-500"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M3 17l4-8 4 5 4-10 6 13" />
              </svg>
              <span className="text-[15px] font-semibold tracking-tight text-slate-900">
                Bank Fee Index
              </span>
            </Link>
            <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
              The national benchmark for retail banking fees across U.S. banks
              and credit unions.
            </p>
          </div>

          {/* Data */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Data
            </h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link
                  href="/fees"
                  className="text-[13px] text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Fee Index
                </Link>
              </li>
              <li>
                <Link
                  href="/districts"
                  className="text-[13px] text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Fed Districts
                </Link>
              </li>
              <li>
                <Link
                  href="/check"
                  className="text-[13px] text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Fee Checker
                </Link>
              </li>
            </ul>
          </div>

          {/* Research */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Research
            </h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link
                  href="/research"
                  className="text-[13px] text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Analysis & Reports
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              About
            </h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link
                  href="/about"
                  className="text-[13px] text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Methodology
                </Link>
              </li>
              <li>
                <Link
                  href="/admin/login"
                  className="text-[13px] text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Institution Login
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Disclaimers */}
        <div className="mt-10 border-t border-slate-200 pt-6">
          <p className="text-[11px] leading-relaxed text-slate-400">
            Fee data sourced from publicly available fee schedule documents
            collected from U.S. banks and credit unions. This analysis covers
            institutions from which fee data was successfully extracted and may
            not be representative of the full market. Content is for
            informational purposes only and does not constitute financial advice
            or a recommendation regarding any specific institution. Fee amounts
            reflect disclosed fee schedules and may not reflect promotional
            rates, relationship pricing, or waived fees.
          </p>
          <p className="mt-4 text-[11px] text-slate-400">
            &copy; {new Date().getFullYear()} Bank Fee Index. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
