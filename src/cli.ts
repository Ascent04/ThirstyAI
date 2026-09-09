#!/usr/bin/env node
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { calculate, DEFAULT_REFERENCE_YEAR } from "./calculate.js";
import { type FactTable } from "./facts.js";
import { loadFacts } from "./factsNode.js";
import { classifyModel } from "./models.js";
import { readClaudeCodeUsage } from "./readers/claudeCode.js";
import { aggregateByModel, measureSession, type ModelMeasurement, type Range } from "./session.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const USAGE_CALC = `Usage: thirstyai calc --model <name> --out <n> [--in <n>] [--region <code>] [--provider <name>] [--year <yyyy>] [--json]`;
const USAGE_SESSION = `Usage: thirstyai session <path.jsonl> [--region <code>] [--year <yyyy>] [--json]`;

function fmt(v: number): string {
  if (v === 0) return "0";
  const digits = Math.max(0, 2 - Math.floor(Math.log10(Math.abs(v))));
  return v.toFixed(digits);
}

function pad(s: string, width: number): string {
  return s.padStart(width);
}

function printTable(
  rows: { label: string; min: number; mid: number; max: number }[],
): void {
  const cells = rows.map((r) => ({
    label: r.label,
    min: fmt(r.min),
    mid: fmt(r.mid),
    max: fmt(r.max),
  }));
  const labelWidth = Math.max(...cells.map((c) => c.label.length));
  const colWidth = Math.max(
    "min".length,
    "mid".length,
    "max".length,
    ...cells.flatMap((c) => [c.min.length, c.mid.length, c.max.length]),
  );
  console.log(
    `${" ".repeat(labelWidth)}  ${pad("min", colWidth)}  ${pad("mid", colWidth)}  ${pad("max", colWidth)}`,
  );
  for (const c of cells) {
    console.log(
      `${c.label.padEnd(labelWidth)}  ${pad(c.min, colWidth)}  ${pad(c.mid, colWidth)}  ${pad(c.max, colWidth)}`,
    );
  }
}

function loadTable(): FactTable {
  return loadFacts([
    join(ROOT, "data", "facts.json"),
    join(ROOT, "data", "assumptions.json"),
    join(ROOT, "data", "models.json"),
  ]);
}

function runCalc(args: string[]): void {
  let values: {
    model?: string;
    out?: string;
    in?: string;
    region?: string;
    provider?: string;
    year?: string;
    json?: boolean;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args,
      options: {
        model: { type: "string" },
        out: { type: "string" },
        in: { type: "string" },
        region: { type: "string" },
        provider: { type: "string" },
        year: { type: "string" },
        json: { type: "boolean" },
        help: { type: "boolean" },
      },
      allowPositionals: true,
    }));
  } catch {
    console.error(USAGE_CALC);
    process.exit(1);
  }

  if (values.help) {
    console.log(USAGE_CALC);
    process.exit(0);
  }

  if (values.model === undefined || values.out === undefined) {
    console.error(USAGE_CALC);
    process.exit(1);
  }

  const tokensOut = Number(values.out);
  const tokensIn = values.in === undefined ? 0 : Number(values.in);
  if (!Number.isFinite(tokensOut) || !Number.isFinite(tokensIn)) {
    console.error(USAGE_CALC);
    process.exit(1);
  }

  const referenceYear = values.year === undefined ? undefined : Number(values.year);
  if (values.year !== undefined && !Number.isFinite(referenceYear)) {
    console.error(USAGE_CALC);
    process.exit(1);
  }

  const table = loadTable();

  let result;
  try {
    result = calculate(
      {
        model: values.model,
        provider: values.provider,
        region: values.region,
        tokensIn,
        tokensOut,
        referenceYear,
      },
      table,
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
    return;
  }

  if (values.json) {
    console.log(JSON.stringify(result));
    return;
  }

  const classification = classifyModel(values.model, values.provider, table);
  const recognized = classification.confidence >= 2;
  const recognizedText = recognized
    ? `recognized via ${classification.sourceFactId ?? "name heuristic"}`
    : "fallback — model not in fact table";

  console.log(
    `ThirstyAI — ${values.model} (class ${classification.modelClass}, ${recognizedText})`,
  );
  console.log(
    `Tokens: in=${tokensIn} out=${tokensOut} · Region: ${values.region ?? "-"} · Reference year: ${result.referenceYear}`,
  );
  console.log();

  const waterMin = result.waterScope1.min + result.waterScope2.min;
  const waterMid = result.waterScope1.mid + result.waterScope2.mid;
  const waterMax = result.waterScope1.max + result.waterScope2.max;

  printTable([
    { label: "energy Wh", min: result.energyTotal.min, mid: result.energyTotal.mid, max: result.energyTotal.max },
    { label: "water ml", min: waterMin, mid: waterMid, max: waterMax },
    { label: "co2 g", min: result.co2Scope2.min, mid: result.co2Scope2.mid, max: result.co2Scope2.max },
  ]);

  console.log();
  console.log(`Data confidence: ${result.dataConfidence}/5`);
  console.log(`Method confidence: ${result.methodConfidence}/5`);
  console.log(`Boundary: ${result.boundary}`);
  console.log(`Facts: ${result.factIds.join(", ")}`);
  if (result.assumptions.length > 0) {
    console.log(`Assumptions: ${result.assumptions.join(", ")}`);
  }
}

function recognizedText(m: ModelMeasurement): string {
  const recognized = m.classification.confidence >= 2;
  return recognized
    ? `recognized via ${m.classification.sourceFactId ?? "name heuristic"}`
    : "fallback — model not in fact table";
}

function whPer1000Output(energyTotal: Range, outputTokens: number): Range {
  if (outputTokens === 0) {
    return { min: 0, mid: 0, max: 0 };
  }
  const per1k = outputTokens / 1000;
  return { min: energyTotal.min / per1k, mid: energyTotal.mid / per1k, max: energyTotal.max / per1k };
}

function printModelBlock(label: string, m: ModelMeasurement, outputTokens: number): void {
  console.log(`=== ${label} ===`);
  const waterMin = m.waterScope1.min + m.waterScope2.min;
  const waterMid = m.waterScope1.mid + m.waterScope2.mid;
  const waterMax = m.waterScope1.max + m.waterScope2.max;

  printTable([
    { label: "energy Wh", min: m.energyTotal.min, mid: m.energyTotal.mid, max: m.energyTotal.max },
    { label: "water ml", min: waterMin, mid: waterMid, max: waterMax },
    { label: "co2 g", min: m.co2Scope2.min, mid: m.co2Scope2.mid, max: m.co2Scope2.max },
  ]);
  console.log();

  const perK = whPer1000Output(m.energyTotal, outputTokens);
  console.log(
    `Wh per 1,000 output tokens (all compute): ${fmt(perK.min)}/${fmt(perK.mid)}/${fmt(perK.max)}`,
  );
  console.log();
}

function runSession(args: string[]): void {
  let values: {
    region?: string;
    year?: string;
    json?: boolean;
    help?: boolean;
  };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args,
      options: {
        region: { type: "string" },
        year: { type: "string" },
        json: { type: "boolean" },
        help: { type: "boolean" },
      },
      allowPositionals: true,
    }));
  } catch {
    console.error(USAGE_SESSION);
    process.exit(1);
  }

  if (values.help) {
    console.log(USAGE_SESSION);
    process.exit(0);
  }

  const filePath = positionals[0];
  if (filePath === undefined) {
    console.error(USAGE_SESSION);
    process.exit(1);
  }

  const referenceYear = values.year === undefined ? undefined : Number(values.year);
  if (values.year !== undefined && !Number.isFinite(referenceYear)) {
    console.error(USAGE_SESSION);
    process.exit(1);
  }

  runSessionAsync(filePath, values.region, referenceYear, values.json === true).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

async function runSessionAsync(
  filePath: string,
  region: string | undefined,
  referenceYear: number | undefined,
  json: boolean,
): Promise<void> {
  let records;
  let skippedUnparsable: number;
  let skippedSynthetic: number;
  try {
    ({ records, skippedUnparsable, skippedSynthetic } = await readClaudeCodeUsage(filePath));
  } catch {
    console.error(USAGE_SESSION);
    process.exit(1);
    return;
  }

  if (records.length === 0) {
    console.error("Keine erkannte Nachricht mit Nutzungsdaten in der Datei.");
    process.exit(1);
    return;
  }

  let table: FactTable;
  let byModel;
  let measurement;
  let cacheReadComputeShareMidMax: number;
  try {
    table = loadTable();
    const shareFact = table.byId.get("cache-read-compute-share-anthropic");
    if (!shareFact) {
      throw new Error("Fakt 'cache-read-compute-share-anthropic' fehlt in data/assumptions.json");
    }
    cacheReadComputeShareMidMax = shareFact.value;
    byModel = aggregateByModel(records, cacheReadComputeShareMidMax);
    measurement = measureSession(table, byModel, region, referenceYear);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
    return;
  }

  const tokens = {
    input: records.reduce((sum, r) => sum + r.inputTokens, 0),
    output: records.reduce((sum, r) => sum + r.outputTokens, 0),
    cacheCreate: records.reduce((sum, r) => sum + r.cacheCreationTokens, 0),
    cacheRead: records.reduce((sum, r) => sum + r.cacheReadTokens, 0),
  };
  const resolvedReferenceYear = referenceYear ?? DEFAULT_REFERENCE_YEAR;

  if (json) {
    console.log(
      JSON.stringify({
        file: filePath,
        records: records.length,
        skipped: { unparsable: skippedUnparsable, synthetic: skippedSynthetic },
        tokens,
        region: region ?? null,
        referenceYear: resolvedReferenceYear,
        models: measurement.models,
        total: measurement.total,
      }),
    );
    return;
  }

  console.log(`ThirstyAI session — ${filePath}`);
  console.log(
    `Records: ${records.length} (skipped unparsable: ${skippedUnparsable}, skipped synthetic: ${skippedSynthetic})`,
  );
  console.log(
    `Tokens: input=${tokens.input} output=${tokens.output} cache-create=${tokens.cacheCreate} ` +
      `cache-read=${tokens.cacheRead} · Region: ${region ?? "-"} · Reference year: ${resolvedReferenceYear}`,
  );
  console.log();

  for (const m of measurement.models) {
    const agg = byModel.get(m.model)!;
    printModelBlock(
      `${m.model} (class ${m.classification.modelClass}, ${recognizedText(m)})`,
      m,
      agg.outputTokens,
    );
  }

  if (measurement.models.length > 1) {
    const totalOutputTokens = tokens.output;
    console.log("=== total ===");
    printTable([
      { label: "energy Wh", min: measurement.total.energyTotal.min, mid: measurement.total.energyTotal.mid, max: measurement.total.energyTotal.max },
      {
        label: "water ml",
        min: measurement.total.waterScope1.min + measurement.total.waterScope2.min,
        mid: measurement.total.waterScope1.mid + measurement.total.waterScope2.mid,
        max: measurement.total.waterScope1.max + measurement.total.waterScope2.max,
      },
      { label: "co2 g", min: measurement.total.co2Scope2.min, mid: measurement.total.co2Scope2.mid, max: measurement.total.co2Scope2.max },
    ]);
    console.log();
    const perK = whPer1000Output(measurement.total.energyTotal, totalOutputTokens);
    console.log(
      `Wh per 1,000 output tokens (all compute): ${fmt(perK.min)}/${fmt(perK.mid)}/${fmt(perK.max)}`,
    );
    console.log();
  }

  const boundaries = [...new Set(measurement.models.map((m) => m.boundary))];
  console.log(`Data confidence: ${measurement.total.dataConfidence}/5`);
  console.log(`Method confidence: ${measurement.total.methodConfidence}/5`);
  console.log(`Boundary: ${boundaries.join(" + ")}`);
  console.log(`Facts: ${measurement.total.factIds.join(", ")}`);
  if (measurement.total.assumptions.length > 0) {
    console.log(`Assumptions: ${measurement.total.assumptions.join(", ")}`);
  }
  console.log(
    `Cache-read compute share: 0/${cacheReadComputeShareMidMax}/${cacheReadComputeShareMidMax} ` +
      `(assumption cache-read-compute-share-anthropic)`,
  );
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "session") {
    runSession(rest);
    return;
  }

  runCalc(command === "calc" ? rest : process.argv.slice(2));
}

main();
