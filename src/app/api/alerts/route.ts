import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/crawler-db/connection";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/alerts
 * List the current user's active alert subscriptions.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await sql`
      SELECT
        a.id,
        a.crawl_target_id,
        a.fee_categories,
        a.is_active,
        a.last_alerted_at,
        a.created_at,
        ct.institution_name
      FROM fee_alert_subscriptions a
      JOIN crawl_targets ct ON ct.id = a.crawl_target_id
      WHERE a.user_id = ${user.id} AND a.is_active = TRUE
      ORDER BY ct.institution_name
    `;

    return NextResponse.json({ subscriptions: [...rows] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/alerts
 * Add an alert subscription for the current user.
 * Body: { crawl_target_id: number, fee_categories?: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { crawl_target_id, fee_categories } = body;

    if (!crawl_target_id || typeof crawl_target_id !== "number") {
      return NextResponse.json(
        { error: "crawl_target_id is required and must be a number" },
        { status: 400 },
      );
    }

    // Verify the crawl target exists
    const [target] = await sql`
      SELECT id FROM crawl_targets WHERE id = ${crawl_target_id}
    `;
    if (!target) {
      return NextResponse.json(
        { error: "Institution not found" },
        { status: 404 },
      );
    }

    // Validate fee_categories if provided
    if (fee_categories !== undefined) {
      if (!Array.isArray(fee_categories) || fee_categories.some((c: unknown) => typeof c !== "string")) {
        return NextResponse.json(
          { error: "fee_categories must be an array of strings" },
          { status: 400 },
        );
      }
    }

    const categories = fee_categories?.length ? fee_categories : null;

    const [row] = await sql`
      INSERT INTO fee_alert_subscriptions (user_id, crawl_target_id, fee_categories)
      VALUES (${user.id}, ${crawl_target_id}, ${categories})
      ON CONFLICT (user_id, crawl_target_id) DO UPDATE
      SET is_active = TRUE,
          fee_categories = EXCLUDED.fee_categories
      RETURNING id
    `;

    return NextResponse.json({ id: Number(row.id) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/alerts
 * Remove (deactivate) an alert subscription.
 * Body: { crawl_target_id: number }
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { crawl_target_id } = body;

    if (!crawl_target_id || typeof crawl_target_id !== "number") {
      return NextResponse.json(
        { error: "crawl_target_id is required and must be a number" },
        { status: 400 },
      );
    }

    const result = await sql`
      UPDATE fee_alert_subscriptions
      SET is_active = FALSE
      WHERE user_id = ${user.id} AND crawl_target_id = ${crawl_target_id}
    `;

    if (result.count === 0) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
