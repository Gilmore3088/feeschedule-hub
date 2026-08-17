import { CustomerNav } from "@/components/customer-nav";
import { CustomerFooter } from "@/components/customer-footer";
import type { Metadata } from "next";
import { SITE_TITLE_TEMPLATE, pageTitle } from "@/lib/constants";

export const metadata: Metadata = {
  title: {
    default: pageTitle("Compare Your Bank's Fees"),
    template: SITE_TITLE_TEMPLATE,
  },
};

export default function ConsumerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <CustomerNav />
      <main>{children}</main>
      <CustomerFooter />
    </div>
  );
}
