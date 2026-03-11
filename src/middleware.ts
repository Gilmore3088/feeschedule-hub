import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip login page itself
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Check for session cookie on all /admin/* routes
  const session = request.cookies.get("fsh_session");
  if (!session?.value) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};
