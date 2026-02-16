import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white py-20 md:py-32">
      <div className="mx-auto max-w-6xl px-4 text-center">
        <Badge variant="secondary" className="mb-6">
          Now accepting early access applications
        </Badge>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
          Know how your fees compare to{" "}
          <span className="text-primary/70">every peer in the market</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
          Banks and credit unions submit their fee schedules and receive
          quarterly benchmarking reports with peer data, percentile rankings,
          and real examples. Like WinAD for financial institutions.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Button size="lg" asChild>
            <Link href="/waitlist">Join the Waitlist</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#how-it-works">See How It Works</a>
          </Button>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Free for founding members. No credit card required.
        </p>
      </div>
    </section>
  );
}
