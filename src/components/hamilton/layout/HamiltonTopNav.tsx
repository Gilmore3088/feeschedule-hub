"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HAMILTON_NAV } from "@/lib/hamilton/navigation";

interface HamiltonTopNavProps {
  isAdmin: boolean;
  activeHref: string;
}

/**
 * HamiltonTopNav — Client component.
 * Renders the horizontal nav bar with Hamilton wordmark and 6 nav items.
 * Uses usePathname() for live client-side active state; activeHref provides
 * the server-rendered initial active state so the correct item is highlighted
 * in the initial HTML without waiting for client JS (satisfies SC-2).
 * Per D-16: nav items locked to HAMILTON_NAV single source of truth.
 */
export function HamiltonTopNav({ isAdmin, activeHref }: HamiltonTopNavProps) {
  const pathname = usePathname();
  const currentPath = pathname || activeHref;

  function isActive(href: string): boolean {
    return currentPath === href || currentPath.startsWith(href + "/");
  }

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-6"
      style={{
        backgroundColor: "var(--hamilton-surface)",
        borderBottom: "1px solid var(--hamilton-border)",
        height: "56px",
      }}
    >
      {/* Hamilton wordmark */}
      <span
        className="text-xl font-bold tracking-tight select-none"
        style={{
          fontFamily: "var(--hamilton-font-serif)",
          color: "var(--hamilton-text-primary)",
        }}
      >
        Hamil<span style={{ color: "var(--hamilton-accent)" }}>ton</span>
      </span>

      {/* Nav items */}
      <nav className="flex items-center gap-1">
        {HAMILTON_NAV.map((item) => {
          if (item.label === "Admin" && !isAdmin) return null;

          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-1.5 rounded text-xs font-medium uppercase tracking-wide no-underline transition-colors"
              style={{
                fontFamily: "var(--hamilton-font-sans)",
                color: active
                  ? "var(--hamilton-text-primary)"
                  : "var(--hamilton-text-secondary)",
                borderBottom: active
                  ? "2px solid var(--hamilton-accent)"
                  : "2px solid transparent",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
