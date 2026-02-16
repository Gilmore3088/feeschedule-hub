import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

const TIERS = [
  {
    name: "Community",
    target: "Under $250M in assets",
    price: "$4,995",
    period: "/year",
    features: [
      "Quarterly benchmark reports (Excel + PDF)",
      "Live dashboard with peer comparisons",
      "Percentile rankings across all fee categories",
      "Anonymized peer fee schedule examples",
      "Up to 3 user seats",
    ],
    highlight: false,
  },
  {
    name: "Regional",
    target: "$250M - $1B in assets",
    price: "$9,995",
    period: "/year",
    features: [
      "Everything in Community, plus:",
      "Quarterly PowerPoint board deck",
      "Custom peer group filtering",
      "Trend analysis (quarter-over-quarter)",
      "Up to 10 user seats",
    ],
    highlight: true,
  },
  {
    name: "Enterprise",
    target: "Over $1B in assets",
    price: "$19,995",
    period: "/year",
    features: [
      "Everything in Regional, plus:",
      "API access for data integration",
      "Custom competitive heatmaps",
      "Priority support and onboarding",
      "Unlimited user seats",
    ],
    highlight: false,
  },
] as const;

export function Pricing() {
  return (
    <section id="pricing" className="bg-slate-50 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Simple Annual Pricing
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            One subscription. Full access to peer data, reports, and examples.
          </p>
        </div>
        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {TIERS.map((tier) => (
            <Card
              key={tier.name}
              className={
                tier.highlight
                  ? "relative border-primary shadow-lg"
                  : "relative"
              }
            >
              {tier.highlight && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                  Most Popular
                </Badge>
              )}
              <CardHeader className="text-center">
                <CardTitle className="text-xl">{tier.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{tier.target}</p>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  <span className="text-muted-foreground">{tier.period}</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-8 w-full"
                  variant={tier.highlight ? "default" : "outline"}
                  asChild
                >
                  <Link href="/waitlist">Join the Waitlist</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Founding members get the first year free. All plans include quarterly
          reports and live dashboard access.
        </p>
      </div>
    </section>
  );
}
