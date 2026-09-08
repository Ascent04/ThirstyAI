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
  referenceYear?: number;
}

export const DEFAULT_REFERENCE_YEAR = 2024;

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
 * wie input-token-cost-share in calculate.ts geht seine confidence deshalb
 * nicht in die Gesamt-confidence ein (sonst waere
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

// --- a) energyPerRequestGpuOnly (Einheit: Wh pro 1.000 Output-Token) ---

/**
 * Ordnet jedem in resolveEnergyPerRequest verwendeten Energie-Fakt den Fakt
 * zu, aus dem die zugehoerige mittlere Output-Tokenzahl stammt - explizite
 * Tabelle, keine Heuristik. "measured": die Tokenzahl stammt aus derselben
 * Messung/demselben Benchmark wie der Energiewert. "assumed": die Tokenzahl
 * stammt aus einer anderen Quelle und wird dem Energiewert nur zugeordnet -
 * das drueckt sich in einem confidence-Deckel von 2 aus, siehe
 * perThousandOutputTokens().
 */
export const OUTPUT_TOKENS_FOR_ENERGY_FACT: Record<
  string,
  { tokenFactId: string; basis: "measured" | "assumed" }
> = {
  "llama31-70b-inf-energy": { tokenFactId: "mlenergy-llama31-70b-output-tokens", basis: "measured" },
  "caravaca-llama31-70b-measured": { tokenFactId: "caravaca-output-tokens", basis: "measured" },
  "mixtral-8x22b-inf-energy": { tokenFactId: "mlenergy-mixtral-8x22b-output-tokens", basis: "measured" },
  "llama31-405b-inf-energy": { tokenFactId: "mlenergy-llama31-405b-output-tokens", basis: "measured" },
  "frontier-class-joule-median": { tokenFactId: "oviedo-typical-output-tokens", basis: "assumed" },
  "frontier-class-joule-iqr-max": { tokenFactId: "oviedo-typical-output-tokens", basis: "assumed" },
  "energy-small-lower-bound": { tokenFactId: "oviedo-typical-output-tokens", basis: "assumed" },
  "dsr1-distill-70b-noreason": { tokenFactId: "oviedo-typical-output-tokens", basis: "assumed" },
  "dsr1-distill-70b-reason": { tokenFactId: "oviedo-reasoning-output-tokens", basis: "assumed" },
  "jegham-long-prompt-max": { tokenFactId: "jegham-long-output-tokens", basis: "measured" },
  "gemini-energy": { tokenFactId: "oviedo-typical-output-tokens", basis: "assumed" },
};

interface PerThousandTokens {
  value: number;
  confidence: number;
  factIds: string[];
}

/**
 * Rechnet einen Wh-pro-Anfrage-Fakt in Wh pro 1.000 Output-Token um, ueber
 * den in OUTPUT_TOKENS_FOR_ENERGY_FACT hinterlegten Token-Fakt. Bei
 * basis "assumed" wird die confidence zusaetzlich auf 2 gedeckelt, weil die
 * Tokenzahl nicht aus derselben Messung stammt wie der Energiewert.
 */
function perThousandOutputTokens(energyFact: Fact, table: FactTable): PerThousandTokens {
  const mapping = OUTPUT_TOKENS_FOR_ENERGY_FACT[energyFact.id];
  if (!mapping) {
    throw new Error(`Kein Token-Fakt fuer Energie-Fakt "${energyFact.id}" hinterlegt`);
  }
  const tokenFact = requireFact(table, mapping.tokenFactId);
  const value = (energyFact.value / tokenFact.value) * 1000;
  let confidence = Math.min(energyFact.confidence, tokenFact.confidence);
  if (mapping.basis === "assumed") {
    confidence = Math.min(confidence, 2);
  }
  return { value, confidence, factIds: [energyFact.id, tokenFact.id] };
}

function energyRangeFromFacts(
  minFact: Fact,
  midFact: Fact,
  maxFact: Fact,
  table: FactTable,
): CoefficientRange {
  const min = perThousandOutputTokens(minFact, table);
  const mid = perThousandOutputTokens(midFact, table);
  const max = perThousandOutputTokens(maxFact, table);
  return {
    min: min.value,
    mid: mid.value,
    max: max.value,
    confidence: Math.min(min.confidence, mid.confidence, max.confidence),
    factIds: [...min.factIds, ...mid.factIds, ...max.factIds],
  };
}

function resolveEnergyPerRequest(
  classification: ModelClassification,
  table: FactTable,
): CoefficientRange {
  if (classification.fullstack) {
    // Gemini Apps: der Fakt ist bereits Vollstack (inkl. PUE), kein
    // GPU-only-Wert. calculate.ts erkennt fullstack und wendet keinen
    // zusaetzlichen Overhead an. Skaliert wie alle anderen Klassen auf
    // Wh pro 1.000 Output-Token (keine Sonderbehandlung).
    const fact = requireFact(table, "gemini-energy");
    const r = perThousandOutputTokens(fact, table);
    return { min: r.value, mid: r.value, max: r.value, confidence: r.confidence, factIds: r.factIds };
  }

  switch (classification.modelClass) {
    case "small": {
      const lower = requireFact(table, "energy-small-lower-bound");
      const upper = requireFact(table, "dsr1-distill-70b-noreason");
      const lowerR = perThousandOutputTokens(lower, table);
      const upperR = perThousandOutputTokens(upper, table);
      return {
        min: lowerR.value,
        mid: (lowerR.value + upperR.value) / 2,
        max: upperR.value,
        confidence: Math.min(lowerR.confidence, upperR.confidence),
        factIds: [...lowerR.factIds, ...upperR.factIds],
      };
    }
    case "mid": {
      const min = requireFact(table, "llama31-70b-inf-energy");
      const mid = requireFact(table, "caravaca-llama31-70b-measured");
      const max = requireFact(table, "mixtral-8x22b-inf-energy");
      return energyRangeFromFacts(min, mid, max, table);
    }
    case "frontier": {
      const min = requireFact(table, "llama31-405b-inf-energy");
      const mid = requireFact(table, "frontier-class-joule-median");
      const max = requireFact(table, "frontier-class-joule-iqr-max");
      return energyRangeFromFacts(min, mid, max, table);
    }
    case "reasoning": {
      const min = requireFact(table, "frontier-class-joule-median");
      const mid = requireFact(table, "dsr1-distill-70b-reason");
      const max = requireFact(table, "jegham-long-prompt-max");
      return energyRangeFromFacts(min, mid, max, table);
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

// --- e) ewif nach Region ---

interface EwifRegionFacts {
  ewifIds: string[];
}

const EWIF_REGION_TABLE: Record<string, EwifRegionFacts> = {
  DE: { ewifIds: ["eu-grid-water-germany"] },
  IE: { ewifIds: ["eu-grid-water-ireland"] },
  NL: { ewifIds: ["eu-grid-water-netherlands"] },
  SE: { ewifIds: ["eu-grid-water-sweden"] },
  FI: { ewifIds: ["eu-grid-water-finland"] },
  FR: { ewifIds: ["eu-grid-water-france"] },
  US: { ewifIds: ["ewif-us-average"] },
  SG: { ewifIds: [] },
  IN: { ewifIds: ["ewif-india"] },
  JP: { ewifIds: [] },
  EU: { ewifIds: [] },
};

const FALLBACK_EWIF_IDS = ["ewif-us-average"];
const FALLBACK_CARBON_IDS = ["grid-co2-egrid-us-2023"];

function resolveEwif(
  region: string | undefined,
  table: FactTable,
  asOf: Date | undefined,
): CoefficientRange {
  const entry = region ? EWIF_REGION_TABLE[region.toUpperCase()] : undefined;
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

// --- f) carbonIntensity nach Region und Bezugsjahr ---

/**
 * min/mid/max je Region als eigene Fakt-ID-Listen (nicht ein einzelner
 * Punktwert wie zuvor). Jede Liste geht durch `latest()`, damit asOf weiter
 * greift (z.B. DE mid: UBA 2024 vs. 2025). In diesem Zyklus (Teilschritt 1,
 * "Strukturumbau ohne Ergebnisaenderung") sind min/mid/max je Region noch
 * identisch zur bisherigen alleinigen Quelle - Teilschritt 2 ersetzt min/max
 * durch die tatsaechlichen Grenzwerte (EEA/Ember-Bandbreite).
 */
interface RegionCarbonFacts {
  minIds: string[];
  midIds: string[];
  maxIds: string[];
}

const CARBON_REGION_TABLE_BY_YEAR: Record<number, Record<string, RegionCarbonFacts>> = {
  2024: {
    DE: {
      minIds: ["grid-co2-uba-de-2024", "grid-co2-uba-de-2025"],
      midIds: ["grid-co2-uba-de-2024", "grid-co2-uba-de-2025"],
      maxIds: ["grid-co2-uba-de-2024", "grid-co2-uba-de-2025"],
    },
    IE: {
      minIds: ["grid-co2-ember-irland"],
      midIds: ["grid-co2-ember-irland"],
      maxIds: ["grid-co2-ember-irland"],
    },
    NL: {
      minIds: ["grid-co2-ember-niederlande"],
      midIds: ["grid-co2-ember-niederlande"],
      maxIds: ["grid-co2-ember-niederlande"],
    },
    SE: {
      minIds: ["grid-co2-ember-schweden"],
      midIds: ["grid-co2-ember-schweden"],
      maxIds: ["grid-co2-ember-schweden"],
    },
    FI: {
      minIds: ["grid-co2-ember-finnland"],
      midIds: ["grid-co2-ember-finnland"],
      maxIds: ["grid-co2-ember-finnland"],
    },
    FR: {
      minIds: ["grid-co2-rte-fr-2024"],
      midIds: ["grid-co2-rte-fr-2024"],
      maxIds: ["grid-co2-rte-fr-2024"],
    },
    US: {
      minIds: ["grid-co2-egrid-us-2023"],
      midIds: ["grid-co2-egrid-us-2023"],
      maxIds: ["grid-co2-egrid-us-2023"],
    },
    SG: {
      minIds: ["grid-co2-ema-sg-2024"],
      midIds: ["grid-co2-ema-sg-2024"],
      maxIds: ["grid-co2-ema-sg-2024"],
    },
    IN: {
      minIds: ["grid-co2-ember-indien"],
      midIds: ["grid-co2-ember-indien"],
      maxIds: ["grid-co2-ember-indien"],
    },
    JP: {
      minIds: ["grid-co2-ember-japan"],
      midIds: ["grid-co2-ember-japan"],
      maxIds: ["grid-co2-ember-japan"],
    },
    EU: {
      minIds: ["grid-co2-ember-eu-27"],
      midIds: ["grid-co2-ember-eu-27"],
      maxIds: ["grid-co2-ember-eu-27"],
    },
  },
};

function resolveCarbonRangeFact(ids: string[], table: FactTable, asOf: Date | undefined): Fact {
  return latest(table, { ids }, asOf)[0] ?? requireFact(table, ids[0]);
}

function resolveCarbonIntensity(
  provider: string | undefined,
  region: string | undefined,
  referenceYear: number,
  table: FactTable,
  asOf: Date | undefined,
): CoefficientRange {
  const p = normalizeProvider(provider);
  if (isGoogleProvider(p)) {
    // Googles eigener Flotten-Emissionsfaktor (market-based) statt Regionsraster,
    // da Gemini Apps ueber die globale Flotte serviert wird.
    return pointRange(requireFact(table, "google-ef-mb-2024"));
  }

  const yearTable = CARBON_REGION_TABLE_BY_YEAR[referenceYear];
  if (!yearTable) {
    throw new Error(`Kein CO2-Regionsraster fuer Bezugsjahr ${referenceYear} hinterlegt`);
  }

  const entry = region ? yearTable[region.toUpperCase()] : undefined;
  if (entry) {
    const minFact = resolveCarbonRangeFact(entry.minIds, table, asOf);
    const midFact = resolveCarbonRangeFact(entry.midIds, table, asOf);
    const maxFact = resolveCarbonRangeFact(entry.maxIds, table, asOf);
    return {
      min: minFact.value,
      mid: midFact.value,
      max: maxFact.value,
      confidence: Math.min(minFact.confidence, midFact.confidence, maxFact.confidence),
      factIds: [...new Set([minFact.id, midFact.id, maxFact.id])],
    };
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
  const referenceYear = input.referenceYear ?? DEFAULT_REFERENCE_YEAR;

  return {
    energyPerRequestGpuOnly: resolveEnergyPerRequest(classification, table),
    overheadFactor: resolveOverheadFactor(table),
    pue: resolvePue(input.provider, table),
    wueSite: resolveWueSite(input.provider, input.region, table, input.asOf),
    ewif: resolveEwif(input.region, table, input.asOf),
    carbonIntensity: resolveCarbonIntensity(
      input.provider,
      input.region,
      referenceYear,
      table,
      input.asOf,
    ),
    fullstack: classification.fullstack,
    modelClass: classification,
  };
}
