import { RegisterForm } from "./register-form";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account | Bank Fee Index",
  description: "Create your free Bank Fee Index account",
};

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/account");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Get access to bank fee intelligence data
          </p>
        </div>
        <RegisterForm />
        <p className="mt-4 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <a href="/login" className="text-gray-900 font-medium hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
