import { describe, expect, it } from "vitest";
import { loadFacts } from "../src/facts.js";
import { resolveCoefficients } from "../src/resolve.js";

const FACTS = new URL("../data/facts.json", import.meta.url).pathname;
const ASSUMPTIONS = new URL("../data/assumptions.json", import.meta.url).pathname;
const MODELS = new URL("../data/models.json", import.meta.url).pathname;

function table() {
  return loadFacts([FACTS, ASSUMPTIONS, MODELS]);
}

describe("resolveCoefficients", () => {
  it("region DE liefert UBA-CO2 und Lohrmann-Wasserwerte", () => {
    const result = resolveCoefficients({ model: "llama-3.1-70b", region: "DE" }, table());
    expect(result.carbonIntensity.factIds).toContain("grid-co2-uba-de-2025");
    expect(result.ewif.factIds).toContain("eu-grid-water-germany");
    expect(result.ewif.mid).toBeCloseTo(2.04, 5);
  });

  it("behandelt AWS-WUE als Entnahme (mid = 80% der Entnahme, max = Entnahme)", () => {
    const result = resolveCoefficients(
      { model: "llama-3.1-70b", provider: "aws" },
      table(),
    );
    expect(result.wueSite.max).toBeCloseTo(0.12, 5);
    expect(result.wueSite.mid).toBeCloseTo(0.096, 5);
    expect(result.wueSite.factIds).toContain("aws-wue-2025");
  });

  it("faellt bei unbekannter Region auf US-Werte mit confidence 2 zurueck", () => {
    const result = resolveCoefficients(
      { model: "llama-3.1-70b", region: "ZZ" },
      table(),
    );
    expect(result.ewif.confidence).toBe(2);
    expect(result.carbonIntensity.confidence).toBe(2);
    expect(result.ewif.factIds).toContain("ewif-us-average");
  });

  it("erkennt Gemini Apps als Vollstack und nutzt Googles eigene Koeffizienten", () => {
    const result = resolveCoefficients({ model: "gemini-apps", provider: "google" }, table());
    expect(result.fullstack).toBe(true);
    expect(result.energyPerRequestGpuOnly.mid).toBeCloseTo(0.24, 5);
    expect(result.wueSite.mid).toBeCloseTo(1.15, 5);
    expect(result.carbonIntensity.mid).toBeCloseTo(94, 5);
  });

  it("liefert fuer jede Modellklasse min <= mid <= max", () => {
    for (const model of ["gpt-4o-mini", "claude-3-5-sonnet", "llama-3.1-405b", "deepseek-r1"]) {
      const result = resolveCoefficients({ model }, table());
      expect(result.energyPerRequestGpuOnly.min).toBeLessThanOrEqual(
        result.energyPerRequestGpuOnly.mid,
      );
      expect(result.energyPerRequestGpuOnly.mid).toBeLessThanOrEqual(
        result.energyPerRequestGpuOnly.max,
      );
    }
  });
});
