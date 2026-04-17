"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs } from "radix-ui";

const TABS: { value: string; label: string; href: string; exact?: boolean }[] = [
  { value: "overview", label: "Overview", href: "/admin/agents", exact: true },
  { value: "lineage", label: "Lineage", href: "/admin/agents/lineage" },
  { value: "messages", label: "Messages", href: "/admin/agents/messages" },
  { value: "replay", label: "Replay", href: "/admin/agents/replay" },
];

function activeValue(pathname: string): string {
  const match = TABS.find((t) =>
    t.exact ? pathname === t.href : pathname.startsWith(t.href),
  );
  return match?.value ?? "overview";
}

export function AgentTabs() {
  const pathname = usePathname();
  const value = activeValue(pathname);

  return (
    <Tabs.Root
      value={value}
      // Navigation is handled by Next Link clicks; the onValueChange is a no-op
      // so Radix still emits proper aria-selected/role="tab" semantics.
      onValueChange={() => {}}
      aria-label="Agent console tabs"
      className="sticky top-11 z-20 -mx-1 px-1 py-1.5 border-b border-black/[0.06] dark:border-white/[0.06] bg-[var(--admin-bg)]/80 dark:bg-[oklch(0.14_0_0)]/80 backdrop-blur"
    >
      <Tabs.List className="flex items-center gap-1">
        {TABS.map((t) => {
          const active = t.value === value;
          return (
            <Tabs.Trigger
              key={t.value}
              value={t.value}
              asChild
            >
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center h-7 px-3 rounded-md text-[12px] font-semibold transition-colors ${
                  active
                    ? "bg-gray-900 text-white dark:bg-white/10 dark:text-gray-100"
                    : "text-gray-500 hover:text-gray-900 hover:bg-black/[0.04] dark:hover:text-gray-100 dark:hover:bg-white/[0.04]"
                }`}
              >
                {t.label}
              </Link>
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>
    </Tabs.Root>
  );
}
