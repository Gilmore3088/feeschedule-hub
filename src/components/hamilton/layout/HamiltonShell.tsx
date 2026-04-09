"use client";

import Link from "next/link";
import type { User } from "@/lib/auth";
import { HamiltonTopNav } from "./HamiltonTopNav";
import { HamiltonContextBar } from "./HamiltonContextBar";
import { HamiltonLeftRail } from "./HamiltonLeftRail";

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

interface HamiltonShellProps {
  user: User;
  isAdmin: boolean;
  institutionContext: {
    name: string | null;
    type: string | null;
    assetTier: string | null;
    fedDistrict: number | null;
  };
  activeHref: string;
  savedAnalyses?: SavedAnalysis[];
  recentScenarios?: RecentScenario[];
  pinnedInstitutions?: string[];
  peerSets?: Array<{ id: number; name: string }>;
  children: React.ReactNode;
}

/**
 * HamiltonShell — Client component (owns left rail collapse state).
 * Outer shell wrapper applying .hamilton-shell CSS isolation boundary.
 * Composes: admin bar, HamiltonTopNav, HamiltonContextBar, HamiltonLeftRail, and main content.
 * Per D-13, ARCH-01: .hamilton-shell class scopes all editorial design tokens.
 * Per D-10: admin mode bar shown only to admin/analyst users.
 */
export function HamiltonShell({
  user,
  isAdmin,
  institutionContext,
  activeHref,
  savedAnalyses,
  recentScenarios,
  pinnedInstitutions,
  peerSets,
  children,
}: HamiltonShellProps) {
  return (
    <div
      className="hamilton-shell min-h-screen"
      style={{ backgroundColor: "var(--hamilton-surface)" }}
    >
      {/* Admin mode bar — only for admin/analyst users (T-40-05) */}
      {isAdmin && (
        <div className="bg-gray-900 text-white flex items-center justify-between px-4 py-1.5 text-xs">
          <span className="text-gray-400">Admin Mode — viewing Hamilton Pro</span>
          <Link
            href="/admin"
            className="text-blue-400 hover:text-blue-300 font-medium no-underline"
          >
            Back to Admin
          </Link>
        </div>
      )}

      {/* Top navigation */}
      <HamiltonTopNav isAdmin={isAdmin} activeHref={activeHref} user={user} />

      {/* Institution context bar */}
      <HamiltonContextBar institutionContext={institutionContext} />

      {/* Two-column layout: left rail + main content */}
      <div className="flex" style={{ minHeight: "calc(100vh - 120px)" }}>
        <HamiltonLeftRail savedAnalyses={savedAnalyses} recentScenarios={recentScenarios} pinnedInstitutions={pinnedInstitutions} peerSets={peerSets} />
        <main className="flex-1 min-w-0 p-6">{children}</main>
      </div>
    </div>
  );
}
