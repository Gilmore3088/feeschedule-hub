import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://bankfeeindex.com"),
  title: {
    default: "Bank Fee Index - National Benchmark for Retail Banking Fees",
    template: "%s | Bank Fee Index",
  },
  description:
    "Compare bank fees across thousands of U.S. institutions. Free national benchmarks for overdraft, NSF, ATM, maintenance, and 45+ fee categories.",
  openGraph: {
    type: "website",
    siteName: "Bank Fee Index",
    title: "Bank Fee Index - National Benchmark for Retail Banking Fees",
    description:
      "Compare bank fees across thousands of U.S. institutions. Free national benchmarks for overdraft, NSF, ATM, maintenance, and 45+ fee categories.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bank Fee Index",
    description:
      "Compare bank fees across thousands of U.S. institutions. Free national benchmarks for 49 fee categories.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Bank Fee Index",
              description:
                "The national benchmark for retail banking fees across U.S. banks and credit unions.",
              url: "https://bankfeeindex.com",
            }).replace(/</g, "\\u003c"),
          }}
        />
        {children}
      </body>
    </html>
  );
}
