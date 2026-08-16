import { describe, expect, it } from "vitest";
import {
  getHamiltonContextSourceLabel,
  normalizeHamiltonContextSource,
  normalizeHamiltonPersistedContextSource,
} from "@/lib/hamilton/context-source";

describe("Hamilton context source helpers", () => {
  it("normalizes transient and persisted sources separately", () => {
    expect(normalizeHamiltonContextSource("url")).toBe("url");
    expect(normalizeHamiltonContextSource("artifact")).toBe("artifact");
    expect(normalizeHamiltonContextSource("none")).toBe("none");
    expect(normalizeHamiltonContextSource("bad", "profile")).toBe("profile");

    expect(normalizeHamiltonPersistedContextSource("watchlist")).toBe("watchlist");
    expect(normalizeHamiltonPersistedContextSource("artifact", "manual")).toBe("manual");
    expect(normalizeHamiltonPersistedContextSource("none", "profile")).toBe("profile");
    expect(normalizeHamiltonPersistedContextSource("bad", "manual")).toBe("manual");
  });

  it("uses the same source labels as the Hamilton context header", () => {
    expect(getHamiltonContextSourceLabel("url")).toBe("URL selected");
    expect(getHamiltonContextSourceLabel("manual")).toBe("Manual");
    expect(getHamiltonContextSourceLabel("profile")).toBe("Profile");
    expect(getHamiltonContextSourceLabel("watchlist")).toBe("Watchlist");
    expect(getHamiltonContextSourceLabel("artifact")).toBe("Saved artifact");
    expect(getHamiltonContextSourceLabel("none")).toBeNull();
    expect(getHamiltonContextSourceLabel("none", true)).toBe("Selected");
  });
});
