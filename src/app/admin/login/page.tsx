import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/admin");
  }

  return (
    <div className="min-h-screen bg-gray-50/50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-lg border shadow-sm px-6 py-8">
          <div className="flex items-center justify-center gap-2 mb-1">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-5 w-5 text-blue-600"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M3 17l4-8 4 5 4-10 6 13" />
            </svg>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              Bank Fee Index
            </h1>
          </div>
          <p className="text-sm text-gray-500 text-center mb-6">
            Sign in to admin dashboard
          </p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
