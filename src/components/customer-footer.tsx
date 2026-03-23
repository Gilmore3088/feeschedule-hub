import Link from "next/link";
import { EmailSignup } from "./public/email-signup";

export function CustomerFooter() {
  return (
    <footer className="border-t border-[#E8DFD1] mt-12 bg-white/40">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand + email */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 no-underline">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-[16px] w-[16px] text-[#C44B2E]"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <rect x="4" y="13" width="4" height="8" rx="1" />
                <rect x="10" y="8" width="4" height="13" rx="1" />
                <rect x="16" y="3" width="4" height="18" rx="1" />
              </svg>
              <span
                className="text-[14px] font-medium tracking-tight text-[#1A1815]"
                style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
              >
                Bank Fee Index
              </span>
            </Link>
            <p className="mt-3 text-[12px] leading-relaxed text-[#A09788] max-w-xs">
              The definitive source for US bank and credit union fee
              intelligence. Data-driven benchmarks for consumers and
              professionals.
            </p>
            <div className="mt-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] mb-2">
                Stay informed
              </p>
              <EmailSignup />
            </div>
          </div>

          {/* Product */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] mb-3">
              Product
            </p>
            <ul className="space-y-2 text-[13px]">
              <li>
                <Link href="/fees" className="text-[#7A7062] hover:text-[#1A1815] transition-colors">
                  Fee Index
                </Link>
              </li>
              <li>
                <Link href="/institutions" className="text-[#7A7062] hover:text-[#1A1815] transition-colors">
                  Find Your Institution
                </Link>
              </li>
              <li>
                <Link href="/research" className="text-[#7A7062] hover:text-[#1A1815] transition-colors">
                  Research Hub
                </Link>
              </li>
              <li>
                <Link href="/guides" className="text-[#7A7062] hover:text-[#1A1815] transition-colors">
                  Consumer Guides
                </Link>
              </li>
              <li>
                <Link href="/subscribe" className="text-[#7A7062] hover:text-[#1A1815] transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/api-docs" className="text-[#7A7062] hover:text-[#1A1815] transition-colors">
                  API
                </Link>
              </li>
            </ul>
          </div>

          {/* Research */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] mb-3">
              Research
            </p>
            <ul className="space-y-2 text-[13px]">
              <li>
                <Link href="/research/national-fee-index" className="text-[#7A7062] hover:text-[#1A1815] transition-colors">
                  National Fee Index
                </Link>
              </li>
              <li>
                <Link href="/research/fee-revenue-analysis" className="text-[#7A7062] hover:text-[#1A1815] transition-colors">
                  Fee-to-Revenue Analysis
                </Link>
              </li>
              <li>
                <Link href="/research" className="text-[#7A7062] hover:text-[#1A1815] transition-colors">
                  State Reports
                </Link>
              </li>
              <li>
                <Link href="/research#districts" className="text-[#7A7062] hover:text-[#1A1815] transition-colors">
                  District Reports
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A09788] mb-3">
              Company
            </p>
            <ul className="space-y-2 text-[13px]">
              <li>
                <Link href="/about" className="text-[#7A7062] hover:text-[#1A1815] transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-[#7A7062] hover:text-[#1A1815] transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-[#7A7062] hover:text-[#1A1815] transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-[#7A7062] hover:text-[#1A1815] transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 pt-6 border-t border-[#E8DFD1]/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-[#B0A89C]">
          <span>Bank Fee Index &copy; {new Date().getFullYear()}</span>
          <span>
            hello@bankfeeindex.com
          </span>
        </div>
      </div>
    </footer>
  );
}
