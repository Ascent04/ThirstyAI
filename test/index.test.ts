import { describe, expect, it } from "vitest";
import { calculate, loadFacts } from "../src/index.js";

const FACTS = new URL("../data/facts.json", import.meta.url).pathname;
const ASSUMPTIONS = new URL("../data/assumptions.json", import.meta.url).pathname;

describe("oeffentlicher Einstieg (src/index.ts)", () => {
  it("laedt Fakten und berechnet ein plausibles Ergebnis end-to-end", () => {
    const table = loadFacts([FACTS, ASSUMPTIONS]);

    const result = calculate(
      { model: "claude-3-5-sonnet", tokensIn: 200, tokensOut: 300, region: "DE" },
      table,
    );

    for (const range of [result.energyTotal, result.waterScope1, result.waterScope2, result.co2Scope2]) {
      expect(range.min).toBeLessThanOrEqual(range.mid);
      expect(range.mid).toBeLessThanOrEqual(range.max);
      expect(range.min).toBeGreaterThanOrEqual(0);
    }
    expect(result.confidence).toBeGreaterThanOrEqual(1);
    expect(result.confidence).toBeLessThanOrEqual(5);
    expect(result.factIds.length).toBeGreaterThan(0);
    expect(result.boundary).toBe("gpu-only");
  });
});
