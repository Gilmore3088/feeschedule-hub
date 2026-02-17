import Link from "next/link";

const NAV_LINKS = [
  { href: "/fees", label: "Fee Index" },
  { href: "/districts", label: "Districts" },
  { href: "/research", label: "Research" },
];

export function PublicNav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0f172a]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-5 w-5 text-amber-400"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 17l4-8 4 5 4-10 6 13" />
          </svg>
          <span className="text-[15px] font-semibold tracking-tight text-white">
            Bank Fee Index
          </span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[13px] text-slate-400 hover:text-white transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/login"
            className="text-[13px] text-slate-500 hover:text-white transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    </header>
  );
}
