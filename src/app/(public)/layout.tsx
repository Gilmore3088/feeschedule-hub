import { ConsumerNav } from "@/components/consumer-nav";
import { CustomerFooter } from "@/components/customer-footer";
import { SearchModal } from "@/components/public/search-modal";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let isAdmin = false;
  let role: string | null = null;
  try {
    const user = await getCurrentUser();
    isAdmin = user?.role === "admin" || user?.role === "analyst";
    role = user?.role ?? null;
  } catch {
    // Not logged in — show normal consumer layout
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {isAdmin && (
        <div className="bg-gray-900 text-white text-xs px-4 py-1.5 flex items-center justify-between">
          <span className="text-gray-400">
            Viewing as {role ?? "admin"} — this is the public consumer view
          </span>
          <Link href="/admin" className="text-blue-400 hover:text-blue-300 font-medium">
            Back to Admin
          </Link>
        </div>
      )}
      <ConsumerNav />
      <main>{children}</main>
      <CustomerFooter />
      <SearchModal />
    </div>
  );
}
