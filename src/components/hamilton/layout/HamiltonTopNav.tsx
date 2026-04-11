"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HAMILTON_NAV } from "@/lib/hamilton/navigation";

interface HamiltonTopNavProps {
  isAdmin: boolean;
  activeHref: string;
  user: {
    display_name: string;
    email: string | null;
    role: string;
  };
}

/**
 * HamiltonTopNav — Client component.
 * Renders the horizontal nav bar with Hamilton wordmark, 6 nav items, and avatar dropdown.
 * Uses usePathname() for live client-side active state; activeHref provides
 * the server-rendered initial active state so the correct item is highlighted
 * in the initial HTML without waiting for client JS (satisfies SC-2).
 * Per D-16: nav items locked to HAMILTON_NAV single source of truth.
 * Per D-02: Settings link only in avatar dropdown, not in main nav.
 */
export function HamiltonTopNav({ isAdmin, activeHref, user }: HamiltonTopNavProps) {
  const pathname = usePathname();
  const currentPath = pathname || activeHref;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  function isActive(href: string): boolean {
    return currentPath === href || currentPath.startsWith(href + "/");
  }

  function getInitials(name: string): string {
    return name
      .split(" ")
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

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

      {/* Avatar dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="flex items-center justify-center rounded-full text-white text-xs font-bold select-none cursor-pointer border-0 outline-none focus:ring-2"
          style={{
            width: "32px",
            height: "32px",
            backgroundColor: "var(--hamilton-accent)",
          }}
          aria-label="User menu"
          aria-expanded={dropdownOpen}
        >
          {getInitials(user.display_name)}
        </button>

        {dropdownOpen && (
          <div
            className="absolute right-0 mt-2 w-56 rounded-lg shadow-lg z-50"
            style={{
              backgroundColor: "var(--hamilton-surface)",
              border: "1px solid var(--hamilton-border)",
              top: "100%",
            }}
          >
            {/* User info */}
            <div className="px-4 py-3 border-b" style={{ borderColor: "var(--hamilton-border)" }}>
              <p
                className="text-sm font-semibold truncate"
                style={{ color: "var(--hamilton-text-primary)" }}
              >
                {user.display_name}
              </p>
              {user.email && (
                <p
                  className="text-xs truncate mt-0.5"
                  style={{ color: "var(--hamilton-text-secondary)" }}
                >
                  {user.email}
                </p>
              )}
            </div>

            {/* Settings link */}
            <div className="py-1">
              <Link
                href="/pro/settings"
                className="flex items-center px-4 py-2 text-sm no-underline transition-colors hover:opacity-80"
                style={{ color: "var(--hamilton-text-primary)" }}
                onClick={() => setDropdownOpen(false)}
              >
                Settings
              </Link>
            </div>

            {/* Sign out */}
            <div className="border-t py-1" style={{ borderColor: "var(--hamilton-border)" }}>
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  className="w-full text-left px-4 py-2 text-sm transition-colors hover:opacity-80 border-0 bg-transparent cursor-pointer"
                  style={{ color: "var(--hamilton-text-secondary)" }}
                >
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
