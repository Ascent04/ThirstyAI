import type { Fact, FactTable } from "./facts.js";
import { latest } from "./facts.js";
import { classifyModel, type ModelClassification } from "./models.js";

export interface CoefficientRange {
  min: number;
  mid: number;
  max: number;
  confidence: number;
  factIds: string[];
}

export interface ResolvedCoefficients {
  energyPerRequestGpuOnly: CoefficientRange;
  overheadFactor: CoefficientRange;
  pue: CoefficientRange;
  wueSite: CoefficientRange;
  ewif: CoefficientRange;
  carbonIntensity: CoefficientRange;
  fullstack: boolean;
  modelClass: ModelClassification;
}

export interface ResolveInput {
  model: string;
  provider?: string;
  region?: string;
  asOf?: Date;
}

function requireFact(table: FactTable, id: string): Fact {
  const fact = table.byId.get(id);
  if (!fact) {
    throw new Error(`Fakt-ID "${id}" fehlt in der Faktentabelle`);
  }
  return fact;
}

function pointRange(fact: Fact): CoefficientRange {
  return {
    min: fact.value,
    mid: fact.value,
    max: fact.value,
    confidence: fact.confidence,
    factIds: [fact.id],
  };
}

/**
 * deltaFact (die Bandbreite um den PUE-Punktwert) wird auf jede einzige
 * Anfrage angewendet, unabhaengig von Modell, Anbieter oder Region - genau
 * wie reference-output-tokens/input-token-cost-share in calculate.ts geht
 * seine confidence deshalb nicht in die Gesamt-confidence ein (sonst waere
 * jedes Ergebnis unabhaengig von der Qualitaet der PUE-Quelle auf 1
 * begrenzt), erscheint aber ueber factIds in `assumptions`.
 */
function spreadRange(fact: Fact, deltaFact: Fact): CoefficientRange {
  const delta = deltaFact.value;
  return {
    min: fact.value - delta,
    mid: fact.value,
    max: fact.value + delta,
    confidence: fact.confidence,
    factIds: [fact.id, deltaFact.id],
  };
}

/**
 * Fakten, die eine Wasser-ENTNAHME (withdrawal) ausweisen statt Verbrauch
 * (consumption), werden so behandelt: mid = Entnahme x consumptionShare
 * (shareFact, z.B. Googles eigener Verbrauchsanteil an der Entnahme), max =
 * die Entnahme selbst als Obergrenze (Annahme: im ungünstigsten Fall wird
 * alles verbraucht). min = mid, da keine belegte untere Grenze vorliegt.
 */
function withdrawalRange(fact: Fact, shareFact: Fact): CoefficientRange {
  const mid = fact.value * shareFact.value;
  return {
    min: mid,
    mid,
    max: fact.value,
    confidence: Math.min(fact.confidence, shareFact.confidence),
    factIds: [fact.id, shareFact.id],
  };
}

function capConfidence(range: CoefficientRange, capFact: Fact): CoefficientRange {
  return {
    ...range,
    confidence: Math.min(range.confidence, capFact.value),
    factIds: [...range.factIds, capFact.id],
  };
}

function normalizeProvider(provider?: string): string | undefined {
  return provider?.toLowerCase();
}

function isGoogleProvider(p?: string): boolean {
  return p !== undefined && (p.includes("google") || p.includes("gemini"));
}
function isMicrosoftProvider(p?: string): boolean {
  return p !== undefined && (p.includes("microsoft") || p.includes("azure"));
}
function isAwsProvider(p?: string): boolean {
  return p !== undefined && (p.includes("aws") || p.includes("amazon"));
}
function isMetaProvider(p?: string): boolean {
  return p !== undefined && p.includes("meta");
}

// --- a) energyPerRequestGpuOnly ---

function resolveEnergyPerRequest(
  classification: ModelClassification,
  table: FactTable,
): CoefficientRange {
  if (classification.fullstack) {
    // Gemini Apps: der Fakt ist bereits Vollstack (inkl. PUE), kein
    // GPU-only-Wert. calculate.ts erkennt fullstack und wendet keinen
    // zusaetzlichen Overhead an.
    return pointRange(requireFact(table, "gemini-energy"));
  }

  switch (classification.modelClass) {
    case "small": {
      const lower = requireFact(table, "energy-small-lower-bound");
      const upper = requireFact(table, "dsr1-distill-70b-noreason");
      return {
        min: lower.value,
        mid: (lower.value + upper.value) / 2,
        max: upper.value,
        confidence: Math.min(lower.confidence, upper.confidence),
        factIds: [lower.id, upper.id],
      };
    }
    case "mid": {
      const min = requireFact(table, "llama31-70b-inf-energy");
      const mid = requireFact(table, "mid-class-caravaca-energy");
      const max = requireFact(table, "mixtral-8x22b-inf-energy");
      return {
        min: min.value,
        mid: mid.value,
        max: max.value,
        confidence: Math.min(min.confidence, mid.confidence, max.confidence),
        factIds: [min.id, mid.id, max.id],
      };
    }
    case "frontier": {
      const min = requireFact(table, "llama31-405b-inf-energy");
      const mid = requireFact(table, "frontier-class-joule-median");
      const max = requireFact(table, "frontier-class-joule-iqr-max");
      return {
        min: min.value,
        mid: mid.value,
        max: max.value,
        confidence: Math.min(min.confidence, mid.confidence, max.confidence),
        factIds: [min.id, mid.id, max.id],
      };
    }
    case "reasoning": {
      const min = requireFact(table, "frontier-class-joule-median");
      const mid = requireFact(table, "dsr1-distill-70b-reason");
      const max = requireFact(table, "jegham-long-prompt-max");
      return {
        min: min.value,
        mid: mid.value,
        max: max.value,
        confidence: Math.min(min.confidence, mid.confidence, max.confidence),
        factIds: [min.id, mid.id, max.id],
      };
    }
    default: {
      const exhaustive: never = classification.modelClass;
      throw new Error(`Unbekannte Modellklasse: ${String(exhaustive)}`);
    }
  }
}

// --- b) overheadFactor ---

function resolveOverheadFactor(table: FactTable): CoefficientRange {
  const min = requireFact(table, "overhead-factor-min");
  const mid = requireFact(table, "overhead-factor-mid");
  const max = requireFact(table, "overhead-factor-max");
  return {
    min: min.value,
    mid: mid.value,
    max: max.value,
    confidence: Math.min(min.confidence, mid.confidence, max.confidence),
    factIds: [min.id, mid.id, max.id],
  };
}

// --- c) pue ---

function resolvePue(provider: string | undefined, table: FactTable): CoefficientRange {
  const p = normalizeProvider(provider);
  let fact: Fact;
  if (isGoogleProvider(p)) {
    fact = requireFact(table, "google-pue");
  } else if (isMicrosoftProvider(p)) {
    fact = requireFact(table, "msft-pue-global-fy25");
  } else {
    fact = requireFact(table, "us-dc-pue-2023");
  }
  const halfWidth = requireFact(table, "pue-range-half-width");
  return spreadRange(fact, halfWidth);
}

// --- d) wueSite ---

const EMEA_REGIONS = new Set(["DE", "IE", "NL", "SE", "FI", "FR", "EU"]);
const AMERICAS_REGIONS = new Set(["US"]);
const APAC_REGIONS = new Set(["SG", "IN", "JP"]);

function resolveWueSite(
  provider: string | undefined,
  region: string | undefined,
  table: FactTable,
  asOf: Date | undefined,
): CoefficientRange {
  const p = normalizeProvider(provider);
  const r = region?.toUpperCase();

  if (isGoogleProvider(p)) {
    return pointRange(requireFact(table, "google-wue-cat2"));
  }
  if (isMicrosoftProvider(p)) {
    if (r && EMEA_REGIONS.has(r)) return pointRange(requireFact(table, "msft-wue-emea-fy25"));
    if (r && AMERICAS_REGIONS.has(r)) {
      return pointRange(requireFact(table, "msft-wue-americas-fy25"));
    }
    if (r && APAC_REGIONS.has(r)) return pointRange(requireFact(table, "msft-wue-apac-fy25"));
    return pointRange(requireFact(table, "msft-wue-global-fy25"));
  }
  if (isAwsProvider(p)) {
    const fact =
      latest(table, { ids: ["aws-wue-2024", "aws-wue-2025"] }, asOf)[0] ??
      requireFact(table, "aws-wue-2024");
    return withdrawalRange(fact, requireFact(table, "withdrawal-to-consumption-share"));
  }
  if (isMetaProvider(p)) {
    return withdrawalRange(
      requireFact(table, "meta-wue-2024"),
      requireFact(table, "withdrawal-to-consumption-share"),
    );
  }

  // Fallback: US-Rechenzentren-Durchschnitt. min/max stehen nur in der Notiz
  // des Fakts (Hyperscale-Median 0.32, Sensitivitaet 0.40), daher als eigene
  // ANNAHME-Fakten herausgezogen.
  const fallback = requireFact(table, "us-dc-wue-site-2023");
  const min = requireFact(table, "wue-site-fallback-min");
  const max = requireFact(table, "wue-site-fallback-max");
  return {
    min: min.value,
    mid: fallback.value,
    max: max.value,
    confidence: Math.min(min.confidence, fallback.confidence, max.confidence),
    factIds: [min.id, fallback.id, max.id],
  };
}

// --- e) ewif und carbonIntensity nach Region ---

interface RegionFacts {
  ewifIds: string[];
  carbonIds: string[];
}

const REGION_TABLE: Record<string, RegionFacts> = {
  DE: { ewifIds: ["eu-grid-water-germany"], carbonIds: ["grid-co2-uba-de-2024", "grid-co2-uba-de-2025"] },
  IE: { ewifIds: ["eu-grid-water-ireland"], carbonIds: ["grid-co2-ember-irland"] },
  NL: { ewifIds: ["eu-grid-water-netherlands"], carbonIds: ["grid-co2-ember-niederlande"] },
  SE: { ewifIds: ["eu-grid-water-sweden"], carbonIds: ["grid-co2-ember-schweden"] },
  FI: { ewifIds: ["eu-grid-water-finland"], carbonIds: ["grid-co2-ember-finnland"] },
  FR: { ewifIds: ["eu-grid-water-france"], carbonIds: ["grid-co2-rte-fr-2024"] },
  US: { ewifIds: ["ewif-us-average"], carbonIds: ["grid-co2-egrid-us-2023"] },
  SG: { ewifIds: [], carbonIds: ["grid-co2-ema-sg-2024"] },
  IN: { ewifIds: ["ewif-india"], carbonIds: ["grid-co2-ember-indien"] },
  JP: { ewifIds: [], carbonIds: ["grid-co2-ember-japan"] },
  EU: { ewifIds: [], carbonIds: ["grid-co2-ember-eu-27"] },
};

const FALLBACK_EWIF_IDS = ["ewif-us-average"];
const FALLBACK_CARBON_IDS = ["grid-co2-egrid-us-2023"];

function resolveEwif(
  region: string | undefined,
  table: FactTable,
  asOf: Date | undefined,
): CoefficientRange {
  const entry = region ? REGION_TABLE[region.toUpperCase()] : undefined;
  if (entry && entry.ewifIds.length > 0) {
    const fact =
      latest(table, { ids: entry.ewifIds }, asOf)[0] ?? requireFact(table, entry.ewifIds[0]);
    return pointRange(fact);
  }
  const fallback =
    latest(table, { ids: FALLBACK_EWIF_IDS }, asOf)[0] ?? requireFact(table, FALLBACK_EWIF_IDS[0]);
  const cap = requireFact(table, "region-fallback-confidence-cap");
  return capConfidence(pointRange(fallback), cap);
}

function resolveCarbonIntensity(
  provider: string | undefined,
  region: string | undefined,
  table: FactTable,
  asOf: Date | undefined,
): CoefficientRange {
  const p = normalizeProvider(provider);
  if (isGoogleProvider(p)) {
    // Googles eigener Flotten-Emissionsfaktor (market-based) statt Regionsraster,
    // da Gemini Apps ueber die globale Flotte serviert wird.
    return pointRange(requireFact(table, "google-ef-mb-2024"));
  }

  const entry = region ? REGION_TABLE[region.toUpperCase()] : undefined;
  if (entry && entry.carbonIds.length > 0) {
    const fact =
      latest(table, { ids: entry.carbonIds }, asOf)[0] ?? requireFact(table, entry.carbonIds[0]);
    return pointRange(fact);
  }
  const fallback =
    latest(table, { ids: FALLBACK_CARBON_IDS }, asOf)[0] ??
    requireFact(table, FALLBACK_CARBON_IDS[0]);
  const cap = requireFact(table, "region-fallback-confidence-cap");
  return capConfidence(pointRange(fallback), cap);
}

/**
 * Loest alle fuenf Koeffizienten fuer eine Anfrage auf. Jede Teilfunktion
 * gibt die genutzten factIds mit zurueck, damit ein Ergebnis spaeter
 * nachvollziehbar bleibt.
 */
export function resolveCoefficients(input: ResolveInput, table: FactTable): ResolvedCoefficients {
  const classification = classifyModel(input.model, input.provider, table);

  return {
    energyPerRequestGpuOnly: resolveEnergyPerRequest(classification, table),
    overheadFactor: resolveOverheadFactor(table),
    pue: resolvePue(input.provider, table),
    wueSite: resolveWueSite(input.provider, input.region, table, input.asOf),
    ewif: resolveEwif(input.region, table, input.asOf),
    carbonIntensity: resolveCarbonIntensity(input.provider, input.region, table, input.asOf),
    fullstack: classification.fullstack,
    modelClass: classification,
  };
}
