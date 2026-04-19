"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: {
  label: string;
  href: string;
  exact?: boolean;
  subtitle: string;
  description: string;
}[] = [
  {
    label: "Workflows",
    href: "/admin/agents",
    exact: true,
    subtitle: "End-to-end pipeline + agent assignments",
    description:
      "The 5-stage pipeline (Scrape -> Discovery -> Extraction -> Review -> Publish) with live counts, 24h throughput, and the agents responsible at each stage. Start here.",
  },
  {
    label: "Health",
    href: "/admin/agents/health",
    subtitle: "Agent health at a glance",
    description:
      "5 health metrics x N agents (loop completion, review latency, pattern promotion, confidence drift, cost/value) with 7-day sparklines.",
  },
  {
    label: "Lineage",
    href: "/admin/agents/lineage",
    subtitle: "Trace a published fee to source",
    description:
      "Enter a fee_published_id and walk Tier 3 -> Tier 2 -> Tier 1 -> R2 document within 3 clicks.",
  },
  {
    label: "Messages",
    href: "/admin/agents/messages",
    subtitle: "Agent-to-agent conversations",
    description:
      "Inter-agent handshake log grouped by correlation_id: intent, state, round count, participants.",
  },
  {
    label: "Replay",
    href: "/admin/agents/replay",
    subtitle: "Read-only timeline by correlation_id",
    description:
      "Reconstruct what an agent did at a given moment. Paste a correlation_id to see the events + messages timeline. Read-only (D-16).",
  },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname.startsWith(href);
}

export function AgentTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Agent console sections"
      className="sticky top-[var(--admin-nav-h)] z-20 -mx-1 px-1 py-1.5 border-b border-black/[0.06] dark:border-white/[0.06] bg-[var(--admin-bg)]/80 dark:bg-[oklch(0.14_0_0)]/80 backdrop-blur"
    >
      <ul className="flex items-center gap-1">
        {TABS.map((t) => {
          const active = isActive(pathname, t.href, t.exact);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                title={t.description}
                aria-current={active ? "page" : undefined}
                aria-describedby={`tab-subtitle-${t.href}`}
                className={`inline-flex flex-col items-start justify-center min-h-11 px-3 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[oklch(0.14_0_0)] ${
                  active
                    ? "bg-gray-900 text-white dark:bg-white/10 dark:text-gray-100"
                    : "text-gray-500 hover:text-gray-900 hover:bg-black/[0.04] dark:hover:text-gray-100 dark:hover:bg-white/[0.04]"
                }`}
              >
                <span className="text-[12px] font-semibold leading-tight">
                  {t.label}
                </span>
                <span
                  id={`tab-subtitle-${t.href}`}
                  className={`text-[10px] leading-tight mt-0.5 ${
                    active
                      ? "text-white/70 dark:text-gray-300"
                      : "text-gray-400 dark:text-gray-500"
                  }`}
                >
                  {t.subtitle}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
