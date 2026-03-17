"use client";

import { OpsClient } from "../ops/ops-client";
import type { OpsJobSummary, OpsJob } from "@/lib/crawler-db/ops";
import type { CrawlStats } from "@/lib/crawler-db/types";

interface OperationsTabProps {
  summary: OpsJobSummary;
  activeJobs: OpsJob[];
  recentJobs: OpsJob[];
  crawlStats: CrawlStats;
  commands: string[];
  username: string;
  canTrigger: boolean;
}

export function OperationsTab({ summary, activeJobs, recentJobs, crawlStats, commands, username, canTrigger }: OperationsTabProps) {
  if (!canTrigger) {
    return (
      <div className="admin-card p-6 text-center">
        <p className="text-[12px] text-gray-400">
          You need <code className="bg-gray-100 dark:bg-white/10 px-1 rounded">trigger_jobs</code> permission to access Operations.
        </p>
      </div>
    );
  }

  return (
    <OpsClient
      summary={summary}
      activeJobs={activeJobs}
      recentJobs={recentJobs}
      crawlStats={crawlStats}
      commands={commands}
      username={username}
    />
  );
}
