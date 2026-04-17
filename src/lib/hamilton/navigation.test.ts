/**
 * Tests for Hamilton navigation source of truth (Phase 38, ARCH-04).
 * Verifies shape, completeness, exact label values, and CTA hierarchy.
 */

import { describe, it, expect } from "vitest";
import {
  HAMILTON_NAV,
  HAMILTON_BASE,
  LEFT_RAIL_CONFIG,
  CTA_HIERARCHY,
  ANALYSIS_FOCUS_TABS,
  HAMILTON_LABELS,
} from "./navigation";
import type { HamiltonScreen } from "./navigation";

describe("HAMILTON_BASE", () => {
  it("is /pro", () => {
    expect(HAMILTON_BASE).toBe("/pro");
  });
});

describe("HAMILTON_NAV", () => {
  it("has exactly 6 entries", () => {
    expect(HAMILTON_NAV).toHaveLength(6);
  });

  it("has exact labels in order: My Bank, Peer Compare, Scenarios, Reports & Briefs, Watchlist, Admin", () => {
    const labels = HAMILTON_NAV.map((item) => item.label);
    expect(labels).toEqual([
      "My Bank",
      "Peer Compare",
      "Scenarios",
      "Reports & Briefs",
      "Watchlist",
      "Admin",
    ]);
  });

  it("all hrefs are unique (no duplicates)", () => {
    const hrefs = HAMILTON_NAV.map((item) => item.href);
    const unique = new Set(hrefs);
    expect(unique.size).toBe(hrefs.length);
  });

  it("all hrefs start with /", () => {
    for (const item of HAMILTON_NAV) {
      expect(item.href).toMatch(/^\//);
    }
  });

  it("non-Admin hrefs start with /pro", () => {
    for (const item of HAMILTON_NAV) {
      if (item.label !== "Admin") {
        expect(item.href).toMatch(/^\/pro\//);
      }
    }
  });
});

describe("LEFT_RAIL_CONFIG", () => {
  it("has an entry for every screen in HAMILTON_NAV", () => {
    const navLabels = HAMILTON_NAV.map((item) => item.label) as HamiltonScreen[];
    for (const label of navLabels) {
      expect(LEFT_RAIL_CONFIG).toHaveProperty(label);
    }
  });

  it("each entry has primaryAction and sections array", () => {
    for (const [_key, config] of Object.entries(LEFT_RAIL_CONFIG)) {
      expect(config).toHaveProperty("primaryAction");
      expect(config).toHaveProperty("sections");
      expect(Array.isArray(config.sections)).toBe(true);
    }
  });
});

describe("CTA_HIERARCHY", () => {
  it("has entries for non-Admin screens (My Bank, Peer Compare, Scenarios, Reports & Briefs, Watchlist)", () => {
    const expectedKeys = [
      "My Bank",
      "Peer Compare",
      "Scenarios",
      "Reports & Briefs",
      "Watchlist",
    ];
    for (const key of expectedKeys) {
      expect(CTA_HIERARCHY).toHaveProperty(key);
    }
    expect(CTA_HIERARCHY).not.toHaveProperty("Admin");
  });

  it("Peer Compare primary CTA is 'Simulate a Change'", () => {
    expect(CTA_HIERARCHY["Peer Compare"].primary).toBe("Simulate a Change");
  });

  it("Scenarios primary CTA is 'Generate Board Scenario Summary'", () => {
    expect(CTA_HIERARCHY["Scenarios"].primary).toBe("Generate Board Scenario Summary");
  });

  it("Reports & Briefs primary CTA is 'Export PDF'", () => {
    expect(CTA_HIERARCHY["Reports & Briefs"].primary).toBe("Export PDF");
  });

  it("each entry has primary string and secondary array", () => {
    for (const [_key, cta] of Object.entries(CTA_HIERARCHY)) {
      expect(typeof cta.primary).toBe("string");
      expect(Array.isArray(cta.secondary)).toBe(true);
    }
  });
});

describe("ANALYSIS_FOCUS_TABS", () => {
  it("contains exactly 4 entries", () => {
    expect(ANALYSIS_FOCUS_TABS).toHaveLength(4);
  });

  it("contains Pricing, Risk, Peer Position, Trend in order", () => {
    expect(ANALYSIS_FOCUS_TABS).toEqual(["Pricing", "Risk", "Peer Position", "Trend"]);
  });
});

describe("HAMILTON_LABELS", () => {
  it("contains Hamilton's View label (D-08)", () => {
    expect(HAMILTON_LABELS.hamiltonsView).toBe("Hamilton's View");
  });

  it("contains all required label keys", () => {
    expect(HAMILTON_LABELS).toHaveProperty("whatChanged");
    expect(HAMILTON_LABELS).toHaveProperty("whatThisMeans");
    expect(HAMILTON_LABELS).toHaveProperty("whyItMatters");
    expect(HAMILTON_LABELS).toHaveProperty("recommendedPosition");
    expect(HAMILTON_LABELS).toHaveProperty("priorityAlert");
    expect(HAMILTON_LABELS).toHaveProperty("signalFeed");
    expect(HAMILTON_LABELS).toHaveProperty("analysisFocus");
  });
});

describe("no Sovereign branding (D-05)", () => {
  it("HAMILTON_NAV contains no Sovereign strings", () => {
    const allText = JSON.stringify(HAMILTON_NAV);
    expect(allText.toLowerCase()).not.toContain("sovereign");
  });

  it("HAMILTON_LABELS contains no Sovereign strings", () => {
    const allText = JSON.stringify(HAMILTON_LABELS);
    expect(allText.toLowerCase()).not.toContain("sovereign");
  });
});
