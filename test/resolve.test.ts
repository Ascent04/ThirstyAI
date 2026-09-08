import { describe, expect, it } from "vitest";
import { loadFacts } from "../src/facts.js";
import { OUTPUT_TOKENS_FOR_ENERGY_FACT, resolveCoefficients } from "../src/resolve.js";

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
    // Einheit seit der Umstellung auf Wh/1.000 Output-Token: 0.24 Wh /
    // oviedo-typical-output-tokens (300) * 1000 = 0.8 (vorher: 0.24, als
    // die Koeffizienten noch in Wh pro Anfrage bei Referenz 300 Token waren).
    expect(result.energyPerRequestGpuOnly.mid).toBeCloseTo(0.8, 5);
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

  it("hat fuer jeden von resolveEnergyPerRequest tatsaechlich verwendeten Energie-Fakt einen Token-Fakt hinterlegt", () => {
    // Jeder Energie-Fakt, den resolveEnergyPerRequest ueber alle vier
    // Modellklassen und den Vollstack-Pfad hinweg nachschlaegt, muss in
    // OUTPUT_TOKENS_FOR_ENERGY_FACT (resolve.ts) eine Zuordnung haben -
    // sonst wirft perThousandOutputTokens() zur Laufzeit. Diese Liste
    // synchron zu den case-Zweigen in resolveEnergyPerRequest halten.
    const usedEnergyFactIds = [
      "energy-small-lower-bound",
      "dsr1-distill-70b-noreason",
      "llama31-70b-inf-energy",
      "caravaca-llama31-70b-measured",
      "mixtral-8x22b-inf-energy",
      "llama31-405b-inf-energy",
      "frontier-class-joule-median",
      "frontier-class-joule-iqr-max",
      "dsr1-distill-70b-reason",
      "jegham-long-prompt-max",
      "gemini-energy",
    ];
    for (const id of usedEnergyFactIds) {
      expect(OUTPUT_TOKENS_FOR_ENERGY_FACT[id], `fehlende Zuordnung fuer "${id}"`).toBeDefined();
    }

    // Gegenprobe: fuer je ein Modell pro Klasse (+ Vollstack) darf
    // resolveCoefficients tatsaechlich nicht werfen.
    const t = table();
    expect(() => resolveCoefficients({ model: "gpt-4o-mini" }, t)).not.toThrow();
    expect(() => resolveCoefficients({ model: "claude-3-5-sonnet" }, t)).not.toThrow();
    expect(() => resolveCoefficients({ model: "llama-3.1-405b" }, t)).not.toThrow();
    expect(() => resolveCoefficients({ model: "deepseek-r1" }, t)).not.toThrow();
    expect(() => resolveCoefficients({ model: "gemini-apps", provider: "google" }, t)).not.toThrow();
  });
});
