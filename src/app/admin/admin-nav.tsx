"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
  icon: React.ReactNode;
}

const ICON_CLASS = "w-[14px] h-[14px] shrink-0";

const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      {
        href: "/admin",
        label: "Dashboard",
        exact: true,
        icon: (
          <svg className={ICON_CLASS} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
            <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
            <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
            <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Benchmarks",
    items: [
      {
        href: "/admin/market",
        label: "Market",
        icon: (
          <svg className={ICON_CLASS} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M1.5 12.5l3.5-5 3 3.5 3-6 3.5 5" />
            <path d="M1.5 14.5h13" />
          </svg>
        ),
      },
      {
        href: "/admin/index",
        label: "National",
        icon: (
          <svg className={ICON_CLASS} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <rect x="2" y="8" width="3" height="6" rx="0.5" />
            <rect x="6.5" y="5" width="3" height="9" rx="0.5" />
            <rect x="11" y="2" width="3" height="12" rx="0.5" />
          </svg>
        ),
      },
      {
        href: "/admin/peers",
        label: "Peer",
        icon: (
          <svg className={ICON_CLASS} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <circle cx="6" cy="5" r="2.5" />
            <circle cx="11" cy="6" r="2" />
            <path d="M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
            <path d="M10.5 11.5c1.5 0 3.5.8 3.5 2.5" />
          </svg>
        ),
      },
      {
        href: "/admin/fees/catalog",
        label: "Categories",
        icon: (
          <svg className={ICON_CLASS} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M2 4h12M2 8h8M2 12h10" />
          </svg>
        ),
      },
      {
        href: "/admin/districts",
        label: "Districts",
        icon: (
          <svg className={ICON_CLASS} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <circle cx="8" cy="7" r="5.5" />
            <path d="M8 1.5v11M2.5 7h11M3.5 3.5c1.5 1 3 1.5 4.5 1.5s3-.5 4.5-1.5M3.5 10.5c1.5-1 3-1.5 4.5-1.5s3 .5 4.5 1.5" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Data",
    items: [
      {
        href: "/admin/pipeline",
        label: "Pipeline",
        icon: (
          <svg className={ICON_CLASS} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M2 3h12M3 6h10M4 9h8M5 12h6" />
          </svg>
        ),
      },
      {
        href: "/admin/review",
        label: "Review",
        icon: (
          <svg className={ICON_CLASS} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M4 8l2.5 2.5L12 4.5" />
            <rect x="1.5" y="1.5" width="13" height="13" rx="2" />
          </svg>
        ),
      },
      {
        href: "/admin/review/categories",
        label: "By Category",
        icon: (
          <svg className={ICON_CLASS} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <rect x="1.5" y="2" width="13" height="3" rx="1" />
            <rect x="1.5" y="7" width="9" height="3" rx="1" />
            <rect x="1.5" y="12" width="6" height="3" rx="1" />
          </svg>
        ),
      },
      {
        href: "/admin/query",
        label: "Explorer",
        icon: (
          <svg className={ICON_CLASS} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
        ),
      },
      {
        href: "/admin/data-quality",
        label: "Data Quality",
        icon: (
          <svg className={ICON_CLASS} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M8 1v14M1 8h14" />
            <circle cx="8" cy="8" r="6" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Research",
    items: [
      {
        href: "/admin/research",
        label: "Research Hub",
        icon: (
          <svg className={ICON_CLASS} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
            <path d="M5 7h4M7 5v4" />
          </svg>
        ),
      },
      {
        href: "/admin/leads",
        label: "Leads",
        icon: (
          <svg className={ICON_CLASS} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M8 1.5v13M4.5 5L8 1.5 11.5 5" />
            <rect x="2" y="9" width="12" height="5" rx="1" />
          </svg>
        ),
      },
    ],
  },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 px-2.5 py-1">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && (
            <div className="mx-2 my-2 h-px bg-black/[0.04] dark:bg-white/[0.04]" />
          )}
          {group.label && (
            <span className="block px-2 mb-1 text-[9px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-[0.1em]">
              {group.label}
            </span>
          )}
          {group.items.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-2 py-[5px] rounded-md text-[12px] font-medium transition-colors ${
                  isActive
                    ? "bg-gray-900 text-white dark:bg-white/10 dark:text-gray-100"
                    : "text-gray-500 hover:text-gray-800 hover:bg-black/[0.03] dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/[0.04]"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AdminNavInline() {
  const pathname = usePathname();

  return (
    <nav className="flex md:hidden items-center gap-0.5 overflow-x-auto">
      {NAV_GROUPS.flatMap((group) =>
        group.items.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`text-[11px] font-semibold px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })
      )}
    </nav>
  );
}
