import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WaitlistForm } from "./waitlist-form";

export const metadata: Metadata = {
  title: "Join the Waitlist - Bank Fee Index",
  description:
    "Sign up for early access to fee benchmarking for banks and credit unions.",
};

export default function WaitlistPage() {
  return (
    <>
      <Nav />
      <main className="py-16 md:py-24">
        <div className="mx-auto max-w-lg px-4">
          <div className="mb-8 text-center">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              &larr; Back to home
            </Link>
          </div>
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Join the Waitlist</CardTitle>
              <p className="text-muted-foreground">
                Get early access to fee benchmarking for your institution.
                Founding members get the first year free.
              </p>
            </CardHeader>
            <CardContent>
              <WaitlistForm />
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </>
  );
}
