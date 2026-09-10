import { PublicShell } from "@/components/public-shell";
import { NotFoundContent } from "@/components/not-found-content";

// Renders for any URL outside the (public) route group's own not-found.tsx
// (e.g. genuinely unmatched top-level paths), so it supplies the site chrome
// itself — nothing above it in the tree does. Reuses PublicShell (rather
// than rendering ConsumerNav/CustomerFooter directly) so the Search
// button/⌘K in ConsumerNav has the <SearchModal/> it needs — this is the
// most-hit 404, so a dead search trigger here is worse than most places.
export default function NotFound() {
  return (
    <PublicShell>
      <NotFoundContent />
    </PublicShell>
  );
}
