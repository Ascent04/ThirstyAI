import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { calculateEmbedded, factById, SOURCES, MODELS, REGIONS, FACT_COUNT, SOURCE_COUNT } from "../web/browser-calc.js";
import { loadFacts } from "../src/factsNode.js";
import { calculate } from "../src/calculate.js";

const FACTS = new URL("../data/facts.json", import.meta.url).pathname;
const ASSUMPTIONS = new URL("../data/assumptions.json", import.meta.url).pathname;
const MODELS_JSON = new URL("../data/models.json", import.meta.url).pathname;
const BUNDLE = new URL("../docs/calculator/bundle.js", import.meta.url).pathname;

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
  });

  it("factById liefert denselben Fakt wie table.byId.get(id)", () => {
    const table = loadFacts([FACTS, ASSUMPTIONS, MODELS_JSON]);
    expect(factById("class-claude-sonnet-5")).toEqual(table.byId.get("class-claude-sonnet-5"));
  });

  it("SOURCES ist deep equal zu table.sources", () => {
    const table = loadFacts([FACTS, ASSUMPTIONS, MODELS_JSON]);
    expect(SOURCES).toEqual(table.sources);
  });

  // Regel 19: docs/calculator/bundle.js ist eingecheckt und wird nicht im
  // Testlauf gebaut. Faengt den vergessenen "npm run build:web" ab, wenn
  // data/facts.json sich geaendert hat. Der Praefix generated:" gehoert zur
  // Pruefung: das Datum steht im Bundle auch als verified-Datum einer Quelle,
  // eine Suche nur nach dem Datum waere also gruen trotz veraltetem Bundle.
  it("das eingecheckte Bundle enthaelt den generated-Stand aus data/facts.json (sonst fehlt npm run build:web)", () => {
    const generated = (JSON.parse(readFileSync(FACTS, "utf-8")) as { generated: string }).generated;
    const bundle = readFileSync(BUNDLE, "utf-8");

    expect(bundle).toContain(`generated:"${generated}"`);
  });
});
