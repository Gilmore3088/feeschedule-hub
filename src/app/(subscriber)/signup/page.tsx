import type { Metadata } from "next";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create a Bank Fee Index account for your institution",
};

export default function SignupPage() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Get started with Bank Fee Index for your institution
          </p>
        </div>
        <SignupForm />
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <a href="/login" className="font-medium text-slate-900 hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
