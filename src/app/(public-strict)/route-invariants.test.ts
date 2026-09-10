import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";

describe("(public-strict) route invariants", () => {
  it("has no loading.tsx anywhere in its tree", () => {
    const root = import.meta.dirname;
    const entries = readdirSync(root, { recursive: true }) as string[];
    const offenders = entries.filter((entry) => entry.endsWith("loading.tsx"));

    expect(
      offenders,
      `Found loading.tsx under (public-strict): ${offenders.join(", ")}. ` +
        `Any loading.tsx here reintroduces the "notFound() returns HTTP 200" ` +
        `bug (Task 17) — see the comment in (public-strict)/layout.tsx for why ` +
        `this group must stay loading.tsx-free. Use an in-page <Suspense> ` +
        `skeleton around the slow section instead.`,
    ).toEqual([]);
  });
});
