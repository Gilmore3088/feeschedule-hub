export const dynamic = "force-dynamic";
import { requireAuth } from "@/lib/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getOpsJobSummary, getRecentJobs, getActiveJobs } from "@/lib/crawler-db/ops";
import { getStats } from "@/lib/crawler-db/core";
import { getAllowedCommands } from "@/lib/job-validation";
import { OpsClient } from "./ops-client";

export default async function OpsPage() {
  const user = await requireAuth("trigger_jobs");

  const summary = await getOpsJobSummary();
  const activeJobs = await getActiveJobs();
  const recentJobs = await getRecentJobs(20);
  const stats = await getStats();
  const commands = getAllowedCommands();

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Admin", href: "/admin" },
            { label: "Operations" },
          ]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Operations Center
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Trigger crawls, monitor jobs, and manage the pipeline
        </p>
      </div>

      <OpsClient
        summary={summary}
        activeJobs={activeJobs}
        recentJobs={recentJobs}
        crawlStats={stats}
        commands={commands}
        username={user.username}
      />
    </div>
  );
}
