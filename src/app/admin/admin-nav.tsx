"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/review", label: "Review Fees" },
  { href: "/admin/fees/catalog", label: "Fee Catalog" },
  { href: "/admin/peers", label: "Peer Groups" },
  { href: "/admin/fees", label: "Fee Extracts", exact: true },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex items-center gap-1">
      {NAV_ITEMS.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
              isActive
                ? "bg-gray-100 text-gray-900"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
