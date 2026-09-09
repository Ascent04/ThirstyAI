/**
 * Browser bridge. Not part of the public library API (src/index.ts).
 */
// Same order as src/cli.ts:56-58 (loadFacts([facts.json, assumptions.json, models.json])).
import facts from "../data/facts.json" with { type: "json" };
import assumptions from "../data/assumptions.json" with { type: "json" };
import models from "../data/models.json" with { type: "json" };

import { buildFactTable, type RawFactFile } from "../src/facts.js";
import { calculate, type CalculateInput, type Result } from "../src/calculate.js";
import { supportedRegions } from "../src/resolve.js";

const TABLE = buildFactTable([facts, assumptions, models] as RawFactFile[]);

export const FACT_COUNT = TABLE.facts.length;
export const SOURCE_COUNT = Object.keys(TABLE.sources).length;

export function calculateEmbedded(input: CalculateInput): Result {
  return calculate(input, TABLE);
}

export const MODELS: { name: string; aliases: string[] }[] = TABLE.facts
  .filter((fact) => fact.category === "parameters")
  .map((fact) => ({ name: fact.model_or_object, aliases: fact.aliases ?? [] }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const REGIONS = supportedRegions(2024);

export const FACTS_GENERATED = (facts as { generated: string }).generated;
