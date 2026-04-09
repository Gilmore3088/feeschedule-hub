import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { seedMonitorData } from "@/lib/hamilton/seed-monitor-data";
import { fetchMonitorPageData } from "@/lib/hamilton/monitor-data";
import { StatusStrip } from "@/components/hamilton/monitor/StatusStrip";
import { SignalFeed } from "@/components/hamilton/monitor/SignalFeed";
import { WatchlistPanel } from "@/components/hamilton/monitor/WatchlistPanel";
import { FloatingChatOverlay } from "@/components/hamilton/monitor/FloatingChatOverlay";

export const metadata: Metadata = { title: "Institutional Monitor" };

// No ISR — fresh signal data on every page load
export const dynamic = "force-dynamic";

export default async function MonitorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Ensure demo signal data exists
  await seedMonitorData(user.id);

  const data = await fetchMonitorPageData(user.id);

  return (
    <>
      {/* Status strip — full width above content */}
      <StatusStrip status={data.status} />

      {/* Page content */}
      <main
        style={{
          padding: "3rem",
          backgroundColor: "var(--hamilton-surface)",
          minHeight: "calc(100vh - 57px)",
        }}
      >
        {/* Page header */}
        <header style={{ marginBottom: "3rem" }}>
          <h1
            className="font-headline"
            style={{
              fontFamily: "var(--hamilton-font-serif)",
              fontSize: "3rem",
              fontStyle: "italic",
              fontWeight: 400,
              letterSpacing: "-0.02em",
              color: "var(--hamilton-on-surface)",
              marginBottom: "0.5rem",
              lineHeight: 1.1,
            }}
          >
            Institutional Monitor
          </h1>
          <p
            style={{
              fontFamily: "var(--hamilton-font-sans)",
              fontSize: "1.125rem",
              color: "var(--hamilton-secondary, #5f5e5e)",
              maxWidth: "42rem",
              lineHeight: 1.5,
            }}
          >
            Continuous surveillance of high-priority counterparts and fee
            structures to preserve long-term recurring value.
          </p>
        </header>

        {/* 12-col grid: feed (7) + sidebar (5) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "7fr 5fr",
            gap: "3rem",
          }}
        >
          {/* Center column: signal feed */}
          <section>
            {/* Feed header row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "1rem",
              }}
            >
              <h2
                style={{
                  fontFamily: "var(--hamilton-font-sans)",
                  fontSize: "0.625rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  color: "var(--hamilton-text-tertiary)",
                  fontWeight: 600,
                }}
              >
                Live Insight Timeline
              </h2>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "0.625rem",
                  fontFamily: "var(--hamilton-font-sans)",
                  color: "var(--hamilton-primary)",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor: "var(--hamilton-primary)",
                    display: "inline-block",
                    animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                  }}
                />
                LIVE UPDATES
              </span>
            </div>

            <SignalFeed signals={data.signalFeed} topAlert={data.topAlert} />
          </section>

          {/* Right sidebar */}
          <aside>
            <WatchlistPanel entries={data.watchlist} userId={user.id} />
          </aside>
        </div>
      </main>

      {/* Floating chat overlay — fixed position */}
      <FloatingChatOverlay />
    </>
  );
}
