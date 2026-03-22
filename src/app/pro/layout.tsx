import { CustomerNav } from "@/components/customer-nav";
import { CustomerFooter } from "@/components/customer-footer";
import { SearchModal } from "@/components/public/search-modal";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Research | Bank Fee Index",
    template: "%s | Bank Fee Index",
  },
};

export default function ProLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <CustomerNav />
      <main>{children}</main>
      <CustomerFooter />
      <SearchModal />
    </div>
  );
}
