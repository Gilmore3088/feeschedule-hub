/**
 * Contrast audit — counts low-contrast text utility usages in src/app and src/components.
 *
 * The warm-500 family (#A09788 / #A69D90 / #B0A89C) is reserved for rules, dividers,
 * disabled states, and decorative marks. Text at or below 14px must use #7A7062 or
 * darker. This script is a read-only sweep: it prints a per-file count and a total,
 * and always exits 0 so it can run in CI without blocking.
 *
 * Usage: node scripts/contrast-audit.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SCAN_DIRS = ["src/app", "src/components"];
const EXTENSIONS = new Set([".tsx", ".ts", ".css"]);
const RESERVED_TEXT_COLORS = ["#A09788", "#A69D90", "#B0A89C"];

const PATTERN = new RegExp(`text-\\[(${RESERVED_TEXT_COLORS.join("|")})\\]`, "gi");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  const counts = new Map();
  let total = 0;

  for (const dir of SCAN_DIRS) {
    const files = await walk(path.join(ROOT, dir));
    for (const file of files) {
      const source = await readFile(file, "utf8");
      const matches = source.match(PATTERN);
      if (!matches) continue;
      counts.set(path.relative(ROOT, file), matches.length);
      total += matches.length;
    }
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [file, count] of sorted) {
    console.log(`${String(count).padStart(4)}  ${file}`);
  }
  console.log(`\n${total} reserved-color text usages across ${sorted.length} files`);
  console.log(`(patterns: ${RESERVED_TEXT_COLORS.map((c) => `text-[${c}]`).join(", ")})`);
}

await main();
