const QUESTIONS = [
  {
    q: "What data do I need to submit?",
    a: "Your institution's fee schedule -- the fees you charge for checking, savings, ATM, wire transfers, and general services. Upload via our Excel template or enter manually. Takes about 15 minutes.",
  },
  {
    q: "How is my data kept private?",
    a: "All benchmarking data is anonymized and aggregated. Your fees are never shown individually. We require a minimum of 5 institutions per peer group before displaying any benchmarks. No institution names are ever tied to specific fee amounts.",
  },
  {
    q: "What do I get in return?",
    a: "Quarterly benchmark reports (Excel, PowerPoint, PDF) showing how your fees compare to peers by percentile, plus a live dashboard between report cycles. You also get access to anonymized example fee schedules from similar institutions.",
  },
  {
    q: "How are peer groups defined?",
    a: "You can filter by asset size, geographic region, and institution type (bank vs. credit union). We build peer groups dynamically so you always compare to the most relevant institutions.",
  },
  {
    q: "Do I have to submit data to see benchmarks?",
    a: "Yes. This is a data cooperative -- everyone contributes, everyone benefits. You must submit a current fee schedule (within the last 90 days) to access peer benchmarks and reports.",
  },
  {
    q: "Are there antitrust concerns with sharing fee data?",
    a: "No. We operate as an independent third party. All data is historical, anonymized, and aggregated. We never facilitate direct communication between competing institutions about pricing. This model is well-established (Raddon, Callahan, and others have operated similarly for decades).",
  },
] as const;

export function FAQ() {
  return (
    <section id="faq" className="py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Frequently Asked Questions
          </h2>
        </div>
        <div className="mx-auto mt-16 max-w-3xl space-y-8">
          {QUESTIONS.map((item) => (
            <div key={item.q}>
              <h3 className="text-lg font-semibold">{item.q}</h3>
              <p className="mt-2 text-muted-foreground">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
