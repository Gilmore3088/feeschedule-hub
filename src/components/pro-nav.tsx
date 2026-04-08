"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchTrigger } from "./search-trigger";
import type { PersonalizationContext } from "@/lib/personalization";

const PRO_NAV_ITEMS = [
  { label: "Dashboard", href: "/pro" },
  { label: "Market", href: "/pro/market" },
  { label: "Peers", href: "/pro/peers" },
  { label: "Categories", href: "/pro/categories" },
  { label: "Districts", href: "/pro/districts" },
  { label: "Data", href: "/pro/data" },
  { label: "Wire", href: "/pro/news" },
  { label: "AI Research", href: "/pro/research" },
];

interface ProNavProps {
  user: {
    displayName: string;
    institutionName: string | null;
    initial: string;
  };
  personalization: PersonalizationContext;
}

export function ProNav({ user, personalization }: ProNavProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-[#E8DFD1] bg-[#FAF7F2]/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <Link
              href="/account"
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
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#C44B2E]/10 text-[#C44B2E] uppercase tracking-wider">
                Pro
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
              {PRO_NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`text-[13px] font-medium transition-colors ${
                      isActive
                        ? "text-[#C44B2E] border-b-2 border-[#C44B2E]"
                        : "text-[#7A7062] hover:text-[#1A1815]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <SearchTrigger />
            <div className="hidden md:block">
              <ProNavUserMenu user={user} />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function ProNavUserMenu({
  user,
}: {
  user: { displayName: string; institutionName: string | null; initial: string };
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-[13px] font-medium text-[#7A7062] hover:text-[#1A1815] transition-colors"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1A1815] text-[10px] font-bold text-white">
          {user.initial}
        </span>
        <span className="hidden lg:inline">{user.displayName}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-[#E8DFD1] rounded-lg shadow-lg">
          <div className="px-4 py-3 border-b border-[#E8DFD1]">
            <p className="text-[13px] font-medium text-[#1A1815]">{user.displayName}</p>
            {user.institutionName && (
              <p className="text-[12px] text-[#7A7062] mt-0.5">{user.institutionName}</p>
            )}
          </div>
          <div className="py-2">
            <Link
              href="/account"
              className="block px-4 py-2 text-[13px] text-[#7A7062] hover:bg-[#FAF7F2] hover:text-[#1A1815] transition-colors"
            >
              Account Settings
            </Link>
            <form action="/api/auth/logout" method="POST" className="block">
              <button
                type="submit"
                className="w-full text-left px-4 py-2 text-[13px] text-[#7A7062] hover:bg-[#FAF7F2] hover:text-[#1A1815] transition-colors"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
