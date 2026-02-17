import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bank Fee Index - National Fee Benchmarking for Banks & Credit Unions",
  description:
    "Submit your fee schedule. See how you compare to peers. Get quarterly benchmarking reports with pricing data and examples.",
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
