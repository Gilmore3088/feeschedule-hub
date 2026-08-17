import Link from "next/link";
import {
  Activity,
  BarChart3,
  Bell,
  FileText,
  MessageSquare,
  Users,
  type LucideIcon,
} from "lucide-react";
import { SITE_NAME } from "@/lib/constants";
import { HamiltonBenchmarkPreview } from "./hamilton-benchmark-preview";
import {
  HAMILTON_CANONICAL,
  PRO_SECTION_TITLE,
  PRO_SUBHEAD,
  type HamiltonMode,
} from "./hamilton-copy";

export { HAMILTON_CANONICAL, HAMILTON_MODES } from "./hamilton-copy";

interface ModeCard {
  mode: HamiltonMode;
  icon: LucideIcon;
  body: string;
}

/** What you do inside Hamilton, one card per mode. Not sibling tools. */
const MODE_CARDS: ModeCard[] = [
  {
    mode: "Analyze",
    icon: MessageSquare,
    body:
      'Ask "What do community banks in District 7 charge for overdraft?" and get an answer ' +
      "with the disclosure it came from. Verified fees and fees under review are always kept separate.",
  },
  {
    mode: "Benchmark",
    icon: Users,
    body:
      "Build peer sets by charter type, asset size and Fed district — as many as you need — " +
      "and see where each of your fees lands against institutions that actually compete with you.",
  },
  {
    mode: "Scenario",
    icon: Activity,
    body:
      "Model a fee change before you make it: move overdraft to $30, drop the paper statement fee, " +
      "and see your position against the same peer set on the same lines.",
  },
  {
    mode: "Report",
    icon: FileText,
    body:
      "Turn any peer set into a board-ready brief — executive summary, evidence table, peer deltas, " +
      "caveats — with every figure cited to its source document. PDF, a few pages each.",
  },
  {
    mode: "Monitor",
    icon: Bell,
    body:
      "Every schedule in your peer set is rechecked on a rolling calendar. When a competitor " +
      "publishes a new fee, you know the day the index picks it up, not at next year's survey.",
  },
];

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-md bg-[#C44B2E] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#A93D25]";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-md border border-warm-300 px-5 py-2.5 text-sm font-medium text-warm-900 transition-colors hover:border-warm-900";

export function ProToolsSection() {
  return (
    <section id="pro" className="scroll-mt-16 border-b border-warm-200 bg-warm-100">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6B6255]">
          {SITE_NAME} Pro
        </p>
        <h2
          className="mt-3 text-[28px] text-warm-900"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          {PRO_SECTION_TITLE}
        </h2>
        <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-warm-800">{HAMILTON_CANONICAL}</p>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-warm-700">{PRO_SUBHEAD}</p>

        <HamiltonBenchmarkPreview className="mt-8" />

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {MODE_CARDS.map((card) => (
            <ModeCardView key={card.mode} card={card} />
          ))}
          <div className="flex flex-col justify-between rounded-xl border border-dashed border-warm-300 p-5">
            <div>
              <BarChart3 className="h-5 w-5 text-terra" aria-hidden="true" />
              <p className="mt-3 text-[15px] font-bold text-warm-900">One seat, all five modes</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-warm-700">
                Monthly or annual, same workspace. Cancel monthly seats at the end of the period.
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Link href="/subscribe" className={PRIMARY_BUTTON}>
                See pricing
              </Link>
              <Link href="/subscribe?plan=monthly" className={SECONDARY_BUTTON}>
                Start monthly
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ModeCardView({ card }: { card: ModeCard }) {
  const Icon = card.icon;
  return (
    <div className="rounded-xl border border-warm-300 bg-white p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-terra" aria-hidden="true" />
        <h3 className="text-[15px] font-bold text-warm-900">{card.mode}</h3>
      </div>
      <p className="mt-2 text-[14px] leading-relaxed text-warm-700">{card.body}</p>
    </div>
  );
}
