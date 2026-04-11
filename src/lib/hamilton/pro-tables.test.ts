/**
 * Structural tests for the Hamilton Pro tables module.
 *
 * Does NOT call ensureHamiltonProTables() (requires live DB).
 * Instead verifies:
 *   - The export exists and is a function
 *   - Source SQL structure matches schema requirements (6 tables, constraints, soft-delete scoping)
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// Mock the DB connection to prevent connection attempt at import time
vi.mock("@/lib/crawler-db/connection", () => ({ sql: {} }));

import { ensureHamiltonProTables } from "./pro-tables";

const SOURCE = readFileSync(resolve(__dirname, "pro-tables.ts"), "utf-8");

describe("ensureHamiltonProTables export", () => {
  it("exports a function", () => {
    expect(typeof ensureHamiltonProTables).toBe("function");
  });
});

describe("pro-tables SQL structure", () => {
  it("creates exactly 6 tables", () => {
    const matches = SOURCE.match(/CREATE TABLE IF NOT EXISTS/g);
    expect(matches).toHaveLength(6);
  });

  it("includes all 6 expected table names", () => {
    const tables = [
      "hamilton_saved_analyses",
      "hamilton_scenarios",
      "hamilton_reports",
      "hamilton_watchlists",
      "hamilton_signals",
      "hamilton_priority_alerts",
    ];
    for (const t of tables) {
      expect(SOURCE).toContain(t);
    }
  });

  it("has confidence_tier CHECK constraint on scenarios", () => {
    expect(SOURCE).toContain("confidence_tier");
    expect(SOURCE).toMatch(/CHECK\s*\(\s*confidence_tier\s+IN/);
  });

  it("has soft-delete columns on analyses and scenarios only (exactly 2 archived_at columns)", () => {
    const archivedMatches = SOURCE.match(/archived_at\s+TIMESTAMPTZ/g);
    expect(archivedMatches).toHaveLength(2);
  });
});
