'use client';

interface ReportTypeCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const REPORT_TYPE_CARDS: ReportTypeCard[] = [
  {
    id: 'peer_brief',
    title: 'Peer Competitive Brief',
    description:
      'Benchmark your fee structure against a custom peer group by charter, asset tier, and Fed district.',
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
        />
      </svg>
    ),
  },
  {
    id: 'competitive_snapshot',
    title: 'Competitive Snapshot',
    description:
      'Quick-turn competitive positioning analysis with national and segment medians for your peer set.',
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
        />
      </svg>
    ),
  },
  {
    id: 'district_outlook',
    title: 'District Economic Outlook',
    description:
      'Regional fee landscape analysis combining Fed district data with fee trend intelligence.',
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
        />
      </svg>
    ),
  },
];

interface Props {
  onSelect: (type: string) => void;
  selected: string | null;
}

export function ReportTypeSelector({ onSelect, selected }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {REPORT_TYPE_CARDS.map((card) => {
        const isSelected = selected === card.id;

        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card.id)}
            className={[
              'text-left rounded-xl border p-5 transition-all duration-150 cursor-pointer',
              isSelected
                ? 'border-[#C44B2E] ring-1 ring-[#C44B2E]/20 bg-[#FFFDF9]'
                : 'border-[#E8DFD1] bg-[#FFFDF9] hover:border-[#C44B2E]/40 hover:bg-white',
            ].join(' ')}
          >
            <div
              className={`mb-3 ${isSelected ? 'text-[#C44B2E]' : 'text-[#7A7265]'}`}
            >
              {card.icon}
            </div>
            <h3
              className="text-sm font-semibold text-[#1A1815] mb-1.5"
              style={{ fontFamily: 'var(--font-newsreader), Georgia, serif' }}
            >
              {card.title}
            </h3>
            <p className="text-xs text-[#7A7265] leading-relaxed">
              {card.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
