import { NextRequest, NextResponse } from "next/server";

// Set to false to disable the coming soon page
const COMING_SOON = true;

const COMING_SOON_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Bank Fee Index - The National Benchmark for Banking Fees</title>
  <meta name="description" content="Compare bank and credit union fees across 9,000+ institutions. The first comprehensive fee benchmarking platform for consumers, consultants, and financial institutions." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: #FAF7F2;
      color: #1A1815;
      min-height: 100vh;
    }
    .header {
      border-bottom: 1px solid #E8DFD1;
      padding: 1rem 2rem;
    }
    .header-inner {
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .logo-icon {
      width: 18px;
      height: 18px;
      color: #C44B2E;
    }
    .logo-text {
      font-family: 'Newsreader', Georgia, serif;
      font-size: 15px;
      font-weight: 500;
      letter-spacing: -0.01em;
      color: #1A1815;
    }
    .hero {
      max-width: 720px;
      margin: 0 auto;
      padding: 6rem 2rem 3rem;
      text-align: center;
    }
    .badge {
      display: inline-block;
      font-size: 0.65rem;
      font-weight: 600;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #C44B2E;
      border: 1px solid #E0C9B8;
      border-radius: 9999px;
      padding: 0.3rem 0.9rem;
      margin-bottom: 2rem;
      background: #FFF8F5;
    }
    h1 {
      font-family: 'Newsreader', Georgia, serif;
      font-size: 3.2rem;
      font-weight: 400;
      letter-spacing: -0.03em;
      line-height: 1.15;
      margin-bottom: 1.5rem;
      color: #1A1815;
    }
    h1 em {
      font-style: italic;
      color: #C44B2E;
    }
    .subtitle {
      font-size: 1.1rem;
      color: #7A7062;
      line-height: 1.7;
      margin-bottom: 2.5rem;
      max-width: 540px;
      margin-left: auto;
      margin-right: auto;
    }
    .cta-group {
      display: flex;
      gap: 0.75rem;
      justify-content: center;
      flex-wrap: wrap;
      margin-bottom: 4rem;
    }
    .cta-primary {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: #C44B2E;
      color: #fff;
      font-size: 0.85rem;
      font-weight: 600;
      padding: 0.7rem 1.5rem;
      border-radius: 6px;
      text-decoration: none;
      transition: background 0.15s;
      border: none;
      cursor: pointer;
    }
    .cta-primary:hover { background: #A83D25; }
    .cta-secondary {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: transparent;
      color: #1A1815;
      font-size: 0.85rem;
      font-weight: 500;
      padding: 0.7rem 1.5rem;
      border-radius: 6px;
      text-decoration: none;
      border: 1px solid #D5CBBF;
      transition: border-color 0.15s;
    }
    .cta-secondary:hover { border-color: #1A1815; }
    .lead-form {
      max-width: 480px;
      margin: 0 auto 3rem;
      text-align: left;
    }
    .lead-form .form-row {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }
    .lead-form .form-row.full { display: block; }
    .lead-form label {
      display: block;
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #7A7062;
      margin-bottom: 0.3rem;
    }
    .lead-form input, .lead-form select, .lead-form textarea {
      width: 100%;
      padding: 0.6rem 0.75rem;
      border: 1px solid #D5CBBF;
      border-radius: 6px;
      font-size: 0.88rem;
      font-family: inherit;
      background: #FFFDF9;
      color: #1A1815;
      outline: none;
      transition: border-color 0.15s;
    }
    .lead-form input:focus, .lead-form select:focus, .lead-form textarea:focus {
      border-color: #C44B2E;
    }
    .lead-form textarea { resize: vertical; min-height: 60px; }
    .lead-form .field { flex: 1; }
    .form-submit {
      width: 100%;
      padding: 0.75rem;
      background: #C44B2E;
      color: #fff;
      font-size: 0.88rem;
      font-weight: 600;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s;
      margin-top: 0.25rem;
    }
    .form-submit:hover { background: #A83D25; }
    .form-submit:disabled { opacity: 0.6; cursor: not-allowed; }
    .form-success {
      text-align: center;
      padding: 2rem;
      border: 1px solid #D5CBBF;
      border-radius: 10px;
      background: #FFFDF9;
    }
    .form-success h3 {
      font-family: 'Newsreader', Georgia, serif;
      font-size: 1.3rem;
      margin-bottom: 0.5rem;
      color: #1A1815;
    }
    .form-success p { font-size: 0.88rem; color: #7A7062; }
    .features {
      max-width: 900px;
      margin: 0 auto;
      padding: 0 2rem 4rem;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
    }
    .feature {
      padding: 1.5rem;
      border: 1px solid #E8DFD1;
      border-radius: 10px;
      background: #FFFDF9;
    }
    .feature-icon {
      width: 32px;
      height: 32px;
      color: #C44B2E;
      margin-bottom: 0.75rem;
    }
    .feature h3 {
      font-family: 'Newsreader', Georgia, serif;
      font-size: 1rem;
      font-weight: 500;
      margin-bottom: 0.4rem;
      color: #1A1815;
    }
    .feature p {
      font-size: 0.8rem;
      color: #7A7062;
      line-height: 1.6;
    }
    .audiences {
      max-width: 900px;
      margin: 0 auto;
      padding: 0 2rem 4rem;
      text-align: center;
    }
    .audiences h2 {
      font-family: 'Newsreader', Georgia, serif;
      font-size: 1.5rem;
      font-weight: 400;
      margin-bottom: 1.5rem;
      color: #1A1815;
    }
    .audience-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
    }
    .audience {
      padding: 1.25rem 1rem;
      border: 1px solid #E8DFD1;
      border-radius: 8px;
      background: #FFFDF9;
    }
    .audience-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #C44B2E;
      margin-bottom: 0.3rem;
    }
    .audience p {
      font-size: 0.78rem;
      color: #7A7062;
      line-height: 1.5;
    }
    .footer {
      border-top: 1px solid #E8DFD1;
      padding: 2rem;
      text-align: center;
      font-size: 0.78rem;
      color: #A69D90;
    }
    .footer a { color: #7A7062; }
    @media (max-width: 768px) {
      h1 { font-size: 2.2rem; }
      .features { grid-template-columns: 1fr; }
      .audience-grid { grid-template-columns: repeat(2, 1fr); }
      .hero { padding: 4rem 1.5rem 2rem; }
    }
    @media (max-width: 480px) {
      .audience-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-inner">
      <svg viewBox="0 0 24 24" fill="none" class="logo-icon" stroke="currentColor" stroke-width="1.5">
        <rect x="4" y="13" width="4" height="8" rx="1" />
        <rect x="10" y="8" width="4" height="13" rx="1" />
        <rect x="16" y="3" width="4" height="18" rx="1" />
      </svg>
      <span class="logo-text">Bank Fee Index</span>
    </div>
  </div>

  <div class="hero">
    <div class="badge">Coming Soon</div>
    <h1>The national benchmark for <em>banking fees</em></h1>
    <p class="subtitle">
      Compare fees across 9,000+ banks and credit unions.
      Research-grade data for consumers, consultants, fintechs,
      and financial institutions.
    </p>
    <div id="lead-form-container" class="lead-form">
      <form id="lead-form" onsubmit="submitLead(event)">
        <div class="form-row">
          <div class="field">
            <label for="name">Your Name</label>
            <input type="text" id="name" name="name" required placeholder="Jane Smith" />
          </div>
          <div class="field">
            <label for="company">Company</label>
            <input type="text" id="company" name="company" required placeholder="First National Bank" />
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="email">Work Email</label>
            <input type="email" id="email" name="email" required placeholder="jane@firstnational.com" />
          </div>
          <div class="field">
            <label for="role">Role</label>
            <select id="role" name="role" required>
              <option value="">Select...</option>
              <option value="bank_cu">Bank / Credit Union</option>
              <option value="consultant">Consultant / Advisory</option>
              <option value="fintech">Fintech / Vendor</option>
              <option value="compliance">Compliance / Risk</option>
              <option value="researcher">Researcher / Analyst</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div class="form-row full">
          <div class="field">
            <label for="use_case">How would you use fee benchmarking data?</label>
            <textarea id="use_case" name="use_case" placeholder="e.g., Peer comparison for board reporting, competitive pricing analysis..." rows="2"></textarea>
          </div>
        </div>
        <button type="submit" class="form-submit" id="submit-btn">Get Early Access</button>
      </form>
    </div>
    <script>
    async function submitLead(e) {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      btn.textContent = 'Submitting...';
      try {
        const form = document.getElementById('lead-form');
        const data = Object.fromEntries(new FormData(form));
        const resp = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (resp.ok) {
          document.getElementById('lead-form-container').innerHTML =
            '<div class="form-success"><h3>Thank you!</h3><p>We will be in touch shortly with early access details.</p></div>';
        } else {
          btn.disabled = false;
          btn.textContent = 'Get Early Access';
          alert('Something went wrong. Please email hello@bankfeeindex.com directly.');
        }
      } catch {
        btn.disabled = false;
        btn.textContent = 'Get Early Access';
        alert('Connection error. Please try again.');
      }
    }
    </script>
  </div>

  <div class="features">
    <div class="feature">
      <svg viewBox="0 0 24 24" fill="none" class="feature-icon" stroke="currentColor" stroke-width="1.5">
        <path d="M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z" />
      </svg>
      <h3>Fee Benchmarking</h3>
      <p>49 fee categories with median, percentile, and peer comparisons across charter types, asset tiers, and Fed districts.</p>
    </div>
    <div class="feature">
      <svg viewBox="0 0 24 24" fill="none" class="feature-icon" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
      <h3>Market Intelligence</h3>
      <p>Track fee trends, detect pricing changes, and analyze competitive positioning with daily-updated economic context.</p>
    </div>
    <div class="feature">
      <svg viewBox="0 0 24 24" fill="none" class="feature-icon" stroke="currentColor" stroke-width="1.5">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
      <h3>Research API</h3>
      <p>Programmatic access to fee data, economic indicators, and institutional profiles. Build reports and integrations.</p>
    </div>
  </div>

  <div class="audiences">
    <h2>Built for every stakeholder</h2>
    <div class="audience-grid">
      <div class="audience">
        <div class="audience-label">Consumers</div>
        <p>Compare fees at your bank to national benchmarks</p>
      </div>
      <div class="audience">
        <div class="audience-label">Consultants</div>
        <p>Peer analysis and competitive intelligence for client engagements</p>
      </div>
      <div class="audience">
        <div class="audience-label">Fintechs</div>
        <p>Fee data APIs for product development and pricing models</p>
      </div>
      <div class="audience">
        <div class="audience-label">Institutions</div>
        <p>Benchmark your fee schedule against peers and market trends</p>
      </div>
    </div>
  </div>

  <div class="footer">
    <a href="mailto:hello@bankfeeindex.com">hello@bankfeeindex.com</a>
    &nbsp;&middot;&nbsp; Fee Insight Research &nbsp;&middot;&nbsp; 2026
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
    url.hostname = "feeinsight.com";
    url.port = "";
    url.protocol = "https:";
    const status =
      request.method === "GET" || request.method === "HEAD" ? 301 : 308;
    return NextResponse.redirect(url, status);
  }

  // Coming soon gate (bypass: admin, API, preview token)
  if (COMING_SOON) {
    const isWhitelisted =
      pathname.startsWith("/admin") ||
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/register") ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/subscribe") ||
      pathname.startsWith("/account");

    // Logged-in users bypass the coming soon gate entirely
    const hasSession = !!request.cookies.get("fsh_session")?.value;

    if (!isWhitelisted && !hasSession) {
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
