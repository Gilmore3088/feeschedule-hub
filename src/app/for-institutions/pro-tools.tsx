import { CheckCircle2, Brain, Users, FileText, TrendingUp, type LucideIcon } from "lucide-react";
import { SITE_NAME } from "@/lib/constants";

export const HAMILTON_CANONICAL =
  `Hamilton is the ${SITE_NAME} Pro workspace: benchmark, scenario, report and monitor ` +
  "your fee position against a verified peer set.";

export const HAMILTON_MODES = ["Analyze", "Benchmark", "Scenario", "Report", "Monitor"] as const;

interface ToolCard {
  icon: LucideIcon;
  title: string;
  body: string;
  bullets: string[];
}

const TOOL_CARDS: ToolCard[] = [
  {
    icon: Brain,
    title: "Hamilton workspace",
    body:
      `${HAMILTON_CANONICAL} Ask "What do community banks in District 7 charge for overdraft?" ` +
      "and get an answer with the disclosure it came from.",
    bullets: [
      `Five modes: ${HAMILTON_MODES.join(" · ")}`,
      "Every answer cited to a source document",
      "Verified fees and fees under review are always kept separate",
    ],
  },
  {
    icon: Users,
    title: "Peer benchmarking",
    body:
      "Build peer groups by charter type, asset size, and Fed district. See where your fees " +
      "land against institutions that actually compete with you — not a national average " +
      "that means nothing to a community bank in Kansas.",
    bullets: [
      "Save peer groups and reuse them across reports",
      "Filter by asset tier and Fed district",
      "Delta indicators against the peer and national median",
    ],
  },
  {
    icon: FileText,
    title: "Board-ready reports",
    body:
      "Generate competitive briefs, district outlooks, and peer analyses with executive " +
      "summaries, evidence tables, peer deltas, and caveats. PDF-ready and built from live " +
      "data — not a template someone filled in last quarter.",
    bullets: [
      "Peer briefs, competitive snapshots, district outlooks",
      "Focused and actionable, a few pages each",
      "Download as PDF and share with your board",
    ],
  },
  {
    icon: TrendingUp,
    title: "Federal data context",
    body:
      "Call Reports, FRED economic indicators, Beige Book commentary, and CFPB complaint data " +
      "in one place. Stop logging into four government websites to piece together a picture.",
    bullets: [
      "Quarterly Call Report history",
      "Fed district economic profiles",
      "Fee-to-revenue context for every peer",
    ],
  },
];

export function ProToolsSection() {
  return (
    <section className="bg-warm-100 border-b border-warm-200">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A7062]">
          {SITE_NAME} Pro
        </p>
        <h2
          className="mt-3 text-warm-900 text-[28px]"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Four tools. One subscription.
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-warm-700">
          For teams that want the report every month, on their own peer sets, without waiting on us.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {TOOL_CARDS.map((card) => (
            <ToolCardView key={card.title} card={card} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ToolCardView({ card }: { card: ToolCard }) {
  const Icon = card.icon;
  return (
    <div className="rounded-xl border border-warm-300 bg-white p-6">
      <Icon className="h-6 w-6 text-terra" />
      <h3 className="mt-4 text-[17px] font-bold text-warm-900">{card.title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-warm-700">{card.body}</p>
      <ul className="mt-4 space-y-2">
        {card.bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2 text-[13px] text-warm-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-terra" />
            {bullet}
          </li>
        ))}
      </ul>
    </div>
  );
}
