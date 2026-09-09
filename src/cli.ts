#!/usr/bin/env node
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { calculate } from "./calculate.js";
import { loadFacts } from "./facts.js";
import { classifyModel } from "./models.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const USAGE = `Usage: thirstyai calc --model <name> --out <n> [--in <n>] [--region <code>] [--provider <name>] [--year <yyyy>] [--json]`;

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

function main(): void {
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
      args: process.argv.slice(2),
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
    console.error(USAGE);
    process.exit(1);
  }

  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (values.model === undefined || values.out === undefined) {
    console.error(USAGE);
    process.exit(1);
  }

  const tokensOut = Number(values.out);
  const tokensIn = values.in === undefined ? 0 : Number(values.in);
  if (!Number.isFinite(tokensOut) || !Number.isFinite(tokensIn)) {
    console.error(USAGE);
    process.exit(1);
  }

  const referenceYear = values.year === undefined ? undefined : Number(values.year);
  if (values.year !== undefined && !Number.isFinite(referenceYear)) {
    console.error(USAGE);
    process.exit(1);
  }

  const table = loadFacts([
    join(ROOT, "data", "facts.json"),
    join(ROOT, "data", "assumptions.json"),
    join(ROOT, "data", "models.json"),
  ]);

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
  console.log(`Confidence: ${result.confidence}/5`);
  console.log(`Boundary: ${result.boundary}`);
  console.log(`Facts: ${result.factIds.join(", ")}`);
  if (result.assumptions.length > 0) {
    console.log(`Assumptions: ${result.assumptions.join(", ")}`);
  }
}

main();
