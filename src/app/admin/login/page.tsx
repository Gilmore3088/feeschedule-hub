import { redirect } from "next/navigation";
import { sanitizeInternalRedirect } from "@/lib/safe-redirect";

// Consolidated: all login goes through /login
export default async function AdminLoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const destination = sanitizeInternalRedirect(from, "/admin");
  const params = new URLSearchParams({ from: destination });
  redirect(`/login?${params.toString()}`);
}
