import type { Fact, FactTable } from "./facts.js";
import { DEFAULT_REFERENCE_YEAR, resolveCoefficients, type CoefficientRange } from "./resolve.js";

export { DEFAULT_REFERENCE_YEAR };

const INPUT_SHARE_ID = "input-token-cost-share";

export interface ResultRange {
  min: number;
  mid: number;
  max: number;
}

export interface Result {
  /** Energy at the facility's grid connection, incl. PUE overhead. Unit: Wh. */
  energyTotal: ResultRange;
  /** On-site cooling water (evaporation), based on IT energy. Unit: mL. */
  waterScope1: ResultRange;
  /** Water for electricity generation, based on total energy. Unit: mL. */
  waterScope2: ResultRange;
  /**
   * Location-/market-based emissions of electricity consumption;
   * manufacturing (Scope 3) and refrigerants (Scope 1) not included.
   */
  co2Scope2: ResultRange;
  confidence: number;
  factIds: string[];
  assumptions: string[];
  boundary: "fullstack" | "gpu-only";
  asOf?: Date;
  /** Bezugsjahr des CO2-Regionsrasters (siehe resolve.ts:CARBON_REGION_TABLE_BY_YEAR). */
  referenceYear: number;
}

export interface CalculateInput {
  model: string;
  provider?: string;
  region?: string;
  tokensIn: number;
  tokensOut: number;
  asOf?: Date;
  /** Default: DEFAULT_REFERENCE_YEAR. Unbekanntes Jahr wirft einen Fehler. */
  referenceYear?: number;
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
 * Ablauf: energyGpu (Koeffizient in Wh pro 1.000 Output-Token, siehe
 * resolve.ts:OUTPUT_TOKENS_FOR_ENERGY_FACT, multipliziert mit den
 * tatsaechlichen Token - Input-Token zu `input-token-cost-share` gewichtet,
 * da Output-Token die Energie dominieren, siehe Oviedo et al. 2025
 * arXiv:2509.20241) -> energyIt (bei Vollstack-Fakten durch PUE geteilt, um
 * den reinen IT-Anteil zurueckzurechnen; sonst mit overheadFactor
 * multipliziert) -> energyTotal (bei Vollstack-Fakten = energyGpu selbst, da
 * dort schon die Gesamtenergie inkl. PUE gemessen wurde; sonst energyIt x
 * PUE) -> waterScope1 (energyIt x wueSite), waterScope2 (energyTotal x
 * ewif), co2Scope2 (energyTotal x carbonIntensity).
 * Die Gesamt-confidence ist das Minimum der tatsaechlich genutzten
 * Koeffizienten (overheadFactor zaehlt nur mit, wenn er auch verwendet
 * wird); die universelle Umrechnungs-Annahme (Input-Anteil) fliesst nicht in
 * die confidence ein, sonst waere jedes Ergebnis auf 1 begrenzt - sie
 * erscheint aber in `assumptions`. Details in docs/methodology-de.md.
 */
export function calculate(input: CalculateInput, table: FactTable): Result {
  const referenceYear = input.referenceYear ?? DEFAULT_REFERENCE_YEAR;
  const coeffs = resolveCoefficients(
    {
      model: input.model,
      provider: input.provider,
      region: input.region,
      asOf: input.asOf,
      referenceYear,
    },
    table,
  );

  const inputShare = requireFact(table, INPUT_SHARE_ID);

  const effectiveTokens = input.tokensOut + inputShare.value * input.tokensIn;

  const energyGpu = scale(coeffs.energyPerRequestGpuOnly, effectiveTokens / 1000);

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
    referenceYear,
  };
}
