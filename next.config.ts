import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ['@react-pdf/renderer'],

  async redirects() {
    return [
      { source: '/pro/categories', destination: '/pro/monitor', permanent: true },
      { source: '/pro/peers', destination: '/pro/monitor', permanent: true },
      { source: '/pro/market', destination: '/pro/analyze', permanent: true },
      { source: '/pro/districts', destination: '/pro/analyze', permanent: true },
      { source: '/pro/data', destination: '/pro/analyze', permanent: true },
      { source: '/pro/news', destination: '/pro/monitor', permanent: true },
      { source: '/pro/research', destination: '/pro/analyze', permanent: true },
      { source: '/pro/reports-legacy', destination: '/pro/reports', permanent: true },
      { source: '/pro/brief', destination: '/pro/monitor', permanent: true },
      { source: '/pro/brief/:path*', destination: '/pro/monitor', permanent: true },
    ];
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
              "script-src 'self' 'unsafe-inline' https://plausible.io https://js.stripe.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self' https://plausible.io https://api.stripe.com",
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
