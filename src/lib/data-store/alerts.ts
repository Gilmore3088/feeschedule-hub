import { sql } from "./connection";

export interface AlertSubscription {
  id: number;
  user_id: number;
  institution_id: number;
  institution_name: string;
  fee_categories: string[] | null;
  is_active: boolean;
  created_at: string;
}

export async function getAlertSubscriptions(userId: number): Promise<AlertSubscription[]> {
  const rows = await sql`
    SELECT a.id, a.user_id, a.institution_id, a.fee_categories,
           a.is_active, a.created_at,
           ct.institution_name
    FROM institution_fee_alert_subscriptions a
    JOIN institution_sources ct ON ct.id = a.institution_id
    WHERE a.user_id = ${userId} AND a.is_active = TRUE
    ORDER BY ct.institution_name
  `;
  return [...rows] as unknown as AlertSubscription[];
}

export async function addAlertSubscription(
  userId: number,
  institutionId: number,
  feeCategories?: string[],
): Promise<{ id: number }> {
  const [row] = await sql`
    SELECT upsert_institution_fee_alert_subscription(
      ${userId},
      ${institutionId},
      ${feeCategories || null}
    ) as id
  `;
  return { id: Number(row.id) };
}

export async function removeAlertSubscription(
  userId: number,
  institutionId: number,
): Promise<boolean> {
  const [row] = await sql`
    SELECT deactivate_institution_fee_alert_subscription(
      ${userId},
      ${institutionId}
    ) as affected_count
  `;
  return Number(row.affected_count) > 0;
}

export async function getAlertSubscriptionCount(userId: number): Promise<number> {
  const [row] = await sql`
    SELECT COUNT(*) as cnt FROM institution_fee_alert_subscriptions
    WHERE user_id = ${userId} AND is_active = TRUE
  `;
  return Number(row.cnt);
}
