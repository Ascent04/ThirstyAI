import type { FactTable } from "./facts.js";
import { classifyModel, type ModelClassification } from "./models.js";
import { calculate, type Result } from "./calculate.js";
import { toInputTokenRange, type ClaudeCodeUsageRecord } from "./readers/claudeCode.js";

export interface Aggregate {
  model: string;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  tokensInAtMin: number;
  tokensInAtMid: number;
  tokensInAtMax: number;
}

/**
 * min = 0 hartkodiert, siehe Beispielskript; offener Punkt: eigener Annahme-Fakt.
 * cache-read-compute-share-anthropic (data/assumptions.json) ist als
 * konzeptionelles Intervall min 0 / mid 0.1 / max 0.1 dokumentiert, aber
 * nur mit einem einzigen `value` (0.1, der mid/max-Wert) gespeichert.
 */
const CACHE_READ_COMPUTE_SHARE_MIN = 0;

/**
 * Aggregiert rohe Claude-Code-Zaehlwerte je Modell und bildet daraus, je
 * Cache-Read-Faktor (min 0 / mid+max aus dem uebergebenen Fakt-Wert), einen
 * eigenen tokensIn-Summenwert (siehe toInputTokenRange in
 * src/readers/claudeCode.ts).
 */
export function aggregateByModel(
  records: ClaudeCodeUsageRecord[],
  cacheReadComputeShareMidMax: number,
): Map<string, Aggregate> {
  const byModel = new Map<string, Aggregate>();
  for (const record of records) {
    const atMin = toInputTokenRange(record, CACHE_READ_COMPUTE_SHARE_MIN).max;
    const atMidMax = toInputTokenRange(record, cacheReadComputeShareMidMax).max;
    const agg = byModel.get(record.model) ?? {
      model: record.model,
      messageCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      tokensInAtMin: 0,
      tokensInAtMid: 0,
      tokensInAtMax: 0,
    };
    agg.messageCount += 1;
    agg.inputTokens += record.inputTokens;
    agg.outputTokens += record.outputTokens;
    agg.cacheCreationTokens += record.cacheCreationTokens;
    agg.cacheReadTokens += record.cacheReadTokens;
    agg.tokensInAtMin += atMin;
    agg.tokensInAtMid += atMidMax;
    agg.tokensInAtMax += atMidMax;
    byModel.set(record.model, agg);
  }
  return byModel;
}

export interface Range {
  min: number;
  mid: number;
  max: number;
}

export interface ModelMeasurement {
  model: string;
  classification: ModelClassification;
  energyTotal: Range;
  waterScope1: Range;
  waterScope2: Range;
  co2Scope2: Range;
  /** confidence je Lauf (min/mid/max-tokensIn) - haengt in der Praxis nicht
   * von tokensIn ab (siehe calculate.ts), ist deshalb ueblicherweise gleich. */
  confidenceMin: number;
  confidenceMid: number;
  confidenceMax: number;
  factIds: string[];
  assumptions: string[];
  boundary: Result["boundary"];
}

export interface SessionTotal {
  energyTotal: Range;
  waterScope1: Range;
  waterScope2: Range;
  co2Scope2: Range;
  confidence: number;
  factIds: string[];
  assumptions: string[];
}

export interface SessionMeasurement {
  models: ModelMeasurement[];
  total: SessionTotal;
}

function sumRange(ranges: Range[]): Range {
  return ranges.reduce(
    (acc, r) => ({ min: acc.min + r.min, mid: acc.mid + r.mid, max: acc.max + r.max }),
    { min: 0, mid: 0, max: 0 },
  );
}

/**
 * Berechnet je Modell drei getrennte calculate()-Laeufe (einen pro
 * Cache-Read-Faktor aus dem min/mid/max-Tripel von aggregateByModel) und
 * uebernimmt aus jedem Lauf nur das dazu passende Feld (min-Lauf -> .min,
 * mid-Lauf -> .mid, max-Lauf -> .max) - nicht ueber zwei Extremlaeufe
 * gemittelt, siehe examples/claude-code-session.ts. Zusaetzlich ein
 * Gesamtaggregat ueber alle Modelle: Summen der Ranges, Confidence als
 * Minimum, factIds/assumptions als Vereinigung.
 */
export function measureSession(
  table: FactTable,
  byModel: Map<string, Aggregate>,
  region: string | undefined,
  referenceYear?: number,
): SessionMeasurement {
  const models: ModelMeasurement[] = [];

  for (const agg of byModel.values()) {
    const resultAtMin = calculate(
      { model: agg.model, region, tokensIn: agg.tokensInAtMin, tokensOut: agg.outputTokens, referenceYear },
      table,
    );
    const resultAtMid = calculate(
      { model: agg.model, region, tokensIn: agg.tokensInAtMid, tokensOut: agg.outputTokens, referenceYear },
      table,
    );
    const resultAtMax = calculate(
      { model: agg.model, region, tokensIn: agg.tokensInAtMax, tokensOut: agg.outputTokens, referenceYear },
      table,
    );

    const classification = classifyModel(agg.model, undefined, table);

    models.push({
      model: agg.model,
      classification,
      energyTotal: {
        min: resultAtMin.energyTotal.min,
        mid: resultAtMid.energyTotal.mid,
        max: resultAtMax.energyTotal.max,
      },
      waterScope1: {
        min: resultAtMin.waterScope1.min,
        mid: resultAtMid.waterScope1.mid,
        max: resultAtMax.waterScope1.max,
      },
      waterScope2: {
        min: resultAtMin.waterScope2.min,
        mid: resultAtMid.waterScope2.mid,
        max: resultAtMax.waterScope2.max,
      },
      co2Scope2: {
        min: resultAtMin.co2Scope2.min,
        mid: resultAtMid.co2Scope2.mid,
        max: resultAtMax.co2Scope2.max,
      },
      confidenceMin: resultAtMin.confidence,
      confidenceMid: resultAtMid.confidence,
      confidenceMax: resultAtMax.confidence,
      factIds: resultAtMin.factIds,
      assumptions: resultAtMin.assumptions,
      boundary: resultAtMin.boundary,
    });
  }

  const total: SessionTotal = {
    energyTotal: sumRange(models.map((m) => m.energyTotal)),
    waterScope1: sumRange(models.map((m) => m.waterScope1)),
    waterScope2: sumRange(models.map((m) => m.waterScope2)),
    co2Scope2: sumRange(models.map((m) => m.co2Scope2)),
    confidence: Math.min(
      ...models.map((m) => Math.min(m.confidenceMin, m.confidenceMid, m.confidenceMax)),
    ),
    factIds: [...new Set(models.flatMap((m) => m.factIds))].sort(),
    assumptions: [...new Set(models.flatMap((m) => m.assumptions))].sort(),
  };

  return { models, total };
}
