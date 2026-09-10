import { ConsumerNav } from "@/components/consumer-nav";
import { CustomerFooter } from "@/components/customer-footer";
import { NotFoundContent } from "@/components/not-found-content";

// Renders for any URL outside the (public) route group's own not-found.tsx
// (e.g. genuinely unmatched top-level paths), so it supplies the site chrome
// itself — nothing above it in the tree does.
export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <ConsumerNav />
      <main>
        <NotFoundContent />
      </main>
      <CustomerFooter />
    </div>
  );
}
