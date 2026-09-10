import { describe, expect, it } from "vitest";
import { loadFacts } from "../src/factsNode.js";
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
    // mid/max sind fuer das Bezugsjahr 2024 fest auf den UBA-2024-Fakt
    // gepinnt (nicht die neuere grid-co2-uba-de-2025), siehe
    // CARBON_REGION_TABLE_BY_YEAR in resolve.ts.
    expect(result.carbonIntensity.factIds).toContain("grid-co2-uba-de-2024");
    expect(result.carbonIntensity.factIds).not.toContain("grid-co2-uba-de-2025");
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

  it("carbonIntensity 2024: DE/FR/US/EU-27 liefern die erwarteten min/mid/max-Werte", () => {
    const t = table();
    const de = resolveCoefficients({ model: "llama-3.1-70b", region: "DE" }, t);
    expect(de.carbonIntensity.min).toBeCloseTo(291, 5);
    expect(de.carbonIntensity.mid).toBeCloseTo(353, 5);
    expect(de.carbonIntensity.max).toBeCloseTo(353, 5);

    const fr = resolveCoefficients({ model: "llama-3.1-70b", region: "FR" }, t);
    expect(fr.carbonIntensity.min).toBeCloseTo(21.7, 5);
    expect(fr.carbonIntensity.mid).toBeCloseTo(21.7, 5);
    expect(fr.carbonIntensity.max).toBeCloseTo(40.48, 5);

    const us = resolveCoefficients({ model: "llama-3.1-70b", region: "US" }, t);
    expect(us.carbonIntensity.min).toBeCloseTo(350, 5);
    expect(us.carbonIntensity.mid).toBeCloseTo(350, 5);
    expect(us.carbonIntensity.max).toBeCloseTo(383.78, 5);

    const eu = resolveCoefficients({ model: "llama-3.1-70b", region: "EU" }, t);
    expect(eu.carbonIntensity.min).toBeCloseTo(183.44, 5);
    expect(eu.carbonIntensity.mid).toBeCloseTo(211.2, 5);
    expect(eu.carbonIntensity.max).toBeCloseTo(211.2, 5);
  });

  it("PUE Default-Anbieter: min = us-dc-pue-ai-2024, mid = us-dc-pue-2024, max = mid + Bandbreite", () => {
    const result = resolveCoefficients({ model: "llama-3.1-70b" }, table());
    expect(result.pue.min).toBeCloseTo(1.145, 5);
    expect(result.pue.mid).toBeCloseTo(1.45, 5);
    expect(result.pue.max).toBeCloseTo(1.55, 5);
    expect(result.pue.min).toBeLessThanOrEqual(result.pue.mid);
    expect(result.pue.mid).toBeLessThanOrEqual(result.pue.max);
    expect(result.pue.factIds).toEqual([
      "us-dc-pue-ai-2024",
      "us-dc-pue-2024",
      "pue-range-half-width",
    ]);
  });

  it("PUE Google/Microsoft: unveraendert symmetrisch um den jeweiligen Punktwert", () => {
    const t = table();
    const google = resolveCoefficients({ model: "llama-3.1-70b", provider: "google" }, t);
    expect(google.pue.factIds).toContain("google-pue");
    expect(google.pue.mid - google.pue.min).toBeCloseTo(google.pue.max - google.pue.mid, 10);

    const microsoft = resolveCoefficients({ model: "llama-3.1-70b", provider: "microsoft" }, t);
    expect(microsoft.pue.factIds).toContain("msft-pue-global-fy25");
    expect(microsoft.pue.mid - microsoft.pue.min).toBeCloseTo(
      microsoft.pue.max - microsoft.pue.mid,
      10,
    );
  });

  it("carbonIntensity 2024: min <= mid <= max fuer jede Region im REGION_TABLE", () => {
    const t = table();
    for (const region of ["DE", "IE", "NL", "SE", "FI", "FR", "US", "SG", "IN", "JP", "EU"]) {
      const result = resolveCoefficients({ model: "llama-3.1-70b", region }, t);
      expect(
        result.carbonIntensity.min,
        `Region ${region}: min <= mid`,
      ).toBeLessThanOrEqual(result.carbonIntensity.mid);
      expect(
        result.carbonIntensity.mid,
        `Region ${region}: mid <= max`,
      ).toBeLessThanOrEqual(result.carbonIntensity.max);
    }
  });

  it("region NL liefert EWIF als Spanne aus Lohrmann (min/mid) und WRI (max)", () => {
    const result = resolveCoefficients({ model: "llama-3.1-70b", region: "NL" }, table());
    expect(result.ewif.min).toBeCloseTo(1.31, 5);
    expect(result.ewif.mid).toBeCloseTo(1.31, 5);
    expect(result.ewif.max).toBeCloseTo(3.445, 5);
    expect(result.ewif.factIds).toContain("eu-grid-water-netherlands");
    expect(result.ewif.factIds).toContain("ewif-netherlands");
  });

  it("region DE liefert EWIF als Spanne aus WRI (min) und Lohrmann (mid/max)", () => {
    const result = resolveCoefficients({ model: "llama-3.1-70b", region: "DE" }, table());
    expect(result.ewif.min).toBeCloseTo(1.947, 5);
    expect(result.ewif.mid).toBeCloseTo(2.04, 5);
    expect(result.ewif.max).toBeCloseTo(2.04, 5);
    expect(result.ewif.factIds).toContain("ewif-germany");
    expect(result.ewif.factIds).toContain("eu-grid-water-germany");
  });
});
