import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { seedMonitorData } from "@/lib/hamilton/seed-monitor-data";
import { fetchMonitorPageData } from "@/lib/hamilton/monitor-data";
import { StatusStrip } from "@/components/hamilton/monitor/StatusStrip";
import { PriorityAlertCard } from "@/components/hamilton/monitor/PriorityAlertCard";
import { SignalFeed } from "@/components/hamilton/monitor/SignalFeed";
import { WatchlistPanel } from "@/components/hamilton/monitor/WatchlistPanel";
import { FloatingChatOverlay } from "@/components/hamilton/monitor/FloatingChatOverlay";

export const metadata: Metadata = { title: "Institutional Monitor" };

// No ISR — fresh signal data on every page load (per D-11 pattern from home screen)
export const dynamic = "force-dynamic";

export default async function MonitorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Ensure demo signal data exists for v8.0
  await seedMonitorData(user.id);

  const data = await fetchMonitorPageData(user.id);

  return (
    <>
      {/* Status strip — full width above content */}
      <StatusStrip status={data.status} />

      {/* Main content grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: "1.5rem",
          padding: "1.5rem",
          maxWidth: "1280px",
          margin: "0 auto",
        }}
      >
        {/* Left column: Priority Alert + Signal Feed */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <PriorityAlertCard alert={data.topAlert} />
          <SignalFeed signals={data.signalFeed} />
        </div>

        {/* Right rail: Watchlist */}
        <aside>
          <WatchlistPanel entries={data.watchlist} userId={user.id} />
        </aside>
      </div>

      {/* Floating chat overlay — fixed position, renders outside the grid */}
      <FloatingChatOverlay userId={user.id} />
    </>
  );
}
