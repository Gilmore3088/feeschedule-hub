import { timingSafeEqual } from "node:crypto";

interface CronSecretEnvironment {
  REPORT_CRON_SECRET?: string;
  BFI_REVALIDATE_TOKEN?: string;
}

export function matchesConfiguredCronSecret(
  headerSecret: string | null,
  environment: CronSecretEnvironment = {
    REPORT_CRON_SECRET: process.env.REPORT_CRON_SECRET,
    BFI_REVALIDATE_TOKEN: process.env.BFI_REVALIDATE_TOKEN,
  },
): boolean {
  const candidate = headerSecret?.trim();
  if (!candidate) return false;

  return [environment.REPORT_CRON_SECRET, environment.BFI_REVALIDATE_TOKEN]
    .map((secret) => secret?.trim())
    .filter((secret): secret is string => Boolean(secret))
    .some((secret) => secureEqual(candidate, secret));
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length
    && timingSafeEqual(leftBuffer, rightBuffer);
}
