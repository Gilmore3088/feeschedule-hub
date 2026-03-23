import { sql } from "./connection";

export interface AlertSubscription {
  id: number;
  user_id: number;
  crawl_target_id: number;
  institution_name: string;
  fee_categories: string[] | null;
  is_active: boolean;
  created_at: string;
}

export async function getAlertSubscriptions(userId: number): Promise<AlertSubscription[]> {
  const rows = await sql`
    SELECT a.id, a.user_id, a.crawl_target_id, a.fee_categories,
           a.is_active, a.created_at,
           ct.institution_name
    FROM fee_alert_subscriptions a
    JOIN crawl_targets ct ON ct.id = a.crawl_target_id
    WHERE a.user_id = ${userId} AND a.is_active = TRUE
    ORDER BY ct.institution_name
  `;
  return [...rows] as unknown as AlertSubscription[];
}

export async function addAlertSubscription(
  userId: number,
  crawlTargetId: number,
  feeCategories?: string[],
): Promise<{ id: number }> {
  const [row] = await sql`
    INSERT INTO fee_alert_subscriptions (user_id, crawl_target_id, fee_categories)
    VALUES (${userId}, ${crawlTargetId}, ${feeCategories || null})
    ON CONFLICT (user_id, crawl_target_id) DO UPDATE
    SET is_active = TRUE, fee_categories = EXCLUDED.fee_categories
    RETURNING id
  `;
  return { id: Number(row.id) };
}

export async function removeAlertSubscription(
  userId: number,
  crawlTargetId: number,
): Promise<boolean> {
  const result = await sql`
    UPDATE fee_alert_subscriptions
    SET is_active = FALSE
    WHERE user_id = ${userId} AND crawl_target_id = ${crawlTargetId}
  `;
  return result.count > 0;
}

export async function getAlertSubscriptionCount(userId: number): Promise<number> {
  const [row] = await sql`
    SELECT COUNT(*) as cnt FROM fee_alert_subscriptions
    WHERE user_id = ${userId} AND is_active = TRUE
  `;
  return Number(row.cnt);
}
