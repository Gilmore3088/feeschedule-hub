import { CustomerNav } from "@/components/customer-nav";
import { CustomerFooter } from "@/components/customer-footer";

export default function PublicLayout({
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
