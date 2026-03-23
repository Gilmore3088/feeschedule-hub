import { redirect } from "next/navigation";

// Consolidated: all login goes through /login
// Admin users are auto-redirected to /admin after login
export default function AdminLoginRedirect() {
  redirect("/login");
}
