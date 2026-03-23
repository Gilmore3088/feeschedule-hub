"use client";

export function SearchTrigger() {
  function openSearch() {
    // Dispatch Cmd+K to trigger the SearchModal
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );
  }

  return (
    <button
      onClick={openSearch}
      className="hidden md:flex items-center gap-2 rounded-lg border border-[#E8DFD1] bg-white/60 px-3 py-1.5 text-[12px] text-[#A09788] hover:border-[#C44B2E]/30 hover:text-[#5A5347] transition-colors"
      aria-label="Search (Cmd+K)"
    >
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <span>Search</span>
      <kbd className="ml-1 inline-flex h-4 items-center rounded bg-[#E8DFD1]/50 px-1 text-[9px] font-medium">
        &#8984;K
      </kbd>
    </button>
  );
}
