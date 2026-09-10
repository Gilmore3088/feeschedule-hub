/**
 * Shared skeleton for `/fees` — used both as the route's `loading.tsx` (the
 * instant response before the RSC payload starts streaming) and as the
 * `<Suspense>` fallback around the data-dependent sections of `page.tsx`
 * (spotlight cards, family tables, sidebar) so the hero and h1 paint before
 * any of those DB reads resolve. Parchment blocks on the page's own
 * background, not the generic slate placeholder other loading states use.
 */
const SKELETON_BLOCK = "animate-pulse rounded-xl bg-[#F3EDE3]";
const FAMILY_SECTION_COUNT = 3;
const SPOTLIGHT_CARD_COUNT = 4;

export function FeesSkeleton() {
  return (
    <div>
      <div className={`${SKELETON_BLOCK} mt-2 h-4 w-72 max-w-full`} />
      <div className={`${SKELETON_BLOCK} mt-3 h-3 w-56 max-w-full`} />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: SPOTLIGHT_CARD_COUNT }).map((_, i) => (
          <div key={i} className={`${SKELETON_BLOCK} h-[108px]`} />
        ))}
      </div>

      <div className={`${SKELETON_BLOCK} mt-5 h-8 w-full max-w-md`} />

      <div className="mt-10 grid grid-cols-1 gap-8 xl:grid-cols-[1fr_280px]">
        <div className="space-y-10">
          {Array.from({ length: FAMILY_SECTION_COUNT }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className={`${SKELETON_BLOCK} h-4 w-40`} />
              <div className={`${SKELETON_BLOCK} h-56 w-full`} />
            </div>
          ))}
        </div>
        <div className={`${SKELETON_BLOCK} h-80 w-full`} />
      </div>
    </div>
  );
}
