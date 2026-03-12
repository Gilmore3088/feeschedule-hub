import { NextRequest, NextResponse } from "next/server";
import {
  getInstitutionById,
  getFeesByInstitution,
  getInstitutionsByFilter,
} from "@/lib/crawler-db";

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  const state = searchParams.get("state");
  const charter = searchParams.get("charter");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

  // Single institution detail
  if (id) {
    const instId = parseInt(id, 10);
    if (isNaN(instId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const inst = getInstitutionById(instId);
    if (!inst) {
      return NextResponse.json({ error: "Institution not found" }, { status: 404 });
    }

    const fees = getFeesByInstitution(instId)
      .filter((f) => f.review_status !== "rejected")
      .map((f) => ({
        fee_name: f.fee_name,
        amount: f.amount,
        frequency: f.frequency,
        conditions: f.conditions,
        review_status: f.review_status,
      }));

    return NextResponse.json({
      id: inst.id,
      name: inst.institution_name,
      state: inst.state_code,
      city: inst.city,
      charter_type: inst.charter_type,
      asset_size: inst.asset_size,
      asset_tier: inst.asset_size_tier,
      fed_district: inst.fed_district,
      fee_count: fees.length,
      fees,
    });
  }

  // List institutions
  const filters: {
    charter_type?: string;
    state_code?: string;
    page: number;
    pageSize: number;
  } = { page, pageSize };

  if (charter === "bank" || charter === "credit_union") {
    filters.charter_type = charter;
  }
  if (state && state.length === 2) {
    filters.state_code = state.toUpperCase();
  }

  const { rows, total } = getInstitutionsByFilter(filters);

  return NextResponse.json({
    total,
    page,
    page_size: pageSize,
    pages: Math.ceil(total / pageSize),
    data: rows.map((r) => ({
      id: r.id,
      name: r.institution_name,
      state: r.state_code,
      city: r.city,
      charter_type: r.charter_type,
      asset_size: r.asset_size,
      asset_tier: r.asset_size_tier,
      fed_district: r.fed_district,
      fee_count: r.fee_count,
    })),
  });
}
