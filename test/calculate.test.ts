import { describe, expect, it } from "vitest";
import type { Fact, FactTable, Source } from "../src/facts.js";
import { loadFacts } from "../src/factsNode.js";
import { calculate } from "../src/calculate.js";

const FACTS = new URL("../data/facts.json", import.meta.url).pathname;
const ASSUMPTIONS = new URL("../data/assumptions.json", import.meta.url).pathname;
const MODELS = new URL("../data/models.json", import.meta.url).pathname;

function table(): FactTable {
  return loadFacts([FACTS, ASSUMPTIONS, MODELS]);
}

function closeWithin(value: number, target: number, tolerance: number): void {
  expect(value).toBeGreaterThanOrEqual(target * (1 - tolerance));
  expect(value).toBeLessThanOrEqual(target * (1 + tolerance));
}

/**
 * Baut eine eigenstaendige Faktentabelle fuer Testfall 2. Sie tritt nicht
 * gegen data/facts.json an, sondern liefert Li et al.s eigene Koeffizienten
 * (PUE 1.17, WUE 0.55, EWIF 3.142, Energie 4.0 Wh, kein Overhead) unter
 * denselben Fakt-IDs, die resolve.ts fuer die Modellklasse "small"
 * nachschlaegt - so lassen sich waterScope1 (2.2 mL) und waterScope2
 * (14.7 mL) aus arXiv:2304.03271 Tab. 1 unabhaengig von den echten
 * Projektfakten pruefen. GPT-3 wird hier absichtlich nicht als "small"
 * klassifiziert, weil es das ist, sondern weil nur diese Klasse ihre
 * Koeffizienten vollstaendig aus (ueberschreibbaren) Fakten statt aus
 * Literalen im Code bezieht.
 */
function overrideTable(): FactTable {
  const source: Source = {
    title: "Testfixtur",
    publisher: "Testfixtur",
    year: 2026,
    url: "-",
    type: "Testfixtur",
    verified: "2026-09-04",
  };
  const sources: Record<string, Source> = { TEST: source };

  function fact(partial: Partial<Fact> & { id: string; value: number }): Fact {
    return {
      category: "test",
      phase: "inference",
      model_or_object: "Testfixtur",
      unit: "-",
      functional_unit: "-",
      measurement_boundary: "Testfixtur, siehe test/calculate.test.ts",
      water_scope: "-",
      carbon_accounting: "-",
      region: "-",
      year: 2026,
      rating: "ANNAHME",
      confidence: 3,
      source_id: "TEST",
      locator: "-",
      quote: "-",
      second_source: "-",
      note: "-",
      ...partial,
    };
  }

  const facts: Fact[] = [
    fact({ id: "energy-small-lower-bound", value: 4.0 }),
    fact({ id: "dsr1-distill-70b-noreason", value: 4.0 }),
    fact({ id: "overhead-factor-min", value: 1.0 }),
    fact({ id: "overhead-factor-mid", value: 1.0 }),
    fact({ id: "overhead-factor-max", value: 1.0 }),
    fact({ id: "us-dc-pue-2023", value: 1.17 }),
    fact({ id: "us-dc-pue-2024", value: 1.17 }),
    fact({ id: "us-dc-pue-ai-2024", value: 1.07 }),
    fact({ id: "pue-range-half-width", value: 0.1 }),
    fact({ id: "us-dc-wue-site-2023", value: 0.55 }),
    fact({ id: "wue-site-fallback-min", value: 0.4 }),
    fact({ id: "wue-site-fallback-max", value: 0.7 }),
    fact({ id: "ewif-us-average", value: 3.142 }),
    fact({ id: "grid-co2-egrid-us-2023", value: 350 }),
    fact({ id: "grid-co2-ember-usa", value: 383.78 }),
    fact({ id: "oviedo-typical-output-tokens", value: 300 }),
    fact({ id: "input-token-cost-share", value: 0.1 }),
  ];

  const byId = new Map(facts.map((f) => [f.id, f]));
  return { sources, facts, byId };
}

describe("calculate", () => {
  it("Gemini-Fallstudie: waterScope1 ~0.26 mL, co2Scope2 ~0.023 g (Scope 2, nicht Googles Gesamtzahl)", () => {
    const result = calculate(
      { model: "gemini-apps", provider: "google", tokensIn: 0, tokensOut: 300 },
      table(),
    );
    closeWithin(result.waterScope1.mid, 0.26, 0.1);
    closeWithin(result.co2Scope2.mid, 0.023, 0.1);
    expect(result.boundary).toBe("fullstack");
    // Vollstack-Fakt ist bereits die Gesamtenergie inkl. PUE, energyTotal
    // darf durch die Intervall-Division bei energyIt nicht verfaelscht werden.
    expect(result.energyTotal.mid).toBeCloseTo(0.24, 10);
  });

  it("GPT-3/Li et al.: mit Original-Koeffizienten waterScope1 ~2.2 mL, waterScope2 ~14.7 mL", () => {
    const result = calculate(
      { model: "small-test-model", tokensIn: 0, tokensOut: 300, region: "US" },
      overrideTable(),
    );
    closeWithin(result.waterScope1.mid, 2.2, 0.05);
    closeWithin(result.waterScope2.mid, 14.7, 0.05);
  });

  it("liefert bei 0 Token ueberall 0", () => {
    const result = calculate(
      { model: "llama-3.1-70b", tokensIn: 0, tokensOut: 0 },
      table(),
    );
    expect(result.energyTotal.mid).toBe(0);
    expect(result.waterScope1.mid).toBe(0);
    expect(result.waterScope2.mid).toBe(0);
    expect(result.co2Scope2.mid).toBe(0);
  });

  it("faellt bei unbekannter Region auf US-Werte zurueck (confidence 2)", () => {
    const result = calculate(
      { model: "gemini-apps", provider: "google", region: "ZZ", tokensIn: 0, tokensOut: 300 },
      table(),
    );
    expect(result.confidence).toBe(2);
    expect(result.factIds).toContain("ewif-us-average");
  });

  it("haelt min <= mid <= max ein, auch bei Vollstack-Fakten (PUE-Division)", () => {
    const cases: Array<{ model: string; provider?: string }> = [
      { model: "gpt-4o-mini" },
      { model: "claude-3-5-sonnet" },
      { model: "llama-3.1-405b" },
      { model: "deepseek-r1" },
      { model: "gemini-apps", provider: "google" },
    ];
    for (const { model, provider } of cases) {
      const result = calculate({ model, provider, tokensIn: 500, tokensOut: 300 }, table());
      for (const range of [result.energyTotal, result.waterScope1, result.waterScope2, result.co2Scope2]) {
        expect(range.min).toBeLessThanOrEqual(range.mid);
        expect(range.mid).toBeLessThanOrEqual(range.max);
      }
    }
  });

  it("waehlt bei asOf in der Vergangenheit den damals bekannten Fakt", () => {
    const result = calculate(
      {
        model: "llama-3.1-70b",
        region: "DE",
        tokensIn: 0,
        tokensOut: 300,
        asOf: new Date("2024-06-01"),
      },
      table(),
    );
    expect(result.factIds).toContain("grid-co2-uba-de-2024");
    expect(result.factIds).not.toContain("grid-co2-uba-de-2025");
  });
});
