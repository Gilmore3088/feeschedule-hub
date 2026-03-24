export const dynamic = "force-dynamic";
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
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left panel - hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#FAF7F2] flex-col justify-center items-center px-12">
        {/* Grid texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(#1A1815 1px, transparent 1px), linear-gradient(90deg, #1A1815 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative z-10 max-w-md">
          {/* Logo */}
          <a href="/" className="inline-flex items-center gap-2 text-[#1A1815] no-underline mb-10">
            <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] text-[#C44B2E]" stroke="currentColor" strokeWidth="1.5">
              <rect x="4" y="13" width="4" height="8" rx="1" />
              <rect x="10" y="8" width="4" height="13" rx="1" />
              <rect x="16" y="3" width="4" height="18" rx="1" />
            </svg>
            <span className="text-[15px] font-medium tracking-tight" style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}>
              Bank Fee Index
            </span>
          </a>

          {/* Accent line */}
          <div className="w-10 h-[3px] bg-[#C44B2E] rounded-full mb-6" />

          <p
            className="text-3xl text-[#1A1815] tracking-tight leading-snug mb-3"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontStyle: "italic" }}
          >
            Start exploring for free
          </p>

          <p className="text-sm text-[#7A7062] leading-relaxed mb-10">
            Free to start, upgrade anytime. Access the most comprehensive
            source for consumer banking fee data.
          </p>

          {/* Feature list */}
          <ul className="space-y-4">
            {[
              "Search 8,000+ institutions",
              "49 fee categories",
              "Plain-language guides",
              "3 free AI research queries/day",
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-[18px] w-[18px] text-[#C44B2E] mt-0.5 shrink-0"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm text-[#1A1815]">{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center bg-white px-4 py-12 lg:py-0">
        <div className="w-full max-w-md">
          {/* Mobile header */}
          <div className="flex items-center justify-between mb-8 lg:hidden">
            <a href="/" className="inline-flex items-center gap-2 text-[#1A1815] no-underline">
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

          <div className="lg:bg-white lg:rounded-xl lg:p-8">
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
    </div>
  );
}
