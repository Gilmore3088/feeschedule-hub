import { PublicShell } from "@/components/public-shell";

// Deliberately no loading.tsx anywhere in this group's chain (unlike
// (public)). A route-level loading.tsx makes Next.js commit to streaming the
// segment behind a fallback and flush a 200 status before the page's own
// notFound()/error() has a chance to run, so any page here whose HTTP
// status must be trustworthy (real 404s for bad ids) belongs in this group
// instead of (public). Falls through to the root not-found.tsx, which
// renders the same nav/footer chrome standalone.
export default async function PublicStrictLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PublicShell>{children}</PublicShell>;
}
