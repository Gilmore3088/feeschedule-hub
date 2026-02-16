import { Upload, BarChart3, FileText } from "lucide-react";

const STEPS = [
  {
    icon: Upload,
    title: "1. Submit Your Fee Schedule",
    description:
      "Upload your fee schedule via our simple form or Excel template. We accept checking, savings, ATM, wire, and service fees.",
  },
  {
    icon: BarChart3,
    title: "2. Get Peer Benchmarks",
    description:
      "See exactly where your fees rank against peers filtered by asset size, region, and charter type. Percentiles, medians, and trends.",
  },
  {
    icon: FileText,
    title: "3. Receive Quarterly Reports",
    description:
      "Every quarter, get a polished report package (Excel, PowerPoint, PDF) ready for your board with competitive analysis and examples.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            How It Works
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Contribute your data. Get the full picture back.
          </p>
        </div>
        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.title} className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                <step.icon className="h-7 w-7 text-primary" />
              </div>
              <h3 className="mt-6 text-lg font-semibold">{step.title}</h3>
              <p className="mt-3 text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
