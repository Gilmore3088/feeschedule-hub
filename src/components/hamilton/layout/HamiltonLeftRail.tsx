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
  pinnedInstitutions?: string[];
  peerSets?: Array<{ id: number; name: string }>;
}

function deriveScreen(pathname: string): HamiltonScreen {
  for (const item of HAMILTON_NAV) {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) {
      return item.label as HamiltonScreen;
    }
  }
  return "Watchlist";
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
 * Matches HTML prototype: NEW ANALYSIS CTA, WORKSPACE + CONTEXT sections,
 * Settings/Support at bottom. Collapsible below lg.
 * Per D-08: hidden below lg breakpoint.
 */
export function HamiltonLeftRail({ savedAnalyses = [], recentScenarios = [], pinnedInstitutions = [], peerSets = [] }: HamiltonLeftRailProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const currentScreen = deriveScreen(pathname);
  const config = LEFT_RAIL_CONFIG[currentScreen];

  const isAnalyzeScreen = currentScreen === "Peer Compare";
  const isSimulateScreen = currentScreen === "Scenarios";

  return (
    <aside
      className="hidden lg:flex lg:flex-col shrink-0 border-r transition-all duration-200"
      style={{
        width: isCollapsed ? "48px" : "288px",
        backgroundColor: "var(--hamilton-surface-container-low)",
        borderColor: "var(--hamilton-outline-variant, rgba(216,194,184,0.1))",
      }}
    >
      {isCollapsed ? (
        /* Collapsed: just collapse toggle */
        <div className="flex flex-col items-center py-4 gap-3">
          <button
            onClick={() => setIsCollapsed(false)}
            className="flex items-center justify-center w-8 h-8 rounded transition-colors"
            style={{ color: "var(--hamilton-text-tertiary)" }}
            aria-label="Expand sidebar"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 3l4 4-4 4" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="flex flex-col h-full py-8 px-6">
          {/* Collapse toggle — top right */}
          <div className="flex justify-end mb-6">
            <button
              onClick={() => setIsCollapsed(true)}
              className="flex items-center justify-center w-6 h-6 rounded transition-colors"
              style={{ color: "var(--hamilton-text-tertiary)" }}
              aria-label="Collapse sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3L5 7l4 4" />
              </svg>
            </button>
          </div>

          {/* Screen title — "Strategy Terminal" on Simulate, else screen label */}
          {isSimulateScreen ? (
            <div className="mb-8">
              <div className="font-headline text-lg" style={{ color: "var(--hamilton-on-surface)" }}>
                Strategy Terminal
              </div>
            </div>
          ) : (
            <div className="mb-10">
              <Link
                href="/pro/analyze"
                className="burnished-cta w-full py-3.5 px-4 text-[11px] uppercase tracking-[0.15em] font-bold rounded shadow-lg flex items-center justify-center gap-2 transition-all no-underline hover:opacity-90"
                style={{ letterSpacing: "0.15em" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v8M8 12h8" />
                </svg>
                {config.primaryAction || "New Analysis"}
              </Link>
            </div>
          )}

          {/* Scrollable section area */}
          <div className="flex-1 overflow-y-auto space-y-10" style={{
            scrollbarWidth: "thin",
            scrollbarColor: "var(--hamilton-outline-variant) transparent",
          }}>

            {/* SIMULATE screen: Strategy Terminal nav */}
            {isSimulateScreen && (
              <section>
                <nav className="space-y-4">
                  <Link
                    href="/pro/simulate"
                    className="flex items-center gap-3 no-underline font-label text-[10px] uppercase tracking-widest font-bold"
                    style={{ color: "var(--hamilton-primary)" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    Current Workspace
                  </Link>
                  <button className="flex items-center gap-3 w-full text-left font-label text-[10px] uppercase tracking-widest transition-colors hover:text-stone-900" style={{ color: "rgb(120 113 108)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    Scenario Archive
                  </button>
                  {recentScenarios.length > 0 && (
                    <ul className="ml-7 space-y-1.5">
                      {recentScenarios.map((s) => (
                        <li key={s.id}>
                          <Link href={`/pro/simulate?scenario=${s.id}`} className="block text-xs truncate no-underline" style={{ color: "var(--hamilton-text-secondary)" }}>
                            {s.fee_category}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button className="flex items-center gap-3 w-full text-left font-label text-[10px] uppercase tracking-widest transition-colors hover:text-stone-900" style={{ color: "rgb(120 113 108)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                    Global Templates
                  </button>
                  <button className="flex items-center gap-3 w-full text-left font-label text-[10px] uppercase tracking-widest transition-colors hover:text-stone-900" style={{ color: "rgb(120 113 108)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    Audit Trail
                  </button>
                </nav>

                {/* NEW SCENARIO button */}
                <div className="mt-8">
                  <button className="w-full burnished-cta rounded font-label text-[10px] uppercase tracking-widest text-center py-2.5 px-4 shadow-sm active:scale-95 transition-all">
                    New Scenario
                  </button>
                </div>
              </section>
            )}

            {/* WORKSPACE section (non-simulate screens) */}
            {!isSimulateScreen && (<section>
              <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold mb-5 flex items-center gap-2"
                style={{ color: "var(--hamilton-text-tertiary)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                Workspace
              </h3>

              <div className="space-y-6">
                {/* Saved Analyses */}
                <div>
                  <span className="text-[9px] uppercase tracking-widest font-semibold mb-3 block"
                    style={{ color: "var(--hamilton-text-secondary)" }}>
                    Saved Analyses
                  </span>
                  {savedAnalyses.length > 0 ? (
                    <ul className="space-y-3.5">
                      {savedAnalyses.map((a) => (
                        <li key={a.id}>
                          <Link
                            href={`/pro/analyze?analysis=${a.id}`}
                            className="flex items-center gap-3 text-[11px] no-underline transition-colors group"
                            style={{ color: "var(--hamilton-text-secondary)" }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                              style={{ opacity: 0.5 }} aria-hidden="true">
                              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                            </svg>
                            <span className="truncate">{a.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Link href="/pro/analyze" className="block text-[11px] no-underline transition-colors" style={{ color: "var(--hamilton-primary)" }}>
                      Ask Hamilton a question to begin
                    </Link>
                  )}
                </div>

                {/* Recent Work */}
                <div>
                  <span className="text-[9px] uppercase tracking-widest font-semibold mb-3 block"
                    style={{ color: "var(--hamilton-text-secondary)" }}>
                    Recent Work
                  </span>
                  {recentScenarios.length > 0 ? (
                    <ul className="space-y-3.5">
                      {recentScenarios.map((s) => (
                        <li key={s.id}>
                          <Link
                            href={`/pro/simulate?scenario=${s.id}`}
                            className="flex items-center gap-3 text-[11px] no-underline transition-colors"
                            style={{ color: "var(--hamilton-text-secondary)" }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                              style={{ opacity: 0.4 }} aria-hidden="true">
                              <circle cx="12" cy="12" r="10" />
                              <path d="M12 6v6l4 2" />
                            </svg>
                            <span className="truncate">{s.fee_category}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Link href="/pro/simulate" className="block text-[11px] no-underline transition-colors" style={{ color: "var(--hamilton-primary)" }}>
                      Run a fee simulation to get started
                    </Link>
                  )}
                </div>
              </div>
            </section>)}

            {/* CONTEXT section — shown on all non-simulate screens */}
            {!isSimulateScreen && (
              <section>
                <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold mb-5 flex items-center gap-2"
                  style={{ color: "var(--hamilton-text-tertiary)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <ellipse cx="12" cy="5" rx="9" ry="3" />
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                  </svg>
                  Context
                </h3>

                <div className="space-y-6">
                  {/* Pinned Institutions */}
                  <div>
                    <span className="text-[9px] uppercase tracking-widest font-semibold mb-3 block"
                      style={{ color: "var(--hamilton-text-secondary)" }}>
                      Pinned Institutions
                    </span>
                    {pinnedInstitutions.length > 0 ? (
                      <div className="space-y-3.5">
                        {pinnedInstitutions.map((instId) => (
                          <div key={instId} className="flex items-center gap-3 cursor-pointer group">
                            <div
                              className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0 transition-colors"
                              style={{
                                backgroundColor: "var(--hamilton-surface-container-high)",
                                color: "var(--hamilton-text-primary)",
                              }}
                            >
                              {instId.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="text-[11px] truncate" style={{ color: "var(--hamilton-text-secondary)" }}>
                              {instId}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Link href="/pro/settings" className="block text-[11px] no-underline transition-colors" style={{ color: "var(--hamilton-primary)" }}>
                        Add institutions to watch
                      </Link>
                    )}
                  </div>

                  {/* Peer Sets */}
                  <div>
                    <span className="text-[9px] uppercase tracking-widest font-semibold mb-3 block"
                      style={{ color: "var(--hamilton-text-secondary)" }}>
                      Peer Sets
                    </span>
                    {peerSets.length > 0 ? (
                      <ul className="space-y-3.5">
                        {peerSets.map((set) => (
                          <li key={set.id}>
                            <span
                              className="flex items-center gap-3 text-[11px]"
                              style={{ color: "var(--hamilton-text-secondary)" }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                style={{ opacity: 0.5 }} aria-hidden="true">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                              </svg>
                              {set.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Link href="/pro/settings" className="block text-[11px] no-underline transition-colors" style={{ color: "var(--hamilton-primary)" }}>
                        Configure peer comparison groups
                      </Link>
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* Settings / Support footer */}
          <div className="mt-auto pt-6 border-t" style={{ borderColor: "rgba(216,194,184,0.2)" }}>
            <nav className="space-y-5">
              <Link
                href="/pro/settings"
                className="flex items-center gap-3 no-underline transition-colors"
                style={{ color: "var(--hamilton-text-tertiary)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
                  <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
                </svg>
                <span className="text-[10px] uppercase tracking-widest font-bold">Settings</span>
              </Link>
              <a
                href="mailto:support@bankfeeindex.com"
                className="flex items-center gap-3 no-underline transition-colors"
                style={{ color: "var(--hamilton-text-tertiary)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
                </svg>
                <span className="text-[10px] uppercase tracking-widest font-bold">Support</span>
              </a>
            </nav>
          </div>
        </div>
      )}
    </aside>
  );
}
