import { ConsumerNav } from "@/components/consumer-nav";
import { CustomerFooter } from "@/components/customer-footer";
import { SearchModal } from "@/components/public/search-modal";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <ConsumerNav />
      <main>{children}</main>
      <CustomerFooter />
      <SearchModal />
    </div>
  );
}
