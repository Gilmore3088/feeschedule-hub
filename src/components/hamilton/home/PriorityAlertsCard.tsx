/**
 * PriorityAlertsCard — Right sidebar: "Why It Matters" + "Priority Alerts" sections.
 * Matches HTML prototype aside structure exactly.
 * Server component — no "use client".
 */

import type { AlertEntry } from "@/lib/hamilton/home-data";

interface PriorityAlertsCardProps {
  alerts: AlertEntry[];
}

function WhyItMatters() {
  return (
    <div
      style={{
        padding: "2rem",
        backgroundColor: "var(--hamilton-surface-container-low)",
        borderRadius: "var(--hamilton-radius-lg)",
      }}
    >
      <h3
        className="font-label"
        style={{
          fontSize: "0.625rem",
          fontWeight: 600,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--hamilton-on-surface-variant)",
          marginBottom: "1.5rem",
        }}
      >
        Why It Matters
      </h3>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
        <li style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
          <span style={{ color: "var(--hamilton-primary)", fontSize: "1.125rem", lineHeight: 1.2, flexShrink: 0 }}>⚠</span>
          <p style={{ fontSize: "0.875rem", fontWeight: 500, lineHeight: 1.4, color: "var(--hamilton-on-surface)", margin: 0 }}>
            Retention risk is rising in high-value segments
          </p>
        </li>
        <li style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
          <span style={{ color: "var(--hamilton-primary)", fontSize: "1.125rem", lineHeight: 1.2, flexShrink: 0 }}>↘</span>
          <p style={{ fontSize: "0.875rem", fontWeight: 500, lineHeight: 1.4, color: "var(--hamilton-on-surface)", margin: 0 }}>
            Peer pricing direction is shifting downward
          </p>
        </li>
        <li style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
          <span style={{ color: "var(--hamilton-primary)", fontSize: "1.125rem", lineHeight: 1.2, flexShrink: 0 }}>⬡</span>
          <p style={{ fontSize: "0.875rem", fontWeight: 500, lineHeight: 1.4, color: "var(--hamilton-on-surface)", margin: 0 }}>
            Revenue exposure is increasing without defensive positioning
          </p>
        </li>
      </ul>
    </div>
  );
}

function DefaultAlerts() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", cursor: "pointer" }}>
        <div
          style={{
            padding: "0.5rem",
            borderRadius: "0.25rem",
            backgroundColor: "rgba(138, 76, 39, 0.1)",
            color: "var(--hamilton-primary)",
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
        </div>
        <div>
          <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--hamilton-on-surface)", margin: "0 0 0.25rem 0" }}>
            Overdraft fee is $4 above median
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--hamilton-on-surface-variant)", margin: 0 }}>
            Impact: High Revenue Risk
          </p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", cursor: "pointer" }}>
        <div
          style={{
            padding: "0.5rem",
            borderRadius: "0.25rem",
            backgroundColor: "var(--hamilton-error-container)",
            color: "var(--hamilton-error)",
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div>
          <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--hamilton-on-surface)", margin: "0 0 0.25rem 0" }}>
            Complaint language worsening
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--hamilton-on-surface-variant)", margin: 0 }}>
            Sentiment Alert: Consumer Friction
          </p>
        </div>
      </div>
    </div>
  );
}

export function PriorityAlertsCard({ alerts }: PriorityAlertsCardProps) {
  return (
    <aside style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <WhyItMatters />

      {/* Priority Alerts */}
      <div
        style={{
          padding: "2rem",
          backgroundColor: "var(--hamilton-surface-container-low)",
          borderRadius: "var(--hamilton-radius-lg)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.5rem",
          }}
        >
          <h3
            className="font-label"
            style={{
              fontSize: "0.625rem",
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--hamilton-on-surface-variant)",
              margin: 0,
            }}
          >
            Priority Alerts
          </h3>
          <span
            style={{
              width: "0.5rem",
              height: "0.5rem",
              borderRadius: "50%",
              backgroundColor: "var(--hamilton-primary)",
              flexShrink: 0,
            }}
          />
        </div>

        {alerts.length === 0 ? (
          <DefaultAlerts />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {alerts.map((alert) => {
              const isError = alert.severity === "high";
              return (
                <div key={alert.id} style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                  <div
                    style={{
                      padding: "0.5rem",
                      borderRadius: "0.25rem",
                      backgroundColor: isError ? "var(--hamilton-error-container)" : "rgba(138, 76, 39, 0.1)",
                      color: isError ? "var(--hamilton-error)" : "var(--hamilton-primary)",
                      flexShrink: 0,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <div>
                    <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--hamilton-on-surface)", margin: "0 0 0.25rem 0" }}>
                      {alert.title}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "var(--hamilton-on-surface-variant)", margin: 0 }}>
                      {alert.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
