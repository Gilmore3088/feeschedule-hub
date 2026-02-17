"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
}

const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  {
    items: [{ href: "/admin", label: "Dashboard", exact: true }],
  },
  {
    label: "Index",
    items: [
      { href: "/admin/market", label: "Market" },
      { href: "/admin/index", label: "National" },
      { href: "/admin/peers", label: "Peer" },
      { href: "/admin/fees/catalog", label: "Categories" },
    ],
  },
  {
    label: "Ops",
    items: [
      { href: "/admin/review", label: "Review" },
      { href: "/admin/districts", label: "Districts" },
      { href: "/admin/fees", label: "Extracts", exact: true },
    ],
  },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex items-center gap-0.5">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi} className="flex items-center">
          {gi > 0 && (
            <span className="mx-2 h-4 w-px bg-gray-200" />
          )}
          {group.label && (
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mr-1.5">
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
                className={`text-[13px] font-medium px-2.5 py-1.5 rounded-md transition-colors ${
                  isActive
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
