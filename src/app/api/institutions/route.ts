import { NextRequest, NextResponse } from "next/server";
import { autocompleteInstitutions } from "@/lib/crawler-db/search";

export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";
  const results = autocompleteInstitutions(q, 8);
  return NextResponse.json(results);
}
