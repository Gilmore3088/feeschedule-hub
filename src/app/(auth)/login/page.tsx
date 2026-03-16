import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Bank Fee Index",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/account");

  const params = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <a href="/" className="inline-flex items-center gap-2 text-[#1A1815] no-underline mb-4">
            <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] text-[#C44B2E]" stroke="currentColor" strokeWidth="1.5">
              <rect x="4" y="13" width="4" height="8" rx="1" />
              <rect x="10" y="8" width="4" height="13" rx="1" />
              <rect x="16" y="3" width="4" height="18" rx="1" />
            </svg>
            <span className="text-[15px] font-medium tracking-tight" style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}>
              Bank Fee Index
            </span>
          </a>
          <h1 className="text-2xl font-bold tracking-tight text-[#1A1815]">
            Sign in
          </h1>
        </div>
        <LoginForm redirectTo={params.from || "/account"} />
        <p className="mt-4 text-center text-sm text-[#7A7062]">
          Don&apos;t have an account?{" "}
          <a href="/register" className="text-[#1A1815] font-medium hover:underline">
            Create one
          </a>
        </p>
      </div>
    </div>
  );
}
