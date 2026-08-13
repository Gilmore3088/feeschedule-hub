import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const { pathname } = request.nextUrl;

  // Domain redirects: old domains -> feeinsight.com
  if (
    host.includes("bankfeeindex.com") ||
    host.includes("thebankfeeindex.com")
  ) {
    const url = new URL(request.url);
    url.hostname = "feeinsight.com";
    url.port = "";
    url.protocol = "https:";
    const status =
      request.method === "GET" || request.method === "HEAD" ? 301 : 308;
    return NextResponse.redirect(url, status);
  }

  // Skip login page itself
  if (pathname === "/admin/login") {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-bfi-admin-login-route", "1");
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // Check for session cookie on all /admin/* routes
  if (pathname.startsWith("/admin")) {
    const session = request.cookies.get("fsh_session");
    if (!session?.value) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("from", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|sitemap.xml|robots.txt|manifest.webmanifest).*)",
  ],
};
