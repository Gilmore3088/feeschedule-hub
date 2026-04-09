/**
 * StatusStrip — Full-width system status banner for the Monitor screen.
 * Server component — no "use client".
 * Displays overall state (stable/watch/worsening), new signal count, and high-alert count.
 */

import type { MonitorPageData } from "@/lib/hamilton/monitor-data";

interface StatusStripProps {
  status: MonitorPageData["status"];
}

const STATE_COLORS: Record<string, { dot: string; label: string; bg: string }> =
  {
    stable: {
      dot: "#16a34a",
      label: "Stable",
      bg: "rgba(22, 163, 74, 0.08)",
    },
    watch: {
      dot: "#b45309",
      label: "Watch",
      bg: "rgba(180, 83, 9, 0.08)",
    },
    worsening: {
      dot: "#b91c1c",
      label: "Worsening",
      bg: "rgba(185, 28, 28, 0.08)",
    },
  };

export function StatusStrip({ status }: StatusStripProps) {
  const { dot, label, bg } =
    STATE_COLORS[status.overall] ?? STATE_COLORS.stable;

  return (
    <div
      style={{
        width: "100%",
        backgroundColor: bg,
        borderBottom: "1px solid var(--hamilton-border)",
        padding: "0.625rem 1.5rem",
        display: "flex",
        alignItems: "center",
        gap: "2rem",
      }}
    >
      {/* System status label + state badge */}
      <div
        style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}
      >
        <span
          style={{
            fontSize: "0.6rem",
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--hamilton-text-secondary)",
          }}
        >
          System Status
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
            fontSize: "0.6875rem",
            fontWeight: 600,
            color: dot,
          }}
        >
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: dot,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          {label}
        </span>
      </div>

      {/* Divider */}
      <span
        style={{
          width: "1px",
          height: "1rem",
          backgroundColor: "var(--hamilton-border)",
        }}
      />

      {/* Signal count */}
      <span
        style={{
          fontSize: "0.6875rem",
          color: "var(--hamilton-text-secondary)",
        }}
      >
        <span
          style={{
            fontWeight: 600,
            color: "var(--hamilton-text-primary)",
          }}
        >
          {status.newSignals}
        </span>{" "}
        new {status.newSignals === 1 ? "signal" : "signals"} today
      </span>

      {/* Alert count */}
      {status.highPriorityAlerts > 0 && (
        <>
          <span
            style={{
              width: "1px",
              height: "1rem",
              backgroundColor: "var(--hamilton-border)",
            }}
          />
          <span
            style={{
              fontSize: "0.6875rem",
              color: "#b91c1c",
              fontWeight: 600,
            }}
          >
            {status.highPriorityAlerts} high-priority{" "}
            {status.highPriorityAlerts === 1 ? "alert" : "alerts"}
          </span>
        </>
      )}
    </div>
  );
}
