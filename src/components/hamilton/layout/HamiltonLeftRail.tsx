"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HAMILTON_NAV, LEFT_RAIL_CONFIG } from "@/lib/hamilton/navigation";
import type { HamiltonScreen } from "@/lib/hamilton/navigation";

interface SavedAnalysis {
  id: string;
  title: string;
  analysis_focus: string;
  updated_at: string;
}

interface RecentScenario {
  id: string;
  fee_category: string;
  updated_at: string;
}

interface HamiltonLeftRailProps {
  savedAnalyses?: SavedAnalysis[];
  recentScenarios?: RecentScenario[];
}

const SECTION_EMPTY_STATES: Record<string, string> = {
  "Recent Work": "Your recent activity will appear here",
  "Pinned Institutions": "Pin institutions from search results",
  "Report History": "Generate your first report",
  "Templates": "Report templates available after setup",
  "Watchlist": "Add institutions to your watchlist",
  "Signal Feed": "Signals will appear as fees change",
};

function deriveScreen(pathname: string): HamiltonScreen {
  for (const item of HAMILTON_NAV) {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) {
      return item.label as HamiltonScreen;
    }
  }
  return "Monitor";
}

function relativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = Date.now();
    const diff = now - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  } catch {
    return "";
  }
}

/**
 * HamiltonLeftRail — Client component.
 * Collapsible workspace memory rail with screen-specific sections.
 * Sections and primary CTA derived from LEFT_RAIL_CONFIG per current screen.
 * Per D-08: hidden below lg breakpoint.
 */
export function HamiltonLeftRail({ savedAnalyses = [], recentScenarios = [] }: HamiltonLeftRailProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const currentScreen = deriveScreen(pathname);
  const config = LEFT_RAIL_CONFIG[currentScreen];

  return (
    <aside
      className="hidden lg:flex lg:flex-col shrink-0 border-r transition-all duration-200"
      style={{
        width: isCollapsed ? "48px" : "256px",
        backgroundColor: "var(--hamilton-surface)",
        borderColor: "var(--hamilton-border)",
      }}
    >
      {/* Collapse toggle */}
      <div
        className="flex items-center justify-end px-2 py-2 border-b"
        style={{ borderColor: "var(--hamilton-border)" }}
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center justify-center w-6 h-6 rounded transition-colors"
          style={{ color: "var(--hamilton-text-tertiary)" }}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {isCollapsed ? (
              <>
                <path d="M5 3l4 4-4 4" />
              </>
            ) : (
              <>
                <path d="M9 3L5 7l4 4" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Sections — only show when expanded */}
      {!isCollapsed && (
        <div className="flex flex-col flex-1 overflow-y-auto py-3 gap-4">
          {config.sections.map((section) => (
            <div key={section} className="px-3">
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--hamilton-text-tertiary)" }}
              >
                {section}
              </p>

              {section === "Saved Analyses" && (
                <>
                  {savedAnalyses.length > 0 ? (
                    <ul className="space-y-1.5">
                      {savedAnalyses.map((a) => (
                        <li key={a.id}>
                          <Link
                            href={`/pro/analyze?analysis=${a.id}`}
                            className="block rounded px-2 py-1.5 no-underline transition-colors hover:bg-[var(--hamilton-surface-elevated)]"
                          >
                            <span
                              className="block text-xs font-medium truncate"
                              style={{ color: "var(--hamilton-text-primary)" }}
                            >
                              {a.title}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span
                                className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded"
                                style={{
                                  backgroundColor: "var(--hamilton-accent-subtle)",
                                  color: "var(--hamilton-text-accent)",
                                }}
                              >
                                {a.analysis_focus}
                              </span>
                              <span
                                className="text-[10px]"
                                style={{ color: "var(--hamilton-text-tertiary)" }}
                              >
                                {relativeTime(a.updated_at)}
                              </span>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p
                      className="text-[11px] italic"
                      style={{ color: "var(--hamilton-text-tertiary)" }}
                    >
                      Run your first analysis to see it here
                    </p>
                  )}
                </>
              )}

              {section === "Scenarios" && (
                <>
                  {recentScenarios.length > 0 ? (
                    <ul className="space-y-1.5">
                      {recentScenarios.map((s) => (
                        <li key={s.id}>
                          <Link
                            href={`/pro/simulate?scenario=${s.id}`}
                            className="block rounded px-2 py-1.5 no-underline transition-colors hover:bg-[var(--hamilton-surface-elevated)]"
                          >
                            <span
                              className="block text-xs font-medium truncate"
                              style={{ color: "var(--hamilton-text-primary)" }}
                            >
                              {s.fee_category}
                            </span>
                            <span
                              className="text-[10px]"
                              style={{ color: "var(--hamilton-text-tertiary)" }}
                            >
                              {relativeTime(s.updated_at)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p
                      className="text-[11px] italic"
                      style={{ color: "var(--hamilton-text-tertiary)" }}
                    >
                      Create a scenario in Simulate
                    </p>
                  )}
                </>
              )}

              {section !== "Saved Analyses" && section !== "Scenarios" && (
                <p
                  className="text-[11px] italic"
                  style={{ color: "var(--hamilton-text-tertiary)" }}
                >
                  {SECTION_EMPTY_STATES[section] ?? ""}
                </p>
              )}
            </div>
          ))}

          {/* Spacer */}
          <div className="flex-1" />
        </div>
      )}

      {/* Primary action CTA */}
      {!isCollapsed && config.primaryAction && (
        <div className="p-3 border-t" style={{ borderColor: "var(--hamilton-border)" }}>
          <button
            className="w-full rounded px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--hamilton-gradient-cta)" }}
          >
            {config.primaryAction}
          </button>
        </div>
      )}
    </aside>
  );
}
