"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Find Your Institution", href: "/institutions" },
  { label: "Fee Benchmarks", href: "/fees" },
  { label: "Research", href: "/research" },
  { label: "Guides", href: "/guides" },
];

export function ConsumerMobileNav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const displayItems = [
    ...NAV_ITEMS,
    ...(isLoggedIn ? [] : [{ label: "Pricing", href: "/subscribe" }]),
  ];

  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      {/* Hamburger button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-[#5A5347] hover:bg-[#E8DFD1]/40 transition-colors"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
          )}
        </svg>
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[#1A1815]/20 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-72 bg-[#FAF7F2] border-l border-[#E8DFD1] shadow-xl transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Close button */}
        <div className="flex items-center justify-between px-6 h-14 border-b border-[#E8DFD1]">
          <span
            className="text-[14px] font-medium text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Menu
          </span>
          <button
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#7A7062] hover:bg-[#E8DFD1]/40 transition-colors"
            aria-label="Close menu"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <nav className="px-4 py-4" aria-label="Mobile navigation">
          <ul className="space-y-1">
            {displayItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`block rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors ${
                      isActive
                        ? "bg-[#C44B2E]/8 text-[#C44B2E]"
                        : "text-[#5A5347] hover:bg-[#E8DFD1]/40 hover:text-[#1A1815]"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 border-t border-[#E8DFD1] pt-4">
            {isLoggedIn ? (
              <Link
                href="/account"
                className="block rounded-lg px-3 py-2.5 text-[14px] font-medium text-[#5A5347] hover:bg-[#E8DFD1]/40 hover:text-[#1A1815] transition-colors"
              >
                Account
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="block rounded-lg px-3 py-2.5 text-[14px] font-medium text-[#5A5347] hover:bg-[#E8DFD1]/40 hover:text-[#1A1815] transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/subscribe"
                  className="block rounded-lg px-3 py-2.5 mt-2 text-[14px] font-semibold bg-[#C44B2E] text-white hover:bg-[#A83A22] transition-colors text-center"
                >
                  Get Pro Access
                </Link>
              </>
            )}
          </div>
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 px-6 py-4 border-t border-[#E8DFD1]">
          <div className="flex items-center gap-2 text-[#A09788]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-4 w-4 text-[#C44B2E]/50"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="4" y="13" width="4" height="8" rx="1" />
              <rect x="10" y="8" width="4" height="13" rx="1" />
              <rect x="16" y="3" width="4" height="18" rx="1" />
            </svg>
            <span className="text-[11px]">Bank Fee Index</span>
          </div>
        </div>
      </div>
    </div>
  );
}
