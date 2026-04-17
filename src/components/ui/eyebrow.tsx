import type { ElementType, ReactNode } from "react";

/**
 * Eyebrow — section labels in the editorial style used across Bank Fee Index
 * marketing surfaces (small uppercase serif, wide tracking, warm muted color).
 *
 * Semantics: defaults to `<span>` (decorative). Pass `as="h2"` (or `h3`/`h4`)
 * when the eyebrow IS the section's heading — so screen readers still get
 * proper landmarks, and the visible style stays the small editorial label.
 *
 * Color scope: hardcoded warm-palette hex internally. The project's
 * `.consumer-brand` wrapper isn't applied to /pro or /for-institutions yet,
 * so utility classes like `text-slate-400` would render as Tailwind's cool
 * default in those routes. Migrate to `text-[var(--eyebrow-color)]` if/when
 * the wrapper coverage is rationalized.
 */

type Tone = "default" | "subtle" | "accent" | "dark";

interface EyebrowProps {
  /** Render-as element. Defaults to `span`. Use `h2`/`h3`/`h4` when this IS the section heading. */
  as?: ElementType;
  /** Color tone. `default` for most labels, `accent` (terracotta) for branded callouts. */
  tone?: Tone;
  /** Tracking / size variant. `wide` is the 0.2em tracking 10px default; `tight` is 0.1em 12px for slightly larger labels. */
  size?: "wide" | "tight";
  className?: string;
  children: ReactNode;
}

const TONE: Record<Tone, string> = {
  default: "text-[#A69D90]",
  subtle: "text-[#7A7062]",
  accent: "text-[#C44B2E]",
  dark: "text-[#5A5347]",
};

const SIZE: Record<NonNullable<EyebrowProps["size"]>, string> = {
  wide: "text-[10px] font-bold uppercase tracking-[0.2em]",
  tight: "text-[12px] font-bold uppercase tracking-[0.1em]",
};

export function Eyebrow({
  as: Component = "span",
  tone = "default",
  size = "wide",
  className = "",
  children,
}: EyebrowProps) {
  return (
    <Component
      className={`${SIZE[size]} ${TONE[tone]} ${className}`}
      style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
    >
      {children}
    </Component>
  );
}
