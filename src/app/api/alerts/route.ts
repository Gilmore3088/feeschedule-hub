import { withApiRoutePolicy } from "@/lib/api-hardening/route-wrapper";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/data-store/connection";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/alerts
 * List the current user's active alert subscriptions.
 */
async function handleGET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await sql`
      SELECT
        a.id,
        a.institution_id,
        a.fee_categories,
        a.is_active,
        a.last_alerted_at,
        a.created_at,
        ct.institution_name
      FROM institution_fee_alert_subscriptions a
      JOIN institution_sources ct ON ct.id = a.institution_id
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
 * Body: { institution_id: number, fee_categories?: string[] }
 */
async function handlePOST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { institution_id, fee_categories } = body;

    if (!institution_id || typeof institution_id !== "number") {
      return NextResponse.json(
        { error: "institution_id is required and must be a number" },
        { status: 400 },
      );
    }

    // Verify the crawl target exists
    const [target] = await sql`
      SELECT id FROM institution_sources WHERE id = ${institution_id}
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
      SELECT upsert_institution_fee_alert_subscription(
        ${user.id},
        ${institution_id},
        ${categories}
      ) as id
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
 * Body: { institution_id: number }
 */
async function handleDELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { institution_id } = body;

    if (!institution_id || typeof institution_id !== "number") {
      return NextResponse.json(
        { error: "institution_id is required and must be a number" },
        { status: 400 },
      );
    }

    const [row] = await sql`
      SELECT deactivate_institution_fee_alert_subscription(
        ${user.id},
        ${institution_id}
      ) as affected_count
    `;

    if (Number(row.affected_count) === 0) {
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

export const GET = withApiRoutePolicy("api.alerts", "GET", handleGET);
export const POST = withApiRoutePolicy("api.alerts", "POST", handlePOST);
export const DELETE = withApiRoutePolicy("api.alerts", "DELETE", handleDELETE);
