"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_LINKS = [
  { href: "/check", label: "Fee Checker" },
  { href: "/institutions", label: "Find Your Bank" },
  { href: "/fees", label: "Fee Index" },
  { href: "/states", label: "States" },
  { href: "/districts", label: "Districts" },
  { href: "/research", label: "Research" },
];

export function PublicNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0f172a]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-5 w-5 text-amber-400"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 17l4-8 4 5 4-10 6 13" />
          </svg>
          <span className="text-[15px] font-semibold tracking-tight text-white">
            Bank Fee Index
          </span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Main navigation" className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-[13px] transition-colors ${
                pathname?.startsWith(link.href)
                  ? "text-white font-medium"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/pricing"
            className="hidden text-[13px] text-slate-400 hover:text-white transition-colors sm:inline"
          >
            Pricing
          </Link>
          <Link
            href="/login"
            className="hidden text-[13px] text-slate-500 hover:text-white transition-colors sm:inline"
          >
            Sign In
          </Link>

          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen(!open)}
            className="flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:text-white md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav aria-label="Mobile navigation" className="border-t border-white/10 bg-[#0f172a] px-6 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded px-3 py-2.5 text-[14px] transition-colors ${
                  pathname?.startsWith(link.href)
                    ? "bg-white/5 text-white font-medium"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/pricing"
              onClick={() => setOpen(false)}
              className="mt-2 rounded border-t border-white/5 px-3 pt-4 pb-2 text-[13px] text-slate-400 hover:text-white transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded px-3 py-2 text-[13px] text-slate-500 hover:text-white transition-colors"
            >
              Sign In
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
