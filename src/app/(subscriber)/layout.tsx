import { PublicNav } from "@/components/public-nav";
import { PublicFooter } from "@/components/public-footer";

export default function SubscriberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <PublicNav />
      <main className="pt-14">{children}</main>
      <PublicFooter />
    </div>
  );
}
