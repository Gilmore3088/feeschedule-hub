"use client";

/** Custom event the mobile search icon dispatches; `SearchModal` listens for it. */
export const OPEN_SEARCH_EVENT = "fi:open-search";

function SearchIcon({ className }: { className: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

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
      className="hidden md:flex items-center gap-2 rounded-lg border border-[#E8DFD1] bg-white/60 px-3 py-1.5 text-[12px] text-[#6B6255] hover:border-[#C44B2E]/30 hover:text-[#5A5347] transition-colors"
      aria-label="Search (Cmd+K)"
    >
      <SearchIcon className="h-3.5 w-3.5" />
      <span>Search</span>
      <kbd className="ml-1 inline-flex h-4 items-center rounded bg-[#E8DFD1]/50 px-1 text-[9px] font-medium">
        &#8984;K
      </kbd>
    </button>
  );
}

/**
 * Small-screen search icon: `SearchTrigger` is `hidden` below the `md`
 * breakpoint, so phones otherwise have no header entry point into
 * `SearchModal`. Sits next to the hamburger; opens the same modal via a
 * custom event rather than the Cmd+K keyboard shortcut.
 */
export function MobileSearchTrigger() {
  function openSearch() {
    document.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
  }

  return (
    <button
      onClick={openSearch}
      className="flex h-11 w-11 items-center justify-center rounded-lg text-[#5A5347] hover:bg-[#E8DFD1]/40 transition-colors md:hidden"
      aria-label="Search"
    >
      <SearchIcon className="h-5 w-5" />
    </button>
  );
}
