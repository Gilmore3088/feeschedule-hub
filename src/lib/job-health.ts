export interface JobHealthCounts {
  stale_count: number;
  failed_count: number;
  never_ran_count: number;
  agent_error_count_24h?: number;
  provider_failure_count_24h?: number;
  automation_enabled?: boolean;
}

export function isJobHealthDegraded(health: JobHealthCounts): boolean {
  return (
    health.stale_count > 0 ||
    health.failed_count > 0 ||
    health.never_ran_count > 0 ||
    (health.agent_error_count_24h ?? 0) > 0 ||
    (health.provider_failure_count_24h ?? 0) > 0 ||
    health.automation_enabled === false
  );
}
