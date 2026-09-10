import { GUIDES, type Guide } from "./guides";

/** "More guides" only ever shows a short, scannable row — not the whole catalog. */
const MAX_RELATED_GUIDES = 3;

/**
 * Up to `MAX_RELATED_GUIDES` other guides, ranked by how many `feeCategories`
 * they share with `slug` (most overlap first, ties broken by catalog order).
 * Never includes `slug` itself. Guides with zero overlap still backfill the
 * remaining slots — via the stable sort below — so the "More guides" block
 * always has something to show as long as other guides exist.
 */
export function relatedGuides(slug: string): Guide[] {
  const current = GUIDES.find((g) => g.slug === slug);
  const others = GUIDES.filter((g) => g.slug !== slug);
  if (!current) return others.slice(0, MAX_RELATED_GUIDES);

  const currentCategories = new Set(current.feeCategories);
  const ranked = others
    .map((guide, catalogIndex) => ({
      guide,
      catalogIndex,
      sharedCount: guide.feeCategories.filter((c) => currentCategories.has(c)).length,
    }))
    .sort((a, b) => b.sharedCount - a.sharedCount || a.catalogIndex - b.catalogIndex);

  return ranked.slice(0, MAX_RELATED_GUIDES).map((entry) => entry.guide);
}
