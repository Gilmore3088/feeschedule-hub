/**
 * CSS isolation smoke tests for the Hamilton shell design system.
 *
 * These file-content tests verify that Hamilton design tokens are scoped
 * exclusively inside `.hamilton-shell` and never leak to the global `@theme
 * inline` block. They catch regressions before they reach production.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const GLOBALS_CSS_PATH = path.resolve(__dirname, "../../app/globals.css");
const css = fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");

/**
 * Extract the text content of the @theme inline { ... } block.
 * Returns an empty string if the block is not found.
 */
function extractThemeInlineBlock(source: string): string {
  const start = source.indexOf("@theme inline {");
  if (start === -1) return "";

  let depth = 0;
  let i = start;
  while (i < source.length) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
    i++;
  }
  return source.slice(start);
}

describe("hamilton CSS isolation", () => {
  it("globals.css contains .hamilton-shell block", () => {
    expect(css).toContain(".hamilton-shell {");
  });

  it("globals.css contains .dark .hamilton-shell dark mode block", () => {
    expect(css).toContain(".dark .hamilton-shell {");
  });

  it("--hamilton-surface token appears inside .hamilton-shell (not at root)", () => {
    // The token must exist somewhere in the file
    expect(css).toContain("--hamilton-surface:");

    // And it must NOT appear before the .hamilton-shell selector
    const hamiltonShellIndex = css.indexOf(".hamilton-shell {");
    const firstTokenIndex = css.indexOf("--hamilton-surface:");
    expect(firstTokenIndex).toBeGreaterThan(hamiltonShellIndex);
  });

  it("--hamilton-* tokens do NOT appear inside @theme inline block", () => {
    const themeBlock = extractThemeInlineBlock(css);
    expect(themeBlock).not.toContain("--hamilton-");
  });

  it('file does NOT contain the string "Sovereign"', () => {
    expect(css).not.toContain("Sovereign");
  });
});
