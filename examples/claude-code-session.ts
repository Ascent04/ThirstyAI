/**
 * Erste echte Messung: liest diese Claude-Code-Sitzung selbst und schickt
 * die aggregierten Zaehlwerte durch calculate(). Nicht Teil der
 * oeffentlichen API (kein Export aus src/index.ts), reines Beispiel-/
 * Analyseskript.
 *
 * Ausfuehrung: erst `npm run build`, dann diese Datei kompilieren und mit
 * node ausfuehren (siehe docs/claude-code-reader.md).
 */
import { copyFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { calculate, loadFacts } from "../dist/index.js";
import { classifyModel } from "../dist/models.js";
import { readClaudeCodeUsage, toInputTokenRange } from "../dist/readers/claudeCode.js";
import type { ClaudeCodeUsageRecord } from "../dist/readers/claudeCode.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Diese eine Sitzung (siehe Schritt 1/2 der Aufgabe). Kopie nach /tmp vor
// dem Lesen, damit nie die live wachsende Originaldatei gelesen wird.
const SESSION_SOURCE =
  "~/.claude/projects/<project-dir>/<session-id>.jsonl";
const SESSION_COPY = "/tmp/thirstyai-session.jsonl";

interface Aggregate {
  model: string;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  tokensInMin: number;
  tokensInMax: number;
}

function aggregateByModel(
  records: ClaudeCodeUsageRecord[],
  cacheReadComputeShare: number,
): Map<string, Aggregate> {
  const byModel = new Map<string, Aggregate>();
  for (const record of records) {
    const range = toInputTokenRange(record, cacheReadComputeShare);
    const agg = byModel.get(record.model) ?? {
      model: record.model,
      messageCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      tokensInMin: 0,
      tokensInMax: 0,
    };
    agg.messageCount += 1;
    agg.inputTokens += record.inputTokens;
    agg.outputTokens += record.outputTokens;
    agg.cacheCreationTokens += record.cacheCreationTokens;
    agg.cacheReadTokens += record.cacheReadTokens;
    agg.tokensInMin += range.min;
    agg.tokensInMax += range.max;
    byModel.set(record.model, agg);
  }
  return byModel;
}

interface ResultRangeLike {
  min: number;
  mid: number;
  max: number;
}

function mergeOuter(a: ResultRangeLike, b: ResultRangeLike): ResultRangeLike {
  return {
    min: Math.min(a.min, b.min),
    mid: (a.mid + b.mid) / 2,
    max: Math.max(a.max, b.max),
  };
}

function fmt(r: ResultRangeLike, digits: number): string {
  return `${r.mid.toFixed(digits)} (${r.min.toFixed(digits)}-${r.max.toFixed(digits)})`;
}

async function main(): Promise<void> {
  copyFileSync(SESSION_SOURCE, SESSION_COPY);

  const { records, skippedUnparsable, skippedSynthetic } = await readClaudeCodeUsage(
    SESSION_COPY,
  );

  const timestamps = records.map((r) => r.timestamp).filter((t) => t !== "").sort();
  console.log("=== Zeitraum ===");
  console.log("frueheste:", timestamps[0]);
  console.log("spaeteste:", timestamps[timestamps.length - 1]);
  console.log();

  console.log("=== Zaehlerübersicht ===");
  console.log("Nachrichten mit Nutzungsdaten (dedupliziert):", records.length);
  console.log("skippedUnparsable:", skippedUnparsable);
  console.log("skippedSynthetic:", skippedSynthetic);
  console.log();

  const table = loadFacts([
    join(ROOT, "data", "facts.json"),
    join(ROOT, "data", "assumptions.json"),
    join(ROOT, "data", "models.json"),
  ]);
  const cacheReadComputeShare = table.byId.get("cache-read-compute-share-anthropic")?.value;
  if (cacheReadComputeShare === undefined) {
    throw new Error("Fakt 'cache-read-compute-share-anthropic' fehlt in data/assumptions.json");
  }
  console.log(`cacheReadComputeShare (aus data/assumptions.json): ${cacheReadComputeShare}`);
  console.log();

  const byModel = aggregateByModel(records, cacheReadComputeShare);

  for (const agg of byModel.values()) {
    console.log(`=== Modell: ${agg.model} ===`);
    console.log(
      `Nachrichten: ${agg.messageCount}  input=${agg.inputTokens}  output=${agg.outputTokens}  ` +
        `cacheCreation=${agg.cacheCreationTokens}  cacheRead=${agg.cacheReadTokens}`,
    );
    console.log(`tokensIn-Intervall (summiert): ${agg.tokensInMin}-${agg.tokensInMax}`);

    const classification = classifyModel(agg.model, undefined, table);
    console.log(
      `Klassifikationsweg: modelClass=${classification.modelClass} ` +
        `confidence=${classification.confidence} family=${classification.family} ` +
        `(${classification.sourceFactId ? "fakt-basiert: " + classification.sourceFactId : "Namensheuristik, kein Fakt-Treffer"})`,
    );
    console.log();

    for (const region of ["US", "EU"]) {
      const resultMin = calculate(
        { model: agg.model, region, tokensIn: agg.tokensInMin, tokensOut: agg.outputTokens },
        table,
      );
      const resultMax = calculate(
        { model: agg.model, region, tokensIn: agg.tokensInMax, tokensOut: agg.outputTokens },
        table,
      );

      const energyTotal = mergeOuter(resultMin.energyTotal, resultMax.energyTotal);
      const waterScope1 = mergeOuter(resultMin.waterScope1, resultMax.waterScope1);
      const waterScope2 = mergeOuter(resultMin.waterScope2, resultMax.waterScope2);
      const co2Scope2 = mergeOuter(resultMin.co2Scope2, resultMax.co2Scope2);
      const waterTotal = mergeOuter(
        { min: resultMin.waterScope1.min + resultMin.waterScope2.min, mid: 0, max: resultMin.waterScope1.max + resultMin.waterScope2.max },
        { min: resultMax.waterScope1.min + resultMax.waterScope2.min, mid: 0, max: resultMax.waterScope1.max + resultMax.waterScope2.max },
      );

      console.log(`--- Region ${region} (ANNAHME fuer US: keine reale Standortkenntnis) ---`);
      console.log(`Energie total (Wh):   ${fmt(energyTotal, 2)}`);
      console.log(`Wasser Standort (mL): ${fmt(waterScope1, 3)}`);
      console.log(`Wasser Strom (mL):    ${fmt(waterScope2, 3)}`);
      console.log(`Wasser gesamt (mL):   ${waterTotal.min.toFixed(3)}-${waterTotal.max.toFixed(3)}`);
      console.log(`CO2 Scope 2 (g):      ${fmt(co2Scope2, 4)}`);
      console.log(
        `Konfidenz: ${resultMin.confidence} (min-Lauf) / ${resultMax.confidence} (max-Lauf)`,
      );
      console.log(`factIds (min-Lauf): ${resultMin.factIds.join(", ")}`);
      console.log();

      const per1k = agg.outputTokens / 1000;
      console.log(`Pro 1.000 Output-Token (${agg.outputTokens} Output-Token gesamt):`);
      console.log(
        `  Energie (Wh): min=${(energyTotal.min / per1k).toFixed(3)} ` +
          `mid=${(energyTotal.mid / per1k).toFixed(3)} max=${(energyTotal.max / per1k).toFixed(3)}`,
      );
      console.log();
    }
  }

  // Defekt-Pruefung pro einzelner Nachricht (nicht aggregiert): negative
  // Werte, min > max, oder mehr als 100 Wh fuer eine einzelne Nachricht.
  let anyDefect = false;
  for (const record of records) {
    const range = toInputTokenRange(record, cacheReadComputeShare);
    for (const tokensIn of [range.min, range.max]) {
      const r = calculate({ model: record.model, region: "US", tokensIn, tokensOut: record.outputTokens }, table);
      for (const field of [r.energyTotal, r.waterScope1, r.waterScope2, r.co2Scope2]) {
        if (field.min < 0 || field.mid < 0 || field.max < 0) {
          console.log(`DEFEKT: negativer Wert bei Nachricht ${record.messageId}`);
          anyDefect = true;
        }
        if (field.min > field.max) {
          console.log(`DEFEKT: min > max bei Nachricht ${record.messageId}`);
          anyDefect = true;
        }
      }
      if (r.energyTotal.max > 100) {
        console.log(
          `DEFEKT: Einzelnachricht ${record.messageId} ueber 100 Wh (${r.energyTotal.max.toFixed(2)} Wh)`,
        );
        anyDefect = true;
      }
    }
  }
  console.log("=== Defekt-Pruefung ===");
  console.log(anyDefect ? "DEFEKT GEFUNDEN, siehe oben" : "keine Defekte (negativ/min>max/>100 Wh)");

  unlinkSync(SESSION_COPY);
  console.log();
  console.log(`/tmp-Kopie geloescht: ${SESSION_COPY}`);
}

main();
