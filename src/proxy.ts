import { NextRequest, NextResponse } from "next/server";

// Set to false to disable the coming soon page
const COMING_SOON = true;

const COMING_SOON_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Bank Fee Index - Coming Soon</title>
  <meta name="description" content="The most comprehensive bank and credit union fee benchmarking platform. Launching soon." />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: #0a0a0a;
      color: #fafafa;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .container {
      text-align: center;
      max-width: 640px;
      padding: 2rem;
      position: relative;
      z-index: 1;
    }
    .badge {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #a3a3a3;
      border: 1px solid #262626;
      border-radius: 9999px;
      padding: 0.35rem 1rem;
      margin-bottom: 2rem;
    }
    h1 {
      font-size: 3rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      line-height: 1.1;
      margin-bottom: 1.5rem;
    }
    h1 span {
      background: linear-gradient(135deg, #60a5fa 0%, #818cf8 50%, #a78bfa 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    p {
      font-size: 1.1rem;
      color: #a3a3a3;
      line-height: 1.7;
      margin-bottom: 2.5rem;
    }
    .stats {
      display: flex;
      gap: 2rem;
      justify-content: center;
      margin-bottom: 3rem;
    }
    .stat { text-align: center; }
    .stat-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: #fafafa;
      font-variant-numeric: tabular-nums;
    }
    .stat-label {
      font-size: 0.75rem;
      color: #737373;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-top: 0.25rem;
    }
    .cta {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: #fafafa;
      color: #0a0a0a;
      font-size: 0.9rem;
      font-weight: 600;
      padding: 0.75rem 1.75rem;
      border-radius: 8px;
      text-decoration: none;
      transition: opacity 0.15s;
    }
    .cta:hover { opacity: 0.85; }
    .footer {
      margin-top: 4rem;
      font-size: 0.8rem;
      color: #525252;
    }
    .glow {
      position: fixed;
      width: 600px;
      height: 600px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%);
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    @media (max-width: 640px) {
      h1 { font-size: 2rem; }
      .stats { gap: 1.25rem; }
      .stat-value { font-size: 1.25rem; }
    }
  </style>
</head>
<body>
  <div class="glow"></div>
  <div class="container">
    <div class="badge">Launching 2026</div>
    <h1><span>Bank Fee Index</span></h1>
    <p>
      The most comprehensive bank and credit union fee benchmarking platform.
      Professional fee intelligence for financial institutions, fintechs, and compliance teams.
    </p>
    <a class="cta" href="mailto:hello@feeinsight.com">Get Early Access</a>
    <div class="footer">Fee Insight Research &mdash; Professional fee intelligence for financial institutions</div>
  </div>
</body>
</html>`;

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const { pathname } = request.nextUrl;

  // Domain redirects: old domains -> feeinsight.com
  if (
    host.includes("bankfeeindex.com") ||
    host.includes("thebankfeeindex.com")
  ) {
    const url = new URL(request.url);
    url.host = "feeinsight.com";
    url.protocol = "https:";
    const status =
      request.method === "GET" || request.method === "HEAD" ? 301 : 308;
    return NextResponse.redirect(url, status);
  }

  // Coming soon gate (bypass: admin, API, preview token)
  if (COMING_SOON) {
    const isAdminOrApi =
      pathname.startsWith("/admin") ||
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next");

    if (!isAdminOrApi) {
      // Secret preview bypass via query param (sets cookie for 7 days)
      const previewToken = process.env.BFI_PREVIEW_TOKEN;
      if (previewToken) {
        const url = request.nextUrl;
        if (url.searchParams.get("preview") === previewToken) {
          const response = NextResponse.next();
          response.cookies.set("bfi_preview", previewToken, {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 7,
          });
          return response;
        }
        if (request.cookies.get("bfi_preview")?.value === previewToken) {
          return NextResponse.next();
        }
      }

      return new NextResponse(COMING_SOON_HTML, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }

  // Skip login page itself
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Check for session cookie on all /admin/* routes
  if (pathname.startsWith("/admin")) {
    const session = request.cookies.get("fsh_session");
    if (!session?.value) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("from", pathname);
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
