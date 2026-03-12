import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getOpsJobSummary, getActiveJobs, getRecentJobs } from "@/lib/crawler-db/ops";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "view")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = getOpsJobSummary();
  const activeJobs = getActiveJobs();
  const recentJobs = getRecentJobs(20);

  return NextResponse.json({ summary, activeJobs, recentJobs });
}
