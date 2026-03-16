import { RegisterForm } from "./register-form";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account | Bank Fee Index",
  description: "Create your Bank Fee Index account to access fee benchmarking data",
};

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/account");

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <header className="border-b border-[#E8DFD1] bg-[#FAF7F2]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-md px-4 flex items-center justify-between h-14">
          <a href="/subscribe" className="flex items-center gap-2 text-[#1A1815] no-underline">
            <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] text-[#C44B2E]" stroke="currentColor" strokeWidth="1.5">
              <rect x="4" y="13" width="4" height="8" rx="1" />
              <rect x="10" y="8" width="4" height="13" rx="1" />
              <rect x="16" y="3" width="4" height="18" rx="1" />
            </svg>
            <span className="text-[15px] font-medium tracking-tight" style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}>
              Bank Fee Index
            </span>
          </a>
          <a href="/login" className="text-[13px] font-medium text-[#7A7062] hover:text-[#1A1815] transition-colors">
            Sign in
          </a>
        </div>
      </header>

      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1
              className="text-2xl font-normal tracking-tight text-[#1A1815]"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
            >
              Create your account
            </h1>
            <p className="mt-2 text-sm text-[#7A7062]">
              Get access to bank fee benchmarking data
            </p>
          </div>
          <RegisterForm />
          <p className="mt-4 text-center text-sm text-[#7A7062]">
            Already have an account?{" "}
            <a href="/login" className="text-[#1A1815] font-medium hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
