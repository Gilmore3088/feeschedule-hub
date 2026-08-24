import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,

  // Hosted/sample Competitive Fee Position reports are read from disk at request time
  // (src/lib/hosted-reports.ts); make sure the studio files ship with the server bundle.
  outputFileTracingIncludes: {
    "/r/**": ["./Reports/studio/out/*.html", "./Reports/studio/hosted-reports.json"],
    "/reports/sample-competitive-fee-position": ["./Reports/studio/sample/*.html"],
    // Brand faces for generated PDFs. @react-pdf/renderer reads these from disk
    // at render time (src/components/hamilton/reports/pdf-theme.ts); without
    // this the renderer silently falls back to built-in Helvetica in production.
    "/api/pro/report-pdf": ["./src/lib/pdf-fonts/*.ttf"],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://plausible.io https://js.stripe.com https://va.vercel-scripts.com",
              // Google Fonts stylesheet (Material Symbols Outlined for /pro icons)
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob:",
              // Google Fonts font files (Material Symbols served from gstatic)
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://plausible.io https://api.stripe.com https://vitals.vercel-insights.com",
              "frame-src 'self' https://js.stripe.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
