import { describe, expect, it } from "vitest";
import type { FactTable } from "../src/facts.js";
import { loadFacts } from "../src/factsNode.js";
import { classifyModel } from "../src/models.js";
import { classifyEmbedded, factById, MODELS } from "../web/browser-calc.js";

const FACTS = new URL("../data/facts.json", import.meta.url).pathname;
const ASSUMPTIONS = new URL("../data/assumptions.json", import.meta.url).pathname;
const MODELS_FILE = new URL("../data/models.json", import.meta.url).pathname;

function table(): FactTable {
  return loadFacts([FACTS, ASSUMPTIONS, MODELS_FILE]);
}

const NO_FACT_NAME = "unbekanntes-modell-xyz";

describe("classifyEmbedded (Web-Bruecke zur Modell-Einordnung)", () => {
  it("liefert dasselbe wie classifyModel mit der vollen Tabelle", () => {
    const t = table();
    for (const name of [...MODELS.map((m) => m.name), NO_FACT_NAME]) {
      expect(classifyEmbedded(name)).toEqual(classifyModel(name, undefined, t));
    }
  });

  it("jedes Modell der Auswahlliste ist ueber einen parameters-Fakt mit seinem Namen eingeordnet", () => {
    expect(MODELS.length).toBeGreaterThan(0);
    for (const m of MODELS) {
      const id = classifyEmbedded(m.name).sourceFactId;
      expect(id, m.name).toBeDefined();
      const fact = factById(id!);
      expect(fact?.category).toBe("parameters");
      expect(fact?.model_or_object).toBe(m.name);
    }
  });

  it("ein Name ohne Fakt hat keine sourceFactId", () => {
    expect(classifyEmbedded(NO_FACT_NAME).sourceFactId).toBeUndefined();
  });
});
