import { PublicShell } from "@/components/public-shell";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PublicShell>{children}</PublicShell>;
}
