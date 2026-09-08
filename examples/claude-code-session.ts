/**
 * Erste echte Messung: liest diese Claude-Code-Sitzung selbst und schickt
 * die aggregierten Zaehlwerte durch calculate(). Nicht Teil der
 * oeffentlichen API (kein Export aus src/index.ts), reines Beispiel-/
 * Analyseskript.
 *
 * tokensIn haengt vom Cache-Read-Rechenanteil ab (Fakt
 * cache-read-compute-share-anthropic, konzeptionell min 0 / mid 0.1 /
 * max 0.1). Deshalb je Modell/Region drei getrennte calculate()-Laeufe -
 * einen pro Faktor -, aus denen jeweils nur das dazu passende Feld
 * (min-Lauf -> .min, mid-Lauf -> .mid, max-Lauf -> .max) uebernommen wird.
 * Vorher wurde nur zwischen Faktor 0 (min) und 0.1 (max) gerechnet und
 * "mid" als Mittelwert der beiden mid-Ergebnisse gebildet - das entsprach
 * rechnerisch einem Cache-Faktor von 0.05, nicht dem dokumentierten
 * mid-Wert 0.1.
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
  tokensInAtMin: number;
  tokensInAtMid: number;
  tokensInAtMax: number;
}

/**
 * cache-read-compute-share-anthropic (data/assumptions.json) ist als
 * konzeptionelles Intervall min 0 / mid 0.1 / max 0.1 dokumentiert, aber
 * nur mit einem einzigen `value` (0.1, der mid/max-Wert) gespeichert - die
 * Untergrenze 0 ist laut Fakt-Note bewusst strukturell realisiert (kein
 * Rechenaufwand fuer einen reinen Cache-Treffer), nicht als zweiter Fakt.
 * Deshalb hier fest 0, der mid/max-Faktor kommt aus dem Fakt.
 */
const CACHE_READ_COMPUTE_SHARE_MIN = 0;

function aggregateByModel(
  records: ClaudeCodeUsageRecord[],
  cacheReadComputeShareMidMax: number,
): Map<string, Aggregate> {
  const byModel = new Map<string, Aggregate>();
  for (const record of records) {
    // toInputTokenRange(record, f).max = base + f * cacheReadTokens fuer
    // jeden Faktor f (bei f=0 gleich .min/base) - je einmal pro Faktor
    // aus dem min/mid/max-Tripel des Fakts aufgerufen, nicht gemittelt.
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

interface ResultRangeLike {
  min: number;
  mid: number;
  max: number;
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
  const cacheReadComputeShareMidMax = table.byId.get("cache-read-compute-share-anthropic")?.value;
  if (cacheReadComputeShareMidMax === undefined) {
    throw new Error("Fakt 'cache-read-compute-share-anthropic' fehlt in data/assumptions.json");
  }
  console.log(
    `cacheReadComputeShare (aus data/assumptions.json): min=${CACHE_READ_COMPUTE_SHARE_MIN} ` +
      `mid=${cacheReadComputeShareMidMax} max=${cacheReadComputeShareMidMax}`,
  );
  console.log();

  const byModel = aggregateByModel(records, cacheReadComputeShareMidMax);

  for (const agg of byModel.values()) {
    console.log(`=== Modell: ${agg.model} ===`);
    console.log(
      `Nachrichten: ${agg.messageCount}  input=${agg.inputTokens}  output=${agg.outputTokens}  ` +
        `cacheCreation=${agg.cacheCreationTokens}  cacheRead=${agg.cacheReadTokens}`,
    );
    console.log(
      `tokensIn (summiert, je Cache-Read-Faktor): min=${agg.tokensInAtMin} ` +
        `mid=${agg.tokensInAtMid} max=${agg.tokensInAtMax}`,
    );

    const classification = classifyModel(agg.model, undefined, table);
    console.log(
      `Klassifikationsweg: modelClass=${classification.modelClass} ` +
        `confidence=${classification.confidence} family=${classification.family} ` +
        `(${classification.sourceFactId ? "fakt-basiert: " + classification.sourceFactId : "Namensheuristik, kein Fakt-Treffer"})`,
    );
    console.log();

    for (const region of ["US", "EU"]) {
      // Drei getrennte Laeufe statt zwei - je Cache-Read-Faktor aus dem
      // min/mid/max-Tripel von cache-read-compute-share-anthropic ein
      // eigener tokensIn-Wert (siehe aggregateByModel). Aus jedem Lauf wird
      // nur das dazu passende Feld uebernommen (min-Lauf -> .min usw.),
      // nicht ueber zwei Extremlaeufe gemittelt - das ergab vorher
      // rechnerisch einen Cache-Faktor von 0.05 statt der dokumentierten
      // 0.1 fuer den mid-Fall.
      const resultAtMin = calculate(
        { model: agg.model, region, tokensIn: agg.tokensInAtMin, tokensOut: agg.outputTokens },
        table,
      );
      const resultAtMid = calculate(
        { model: agg.model, region, tokensIn: agg.tokensInAtMid, tokensOut: agg.outputTokens },
        table,
      );
      const resultAtMax = calculate(
        { model: agg.model, region, tokensIn: agg.tokensInAtMax, tokensOut: agg.outputTokens },
        table,
      );

      const energyTotal = {
        min: resultAtMin.energyTotal.min,
        mid: resultAtMid.energyTotal.mid,
        max: resultAtMax.energyTotal.max,
      };
      const waterScope1 = {
        min: resultAtMin.waterScope1.min,
        mid: resultAtMid.waterScope1.mid,
        max: resultAtMax.waterScope1.max,
      };
      const waterScope2 = {
        min: resultAtMin.waterScope2.min,
        mid: resultAtMid.waterScope2.mid,
        max: resultAtMax.waterScope2.max,
      };
      const co2Scope2 = {
        min: resultAtMin.co2Scope2.min,
        mid: resultAtMid.co2Scope2.mid,
        max: resultAtMax.co2Scope2.max,
      };
      const waterTotal = {
        min: resultAtMin.waterScope1.min + resultAtMin.waterScope2.min,
        max: resultAtMax.waterScope1.max + resultAtMax.waterScope2.max,
      };

      console.log(`--- Region ${region} (ANNAHME fuer US: keine reale Standortkenntnis) ---`);
      console.log(`Energie total (Wh):   ${fmt(energyTotal, 2)}`);
      console.log(`Wasser Standort (mL): ${fmt(waterScope1, 3)}`);
      console.log(`Wasser Strom (mL):    ${fmt(waterScope2, 3)}`);
      console.log(`Wasser gesamt (mL):   ${waterTotal.min.toFixed(3)}-${waterTotal.max.toFixed(3)}`);
      console.log(`CO2 Scope 2 (g):      ${fmt(co2Scope2, 4)}`);
      console.log(
        `Konfidenz: ${resultAtMin.confidence} (min-Lauf) / ${resultAtMid.confidence} (mid-Lauf) / ` +
          `${resultAtMax.confidence} (max-Lauf)`,
      );
      console.log(`factIds (min-Lauf): ${resultAtMin.factIds.join(", ")}`);
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
    const range = toInputTokenRange(record, cacheReadComputeShareMidMax);
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
