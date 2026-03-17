import { NextResponse } from "next/server";
import { getCityAutocomplete } from "@/lib/crawler-db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const results = getCityAutocomplete(q, 8);
  return NextResponse.json(results);
}
