import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/admin");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-lg border shadow-sm px-6 py-8">
          <h1 className="text-xl font-semibold text-gray-900 text-center">
            FeeSchedule Hub
          </h1>
          <p className="text-sm text-gray-500 text-center mt-1 mb-6">
            Sign in to admin dashboard
          </p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
