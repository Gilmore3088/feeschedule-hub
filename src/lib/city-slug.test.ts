import { describe, expect, it } from "vitest";
import { citySlug, cityName, normalizeCityKey } from "./city-slug";

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

  it("documents the known lossy round-trip for hyphenated city names", () => {
    // cityName always rejoins words with a space, so a real hyphenated city
    // name like "Winston-Salem" does not survive citySlug -> cityName intact.
    // This is exactly why DB lookups must key on normalizeCityKey, not on
    // reconstructing the DB's original spelling from the slug.
    expect(cityName(citySlug("Winston-Salem"))).toBe("Winston Salem");
  });
});

describe("normalizeCityKey", () => {
  it("treats hyphens and spaces as equivalent word separators", () => {
    expect(normalizeCityKey("Winston-Salem")).toBe(normalizeCityKey("Winston Salem"));
    expect(normalizeCityKey("Winston-Salem")).toBe("winston salem");
  });

  it("collapses repeated separators and trims", () => {
    expect(normalizeCityKey("  WINSTON--SALEM  ")).toBe("winston salem");
  });

  it("matches a slug-derived name back to its hyphenated DB spelling", () => {
    // The bug this guards against: a page built from the URL slug
    // ("winston-salem" -> cityName -> "Winston Salem") must still match a DB
    // row stored as "Winston-Salem" once both sides are normalized.
    expect(normalizeCityKey(cityName(citySlug("Winston-Salem")))).toBe(
      normalizeCityKey("Winston-Salem"),
    );
  });
});
