import { sql } from "@/lib/crawler-db/connection";

export async function logApiUsage(
  organizationId: number | null,
  anonymousId: string | null,
  eventType: string,
  metadata?: object
): Promise<void> {
  try {
    await sql`
      INSERT INTO usage_events (organization_id, anonymous_id, event_type, metadata)
      VALUES (
        ${organizationId},
        ${anonymousId},
        ${eventType},
        ${metadata ? JSON.stringify(metadata) : null}
      )
    `;
  } catch (err) {
    // Log but don't throw — usage metering should never break the API
    console.error("Failed to log API usage:", err);
  }
}
