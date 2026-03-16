import { CustomerNav } from "@/components/customer-nav";
import { CustomerFooter } from "@/components/customer-footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Bank Fee Index - Compare Your Bank's Fees",
    template: "%s | Bank Fee Index",
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
