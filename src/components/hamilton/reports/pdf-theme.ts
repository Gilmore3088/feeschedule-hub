/**
 * Shared PDF theme — brand fonts and the design tokens the studio report used.
 *
 * Server-side ONLY. Never import this in a client component.
 *
 * Before this module both PDF documents rendered in @react-pdf/renderer's
 * built-in Helvetica, so an on-demand report looked nothing like the site or
 * like the hand-rendered studio report. The tokens below are lifted from
 * Reports/studio/template.html so the generated report and the batch report
 * are the same object.
 *
 * Two font choices here are load-bearing and should not be casually changed:
 *
 * 1. The mono face is IBM Plex Mono, NOT the site's JetBrains Mono. JetBrains
 *    ships programming ligatures ('//', '://', '..') whose glyph metrics crash
 *    fontkit inside @react-pdf. Any report carrying a source URL would 500.
 * 2. These are the static originals from the google/fonts repo, not the
 *    optimized builds fonts.gstatic.com serves. The gstatic IBM Plex Mono
 *    build fails to parse on plain ASCII in this fontkit version.
 *
 * src/components/hamilton/reports/pdf-render.test.tsx guards both.
 *
 * Font files live in src/lib/pdf-fonts and are traced into the server bundle
 * by outputFileTracingIncludes in next.config.ts.
 */
import path from "node:path";
import { Font } from "@react-pdf/renderer";

const FONT_DIR = path.join(process.cwd(), "src", "lib", "pdf-fonts");
const file = (name: string) => path.join(FONT_DIR, name);

export const PDF_FONT = {
  serif: "Newsreader",
  sans: "IBMPlexSans",
  mono: "IBMPlexMono",
} as const;

let registered = false;

/**
 * Register the brand faces with @react-pdf/renderer. Idempotent — the renderer
 * throws on duplicate family registration, and route handlers can run many
 * times in one warm lambda.
 */
export function registerPdfFonts(): void {
  if (registered) return;

  Font.register({
    family: PDF_FONT.serif,
    fonts: [
      { src: file("Newsreader-Regular.ttf"), fontWeight: 400 },
      { src: file("Newsreader-SemiBold.ttf"), fontWeight: 600 },
      { src: file("Newsreader-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
    ],
  });

  Font.register({
    family: PDF_FONT.sans,
    fonts: [
      { src: file("IBMPlexSans-Regular.ttf"), fontWeight: 400 },
      { src: file("IBMPlexSans-SemiBold.ttf"), fontWeight: 600 },
    ],
  });

  Font.register({
    family: PDF_FONT.mono,
    fonts: [
      { src: file("IBMPlexMono-Regular.ttf"), fontWeight: 400 },
      { src: file("IBMPlexMono-Medium.ttf"), fontWeight: 500 },
    ],
  });

  // Long canonical fee keys and institution names should break on syllables
  // rather than being hyphenated mid-word by the default algorithm.
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}

/** Studio palette — Reports/studio/template.html :root. */
export const PDF_COLORS = {
  ink: "#1A1815",
  ink2: "#3D3830",
  text2: "#6E655A",
  muted: "#9A9082",

  paper: "#FFFFFF",
  cream: "#FDFBF8",
  sand: "#F4EEE4",

  terra: "#C44B2E",
  terraDeep: "#9E3A22",
  terraSoft: "#FBEDE8",
  terraGhost: "#F7E3DC",

  good: "#1F7A4A",
  goodSoft: "#E8F2EB",

  line: "#E3DACB",
  lineLight: "#EFE8DC",
  lineDark: "#1A1815",
} as const;

/**
 * Type scale in points, matching the studio template. @react-pdf sizes are
 * already in pt at 72dpi, so these transfer one-to-one from the print CSS.
 */
export const PDF_TYPE = {
  coverTitle: 46,
  coverInstitution: 24,
  coverFor: 12.5,
  h1: 21,
  h2: 13.5,
  h3: 10.5,
  body: 9.2,
  lede: 8.6,
  small: 8,
  kicker: 7.2,
  meta: 7.6,
  footnote: 6.8,
} as const;

export const PDF_TRACKING = {
  kicker: 1.15,
  series: 1.3,
  meta: 0.45,
} as const;

/** Letter page geometry from `@page { margin: 0.75in 0.85in 0.8in }`. */
export const PDF_PAGE = {
  paddingTop: 54,
  paddingBottom: 57.6,
  paddingHorizontal: 61.2,
  spineWidth: 30,
} as const;
