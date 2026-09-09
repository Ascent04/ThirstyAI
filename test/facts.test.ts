import { describe, expect, it } from "vitest";
import { FactValidationError, latest } from "../src/facts.js";
import { loadFacts } from "../src/factsNode.js";

const REAL_FACTS = new URL("../data/facts.json", import.meta.url).pathname;
const BROKEN_DUPLICATE_ID = new URL(
  "./fixtures/broken-duplicate-id.json",
  import.meta.url,
).pathname;
const BROKEN_MISSING_SOURCE = new URL(
  "./fixtures/broken-missing-source.json",
  import.meta.url,
).pathname;

describe("loadFacts", () => {
  it("lädt die echte facts.json fehlerfrei", () => {
    const table = loadFacts([REAL_FACTS]);
    expect(table.facts.length).toBeGreaterThan(0);
    expect(Object.keys(table.sources).length).toBeGreaterThan(0);
    expect(table.byId.get("gemini-energy")?.value).toBe(0.24);
  });

  it("lehnt eine Datei mit doppelter ID ab", () => {
    expect(() => loadFacts([BROKEN_DUPLICATE_ID])).toThrow(FactValidationError);
    try {
      loadFacts([BROKEN_DUPLICATE_ID]);
      expect.fail("hätte werfen müssen");
    } catch (error) {
      expect(error).toBeInstanceOf(FactValidationError);
      expect((error as FactValidationError).factId).toBe("dup-id");
    }
  });

  it("lehnt eine Datei mit fehlender Quelle ab", () => {
    try {
      loadFacts([BROKEN_MISSING_SOURCE]);
      expect.fail("hätte werfen müssen");
    } catch (error) {
      expect(error).toBeInstanceOf(FactValidationError);
      expect((error as FactValidationError).factId).toBe("no-source");
    }
  });
});

describe("latest", () => {
  it("wählt je Schlüssel den neuesten Fakt", () => {
    const table = loadFacts([REAL_FACTS]);
    const result = latest(table, { region: "Deutschland", category: "grid" });
    const ids = result.map((f) => f.id);
    expect(ids).toContain("grid-co2-uba-de-2025");
    expect(ids).not.toContain("grid-co2-uba-de-2024");
  });

  it("berücksichtigt asOf und wählt ältere Fakten zum Stichtag", () => {
    const table = loadFacts([REAL_FACTS]);
    const result = latest(
      table,
      { region: "Deutschland", category: "grid" },
      new Date("2024-12-31"),
    );
    const ids = result.map((f) => f.id);
    expect(ids).toContain("grid-co2-uba-de-2024");
    expect(ids).not.toContain("grid-co2-uba-de-2025");
  });
});
