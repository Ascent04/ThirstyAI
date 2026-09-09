import { describe, expect, it } from "vitest";

import { calculateEmbedded, MODELS, REGIONS, FACTS_GENERATED, FACT_COUNT, SOURCE_COUNT } from "../web/browser-calc.js";
import { loadFacts } from "../src/factsNode.js";
import { calculate } from "../src/calculate.js";

const FACTS = new URL("../data/facts.json", import.meta.url).pathname;
const ASSUMPTIONS = new URL("../data/assumptions.json", import.meta.url).pathname;
const MODELS_JSON = new URL("../data/models.json", import.meta.url).pathname;

describe("browser-calc", () => {
  it("calculateEmbedded liefert dasselbe wie calculate(loadFacts(...)); Tabellen-/Auswahllisten stimmen", () => {
    const input = { model: "claude-sonnet-5", tokensIn: 0, tokensOut: 1000, region: "DE" };
    const table = loadFacts([FACTS, ASSUMPTIONS, MODELS_JSON]);
    const expected = calculate(input, table);

    expect(calculateEmbedded(input)).toEqual(expected);

    expect(FACT_COUNT).toBe(table.facts.length);
    expect(SOURCE_COUNT).toBe(Object.keys(table.sources).length);

    expect(REGIONS.length).toBe(11);
    expect(REGIONS).toContain("DE");

    expect(MODELS.length).toBe(7);
    for (const model of MODELS) {
      expect(typeof model.name).toBe("string");
      expect(Array.isArray(model.aliases)).toBe(true);
      for (const alias of model.aliases) {
        expect(typeof alias).toBe("string");
      }
    }

    expect(FACTS_GENERATED).toBe("2026-09-09");
  });
});
