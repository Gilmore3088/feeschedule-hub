import { NextRequest, NextResponse } from "next/server";

const ADMIN_COOKIE = "fsh_session";
const SUB_COOKIE = "bfi_sub";

/** Paths that require an active paid subscription */
const GATED_PATHS = [
  "/benchmarks",
  "/export",
  "/api/v1",
  "/alerts",
  "/trends",
];

/** Paths that are metered for free users (handled in page components) */
// const METERED_PATHS = ["/compare", "/research"];

function isAdminPath(pathname: string): boolean {
  return pathname.startsWith("/admin/") && !pathname.startsWith("/admin/login");
}

function isGatedPath(pathname: string): boolean {
  return GATED_PATHS.some((p) => pathname.startsWith(p));
}

function isSubscriberAuthPath(pathname: string): boolean {
  return pathname === "/account" || pathname.startsWith("/account/");
}

function hasValidSubCookie(request: NextRequest): {
  active: boolean;
  plan: string | null;
} | null {
  const cookie = request.cookies.get(SUB_COOKIE)?.value;
  if (!cookie) return null;

  try {
    const [encoded] = cookie.split(".");
    if (!encoded) return null;
    // base64url decode
    const json = Buffer.from(encoded, "base64url").toString("utf-8");
    const payload = JSON.parse(json);
    if (Date.now() > payload.exp) return null;
    return {
      active: payload.subscriptionActive ?? false,
      plan: payload.plan ?? null,
    };
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Admin routes: require admin session
  if (isAdminPath(pathname)) {
    const session = request.cookies.get(ADMIN_COOKIE);
    if (!session?.value) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.next();
  }

  // Subscriber account page: require subscriber login
  if (isSubscriberAuthPath(pathname)) {
    const sub = hasValidSubCookie(request);
    if (!sub) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  // Gated paths: require active subscription
  if (isGatedPath(pathname)) {
    const sub = hasValidSubCookie(request);
    if (!sub?.active) {
      return NextResponse.redirect(new URL("/pricing", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/((?!login).*)",
    "/account/:path*",
    "/benchmarks/:path*",
    "/export/:path*",
    "/api/v1/:path*",
    "/alerts/:path*",
    "/trends/:path*",
  ],
};
