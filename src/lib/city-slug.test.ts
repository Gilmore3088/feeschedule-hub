import { describe, expect, it } from "vitest";
import { citySlug, cityName } from "./city-slug";

describe("citySlug", () => {
  it("lowercases and hyphenates a multi-word city name", () => {
    expect(citySlug("Fort Worth")).toBe("fort-worth");
  });

  it("collapses repeated whitespace into a single hyphen", () => {
    expect(citySlug("New   York")).toBe("new-york");
  });

  it("trims surrounding whitespace", () => {
    expect(citySlug("  Reno ")).toBe("reno");
  });

  it("leaves an already-hyphenated name lowercase", () => {
    expect(citySlug("Winston-Salem")).toBe("winston-salem");
  });
});

describe("cityName", () => {
  it("title-cases a hyphenated slug", () => {
    expect(cityName("fort-worth")).toBe("Fort Worth");
  });

  it("round-trips through citySlug", () => {
    expect(cityName(citySlug("Fort Worth"))).toBe("Fort Worth");
  });

  it("decodes a legacy percent-encoded slug", () => {
    expect(cityName("fort%20worth")).toBe("Fort Worth");
  });

  it("normalizes an all-caps slug", () => {
    expect(cityName("FORT-WORTH")).toBe("Fort Worth");
  });
});
