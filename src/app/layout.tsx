import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://bankfeeindex.com"),
  title: {
    default: "Bank Fee Index - National Fee Benchmarking for Banks & Credit Unions",
    template: "%s | Bank Fee Index",
  },
  description:
    "Compare bank fees nationwide. Free benchmarking data on overdraft, NSF, ATM, wire, and maintenance fees for 10,000+ institutions.",
  openGraph: {
    type: "website",
    siteName: "Bank Fee Index",
  },
  twitter: {
    card: "summary_large_image",
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
        {children}
      </body>
    </html>
  );
}
