"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { label: string; href: string; exact?: boolean }[] = [
  { label: "Overview", href: "/admin/agents", exact: true },
  { label: "Lineage", href: "/admin/agents/lineage" },
  { label: "Messages", href: "/admin/agents/messages" },
  { label: "Replay", href: "/admin/agents/replay" },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname.startsWith(href);
}

export function AgentTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Agent console sections"
      className="sticky top-11 z-20 -mx-1 px-1 py-1.5 border-b border-black/[0.06] dark:border-white/[0.06] bg-[var(--admin-bg)]/80 dark:bg-[oklch(0.14_0_0)]/80 backdrop-blur"
    >
      <ul className="flex items-center gap-1">
        {TABS.map((t) => {
          const active = isActive(pathname, t.href, t.exact);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center h-8 px-3 rounded-md text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[oklch(0.14_0_0)] ${
                  active
                    ? "bg-gray-900 text-white dark:bg-white/10 dark:text-gray-100"
                    : "text-gray-500 hover:text-gray-900 hover:bg-black/[0.04] dark:hover:text-gray-100 dark:hover:bg-white/[0.04]"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
