import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Bank Fee Index account",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Sign in to Bank Fee Index
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Access your fee benchmarks, exports, and alerts
          </p>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-sm text-slate-500">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="font-medium text-slate-900 hover:underline">
            Create one
          </a>
        </p>
      </div>
    </div>
  );
}
