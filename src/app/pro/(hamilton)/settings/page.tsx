import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsForm } from "./SettingsForm";
import { PeerSetManager } from "./PeerSetManager";
import { getSavedPeerSets } from "@/lib/crawler-db/saved-peers";
import { getIntelligenceSnapshot } from "./actions";
import { FeatureToggles } from "./FeatureToggles";

export const metadata: Metadata = {
  title: "Strategy Settings",
};

const PLAN_LABEL: Record<string, string> = {
  premium: "Professional",
  admin: "Admin Access",
  analyst: "Admin Access",
  viewer: "Free",
};

/**
 * Settings page — Strategy Settings editorial design.
 * Institution profile form feeds HamiltonContextBar across all screens.
 * Per D-01, D-09: warm parchment aesthetic, serif headers, editorial layout.
 */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const planLabel = PLAN_LABEL[user.role] ?? "Free";
  const isAdmin = user.role === "admin" || user.role === "analyst";

  // Parallel data fetching
  const [peerSets, snapshot] = await Promise.all([
    getSavedPeerSets(String(user.id)).catch(() => []),
    getIntelligenceSnapshot(),
  ]);

  const cardStyle = {
    backgroundColor: "var(--hamilton-surface-elevated)",
    border: "1px solid var(--hamilton-border)",
    borderRadius: "0.5rem",
    padding: "1.5rem",
  };

  const sectionLabelStyle = {
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "var(--hamilton-text-secondary)",
  };

  const statusColors: Record<string, { bg: string; text: string }> = {
    active: { bg: "rgb(236, 253, 245)", text: "rgb(5, 150, 105)" },
    past_due: { bg: "rgb(255, 251, 235)", text: "rgb(217, 119, 6)" },
    canceled: { bg: "rgb(254, 242, 242)", text: "rgb(220, 38, 38)" },
    none: { bg: "rgb(243, 244, 246)", text: "rgb(107, 114, 128)" },
  };

  return (
    <div className="max-w-5xl mx-auto pb-16">
      {/* Page header */}
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "var(--hamilton-text-secondary)" }}>
          Hamilton Intelligence
        </p>
        <h1
          className="text-3xl font-bold mb-2"
          style={{
            fontFamily: "var(--hamilton-font-serif)",
            color: "var(--hamilton-text-primary)",
          }}
        >
          Strategy Settings
        </h1>
        <p className="text-sm max-w-xl" style={{ color: "var(--hamilton-text-secondary)" }}>
          Refine your institutional parameters, monitor prediction thresholds, and tune the strategy
          model your Hamilton experience is built on.
        </p>
      </div>

      {/* Row 1: Account Overview + Intelligence Snapshot */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-6">
        {/* Account Overview */}
        <div className="lg:col-span-2" style={cardStyle}>
          <p style={sectionLabelStyle} className="mb-4">Account Overview</p>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p
                className="text-lg font-bold"
                style={{
                  fontFamily: "var(--hamilton-font-serif)",
                  color: "var(--hamilton-text-primary)",
                }}
              >
                {user.display_name}
              </p>
              {user.email && (
                <p className="text-sm mt-0.5" style={{ color: "var(--hamilton-text-secondary)" }}>
                  {user.email}
                </p>
              )}

              <div className="flex items-center gap-3 mt-3">
                <span
                  className="px-2 py-0.5 text-[11px] font-semibold rounded uppercase tracking-wider"
                  style={{
                    backgroundColor: "var(--hamilton-accent-subtle)",
                    color: "var(--hamilton-text-accent)",
                  }}
                >
                  {user.role}
                </span>
                <span className="text-sm" style={{ color: "var(--hamilton-text-secondary)" }}>
                  {planLabel}
                </span>
                <span className="text-sm" style={{ color: "var(--hamilton-text-tertiary)" }}>
                  Member since 2026
                </span>
              </div>
            </div>
          </div>

          {!isAdmin && (
            <div className="flex items-center gap-3 mt-5">
              <button
                type="button"
                className="px-4 py-2 text-xs font-semibold rounded-md border transition-opacity hover:opacity-80"
                style={{
                  borderColor: "var(--hamilton-border)",
                  color: "var(--hamilton-text-primary)",
                  backgroundColor: "white",
                }}
              >
                Manage Billing
              </button>
              <button
                type="button"
                className="px-4 py-2 text-xs font-semibold rounded-md border transition-opacity hover:opacity-80"
                style={{
                  borderColor: "var(--hamilton-border)",
                  color: "var(--hamilton-text-secondary)",
                  backgroundColor: "transparent",
                }}
              >
                Contact Support
              </button>
            </div>
          )}
        </div>

        {/* Intelligence Snapshot (SET-05) */}
        <div style={cardStyle}>
          <p style={sectionLabelStyle} className="mb-4">Intelligence Snapshot</p>
          <div className="space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--hamilton-text-tertiary)" }}>
                Account Tier
              </p>
              <p className="text-sm font-bold tabular-nums" style={{ color: "var(--hamilton-text-primary)" }}>
                {snapshot.tier}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--hamilton-text-tertiary)" }}>
                Saved Analyses
              </p>
              <p className="text-sm font-bold tabular-nums" style={{ color: "var(--hamilton-text-primary)" }}>
                {snapshot.savedAnalyses}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--hamilton-text-tertiary)" }}>
                Saved Scenarios
              </p>
              <p className="text-sm font-bold tabular-nums" style={{ color: "var(--hamilton-text-primary)" }}>
                {snapshot.savedScenarios}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--hamilton-text-tertiary)" }}>
                Last Activity
              </p>
              <p className="text-sm" style={{ color: "var(--hamilton-text-secondary)" }}>
                {snapshot.lastActivity ? new Date(snapshot.lastActivity).toLocaleDateString() : "No activity yet"}
              </p>
            </div>
          </div>
          <Link
            href="/pro/analyze"
            className="inline-block mt-4 text-xs font-medium no-underline hover:opacity-80"
            style={{ color: "var(--hamilton-accent)" }}
          >
            View in Analyze
          </Link>
        </div>
      </div>

      {/* Institution Profile */}
      <div style={cardStyle} className="mb-6">
        <p style={sectionLabelStyle} className="mb-1">Institution Profile</p>
        <p className="text-xs mb-5" style={{ color: "var(--hamilton-text-tertiary)" }}>
          This profile powers all Hamilton screens. Configure it to unlock personalized benchmarks and analysis.
        </p>
        <SettingsForm
          initialValues={{
            institution_name: user.institution_name,
            institution_type: user.institution_type,
            asset_tier: user.asset_tier,
            state_code: user.state_code,
            fed_district: user.fed_district ?? null,
          }}
        />
      </div>

      {/* Peer Set Management (SET-02) */}
      <div style={cardStyle} className="mb-6">
        <p style={sectionLabelStyle} className="mb-1">Peer Set Management</p>
        <p className="text-xs mb-4" style={{ color: "var(--hamilton-text-tertiary)" }}>
          Configure peer groups for Simulate and Reports. Peer sets define the comparison universe for your fee analysis.
        </p>
        <PeerSetManager initialPeerSets={peerSets} />
      </div>

      {/* Row: Usage & Limits + Feature Access */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
        {/* Usage & Limits */}
        <div style={cardStyle}>
          <p style={sectionLabelStyle} className="mb-3">Usage and Limits</p>
          <div className="space-y-2">
            {[
              { label: "Research queries", value: "Unlimited" },
              { label: "Report exports", value: "Unlimited" },
              { label: "Saved analyses", value: "Unlimited" },
              { label: "Saved scenarios", value: "Unlimited" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between text-sm">
                <span style={{ color: "var(--hamilton-text-secondary)" }}>{item.label}</span>
                <span className="font-semibold" style={{ color: "var(--hamilton-text-primary)" }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Feature Access (SET-03) */}
        <div style={cardStyle}>
          <p style={sectionLabelStyle} className="mb-3">Feature Access</p>
          <FeatureToggles />
        </div>
      </div>

      {/* Row: Proxy Access + Billing */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
        {/* Proxy Access */}
        <div style={cardStyle}>
          <p style={sectionLabelStyle} className="mb-3">Proxy Access</p>
          <p className="text-sm" style={{ color: "var(--hamilton-text-tertiary)" }}>
            Grant read-only access to team members or external advisors. Coming in a future update.
          </p>
        </div>

        {/* Billing (SET-04) */}
        <div style={cardStyle}>
          <p style={sectionLabelStyle} className="mb-3">Billing</p>
          {isAdmin ? (
            <div>
              <span
                className="inline-block px-3 py-1 text-[11px] font-semibold rounded uppercase tracking-wider"
                style={{ backgroundColor: "rgb(255, 251, 235)", color: "rgb(180, 83, 9)" }}
              >
                Admin Access
              </span>
              <p className="text-sm mt-2" style={{ color: "var(--hamilton-text-secondary)" }}>
                You have full platform access as an administrator. No billing applies.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <p
                  className="text-base font-bold"
                  style={{ fontFamily: "var(--hamilton-font-serif)", color: "var(--hamilton-text-primary)" }}
                >
                  Professional
                </p>
                <span
                  className="px-2 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wider"
                  style={{
                    backgroundColor: statusColors[user.subscription_status]?.bg ?? statusColors.none.bg,
                    color: statusColors[user.subscription_status]?.text ?? statusColors.none.text,
                  }}
                >
                  {user.subscription_status === "active" ? "Active" :
                   user.subscription_status === "past_due" ? "Past Due" :
                   user.subscription_status === "canceled" ? "Canceled" : "No Subscription"}
                </span>
              </div>
              <p className="text-xs" style={{ color: "var(--hamilton-text-tertiary)" }}>
                Renews monthly
              </p>
              <button
                type="button"
                className="px-4 py-2 text-xs font-semibold rounded-md transition-opacity hover:opacity-80"
                style={{
                  background: "linear-gradient(135deg, var(--hamilton-primary), var(--hamilton-primary-container))",
                  color: "white",
                }}
              >
                Manage Billing
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div style={cardStyle} className="mb-6">
        <p style={sectionLabelStyle} className="mb-4">Quick Actions: Continue Working</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { href: "/pro/monitor", label: "Back to Monitor" },
            { href: "/pro/analyze", label: "Run Analysis" },
            { href: "/pro/reports", label: "Build Report" },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="block p-3 rounded-md text-sm font-medium no-underline text-center transition-all hover:opacity-80"
              style={{
                backgroundColor: "var(--hamilton-surface-container-low)",
                color: "var(--hamilton-text-primary)",
                border: "1px solid transparent",
              }}
              onMouseEnter={() => {}}
            >
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
