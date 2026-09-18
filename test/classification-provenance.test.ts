import { describe, expect, it } from "vitest";
import type { FactTable } from "../src/facts.js";
import { loadFacts } from "../src/factsNode.js";
import { calculate } from "../src/calculate.js";

const FACTS = new URL("../data/facts.json", import.meta.url).pathname;
const ASSUMPTIONS = new URL("../data/assumptions.json", import.meta.url).pathname;
const MODELS = new URL("../data/models.json", import.meta.url).pathname;

function table(): FactTable {
  return loadFacts([FACTS, ASSUMPTIONS, MODELS]);
}

function run(model: string) {
  return calculate({ model, tokensIn: 0, tokensOut: 1000, region: "DE" }, table());
}

describe("Herkunft der Modell-Einordnung in factIds", () => {
  it("Modell mit Parameter-Fakt: der params-Fakt steht in factIds, nicht in assumptions", () => {
    const result = run("Llama 3.1 70B");
    expect(result.factIds).toContain("params-llama-3-1-70b");
    expect(result.assumptions).not.toContain("params-llama-3-1-70b");
  });

  it("Modell mit Klassen-Annahme: der class-Fakt steht in factIds und in assumptions", () => {
    const result = run("claude-sonnet-5");
    expect(result.factIds).toContain("class-claude-sonnet-5");
    expect(result.assumptions).toContain("class-claude-sonnet-5");
  });

  it("Modell ohne Fakt (Namensheuristik): keine params- oder class-ID in factIds", () => {
    const result = run("gpt-4o");
    const ids = result.factIds.filter((id) => id.startsWith("params-") || id.startsWith("class-"));
    expect(ids).toEqual([]);
  });

  it("factIds bleibt sortiert und ohne Dubletten", () => {
    const result = run("Llama 3.1 70B");
    expect(result.factIds).toEqual([...new Set(result.factIds)].sort());
  });
});
