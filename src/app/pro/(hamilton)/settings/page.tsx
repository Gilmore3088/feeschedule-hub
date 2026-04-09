import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsForm } from "./SettingsForm";

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

        {/* Intelligence Snapshot — placeholder for Plan 02 */}
        <div style={cardStyle}>
          <p style={sectionLabelStyle} className="mb-4">Intelligence Snapshot</p>
          <p className="text-sm" style={{ color: "var(--hamilton-text-tertiary)" }}>
            Loading intelligence data...
          </p>
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

      {/* Row: Usage & Limits + Feature Access */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
        <div style={cardStyle}>
          <p style={sectionLabelStyle} className="mb-3">Usage and Limits</p>
          <p className="text-xs" style={{ color: "var(--hamilton-text-tertiary)" }}>Coming soon</p>
        </div>

        <div style={cardStyle}>
          <p style={sectionLabelStyle} className="mb-3">Feature Access</p>
          <p className="text-xs" style={{ color: "var(--hamilton-text-tertiary)" }}>Coming soon</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={cardStyle} className="mb-6">
        <p style={sectionLabelStyle} className="mb-3">Quick Actions: Continue Working</p>
        <Link
          href="/pro/monitor"
          className="text-sm font-medium no-underline hover:opacity-80 transition-opacity"
          style={{ color: "var(--hamilton-accent)" }}
        >
          Back to Monitor
        </Link>
      </div>

      {/* Row: Proxy Access + Billing */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
        <div style={cardStyle}>
          <p style={sectionLabelStyle} className="mb-3">Proxy Access</p>
          <p className="text-xs" style={{ color: "var(--hamilton-text-tertiary)" }}>Coming soon</p>
        </div>

        <div style={cardStyle}>
          <p style={sectionLabelStyle} className="mb-3">Billing</p>
          <p className="text-xs" style={{ color: "var(--hamilton-text-tertiary)" }}>Coming soon</p>
        </div>
      </div>
    </div>
  );
}
