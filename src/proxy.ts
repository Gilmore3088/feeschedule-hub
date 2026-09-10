import { NextRequest, NextResponse } from "next/server";
import { citySlug, cityName } from "./lib/city-slug";

function requestHeadersWithPath(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const pathWithSearch = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  requestHeaders.set("x-invoke-path", pathWithSearch);
  requestHeaders.set("x-next-url", pathWithSearch);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return requestHeaders;
}

function isRouteBranch(pathname: string, branch: string) {
  return pathname === branch || pathname.startsWith(`${branch}/`);
}

/** Retired public paths -> their current homes (exact-path, permanent). */
const LEGACY_PATH_REDIRECTS: Record<string, string> = {
  "/consumer": "/institutions",
  "/check": "/institutions",
  "/districts": "/research",
  "/waitlist": "/for-institutions#report",
  "/pricing": "/subscribe",
  "/report": "/for-institutions#report",
  "/request-report": "/for-institutions#report",
  "/claim": "/submit-fees?claim=1",
};

function permanentRedirectStatus(method: string) {
  return method === "GET" || method === "HEAD" ? 301 : 308;
}

const CITY_PAGE_PATTERN = /^\/fees\/city\/([^/]+)\/([^/]+)\/?$/;

/**
 * Canonicalizes `/fees/city/:state/:city` to a lowercase state code and a
 * lowercase, hyphenated city slug (e.g. `/fees/city/TX/Fort%20Worth` or
 * `/fees/city/tx/FORT-WORTH` -> `/fees/city/tx/fort-worth`). Returns null
 * when the path already is canonical or isn't a city page at all.
 */
function canonicalCityPath(pathname: string): string | null {
  const match = pathname.match(CITY_PAGE_PATTERN);
  if (!match) return null;
  const [, stateSegment, citySegment] = match;

  const canonicalState = stateSegment.toLowerCase();
  let canonicalCity: string;
  try {
    canonicalCity = citySlug(cityName(citySegment));
  } catch {
    return null;
  }
  if (!canonicalCity || (canonicalState === stateSegment && canonicalCity === citySegment)) {
    return null;
  }
  return `/fees/city/${canonicalState}/${canonicalCity}`;
}

const STATE_RESEARCH_PATTERN = /^\/research\/state\/([^/]+)\/?$/;

/**
 * Canonicalizes `/research/state/:code` to an uppercase state code (e.g.
 * `/research/state/oh` -> `/research/state/OH`). Returns null when the path
 * already is canonical or isn't a state research page at all.
 */
function canonicalStatePath(pathname: string): string | null {
  const match = pathname.match(STATE_RESEARCH_PATTERN);
  if (!match) return null;
  const [, codeSegment] = match;

  const canonicalCode = codeSegment.toUpperCase();
  if (canonicalCode === codeSegment) return null;
  return `/research/state/${canonicalCode}`;
}

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
    return NextResponse.redirect(url, permanentRedirectStatus(request.method));
  }

  const legacyTarget = LEGACY_PATH_REDIRECTS[pathname];
  if (legacyTarget) {
    const url = new URL(legacyTarget, request.url);
    return NextResponse.redirect(url, permanentRedirectStatus(request.method));
  }

  const canonicalCity = canonicalCityPath(pathname);
  if (canonicalCity) {
    const url = new URL(canonicalCity, request.url);
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url, permanentRedirectStatus(request.method));
  }

  const canonicalState = canonicalStatePath(pathname);
  if (canonicalState) {
    const url = new URL(canonicalState, request.url);
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url, permanentRedirectStatus(request.method));
  }

  // Skip login page itself
  if (pathname === "/admin/login") {
    const requestHeaders = requestHeadersWithPath(request);
    requestHeaders.set("x-bfi-admin-login-route", "1");
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // Check for session cookie on all /admin routes.
  if (isRouteBranch(pathname, "/admin")) {
    const session = request.cookies.get("fsh_session");
    if (!session?.value) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("from", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
  }

  // No-session Pro routes should redirect before App Router rendering so
  // institution-specific return paths do not depend on streamed meta redirects.
  if (isRouteBranch(pathname, "/pro")) {
    const session = request.cookies.get("fsh_session");
    if (!session?.value) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("from", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next({
    request: { headers: requestHeadersWithPath(request) },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|sitemap.xml|robots.txt|manifest.webmanifest).*)",
  ],
};
