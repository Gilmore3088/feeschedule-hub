/**
 * seedMonitorData — Insert demo signals and alerts for v8.0.
 * Idempotent: checks for existing rows before inserting.
 * Called once from the Monitor page on first load.
 * Automated signal pipeline is deferred post-v8.0.
 */

import { sql } from "@/lib/crawler-db/connection";

const SEED_SIGNALS = [
  {
    institutionId: "first-national-bank",
    signalType: "fee_increase",
    severity: "high",
    title: "First National Bank raised overdraft fee from $32 to $38",
    body: "A 19% overdraft fee increase puts First National 24% above the peer median of $30.75. Expect customer attrition pressure on rate-sensitive segments.",
    daysAgo: 1,
  },
  {
    institutionId: "commerce-bank",
    signalType: "peer_outlier",
    severity: "high",
    title: "Commerce Bank now charges $0 monthly maintenance — outlier position",
    body: "Commerce Bank eliminated monthly maintenance fees entirely. This outlier move is attracting new accounts from fee-sensitive consumers and may signal a broader regional trend.",
    daysAgo: 2,
  },
  {
    institutionId: "midwest-credit-union",
    signalType: "competitive_shift",
    severity: "medium",
    title: "Midwest Credit Union restructured NSF fee schedule",
    body: "NSF fee reduced from $35 to $25 with a daily cap of 3 fees. Represents a $10 reduction that could increase account acquisition among overdraft-prone segments.",
    daysAgo: 3,
  },
  {
    institutionId: "regional-savings-bank",
    signalType: "rate_change",
    severity: "medium",
    title: "Regional Savings Bank introduced tiered wire transfer pricing",
    body: "Domestic outbound wire fee now $18 for standard accounts, $12 for premium. This tiering strategy is increasingly common among mid-size institutions seeking to retain high-value customers.",
    daysAgo: 5,
  },
  {
    institutionId: "community-first-bank",
    signalType: "new_entrant",
    severity: "low",
    title: "Community First Bank launched no-fee checking — new market entrant",
    body: "New charter in your district is offering no-fee checking as a launch promotion. Impact is limited for now, but warrants monitoring if the promotion becomes permanent.",
    daysAgo: 7,
  },
];

export async function seedMonitorData(userId: number): Promise<void> {
  try {
    const existingRows = await sql`SELECT COUNT(*)::int AS count FROM hamilton_signals`;
    const count = Number(existingRows[0]?.count ?? 0);
    if (count > 0) return;

    const now = new Date();

    // Insert signals one by one to capture returned IDs
    const insertedIds: string[] = [];
    for (const sig of SEED_SIGNALS) {
      const signalDate = new Date(now);
      signalDate.setDate(signalDate.getDate() - sig.daysAgo);

      const rows = await sql`
        INSERT INTO hamilton_signals
          (institution_id, signal_type, severity, title, body, created_at)
        VALUES
          (${sig.institutionId}, ${sig.signalType}, ${sig.severity}, ${sig.title}, ${sig.body}, ${signalDate.toISOString()})
        RETURNING id
      `;
      insertedIds.push(String(rows[0].id));
    }

    // Create priority alerts for high + medium signals (first 4)
    for (const signalId of insertedIds.slice(0, 4)) {
      await sql`
        INSERT INTO hamilton_priority_alerts
          (user_id, signal_id, status, created_at)
        VALUES
          (${userId}, ${signalId}::uuid, 'active', NOW())
      `;
    }
  } catch {
    // Swallow — demo data is optional, page degrades gracefully to empty state
  }
}
