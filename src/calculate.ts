import type { Fact, FactTable } from "./facts.js";
import { resolveCoefficients, type CoefficientRange } from "./resolve.js";

const REFERENCE_TOKENS_ID = "reference-output-tokens";
const INPUT_SHARE_ID = "input-token-cost-share";

export interface ResultRange {
  min: number;
  mid: number;
  max: number;
}

export interface Result {
  /** Energie am Netzanschluss der Anlage, inkl. PUE-Overhead. Einheit: Wh. */
  energyTotal: ResultRange;
  /** Standortgebundenes Kuehlwasser (Verdunstung), bezogen auf IT-Energie. Einheit: mL. */
  waterScope1: ResultRange;
  /** Wasser zur Stromerzeugung, bezogen auf Gesamtenergie. Einheit: mL. */
  waterScope2: ResultRange;
  /**
   * location-/market-based Emissionen des Stromverbrauchs; Herstellung
   * (Scope 3) und Kühlmittel (Scope 1) nicht enthalten.
   */
  co2Scope2: ResultRange;
  confidence: number;
  factIds: string[];
  assumptions: string[];
  boundary: "fullstack" | "gpu-only";
  asOf?: Date;
}

export interface CalculateInput {
  model: string;
  provider?: string;
  region?: string;
  tokensIn: number;
  tokensOut: number;
  asOf?: Date;
}

function requireFact(table: FactTable, id: string): Fact {
  const fact = table.byId.get(id);
  if (!fact) {
    throw new Error(`Fakt-ID "${id}" fehlt in der Faktentabelle`);
  }
  return fact;
}

function scale(range: CoefficientRange, factor: number): ResultRange {
  return { min: range.min * factor, mid: range.mid * factor, max: range.max * factor };
}

function scaleResult(range: ResultRange, factor: number): ResultRange {
  return { min: range.min * factor, mid: range.mid * factor, max: range.max * factor };
}

function mul(a: ResultRange, b: CoefficientRange): ResultRange {
  return { min: a.min * b.min, mid: a.mid * b.mid, max: a.max * b.max };
}

// Intervall-Division: der kleinste Quotient entsteht beim groessten Divisor
// und umgekehrt, daher min/max ueber Kreuz (nicht indexweise wie bei mul()).
function div(a: ResultRange, b: CoefficientRange): ResultRange {
  return { min: a.min / b.max, mid: a.mid / b.mid, max: a.max / b.min };
}

/**
 * Berechnet Wasser-, Strom- und CO2-Bandbreiten fuer eine Anfrage.
 *
 * Ablauf: energyGpu (Koeffizient skaliert auf die tatsaechliche Tokenzahl,
 * Referenz 300 Output-Token, Input-Token zu `input-token-cost-share` gewichtet)
 * -> energyIt (bei Vollstack-Fakten durch PUE geteilt, um den reinen
 * IT-Anteil zurueckzurechnen; sonst mit overheadFactor multipliziert) ->
 * energyTotal (bei Vollstack-Fakten = energyGpu selbst, da dort schon die
 * Gesamtenergie inkl. PUE gemessen wurde; sonst energyIt x PUE) ->
 * waterScope1 (energyIt x wueSite), waterScope2 (energyTotal x ewif),
 * co2Scope2 (energyTotal x carbonIntensity).
 * Die Gesamt-confidence ist das Minimum der tatsaechlich genutzten
 * Koeffizienten (overheadFactor zaehlt nur mit, wenn er auch verwendet wird);
 * die beiden universellen Umrechnungs-Annahmen (Referenz-Token, Input-Anteil)
 * fliessen nicht in die confidence ein, sonst waere jedes Ergebnis auf 1
 * begrenzt - sie erscheinen aber in `assumptions`. Details in
 * docs/methodology-draft.md.
 */
export function calculate(input: CalculateInput, table: FactTable): Result {
  const coeffs = resolveCoefficients(
    { model: input.model, provider: input.provider, region: input.region, asOf: input.asOf },
    table,
  );

  const referenceTokens = requireFact(table, REFERENCE_TOKENS_ID);
  const inputShare = requireFact(table, INPUT_SHARE_ID);

  const effectiveTokens = input.tokensOut + inputShare.value * input.tokensIn;
  const tokenScale = effectiveTokens / referenceTokens.value;

  const energyGpu = scale(coeffs.energyPerRequestGpuOnly, tokenScale);

  // Vollstack-Fakten (aktuell nur Gemini Apps) sind bereits die
  // Gesamtenergie inkl. PUE - energyTotal ist deshalb der Fakt selbst, nicht
  // energyIt*PUE (das wuerde durch die Intervall-Division keine exakte
  // Rundreise mehr ergeben). energyIt wird nur fuer waterScope1 gebraucht
  // und daraus zurueckgerechnet.
  const energyIt = coeffs.fullstack
    ? div(energyGpu, coeffs.pue)
    : mul(energyGpu, coeffs.overheadFactor);

  const energyTotal = coeffs.fullstack ? energyGpu : mul(energyIt, coeffs.pue);

  const waterScope1 = mul(energyIt, coeffs.wueSite);
  const waterScope2 = mul(energyTotal, coeffs.ewif);
  const co2Scope2 = scaleResult(mul(energyTotal, coeffs.carbonIntensity), 1 / 1000);

  const usedRanges: CoefficientRange[] = [
    coeffs.energyPerRequestGpuOnly,
    coeffs.pue,
    coeffs.wueSite,
    coeffs.ewif,
    coeffs.carbonIntensity,
  ];
  if (!coeffs.fullstack) {
    usedRanges.push(coeffs.overheadFactor);
  }
  const confidence = Math.min(...usedRanges.map((range) => range.confidence));

  const factIds = new Set<string>();
  for (const range of usedRanges) {
    for (const id of range.factIds) factIds.add(id);
  }
  factIds.add(referenceTokens.id);
  factIds.add(inputShare.id);

  const assumptions = [...factIds].filter((id) => table.byId.get(id)?.rating === "ANNAHME");

  return {
    energyTotal,
    waterScope1,
    waterScope2,
    co2Scope2,
    confidence,
    factIds: [...factIds].sort(),
    assumptions: assumptions.sort(),
    boundary: coeffs.fullstack ? "fullstack" : "gpu-only",
    asOf: input.asOf,
  };
}
